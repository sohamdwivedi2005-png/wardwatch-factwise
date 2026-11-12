// lib/rules.ts
// SINGLE SOURCE OF TRUTH for all WardWatch business rules.
// Pure functions only — store actions and the dashboard call these; nothing
// recomputes a rule inline. Everything here is deterministic and unit-tested.

import type {
  Patient,
  TempReading,
  DoctorVisit,
  Ward,
} from "./types";
import { addDaysStr, dayDiff, hoursBetween } from "./clock";

// ---- Temperature ----------------------------------------------------------
export const FEVER_THRESHOLD_C = 38.0;
export const TEMP_MIN = 34.0;
export const TEMP_MAX = 43.0;
export const LOW_CONFIRM = 35.0; // below this -> confirm
export const HIGH_CONFIRM = 41.0; // at/above this -> confirm + critical
export const ELIGIBLE_STREAK = 3;
export const ESCALATION_HOURS = 4;

export function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32 * 10) / 10 + 0; // see fmtF for display
}
export function fmtF(c: number): number {
  return Math.round(((c * 9) / 5 + 32) * 10) / 10;
}

export function isFever(valueC: number): boolean {
  return valueC >= FEVER_THRESHOLD_C;
}

export function validateTemp(valueC: number): { ok: boolean; error?: string } {
  if (Number.isNaN(valueC))
    return { ok: false, error: "Enter a value between 34.0 and 43.0 °C" };
  if (valueC < TEMP_MIN || valueC > TEMP_MAX)
    return { ok: false, error: "Enter a value between 34.0 and 43.0 °C" };
  return { ok: true };
}

/** below 35.0 or at/above 41.0 -> require a second confirmation */
export function needsConfirm(valueC: number): boolean {
  return valueC < LOW_CONFIRM || valueC >= HIGH_CONFIRM;
}

/** confirmed at/above 41.0 -> critical alert to doctors */
export function isCritical(valueC: number): boolean {
  return valueC >= HIGH_CONFIRM;
}

// ---- Fever-free streak & eligibility --------------------------------------

/**
 * Consecutive facility days with a recorded reading below 38.0 °C, ending at
 * the latest meaningful day:
 *  - today if today has a reading, otherwise yesterday (today's still-open day
 *    is not treated as a missed day);
 *  - a fever resets the streak to 0;
 *  - a missing day breaks the streak;
 *  - days before admission do not count.
 */
export function feverFreeStreak(
  readings: TempReading[],
  patient: Patient,
  todayStr: string
): number {
  const byDay = new Map<string, number>();
  for (const r of readings) {
    if (r.patientId !== patient.id) continue;
    if (dayDiff(r.day, patient.admittedOn) < 0) continue; // before admission
    byDay.set(r.day, r.valueC);
  }
  // choose the anchor day
  const anchor = byDay.has(todayStr) ? todayStr : addDaysStr(todayStr, -1);

  let streak = 0;
  let cursor = anchor;
  while (true) {
    if (dayDiff(cursor, patient.admittedOn) < 0) break; // reached before admission
    if (!byDay.has(cursor)) break; // gap -> break
    const v = byDay.get(cursor)!;
    if (v >= FEVER_THRESHOLD_C) break; // fever -> stop (resets anything older)
    streak += 1;
    cursor = addDaysStr(cursor, -1);
  }
  return streak;
}

export function isEligibleByStreak(
  readings: TempReading[],
  patient: Patient,
  todayStr: string
): boolean {
  if (patient.status !== "admitted") return false;
  return feverFreeStreak(readings, patient, todayStr) >= ELIGIBLE_STREAK;
}

// ---- Doctor visits --------------------------------------------------------

export function hasReadingToday(
  readings: TempReading[],
  patientId: string,
  todayStr: string
): boolean {
  return readings.some((r) => r.patientId === patientId && r.day === todayStr);
}

export function primaryVisitToday(
  visits: DoctorVisit[],
  patientId: string,
  todayStr: string
): DoctorVisit | undefined {
  return visits.find(
    (v) => v.patientId === patientId && v.day === todayStr && !v.followUp
  );
}

export const MIN_VISIT_NOTES = 5;

// ---- Wards & beds ---------------------------------------------------------

export function wardForBed(bedId: number): Ward {
  if (bedId <= 19) return "A";
  if (bedId <= 38) return "B";
  if (bedId <= 56) return "C";
  return "D";
}

// ---- Metrics --------------------------------------------------------------

export interface MetricsInput {
  patients: Patient[];
  readings: TempReading[];
  visits: DoctorVisit[];
  todayStr: string;
}

export function closedCases(patients: Patient[]) {
  const recovered = patients.filter((p) => p.status === "discharged");
  const deaths = patients.filter((p) => p.status === "deceased");
  return { recovered, deaths, total: recovered.length + deaths.length };
}

export function mortalityRate(patients: Patient[]): number | null {
  const { deaths, total } = closedCases(patients);
  if (total === 0) return null;
  return deaths.length / total;
}

export function rolling30Closed(patients: Patient[], todayStr: string) {
  return patients.filter((p) => {
    if (p.status !== "discharged" && p.status !== "deceased") return false;
    if (!p.exit) return false;
    const d = dayDiff(todayStr, p.exit.on);
    return d >= 0 && d < 30;
  });
}

export function rolling30Mortality(
  patients: Patient[],
  todayStr: string
): number | null {
  const window = rolling30Closed(patients, todayStr);
  const deaths = window.filter((p) => p.status === "deceased").length;
  if (window.length === 0) return null;
  return deaths / window.length;
}

export const MORTALITY_TARGET = 0.15;
export const MORTALITY_MIN_SAMPLE = 20;

/** Only alert above target when the sample is large enough to be meaningful. */
export function mortalityAlert(
  patients: Patient[],
  todayStr: string
): { state: "ok" | "alert" | "insufficient"; value: number | null; sample: number } {
  const window = rolling30Closed(patients, todayStr);
  const value = rolling30Mortality(patients, todayStr);
  if (window.length < MORTALITY_MIN_SAMPLE)
    return { state: "insufficient", value, sample: window.length };
  if (value !== null && value > MORTALITY_TARGET)
    return { state: "alert", value, sample: window.length };
  return { state: "ok", value, sample: window.length };
}

export function successRate(patients: Patient[]): number | null {
  const m = mortalityRate(patients);
  return m === null ? null : 1 - m;
}

/** admitted on or before `day` and still counted as present that day */
function admittedOnDay(patients: Patient[], day: string): Patient[] {
  return patients.filter((p) => {
    if (dayDiff(day, p.admittedOn) < 0) return false; // not yet admitted
    // exclude if they exited before this day
    if (p.exit && dayDiff(day, p.exit.on) > 0) return false;
    return p.status === "admitted"
      ? true
      : // on their exit day they still counted as present for compliance
        !!p.exit && dayDiff(day, p.exit.on) <= 0;
  });
}

export function dailyCompliance(
  patients: Patient[],
  readings: TempReading[],
  visits: DoctorVisit[],
  day: string
) {
  const present = admittedOnDay(patients, day);
  const admitted = present.length;
  const withReading = present.filter((p) =>
    readings.some((r) => r.patientId === p.id && r.day === day)
  ).length;
  const withVisit = present.filter((p) =>
    visits.some((v) => v.patientId === p.id && v.day === day && !v.followUp)
  ).length;
  return {
    admitted,
    withReading,
    withVisit,
    tempPct: admitted ? withReading / admitted : 0,
    visitPct: admitted ? withVisit / admitted : 0,
  };
}

export function avgLengthOfStay(patients: Patient[]): number | null {
  const discharged = patients.filter(
    (p) => p.status === "discharged" && p.exit
  );
  if (discharged.length === 0) return null;
  const sum = discharged.reduce(
    (acc, p) => acc + Math.max(0, dayDiff(p.exit!.on, p.admittedOn)),
    0
  );
  return sum / discharged.length;
}

/** discharge delay = hours from eligibleSince to exit, per recovered patient */
export function dischargeDelays(patients: Patient[]): number[] {
  return patients
    .filter((p) => p.status === "discharged" && p.exit && p.eligibleSince)
    .map((p) => Math.max(0, hoursBetween(p.exit!.at, p.eligibleSince!)));
}

export function avgDischargeDelay(patients: Patient[]): number | null {
  const d = dischargeDelays(patients);
  if (d.length === 0) return null;
  return d.reduce((a, b) => a + b, 0) / d.length;
}

// ---- Escalations (computed from facility now) -----------------------------

export interface Escalation {
  patientId: string;
  kind: "signoff_overdue" | "discharge_overdue";
  hours: number;
}

export function escalations(
  patients: Patient[],
  nowIso: string
): Escalation[] {
  const out: Escalation[] = [];
  for (const p of patients) {
    if (p.status !== "admitted") continue;
    if (p.eligibleSince && !p.clearance) {
      const h = hoursBetween(nowIso, p.eligibleSince);
      if (h > ESCALATION_HOURS)
        out.push({ patientId: p.id, kind: "signoff_overdue", hours: h });
    }
    if (p.clearance) {
      const h = hoursBetween(nowIso, p.clearance.clearedAt);
      if (h > ESCALATION_HOURS)
        out.push({ patientId: p.id, kind: "discharge_overdue", hours: h });
    }
  }
  return out;
}

export function fallbackEntriesSince(
  readings: TempReading[],
  sinceDay: string
): TempReading[] {
  return readings.filter((r) => r.fallback && dayDiff(r.day, sinceDay) >= 0);
}
