// lib/types.ts
// Core domain models for WardWatch. These field names are the contract the
// store and UI depend on — extend, but do not rename, the specified fields.

export type StaffRole = "nurse" | "doctor" | "head_doctor" | "admin";

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  pin: string;
}

export type Ward = "A" | "B" | "C" | "D";

export interface Bed {
  id: number;
  ward: Ward;
  patientId: string | null;
}

export type PatientStatus =
  | "admitted"
  | "discharged"
  | "deceased"
  | "transferred";

export interface Patient {
  id: string;
  mrn: string;
  name: string;
  age: number;
  sex: string;
  phone?: string;
  bedId: number | null;
  admittedOn: string; // facility day yyyy-MM-dd
  status: PatientStatus;
  clearance?: {
    clearedBy: string;
    clearedAt: string; // ISO timestamp
    override?: boolean;
    reason?: string;
  };
  eligibleSince?: string; // ISO timestamp
  exit?: {
    on: string; // facility day yyyy-MM-dd
    at: string; // ISO timestamp
    by: string;
    kind?: "recovered" | "deceased" | "transferred";
    note?: string;
    reason?: string;
  };
  /** demo-only: flags the six near-eligible patients so evaluators can find them */
  demo?: boolean;
}

export interface TempEdit {
  at: string;
  by: string;
  from: number;
  to: number;
  reason: string;
}

export interface TempReading {
  id: string;
  patientId: string;
  day: string; // facility day yyyy-MM-dd
  valueC: number;
  takenAt: string; // ISO timestamp
  takenBy: string;
  edits: TempEdit[];
  late?: boolean;
  fallback?: boolean;
  fallbackReason?: string;
}

export interface DoctorVisit {
  id: string;
  patientId: string;
  day: string; // facility day yyyy-MM-dd
  doctorId: string;
  at: string; // ISO timestamp
  notes: string;
  treatment?: string;
  followUp?: boolean;
}

export interface AuditEvent {
  id: string;
  at: string;
  by: string;
  type: string;
  patientId?: string;
  detail: string;
}

export type AlertLevel = "info" | "warn" | "critical";

export interface Alert {
  id: string;
  at: string;
  level: AlertLevel;
  audience: StaffRole[];
  text: string;
  patientId?: string;
  resolved: boolean;
  /** stable key so the same escalation is not raised twice */
  dedupeKey?: string;
}

/** Daily compliance frozen at the moment a facility day advances. */
export interface DailyComplianceSnapshot {
  day: string;
  admitted: number;
  withReading: number;
  withVisit: number;
}
