// lib/seed.ts
// Deterministic synthetic demo data. Reset reproduces this exact scenario.
// Metrics (mortality etc.) are NOT hardcoded — they are computed by rules.ts
// from the case records generated here. The counts below are arranged so that
// all-time mortality = 27/200 = 13.5% and rolling-30 = 10/60 = 16.7%.

import type {
  Staff,
  Patient,
  Bed,
  TempReading,
  DoctorVisit,
  Alert,
  AuditEvent,
} from "./types";
import { toDayString, addDaysStr } from "./clock";
import { wardForBed } from "./rules";

export const STAFF: Staff[] = [
  { id: "n1", name: "Nurse Priya Nair", role: "nurse", pin: "1234" },
  { id: "n2", name: "Nurse Arjun Patil", role: "nurse", pin: "1234" },
  { id: "d1", name: "Dr. Kavya Mehta", role: "doctor", pin: "1234" },
  { id: "d2", name: "Dr. Sameer Khan", role: "doctor", pin: "1234" },
  { id: "a1", name: "Rahul Joshi", role: "admin", pin: "1234" },
  { id: "h1", name: "Dr. Anil Rao", role: "head_doctor", pin: "1234" },
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna",
  "Ishaan", "Rohan", "Ananya", "Diya", "Saanvi", "Aadhya", "Ira", "Myra",
  "Anika", "Navya", "Kiara", "Riya", "Kabir", "Dev", "Yuvan", "Advik",
  "Rudra", "Meera", "Prisha", "Aisha", "Tara", "Sara", "Neha", "Pooja",
  "Rajesh", "Suresh", "Mahesh", "Lakshmi", "Sunita", "Geeta", "Anil", "Vikram",
];
const LAST = [
  "Sharma", "Verma", "Gupta", "Patel", "Reddy", "Nair", "Iyer", "Rao",
  "Desai", "Mehta", "Shah", "Joshi", "Kulkarni", "Pillai", "Menon", "Bose",
  "Chopra", "Kapoor", "Malhotra", "Banerjee",
];

const SEXES = ["M", "F"];

interface SeedResult {
  patients: Patient[];
  beds: Bed[];
  readings: TempReading[];
  visits: DoctorVisit[];
  alerts: Alert[];
  audits: AuditEvent[];
}

export function buildSeed(baseDate: Date = new Date()): SeedResult {
  const rand = mulberry32(20261112);
  const today = toDayString(baseDate);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const normal = () => [36.4, 36.6, 36.8, 37.0, 37.2, 37.4, 37.6][Math.floor(rand() * 7)];
  const fever = () => [38.1, 38.4, 38.8, 39.2, 39.6][Math.floor(rand() * 5)];

  const patients: Patient[] = [];
  const readings: TempReading[] = [];
  const visits: DoctorVisit[] = [];
  const alerts: Alert[] = [];
  const audits: AuditEvent[] = [];
  let mrnSeq = 1;
  const mrn = () => `WW-${String(mrnSeq++).padStart(4, "0")}`;

  const addReading = (
    pid: string,
    day: string,
    valueC: number,
    opts: Partial<TempReading> = {}
  ) => {
    readings.push({
      id: `r_${pid}_${day}`,
      patientId: pid,
      day,
      valueC,
      takenAt: `${day}T08:${String(between(0, 59)).padStart(2, "0")}:00.000Z`,
      takenBy: pick(["n1", "n2"]),
      edits: [],
      ...opts,
    });
  };

  const nowIso = baseDate.toISOString();
  const hoursAgoIso = (h: number) => new Date(baseDate.getTime() - h * 3600000).toISOString();

  // ---- 74 admitted patients -------------------------------------------------
  // group plan by index:
  //  0-5   near-eligible (2 fever-free days ending yesterday, no reading today)
  //  6-8   already eligible awaiting sign-off (idx 6 escalated: eligible 6h ago)
  //  9-10  cleared, awaiting admin discharge
  //  11    has a historical 41.2 critical reading
  //  12-13 missed reading yesterday
  //  rest  ordinary mix
  const RECORDED_TODAY = new Set<number>();
  // deterministically mark ~30 ordinary patients as already measured today
  for (let i = 14; i < 74 && RECORDED_TODAY.size < 30; i++) {
    if (i % 2 === 0) RECORDED_TODAY.add(i);
  }

  for (let i = 0; i < 74; i++) {
    const bedId = i + 1;
    const pid = `pt${bedId}`;
    const stayDays = between(3, 14);
    const admittedOn = addDaysStr(today, -stayDays);
    const p: Patient = {
      id: pid,
      mrn: mrn(),
      name: `${pick(FIRST)} ${pick(LAST)}`,
      age: between(18, 80),
      sex: pick(SEXES),
      bedId,
      admittedOn,
      status: "admitted",
    };

    // base daily history admittedOn .. day-3 with occasional early fever + gaps
    const yesterday = addDaysStr(today, -1);
    for (let d = stayDays; d >= 3; d--) {
      const day = addDaysStr(today, -d);
      // a few deliberate gaps
      if (rand() < 0.08) continue;
      const early = d >= stayDays - 1;
      addReading(pid, day, early && rand() < 0.5 ? fever() : normal());
    }

    // group-specific shaping of the last 3 days
    if (i <= 5) {
      // near-eligible demo: day-3 fever caps streak, day-2 & day-1 normal, no today
      p.demo = true;
      addReading(pid, addDaysStr(today, -3), fever());
      addReading(pid, addDaysStr(today, -2), normal());
      addReading(pid, yesterday, normal());
    } else if (i <= 8) {
      // eligible: 3 consecutive normal ending yesterday + normal today
      addReading(pid, addDaysStr(today, -2), normal());
      addReading(pid, yesterday, normal());
      addReading(pid, today, normal());
      p.eligibleSince = i === 6 ? hoursAgoIso(6) : hoursAgoIso(2);
      alerts.push({
        id: `al_elig_${pid}`,
        at: p.eligibleSince,
        level: "info",
        audience: ["doctor", "head_doctor", "admin"],
        text: `${p.name} (Bed ${bedId}) is eligible for discharge — awaiting doctor sign-off.`,
        patientId: pid,
        resolved: false,
        dedupeKey: `eligible:${pid}`,
      });
    } else if (i <= 10) {
      // cleared, awaiting admin discharge
      addReading(pid, addDaysStr(today, -2), normal());
      addReading(pid, yesterday, normal());
      addReading(pid, today, normal());
      p.eligibleSince = hoursAgoIso(7);
      p.clearance = { clearedBy: "d1", clearedAt: hoursAgoIso(3) };
      alerts.push({
        id: `al_clr_${pid}`,
        at: p.clearance.clearedAt,
        level: "info",
        audience: ["admin", "head_doctor"],
        text: `${p.name} (Bed ${bedId}) cleared by Dr. Kavya Mehta — ready for discharge.`,
        patientId: pid,
        resolved: false,
        dedupeKey: `cleared:${pid}`,
      });
    } else if (i === 11) {
      // historical critical reading
      addReading(pid, addDaysStr(today, -2), 41.2);
      addReading(pid, yesterday, fever());
      alerts.push({
        id: `al_crit_${pid}`,
        at: hoursAgoIso(30),
        level: "critical",
        audience: ["doctor", "head_doctor"],
        text: `${p.name} (Bed ${bedId}) recorded 41.2 °C — urgent review.`,
        patientId: pid,
        resolved: true,
        dedupeKey: `critical:${pid}:${addDaysStr(today, -2)}`,
      });
    } else if (i <= 13) {
      // missed reading yesterday (gap), reading two days ago
      addReading(pid, addDaysStr(today, -2), normal());
      // intentionally no yesterday reading
    } else {
      // ordinary: reading yesterday; some have today's reading already
      addReading(pid, yesterday, rand() < 0.2 ? fever() : normal());
      if (RECORDED_TODAY.has(i)) addReading(pid, today, normal());
    }

    patients.push(p);
  }

  // ---- today's doctor visits (~18 primary) ----------------------------------
  const recordedTodayIds = patients
    .filter((p) => readings.some((r) => r.patientId === p.id && r.day === today))
    .map((p) => p.id);
  let visitCount = 0;
  for (const pid of recordedTodayIds) {
    if (visitCount >= 18) break;
    visits.push({
      id: `v_${pid}_${today}`,
      patientId: pid,
      day: today,
      doctorId: pick(["d1", "d2"]),
      at: `${today}T10:${String(between(0, 59)).padStart(2, "0")}:00.000Z`,
      notes: "Patient reviewed, stable. Continue supportive care and monitoring.",
      treatment: "Paracetamol PRN, oral fluids.",
    });
    visitCount++;
  }

  // ---- beds -----------------------------------------------------------------
  const beds: Bed[] = [];
  for (let id = 1; id <= 74; id++) {
    const occupant = patients.find((p) => p.bedId === id);
    beds.push({ id, ward: wardForBed(id), patientId: occupant ? occupant.id : null });
  }

  // ---- 200 closed cases (173 discharged + 27 deaths) + a few transfers ------
  const makeClosed = (
    idx: number,
    exitDay: string,
    kind: "recovered" | "deceased"
  ) => {
    const pid = `cl${idx}`;
    const los = between(4, 12);
    const admittedOn = addDaysStr(exitDay, -los);
    const delayH =
      rand() < 0.1 ? between(20, 30) : between(2, 10); // mostly 2-10h, few long
    const exitAt = `${exitDay}T${String(between(8, 18)).padStart(2, "0")}:00:00.000Z`;
    const eligibleAt = new Date(
      new Date(exitAt).getTime() - delayH * 3600000
    ).toISOString();
    const p: Patient = {
      id: pid,
      mrn: mrn(),
      name: `${pick(FIRST)} ${pick(LAST)}`,
      age: between(18, 80),
      sex: pick(SEXES),
      bedId: null,
      admittedOn,
      status: kind === "recovered" ? "discharged" : "deceased",
      eligibleSince: kind === "recovered" ? eligibleAt : undefined,
      exit: {
        on: exitDay,
        at: exitAt,
        by: kind === "recovered" ? "a1" : "d1",
        kind,
      },
    };
    patients.push(p);
  };

  let ci = 0;
  // older 140: exits 31..180 days ago, 17 deaths
  for (let k = 0; k < 140; k++) {
    const exitDay = addDaysStr(today, -between(31, 180));
    makeClosed(ci++, exitDay, k < 17 ? "deceased" : "recovered");
  }
  // recent 60: exits 1..30 days ago, 10 deaths
  for (let k = 0; k < 60; k++) {
    const exitDay = addDaysStr(today, -between(1, 30));
    makeClosed(ci++, exitDay, k < 10 ? "deceased" : "recovered");
  }
  // a handful of transfers (excluded from mortality denominator)
  for (let k = 0; k < 6; k++) {
    const exitDay = addDaysStr(today, -between(5, 120));
    const pid = `tr${k}`;
    patients.push({
      id: pid,
      mrn: mrn(),
      name: `${pick(FIRST)} ${pick(LAST)}`,
      age: between(18, 80),
      sex: pick(SEXES),
      bedId: null,
      admittedOn: addDaysStr(exitDay, -between(2, 8)),
      status: "transferred",
      exit: { on: exitDay, at: `${exitDay}T12:00:00.000Z`, by: "a1", kind: "transferred", reason: "Referred to tertiary care", note: "Transferred with doctor note." },
    });
  }

  audits.push({
    id: "aud_seed",
    at: nowIso,
    by: "system",
    type: "seed",
    detail: "Demo data initialised.",
  });

  return { patients, beds, readings, visits, alerts, audits };
}
