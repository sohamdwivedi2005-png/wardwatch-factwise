import { describe, it, expect } from "vitest";
import {
  feverFreeStreak,
  isEligibleByStreak,
  mortalityRate,
  rolling30Mortality,
  mortalityAlert,
  successRate,
  dailyCompliance,
  validateTemp,
  needsConfirm,
  isCritical,
  isFever,
  wardForBed,
  escalations,
} from "@/lib/rules";
import { can, canCorrectTemp } from "@/lib/permissions";
import type { Patient, TempReading, DoctorVisit, Staff } from "@/lib/types";

const TODAY = "2026-11-12";

function patient(p: Partial<Patient> = {}): Patient {
  return {
    id: "p1",
    mrn: "WW-0001",
    name: "Test Patient",
    age: 40,
    sex: "M",
    bedId: 1,
    admittedOn: "2026-11-01",
    status: "admitted",
    ...p,
  };
}
function reading(day: string, valueC: number, pid = "p1"): TempReading {
  return {
    id: `r_${pid}_${day}`,
    patientId: pid,
    day,
    valueC,
    takenAt: `${day}T08:00:00.000Z`,
    takenBy: "n1",
    edits: [],
  };
}

describe("temperature validation", () => {
  it("accepts in-range, rejects out-of-range", () => {
    expect(validateTemp(37.0).ok).toBe(true);
    expect(validateTemp(45).ok).toBe(false);
    expect(validateTemp(33).ok).toBe(false);
    expect(validateTemp(NaN).ok).toBe(false);
  });
  it("flags confirm and critical thresholds", () => {
    expect(needsConfirm(34.5)).toBe(true);
    expect(needsConfirm(41.0)).toBe(true);
    expect(needsConfirm(38.5)).toBe(false);
    expect(isCritical(41.2)).toBe(true);
    expect(isCritical(40.9)).toBe(false);
    expect(isFever(38.0)).toBe(true);
    expect(isFever(37.9)).toBe(false);
  });
});

describe("fever-free streak", () => {
  it("three normal days -> eligible", () => {
    const r = [reading("2026-11-10", 37), reading("2026-11-11", 37.2), reading("2026-11-12", 36.9)];
    expect(feverFreeStreak(r, patient(), TODAY)).toBe(3);
    expect(isEligibleByStreak(r, patient(), TODAY)).toBe(true);
  });
  it("fever resets the streak", () => {
    const r = [reading("2026-11-10", 37), reading("2026-11-11", 38.4), reading("2026-11-12", 36.9)];
    expect(feverFreeStreak(r, patient(), TODAY)).toBe(1);
  });
  it("missing previous day breaks the streak", () => {
    const r = [reading("2026-11-10", 37), reading("2026-11-12", 36.9)]; // 11th missing
    expect(feverFreeStreak(r, patient(), TODAY)).toBe(1);
  });
  it("no reading today while day is still open -> yesterday's streak stands", () => {
    const r = [reading("2026-11-09", 37), reading("2026-11-10", 37), reading("2026-11-11", 36.9)];
    expect(feverFreeStreak(r, patient(), TODAY)).toBe(3); // anchored on yesterday
  });
  it("does not count days before admission", () => {
    const r = [reading("2026-11-11", 37), reading("2026-11-12", 36.9)];
    expect(feverFreeStreak(r, patient({ admittedOn: "2026-11-11" }), TODAY)).toBe(2);
  });
  it("not eligible when discharged already", () => {
    const r = [reading("2026-11-10", 37), reading("2026-11-11", 37), reading("2026-11-12", 37)];
    expect(isEligibleByStreak(r, patient({ status: "discharged" }), TODAY)).toBe(false);
  });
});

describe("metrics", () => {
  const closed: Patient[] = [
    ...Array.from({ length: 8 }, (_, i) =>
      patient({ id: `d${i}`, status: "discharged", admittedOn: "2026-11-01", exit: { on: "2026-11-05", at: "2026-11-05T10:00:00Z", by: "a1", kind: "recovered" }, eligibleSince: "2026-11-05T06:00:00Z" })
    ),
    patient({ id: "x1", status: "deceased", exit: { on: "2026-11-04", at: "2026-11-04T10:00:00Z", by: "do1", kind: "deceased" } }),
    patient({ id: "x2", status: "deceased", exit: { on: "2026-11-06", at: "2026-11-06T10:00:00Z", by: "do1", kind: "deceased" } }),
    patient({ id: "t1", status: "transferred", exit: { on: "2026-11-03", at: "2026-11-03T10:00:00Z", by: "a1", kind: "transferred" } }),
  ];
  it("mortality excludes transfers", () => {
    expect(mortalityRate(closed)).toBeCloseTo(2 / 10, 5); // 2 deaths / 10 closed
    expect(successRate(closed)).toBeCloseTo(0.8, 5);
  });
  it("returns null for zero closed cases", () => {
    expect(mortalityRate([patient()])).toBeNull();
  });
  it("rolling-30 window only counts recent exits", () => {
    const old = patient({ id: "oldDeath", status: "deceased", exit: { on: "2026-09-01", at: "2026-09-01T10:00:00Z", by: "do1" } });
    expect(rolling30Mortality([...closed, old], TODAY)).toBeCloseTo(2 / 10, 5);
  });
  it("mortality alert needs a minimum sample", () => {
    const small = mortalityAlert(closed, TODAY); // 10 < 20
    expect(small.state).toBe("insufficient");
    const big: Patient[] = Array.from({ length: 24 }, (_, i) =>
      patient({ id: `b${i}`, status: i < 5 ? "deceased" : "discharged", exit: { on: "2026-11-05", at: "2026-11-05T10:00:00Z", by: "a1" } })
    );
    const alert = mortalityAlert(big, TODAY); // 5/24 = 20.8% > 15%
    expect(alert.state).toBe("alert");
  });
});

describe("daily compliance", () => {
  it("counts readings and primary visits, excludes follow-ups", () => {
    const pts = [patient({ id: "a" }), patient({ id: "b" }), patient({ id: "c" })];
    const r = [reading(TODAY, 37, "a"), reading(TODAY, 37, "b")];
    const v: DoctorVisit[] = [
      { id: "v1", patientId: "a", day: TODAY, doctorId: "do1", at: `${TODAY}T09:00:00Z`, notes: "seen" },
      { id: "v2", patientId: "a", day: TODAY, doctorId: "do1", at: `${TODAY}T15:00:00Z`, notes: "follow", followUp: true },
    ];
    const c = dailyCompliance(pts, r, v, TODAY);
    expect(c.admitted).toBe(3);
    expect(c.withReading).toBe(2);
    expect(c.withVisit).toBe(1); // follow-up not counted
  });
});

describe("permissions", () => {
  it("role matrix", () => {
    expect(can.recordTemp("nurse")).toBe(true);
    expect(can.recordTemp("admin")).toBe(false);
    expect(can.completeDischarge("doctor")).toBe(false);
    expect(can.completeDischarge("admin")).toBe(true);
    expect(can.signOff("nurse")).toBe(false);
    expect(can.override("doctor")).toBe(false);
    expect(can.override("head_doctor")).toBe(true);
    expect(can.viewClinicalNotes("admin")).toBe(false);
  });
  it("nurse temp correction window", () => {
    const staff: Staff = { id: "n1", name: "Priya", role: "nurse", pin: "1234" };
    const r = reading(TODAY, 37);
    expect(canCorrectTemp(staff, r, TODAY, `${TODAY}T09:00:00.000Z`).ok).toBe(true); // 1h later
    expect(canCorrectTemp(staff, r, TODAY, `${TODAY}T11:00:00.000Z`).ok).toBe(false); // 3h later
    const other = { ...r, takenBy: "n2" };
    expect(canCorrectTemp(staff, other, TODAY, `${TODAY}T08:30:00.000Z`).ok).toBe(false);
  });
});

describe("wards & escalations", () => {
  it("ward mapping", () => {
    expect(wardForBed(1)).toBe("A");
    expect(wardForBed(19)).toBe("A");
    expect(wardForBed(20)).toBe("B");
    expect(wardForBed(56)).toBe("C");
    expect(wardForBed(74)).toBe("D");
  });
  it("escalates eligible-not-signed-off beyond 4h", () => {
    const nowIso = "2026-11-12T12:00:00.000Z";
    const p = patient({ eligibleSince: "2026-11-12T06:00:00.000Z" }); // 6h
    expect(escalations([p], nowIso).some((e) => e.kind === "signoff_overdue")).toBe(true);
    const p2 = patient({ eligibleSince: "2026-11-12T10:00:00.000Z" }); // 2h
    expect(escalations([p2], nowIso).length).toBe(0);
  });
});
