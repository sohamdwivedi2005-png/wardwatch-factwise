"use client";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { ArrowLeft, Thermometer, Stethoscope, ClipboardCheck, LogOut, HeartCrack, ArrowRightLeft } from "lucide-react";
import { useWard } from "@/store/wardwatch-store";
import { AppShell } from "@/components/layout/app-shell";
import { Button, Card, Badge, Textarea, Input, Label } from "@/components/ui/primitives";
import { Dialog, Sheet } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toaster";
import { TempValue, FeverBadge, StatusChip, StreakDots } from "@/components/shared/clinical";
import {
  feverFreeStreak, validateTemp, needsConfirm, isCritical, isFever,
} from "@/lib/rules";
import { can } from "@/lib/permissions";
import { today, addDaysStr, dayDiff, now } from "@/lib/clock";
import type { Patient, StaffRole } from "@/lib/types";

export default function PatientDetailPage() {
  return (
    <AppShell allow={["nurse", "doctor", "head_doctor", "admin"]}>
      <PatientDetail />
    </AppShell>
  );
}

function PatientDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const patients = useWard((s) => s.patients);
  const readings = useWard((s) => s.readings);
  const visits = useWard((s) => s.visits);
  const staff = useWard((s) => s.staff);
  const user = useWard((s) => s.staff.find((x) => x.id === s.currentUserId)!);
  const [dialog, setDialog] = React.useState<null | "temp" | "visit" | "death" | "transfer">(null);

  const p = patients.find((x) => x.id === params.id);
  if (!p) return <p className="text-sm text-slate-500">Patient not found.</p>;

  const role: StaffRole = user.role;
  const t = today();
  const pr = readings.filter((r) => r.patientId === p.id).sort((a, b) => (a.day < b.day ? -1 : 1));
  const pv = visits.filter((v) => v.patientId === p.id).sort((a, b) => (a.at < b.at ? 1 : -1));
  const streak = feverFreeStreak(readings, p, t);
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? id;

  // chart data: last 14 facility days
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) days.push(addDaysStr(t, -i));
  const chart = days.map((d) => {
    const r = pr.find((x) => x.day === d);
    return { day: d.slice(5), value: r ? r.valueC : null, fever: r ? isFever(r.valueC) : false };
  });
  const edits = pr.flatMap((r) => r.edits.map((e) => ({ ...e, day: r.day })));

  return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{p.name}</h1>
              <StatusChip status={p.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {p.mrn} · {p.age}y · {p.sex} · {p.bedId ? `Bed ${p.bedId}` : "No bed"}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              Admitted {p.admittedOn} · Day {Math.max(1, dayDiff((p.exit?.on ?? t), p.admittedOn) + 1)} of stay
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Fever-free streak</p>
            <div className="mt-1 flex items-center justify-end gap-2"><StreakDots streak={streak} /></div>
            {p.eligibleSince && !p.clearance && <Badge tone="amber" className="mt-2">Awaiting sign-off</Badge>}
            {p.clearance && p.status === "admitted" && <Badge tone="green" className="mt-2">Cleared for discharge</Badge>}
          </div>
        </div>

        {/* actions */}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {can.recordTemp(role) && p.status === "admitted" && (
            <Button size="sm" variant="secondary" onClick={() => setDialog("temp")}><Thermometer className="h-4 w-4" /> Record / correct temp</Button>
          )}
          {can.logVisit(role) && p.status === "admitted" && (
            <Button size="sm" variant="secondary" onClick={() => setDialog("visit")}><Stethoscope className="h-4 w-4" /> Log visit</Button>
          )}
          {can.signOff(role) && p.status === "admitted" && p.eligibleSince && !p.clearance && (
            <SignOff patientId={p.id} by={user.id} />
          )}
          {can.completeDischarge(role) && p.status === "admitted" && p.clearance && (
            <CompleteDischarge patientId={p.id} by={user.id} />
          )}
          {can.recordDeath(role) && p.status === "admitted" && (
            <Button size="sm" variant="secondary" onClick={() => setDialog("death")}><HeartCrack className="h-4 w-4" /> Record death</Button>
          )}
          {can.transfer(role) && p.status === "admitted" && (
            <Button size="sm" variant="secondary" onClick={() => setDialog("transfer")}><ArrowRightLeft className="h-4 w-4" /> Transfer</Button>
          )}
        </div>
      </Card>

      {/* chart */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Temperature — last 14 days</h2>
          <span className="flex items-center gap-1 text-xs text-slate-400"><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> fever ≥ 38°C</span>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={1} />
              <YAxis domain={[35, 42]} ticks={[35, 37, 38, 40, 42]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <ReferenceLine y={38} stroke="#ef4444" strokeDasharray="4 4" />
              <Tooltip formatter={(v) => (v == null ? "—" : `${v}°C`)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#0d9488"
                strokeWidth={2}
                connectNulls={false}
                dot={(props: { cx?: number; cy?: number; payload?: { fever?: boolean }; index?: number }) => {
                  const { cx, cy, payload, index } = props;
                  if (cx == null || cy == null || !payload || payload.fever == null)
                    return <g key={`d${index}`} />;
                  return <circle key={`d${index}`} cx={cx} cy={cy} r={3.5} fill={payload.fever ? "#ef4444" : "#0d9488"} />;
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* readings */}
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Reading history</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400">
                  <th className="py-1.5">Day</th><th>Temp</th><th>By</th><th>Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pr.slice().reverse().slice(0, 14).map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 text-slate-500">{r.day}</td>
                    <td><TempValue c={r.valueC} /></td>
                    <td className="text-slate-500">{nameOf(r.takenBy).split(" ").slice(-1)}</td>
                    <td className="flex gap-1 py-1.5">
                      {isFever(r.valueC) && <Badge tone="red">Fever</Badge>}
                      {r.late && <Badge tone="amber">Late</Badge>}
                      {r.fallback && <Badge tone="slate">Fallback</Badge>}
                      {r.edits.length > 0 && <Badge tone="slate">Edited</Badge>}
                    </td>
                  </tr>
                ))}
                {pr.length === 0 && <tr><td colSpan={4} className="py-3 text-slate-400">No readings.</td></tr>}
              </tbody>
            </table>
          </div>
          {edits.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold uppercase text-slate-400">Corrections</p>
              <ul className="mt-1 space-y-1 text-xs text-slate-500">
                {edits.map((e, i) => (
                  <li key={i}>{e.day}: {e.from}→{e.to}°C by {nameOf(e.by).split(" ").slice(-1)} ({e.reason})</li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* visits (hidden from admin) */}
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Doctor visits</h2>
          {!can.viewClinicalNotes(role) ? (
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-400">Clinical notes are not visible to admin staff.</p>
          ) : pv.length === 0 ? (
            <p className="py-3 text-sm text-slate-400">No visits logged.</p>
          ) : (
            <ul className="space-y-2.5">
              {pv.map((v) => (
                <li key={v.id} className="rounded-lg border border-slate-100 p-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{v.day} · {nameOf(v.doctorId)}</span>
                    {v.followUp && <Badge tone="slate">Follow-up</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{v.notes}</p>
                  {v.treatment && <p className="mt-0.5 text-xs text-slate-500">Treatment: {v.treatment}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {dialog === "temp" && <TempDialog patient={p} by={user.id} onClose={() => setDialog(null)} />}
      {dialog === "visit" && <VisitDialog patient={p} by={user.id} onClose={() => setDialog(null)} />}
      {dialog === "death" && <DeathDialog patient={p} by={user.id} onClose={() => setDialog(null)} />}
      {dialog === "transfer" && <TransferDialog patient={p} by={user.id} onClose={() => setDialog(null)} />}
    </div>
  );
}

function SignOff({ patientId, by }: { patientId: string; by: string }) {
  const signOff = useWard((s) => s.signOff);
  return <Button size="sm" onClick={() => { const r = signOff(patientId, by); r.ok ? toast("Signed off", { variant: "success" }) : toast(r.error!, { variant: "error" }); }}><ClipboardCheck className="h-4 w-4" /> Sign off discharge</Button>;
}
function CompleteDischarge({ patientId, by }: { patientId: string; by: string }) {
  const complete = useWard((s) => s.completeDischarge);
  const [confirm, setConfirm] = React.useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setConfirm(true)}><LogOut className="h-4 w-4" /> Complete discharge</Button>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Complete discharge?"
        footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button onClick={() => { const r = complete(patientId, by); setConfirm(false); r.ok ? toast("Discharged — bed freed", { variant: "success" }) : toast(r.error!, { variant: "error" }); }}>Confirm</Button></>}>
        <p className="text-sm text-slate-600">This frees the bed and closes the case as recovered.</p>
      </Dialog>
    </>
  );
}

function TempDialog({ patient, by, onClose }: { patient: Patient; by: string; onClose: () => void }) {
  const recordTemp = useWard((s) => s.recordTemp);
  const correctTemp = useWard((s) => s.correctTemp);
  const readings = useWard((s) => s.readings);
  const user = useWard((s) => s.staff.find((x) => x.id === s.currentUserId)!);
  const t = today();
  const existing = readings.find((r) => r.patientId === patient.id && r.day === t);
  const [val, setVal] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const num = parseFloat(val);
  const valid = validateTemp(num);
  const needReason = user.role !== "nurse"; // doctor fallback/edit reason

  function submit() {
    if (!valid.ok) return toast(valid.error!, { variant: "error" });
    if (needsConfirm(num) && !confirming) return setConfirming(true);
    if (existing) {
      if (reason.trim().length < 3) return toast("Reason required for correction.", { variant: "error" });
      const r = correctTemp(existing.id, num, by, reason.trim());
      return r.ok ? (toast("Corrected", { variant: "success" }), onClose()) : toast(r.error!, { variant: "error" });
    }
    const r = recordTemp(patient.id, num, by, needReason && reason.trim() ? { fallbackReason: reason.trim() } : undefined);
    if (!r.ok) return toast(r.error!, { variant: "error" });
    if (isCritical(num)) toast("Critical — doctors alerted", { variant: "error" });
    else toast("Recorded", { variant: "success" });
    onClose();
  }
  return (
    <Sheet open onClose={onClose} title={`${existing ? "Correct" : "Record"} temperature`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={confirming ? "danger" : "primary"} onClick={submit}>{confirming ? "Confirm" : "Save"}</Button></>}>
      <input autoFocus inputMode="decimal" value={val} onChange={(e) => { setVal(e.target.value.replace(/[^0-9.]/g, "")); setConfirming(false); }} placeholder="37.0"
        className="h-20 w-40 rounded-xl border border-slate-300 text-center text-4xl font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500" />
      {val && valid.ok && <div className="mt-2"><FeverBadge c={num} /></div>}
      {val && !valid.ok && <p className="mt-2 text-sm font-medium text-red-600">{valid.error}</p>}
      {valid.ok && needsConfirm(num) && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-800">Unusual reading — please re-check and confirm.</p>}
      {needReason && (
        <div className="mt-4">
          <Label>{existing ? "Correction reason" : "Reason (doctor fallback entry)"}</Label>
          <Input className="mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={existing ? "why corrected" : "Nurse unavailable / urgent assessment"} />
        </div>
      )}
    </Sheet>
  );
}

function VisitDialog({ patient, by, onClose }: { patient: Patient; by: string; onClose: () => void }) {
  const logVisit = useWard((s) => s.logVisit);
  const [notes, setNotes] = React.useState("");
  const [treatment, setTreatment] = React.useState("");
  return (
    <Dialog open onClose={onClose} title={`Log visit · ${patient.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => { const r = logVisit(patient.id, by, notes, treatment); r.ok ? (toast("Visit logged", { variant: "success" }), onClose()) : toast(r.error!, { variant: "error" }); }}>Save</Button></>}>
      <Label>Visit notes <span className="text-red-500">*</span></Label>
      <Textarea className="mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Findings and plan (min 5 chars)" />
      <Label className="mt-4 block">Treatment (optional)</Label>
      <Input className="mt-1.5" value={treatment} onChange={(e) => setTreatment(e.target.value)} />
    </Dialog>
  );
}

function DeathDialog({ patient, by, onClose }: { patient: Patient; by: string; onClose: () => void }) {
  const recordDeath = useWard((s) => s.recordDeath);
  const [note, setNote] = React.useState("");
  const [time, setTime] = React.useState(now().toISOString().slice(0, 16));
  return (
    <Dialog open onClose={onClose} title="Record death"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={() => { const r = recordDeath(patient.id, by, new Date(time).toISOString(), note); r.ok ? (toast("Death recorded — bed freed", { variant: "info" }), onClose()) : toast(r.error!, { variant: "error" }); }}>Confirm death</Button></>}>
      <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">This is irreversible (except by Head Doctor with reason) and frees the bed.</p>
      <Label className="mt-3 block">Time of death</Label>
      <Input type="datetime-local" className="mt-1.5" value={time} onChange={(e) => setTime(e.target.value)} />
      <Label className="mt-3 block">Note <span className="text-red-500">*</span></Label>
      <Textarea className="mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} />
    </Dialog>
  );
}

function TransferDialog({ patient, by, onClose }: { patient: Patient; by: string; onClose: () => void }) {
  const transfer = useWard((s) => s.transferPatient);
  const [reason, setReason] = React.useState("");
  const [doctorNote, setDoctorNote] = React.useState("");
  return (
    <Dialog open onClose={onClose} title="Record transfer"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => { const r = transfer(patient.id, by, reason, doctorNote); r.ok ? (toast("Transfer recorded — bed freed", { variant: "success" }), onClose()) : toast(r.error!, { variant: "error" }); }}>Confirm transfer</Button></>}>
      <Label>Reason <span className="text-red-500">*</span></Label>
      <Input className="mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. ICU referral" />
      <Label className="mt-3 block">Doctor note <span className="text-red-500">*</span></Label>
      <Textarea className="mt-1.5" value={doctorNote} onChange={(e) => setDoctorNote(e.target.value)} />
      <p className="mt-2 text-xs text-slate-400">Transfers are excluded from the mortality denominator.</p>
    </Dialog>
  );
}
