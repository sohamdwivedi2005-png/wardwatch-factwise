// lib/permissions.ts
// Centralised permission logic. Store actions MUST consult these functions —
// the UI hiding a button is cosmetic; this is where authorisation is decided
// (at the prototype's client-side level; see report for the production design).

import type { StaffRole, Staff, TempReading } from "./types";
import { hoursBetween } from "./clock";

export function landingPath(role: StaffRole): string {
  switch (role) {
    case "nurse":
      return "/nurse";
    case "doctor":
      return "/doctor";
    case "head_doctor":
      return "/dashboard";
    case "admin":
      return "/admin";
  }
}

export const can = {
  recordTemp: (role: StaffRole) =>
    role === "nurse" || role === "doctor" || role === "head_doctor",
  logVisit: (role: StaffRole) => role === "doctor" || role === "head_doctor",
  signOff: (role: StaffRole) => role === "doctor" || role === "head_doctor",
  recordDeath: (role: StaffRole) =>
    role === "doctor" || role === "head_doctor",
  completeDischarge: (role: StaffRole) => role === "admin",
  admit: (role: StaffRole) => role === "admin",
  transfer: (role: StaffRole) => role === "admin",
  override: (role: StaffRole) => role === "head_doctor",
  viewClinicalNotes: (role: StaffRole) => role !== "admin",
  // dashboard access is tiered
  dashboardFull: (role: StaffRole) => role === "head_doctor",
  dashboardSummary: (role: StaffRole) => role === "doctor",
  dashboardOps: (role: StaffRole) => role === "admin",
  dashboardAny: (role: StaffRole) => role !== "nurse",
};

/**
 * May this staff member CORRECT an existing reading?
 * - nurse: only their own, same facility day, within 2h of the original.
 * - doctor / head doctor: any reading, same day, reason required (enforced in UI).
 * - admin: never.
 */
export function canCorrectTemp(
  staff: Staff,
  reading: TempReading,
  nowDay: string,
  nowIso: string
): { ok: boolean; reason?: string } {
  if (staff.role === "admin")
    return { ok: false, reason: "Admins cannot edit temperatures." };
  if (reading.day !== nowDay)
    return { ok: false, reason: "Corrections are only allowed on the same day." };
  if (staff.role === "nurse") {
    if (reading.takenBy !== staff.id)
      return { ok: false, reason: "Nurses can only correct their own reading." };
    if (hoursBetween(nowIso, reading.takenAt) > 2)
      return { ok: false, reason: "Nurse corrections must be within 2 hours." };
  }
  return { ok: true };
}
