// store/wardwatch-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Staff,
  Patient,
  Bed,
  TempReading,
  DoctorVisit,
  Alert,
  AuditEvent,
  StaffRole,
} from "@/lib/types";
import { STAFF, buildSeed } from "@/lib/seed";
import {
  now,
  today,
  setOffsetMinutes,
  minutesToNextMorning,
  addDaysStr,
} from "@/lib/clock";
import {
  isEligibleByStreak,
  isCritical,
  wardForBed,
  escalations,
  dailyCompliance,
} from "@/lib/rules";
import { uid } from "@/lib/utils";

const STORE_KEY = "wardwatch-v1";
const STORE_VERSION = 8;

interface DailySnapshot {
  day: string;
  admitted: number;
  withReading: number;
  withVisit: number;
}

interface WardState {
  staff: Staff[];
  patients: Patient[];
  beds: Bed[];
  readings: TempReading[];
  visits: DoctorVisit[];
  alerts: Alert[];
  audits: AuditEvent[];
  dailySnapshots: DailySnapshot[];
  offsetMinutes: number;
  currentUserId: string | null;
  hydrated: boolean;

  // auth
  login: (staffId: string, pin: string) => { ok: boolean; error?: string };
  logout: () => void;
  currentUser: () => Staff | null;

  // clinical actions
  recordTemp: (
    patientId: string,
    valueC: number,
    by: string,
    opts?: { fallbackReason?: string; late?: boolean; day?: string }
  ) => { ok: boolean; error?: string };
  correctTemp: (
    readingId: string,
    newValue: number,
    by: string,
    reason: string
  ) => { ok: boolean; error?: string };
  logVisit: (
    patientId: string,
    doctorId: string,
    notes: string,
    treatment?: string,
    followUp?: boolean
  ) => { ok: boolean; error?: string };
  notifyNurse: (patientId: string, by: string) => void;
  signOff: (patientId: string, by: string) => { ok: boolean; error?: string };
  completeDischarge: (patientId: string, by: string) => { ok: boolean; error?: string };
  recordDeath: (
    patientId: string,
    by: string,
    timeOfDeath: string,
    note: string
  ) => { ok: boolean; error?: string };
  transferPatient: (
    patientId: string,
    by: string,
    reason: string,
    doctorNote: string
  ) => { ok: boolean; error?: string };
  admitPatient: (
    data: { name: string; age: number; sex: string; phone?: string },
    bedId: number,
    by: string
  ) => { ok: boolean; error?: string; patientId?: string };
  overrideDischarge: (patientId: string, by: string, reason: string) => { ok: boolean; error?: string };

  // alerts
  resolveAlert: (alertId: string) => void;

  // demo
  advanceHours: (h: number) => void;
  advanceDay: () => void;
  reset: () => void;
}

function freshData() {
  const seed = buildSeed(new Date());
  return {
    patients: seed.patients,
    beds: seed.beds,
    readings: seed.readings,
    visits: seed.visits,
    alerts: seed.alerts,
    audits: seed.audits,
    dailySnapshots: [] as DailySnapshot[],
    offsetMinutes: 0,
  };
}

function audit(by: string, type: string, detail: string, patientId?: string): AuditEvent {
  return { id: uid("aud"), at: now().toISOString(), by, type, detail, patientId };
}

export const useWard = create<WardState>()(
  persist(
    (set, get) => ({
      staff: STAFF,
      ...freshData(),
      currentUserId: null,
      hydrated: false,

      currentUser: () => {
        const { staff, currentUserId } = get();
        return staff.find((s) => s.id === currentUserId) ?? null;
      },

      login: (staffId, pin) => {
        const s = get().staff.find((x) => x.id === staffId);
        if (!s) return { ok: false, error: "Unknown staff member." };
        if (s.pin !== pin) return { ok: false, error: "Incorrect PIN." };
        set({ currentUserId: staffId });
        return { ok: true };
      },

      logout: () => set({ currentUserId: null }),

      recordTemp: (patientId, valueC, by, opts = {}) => {
        const st = get();
        const p = st.patients.find((x) => x.id === patientId);
        if (!p) return { ok: false, error: "Patient not found." };
        if (p.status !== "admitted")
          return { ok: false, error: "Patient is no longer admitted." };
        const day = opts.day ?? today();
        const exists = st.readings.find((r) => r.patientId === patientId && r.day === day);
        if (exists)
          return { ok: false, error: "A reading has already been recorded for today." };

        const reading: TempReading = {
          id: uid("r"),
          patientId,
          day,
          valueC,
          takenAt: now().toISOString(),
          takenBy: by,
          edits: [],
          late: opts.late,
          fallback: !!opts.fallbackReason,
          fallbackReason: opts.fallbackReason,
        };

        const readings = [...st.readings, reading];
        const alerts = [...st.alerts];
        const audits = [...st.audits, audit(by, "temp.record", `${valueC} °C recorded`, patientId)];

        // critical alert
        if (isCritical(valueC)) {
          alerts.push({
            id: uid("al"),
            at: now().toISOString(),
            level: "critical",
            audience: ["doctor", "head_doctor"],
            text: `${p.name} (Bed ${p.bedId}) recorded ${valueC.toFixed(1)} °C — urgent review.`,
            patientId,
            resolved: false,
            dedupeKey: `critical:${patientId}:${day}`,
          });
        }

        // recompute eligibility / revocation for this patient
        const patients = st.patients.map((x) => {
          if (x.id !== patientId) return x;
          const eligible = isEligibleByStreak(readings, x, today());
          if (eligible && !x.eligibleSince) {
            alerts.push({
              id: uid("al"),
              at: now().toISOString(),
              level: "info",
              audience: ["doctor", "head_doctor", "admin"],
              text: `${x.name} (Bed ${x.bedId}) is now eligible for discharge — awaiting sign-off.`,
              patientId,
              resolved: false,
              dedupeKey: `eligible:${patientId}`,
            });
            return { ...x, eligibleSince: now().toISOString() };
          }
          if (!eligible && valueC >= 38 && (x.eligibleSince || x.clearance)) {
            // fever revokes eligibility and clearance
            alerts.push({
              id: uid("al"),
              at: now().toISOString(),
              level: "warn",
              audience: ["doctor", "head_doctor", "admin"],
              text: `${x.name} (Bed ${x.bedId}) recorded a fever — eligibility/clearance revoked.`,
              patientId,
              resolved: false,
            });
            return { ...x, eligibleSince: undefined, clearance: undefined };
          }
          return x;
        });

        set({ readings, patients, alerts, audits });
        return { ok: true };
      },

      correctTemp: (readingId, newValue, by, reason) => {
        const st = get();
        const r = st.readings.find((x) => x.id === readingId);
        if (!r) return { ok: false, error: "Reading not found." };
        const readings = st.readings.map((x) =>
          x.id === readingId
            ? {
                ...x,
                valueC: newValue,
                edits: [
                  ...x.edits,
                  { at: now().toISOString(), by, from: x.valueC, to: newValue, reason },
                ],
              }
            : x
        );
        // recompute eligibility after correction
        const p = st.patients.find((x) => x.id === r.patientId)!;
        const patients = st.patients.map((x) => {
          if (x.id !== p.id) return x;
          const eligible = isEligibleByStreak(readings, x, today());
          if (eligible && !x.eligibleSince) return { ...x, eligibleSince: now().toISOString() };
          if (!eligible && (x.eligibleSince || x.clearance))
            return { ...x, eligibleSince: undefined, clearance: undefined };
          return x;
        });
        set({
          readings,
          patients,
          audits: [...st.audits, audit(by, "temp.correct", `corrected to ${newValue} °C (${reason})`, r.patientId)],
        });
        return { ok: true };
      },

      logVisit: (patientId, doctorId, notes, treatment, followUp) => {
        const st = get();
        const day = today();
        const hasReading = st.readings.some((r) => r.patientId === patientId && r.day === day);
        if (!hasReading)
          return { ok: false, error: "Temperature not yet recorded today — nurse has been notified." };
        if (notes.trim().length < 5)
          return { ok: false, error: "Visit notes must be at least 5 characters." };
        const primaryExists = st.visits.some(
          (v) => v.patientId === patientId && v.day === day && !v.followUp
        );
        const visit: DoctorVisit = {
          id: uid("v"),
          patientId,
          day,
          doctorId,
          at: now().toISOString(),
          notes: notes.trim(),
          treatment: treatment?.trim() || undefined,
          followUp: followUp || primaryExists,
        };
        set({
          visits: [...st.visits, visit],
          audits: [...st.audits, audit(doctorId, "visit.log", visit.followUp ? "follow-up visit" : "primary visit", patientId)],
        });
        return { ok: true };
      },

      notifyNurse: (patientId, by) => {
        const st = get();
        const p = st.patients.find((x) => x.id === patientId);
        if (!p) return;
        set({
          alerts: [
            ...st.alerts,
            {
              id: uid("al"),
              at: now().toISOString(),
              level: "warn",
              audience: ["nurse"],
              text: `Temperature needed for ${p.name} (Bed ${p.bedId}) — requested by doctor.`,
              patientId,
              resolved: false,
            },
          ],
          audits: [...st.audits, audit(by, "notify.nurse", "requested temperature", patientId)],
        });
      },

      signOff: (patientId, by) => {
        const st = get();
        const p = st.patients.find((x) => x.id === patientId);
        if (!p) return { ok: false, error: "Patient not found." };
        if (!p.eligibleSince)
          return { ok: false, error: "Patient is not eligible for discharge." };
        const patients = st.patients.map((x) =>
          x.id === patientId
            ? { ...x, clearance: { clearedBy: by, clearedAt: now().toISOString() } }
            : x
        );
        set({
          patients,
          alerts: [
            ...st.alerts,
            {
              id: uid("al"),
              at: now().toISOString(),
              level: "info",
              audience: ["admin", "head_doctor"],
              text: `${p.name} (Bed ${p.bedId}) cleared for discharge — ready for admin.`,
              patientId,
              resolved: false,
              dedupeKey: `cleared:${patientId}`,
            },
          ],
          audits: [...st.audits, audit(by, "discharge.signoff", "cleared for discharge", patientId)],
        });
        return { ok: true };
      },

      completeDischarge: (patientId, by) => {
        const st = get();
        const p = st.patients.find((x) => x.id === patientId);
        if (!p) return { ok: false, error: "Patient not found." };
        if (!p.clearance)
          return { ok: false, error: "Patient has not been cleared by a doctor." };
        const patients = st.patients.map((x) =>
          x.id === patientId
            ? {
                ...x,
                status: "discharged" as const,
                bedId: null,
                exit: { on: today(), at: now().toISOString(), by, kind: "recovered" as const },
              }
            : x
        );
        const beds = st.beds.map((b) => (b.patientId === patientId ? { ...b, patientId: null } : b));
        set({
          patients,
          beds,
          audits: [...st.audits, audit(by, "discharge.complete", "discharged, bed freed", patientId)],
        });
        return { ok: true };
      },

      recordDeath: (patientId, by, timeOfDeath, note) => {
        const st = get();
        const p = st.patients.find((x) => x.id === patientId);
        if (!p) return { ok: false, error: "Patient not found." };
        if (!note.trim()) return { ok: false, error: "A note is required." };
        const patients = st.patients.map((x) =>
          x.id === patientId
            ? {
                ...x,
                status: "deceased" as const,
                bedId: null,
                exit: { on: today(), at: timeOfDeath, by, kind: "deceased" as const, note: note.trim() },
              }
            : x
        );
        const beds = st.beds.map((b) => (b.patientId === patientId ? { ...b, patientId: null } : b));
        set({
          patients,
          beds,
          alerts: [
            ...st.alerts,
            {
              id: uid("al"),
              at: now().toISOString(),
              level: "warn",
              audience: ["admin", "head_doctor"],
              text: `Death recorded for ${p.name} (Bed ${p.bedId}). Bed freed.`,
              patientId,
              resolved: false,
            },
          ],
          audits: [...st.audits, audit(by, "death.record", "death recorded", patientId)],
        });
        return { ok: true };
      },

      transferPatient: (patientId, by, reason, doctorNote) => {
        const st = get();
        const p = st.patients.find((x) => x.id === patientId);
        if (!p) return { ok: false, error: "Patient not found." };
        if (!reason.trim()) return { ok: false, error: "A reason is required." };
        if (!doctorNote.trim()) return { ok: false, error: "A doctor note is required." };
        const patients = st.patients.map((x) =>
          x.id === patientId
            ? {
                ...x,
                status: "transferred" as const,
                bedId: null,
                exit: { on: today(), at: now().toISOString(), by, kind: "transferred" as const, reason: reason.trim(), note: doctorNote.trim() },
              }
            : x
        );
        const beds = st.beds.map((b) => (b.patientId === patientId ? { ...b, patientId: null } : b));
        set({
          patients,
          beds,
          audits: [...st.audits, audit(by, "transfer", `transferred: ${reason.trim()}`, patientId)],
        });
        return { ok: true };
      },

      admitPatient: (data, bedId, by) => {
        const st = get();
        const occupied = st.beds.filter((b) => b.patientId).length;
        if (occupied >= 74) return { ok: false, error: "Facility is at full capacity." };
        const bed = st.beds.find((b) => b.id === bedId);
        if (!bed) return { ok: false, error: "Bed not found." };
        if (bed.patientId) return { ok: false, error: "Bed is already occupied." };
        if (data.age < 0 || data.age > 120) return { ok: false, error: "Age must be 0–120." };
        const mrnSeq = st.patients.length + 1;
        const pid = uid("pt");
        const patient: Patient = {
          id: pid,
          mrn: `WW-${String(1000 + mrnSeq).padStart(4, "0")}`,
          name: data.name.trim(),
          age: data.age,
          sex: data.sex,
          phone: data.phone,
          bedId,
          admittedOn: today(),
          status: "admitted",
        };
        set({
          patients: [...st.patients, patient],
          beds: st.beds.map((b) => (b.id === bedId ? { ...b, patientId: pid } : b)),
          audits: [...st.audits, audit(by, "admit", `admitted to bed ${bedId}`, pid)],
        });
        return { ok: true, patientId: pid };
      },

      overrideDischarge: (patientId, by, reason) => {
        const st = get();
        const p = st.patients.find((x) => x.id === patientId);
        if (!p) return { ok: false, error: "Patient not found." };
        if (!reason.trim()) return { ok: false, error: "An override reason is required." };
        const patients = st.patients.map((x) =>
          x.id === patientId
            ? {
                ...x,
                status: "discharged" as const,
                bedId: null,
                clearance: { clearedBy: by, clearedAt: now().toISOString(), override: true, reason: reason.trim() },
                exit: { on: today(), at: now().toISOString(), by, kind: "recovered" as const, reason: `Override: ${reason.trim()}` },
              }
            : x
        );
        const beds = st.beds.map((b) => (b.patientId === patientId ? { ...b, patientId: null } : b));
        set({
          patients,
          beds,
          alerts: [
            ...st.alerts,
            {
              id: uid("al"),
              at: now().toISOString(),
              level: "warn",
              audience: ["head_doctor", "admin"],
              text: `Clinical override discharge for ${p.name}: ${reason.trim()}`,
              patientId,
              resolved: false,
            },
          ],
          audits: [...st.audits, audit(by, "override.discharge", reason.trim(), patientId)],
        });
        return { ok: true };
      },

      resolveAlert: (alertId) =>
        set((s) => ({ alerts: s.alerts.map((a) => (a.id === alertId ? { ...a, resolved: true } : a)) })),

      advanceHours: (h) => {
        const next = get().offsetMinutes + h * 60;
        setOffsetMinutes(next);
        set({ offsetMinutes: next });
        get().resolveAlert; // noop ref
        syncEscalations(get, set);
      },

      advanceDay: () => {
        const st = get();
        // freeze yesterday's (soon-to-be previous) compliance
        const prevDay = today();
        const c = dailyCompliance(st.patients, st.readings, st.visits, prevDay);
        const snapshots = st.dailySnapshots.some((s) => s.day === prevDay)
          ? st.dailySnapshots
          : [...st.dailySnapshots, { day: prevDay, admitted: c.admitted, withReading: c.withReading, withVisit: c.withVisit }];
        const next = st.offsetMinutes + minutesToNextMorning();
        setOffsetMinutes(next);
        set({ offsetMinutes: next, dailySnapshots: snapshots });
        syncEscalations(get, set);
      },

      reset: () => {
        setOffsetMinutes(0);
        set({ ...freshData(), currentUserId: get().currentUserId });
        syncEscalations(get, set);
      },
    }),
    {
      name: STORE_KEY,
      version: STORE_VERSION,
      migrate: () => {
        // any version mismatch -> re-seed cleanly so an old deploy can't break the demo
        return { ...freshData(), currentUserId: null, hydrated: false } as Partial<WardState>;
      },
      partialize: (s) => ({
        patients: s.patients,
        beds: s.beds,
        readings: s.readings,
        visits: s.visits,
        alerts: s.alerts,
        audits: s.audits,
        dailySnapshots: s.dailySnapshots,
        offsetMinutes: s.offsetMinutes,
        currentUserId: s.currentUserId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          setOffsetMinutes(state.offsetMinutes ?? 0);
          state.hydrated = true;
          // compute escalation alerts after hydration
          setTimeout(() => syncEscalations(useWard.getState, useWard.setState), 0);
        }
      },
    }
  )
);

// Materialise current escalations as (deduped) alerts.
function syncEscalations(
  get: () => WardState,
  set: (partial: Partial<WardState>) => void
) {
  const st = get();
  const esc = escalations(st.patients, now().toISOString());
  const existing = new Set(st.alerts.map((a) => a.dedupeKey).filter(Boolean));
  const added: Alert[] = [];
  for (const e of esc) {
    const p = st.patients.find((x) => x.id === e.patientId);
    if (!p) continue;
    const key = `escal:${e.kind}:${p.id}`;
    if (existing.has(key)) continue;
    added.push({
      id: uid("al"),
      at: now().toISOString(),
      level: "warn",
      audience: e.kind === "signoff_overdue" ? ["head_doctor"] : ["admin", "head_doctor"],
      text:
        e.kind === "signoff_overdue"
          ? `${p.name} (Bed ${p.bedId}) eligible for ${e.hours.toFixed(1)}h without sign-off.`
          : `${p.name} (Bed ${p.bedId}) cleared ${e.hours.toFixed(1)}h ago, not yet discharged.`,
      patientId: p.id,
      resolved: false,
      dedupeKey: key,
    });
  }
  if (added.length) set({ alerts: [...st.alerts, ...added] });
}

// mark hydrated=true even when there was nothing persisted (first visit)
if (typeof window !== "undefined") {
  setTimeout(() => {
    if (!useWard.getState().hydrated) {
      useWard.setState({ hydrated: true });
      syncEscalations(useWard.getState, useWard.setState);
    }
  }, 0);
}
