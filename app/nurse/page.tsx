"use client";
import * as React from "react";
import { Search, Thermometer, Check } from "lucide-react";
import { useWard } from "@/store/wardwatch-store";
import { AppShell } from "@/components/layout/app-shell";
import { Button, Card, Input, Progress, Badge } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/overlay";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { TempValue, FeverBadge, StreakDots, lastReading, EmptyState } from "@/components/shared/clinical";
import {
  feverFreeStreak,
  validateTemp,
  needsConfirm,
  isCritical,
  isFever,
  wardForBed,
} from "@/lib/rules";
import { today } from "@/lib/clock";
import { dayDiff } from "@/lib/clock";
import type { Patient } from "@/lib/types";

export default function NursePage() {
  return (
    <AppShell allow={["nurse", "doctor", "head_doctor"]}>
      <NurseRounds />
    </AppShell>
  );
}

function NurseRounds() {
  const patients = useWard((s) => s.patients);
  const readings = useWard((s) => s.readings);
  const user = useWard((s) => s.staff.find((x) => x.id === s.currentUserId)!);
  const [tab, setTab] = React.useState("pending");
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState<Patient | null>(null);

  const t = today();
  const admitted = patients.filter((p) => p.status === "admitted");
  const recordedToday = (p: Patient) => readings.some((r) => r.patientId === p.id && r.day === t);
  const recordedCount = admitted.filter(recordedToday).length;

  const match = (p: Patient) =>
    !q ||
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    p.mrn.toLowerCase().includes(q.toLowerCase()) ||
    String(p.bedId).includes(q);

  let list = admitted.filter(match);
  if (tab === "pending") list = list.filter((p) => !recordedToday(p));
  else if (tab === "recorded") list = list.filter(recordedToday);

  // sort: demo (near-eligible) first in pending, then by bed
  list = [...list].sort((a, b) => {
    if (tab === "pending") {
      if (!!a.demo !== !!b.demo) return a.demo ? -1 : 1;
    }
    return (a.bedId ?? 0) - (b.bedId ?? 0);
  });

  const byWard = new Map<string, Patient[]>();
  for (const p of list) {
    const w = wardForBed(p.bedId!);
    if (!byWard.has(w)) byWard.set(w, []);
    byWard.get(w)!.push(p);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Today&apos;s Rounds</h1>
        <p className="text-sm text-slate-500">Record one temperature per patient for {t}.</p>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Temperatures recorded</span>
          <span className="font-semibold tabular-nums text-slate-900">{recordedCount} / 74</span>
        </div>
        <Progress className="mt-2" value={(recordedCount / 74) * 100} />
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="sm:w-64">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { key: "pending", label: "Pending", count: admitted.filter((p) => !recordedToday(p)).length },
              { key: "recorded", label: "Recorded", count: recordedCount },
              { key: "all", label: "All", count: admitted.length },
            ]}
          />
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search bed, name or MRN" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState title="Nothing here" hint={tab === "pending" ? "All temperatures recorded." : "No matching patients."} />
      ) : (
        [...byWard.entries()].map(([ward, pts]) => (
          <div key={ward}>
            <p className="mb-1.5 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Ward {ward}</p>
            <Card className="divide-y divide-slate-100">
              {pts.map((p) => {
                const lr = lastReading(readings, p.id);
                const streak = feverFreeStreak(readings, p, t);
                const done = recordedToday(p);
                const todayReading = readings.find((r) => r.patientId === p.id && r.day === t);
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3">
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                      <span className="text-[10px] leading-none text-slate-400">BED</span>
                      <span className="text-sm font-bold leading-tight">{p.bedId}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                        {p.demo && (
                          <span title="2 fever-free days — record a normal temperature to make eligible">
                            <Badge tone="teal">Demo</Badge>
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>{p.age}y · {p.sex}</span>
                        <span>Day {dayDiff(t, p.admittedOn) + 1}</span>
                        {lr ? <TempValue c={lr.valueC} className="text-slate-600" /> : <span className="text-slate-400">No reading</span>}
                        <StreakDots streak={streak} />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {done ? (
                        <>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700"><Check className="h-3.5 w-3.5" /> {todayReading && <TempValue c={todayReading.valueC} />}</span>
                          <button className="text-xs text-slate-400 hover:text-teal-700" onClick={() => setActive(p)}>Correct</button>
                        </>
                      ) : (
                        <Button size="sm" onClick={() => setActive(p)}>
                          <Thermometer className="h-4 w-4" /> Record
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        ))
      )}

      {active && (
        <RecordSheet
          patient={active}
          nurseId={user.id}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function RecordSheet({ patient, nurseId, onClose }: { patient: Patient; nurseId: string; onClose: () => void }) {
  const recordTemp = useWard((s) => s.recordTemp);
  const correctTemp = useWard((s) => s.correctTemp);
  const readings = useWard((s) => s.readings);
  const t = today();
  const existing = readings.find((r) => r.patientId === patient.id && r.day === t);
  const [val, setVal] = React.useState(existing ? String(existing.valueC) : "");
  const [confirming, setConfirming] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const num = parseFloat(val);
  const valid = validateTemp(num);

  function submit() {
    if (!valid.ok) {
      toast(valid.error!, { variant: "error" });
      return;
    }
    if (needsConfirm(num) && !confirming) {
      setConfirming(true);
      return;
    }
    if (existing) {
      if (reason.trim().length < 3) {
        toast("A correction reason is required.", { variant: "error" });
        return;
      }
      const r = correctTemp(existing.id, num, nurseId, reason.trim());
      if (!r.ok) return toast(r.error!, { variant: "error" });
      toast("Reading corrected", { variant: "success" });
    } else {
      const r = recordTemp(patient.id, num, nurseId);
      if (!r.ok) return toast(r.error!, { variant: "error" });
      if (isCritical(num)) toast("Critical reading — doctors alerted", { variant: "error" });
      else toast("Temperature recorded", { variant: "success", description: `${num.toFixed(1)}°C for ${patient.name}` });
      const streakNow = feverFreeStreak([...readings, { id: "tmp", patientId: patient.id, day: t, valueC: num, takenAt: "", takenBy: nurseId, edits: [] }], patient, t);
      if (streakNow >= 3) toast("Patient now eligible — doctor & admin notified", { variant: "info" });
    }
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? `Correct temperature · Bed ${patient.bedId}` : `Record temperature · Bed ${patient.bedId}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant={confirming ? "danger" : "primary"} onClick={submit}>
            {confirming ? "Confirm reading" : existing ? "Save correction" : "Save"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-500">{patient.name} · {patient.age}y · {patient.sex}</p>
      <div className="mt-4">
        <div className="flex items-end gap-3">
          <input
            autoFocus
            inputMode="decimal"
            value={val}
            onChange={(e) => { setVal(e.target.value.replace(/[^0-9.]/g, "")); setConfirming(false); }}
            placeholder="37.0"
            className="h-20 w-40 rounded-xl border border-slate-300 bg-white text-center text-4xl font-bold tabular-nums text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          />
          <div className="pb-2">
            <p className="text-lg font-semibold text-slate-400">°C</p>
            {val && valid.ok && <div className="mt-1">{isFever(num) ? <FeverBadge c={num} /> : <FeverBadge c={num} />}</div>}
          </div>
        </div>
        {val && !valid.ok && <p className="mt-2 text-sm font-medium text-red-600">{valid.error}</p>}
        {valid.ok && needsConfirm(num) && (
          <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-800">
            {isCritical(num) ? "This is a critical reading (≥ 41.0 °C). " : "This reading is unusually low (< 35.0 °C). "}
            Please re-check and confirm.
          </p>
        )}
        {existing && (
          <div className="mt-4">
            <label className="text-sm font-medium text-slate-700">Correction reason</label>
            <Input className="mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. typo, re-measured" />
            <p className="mt-1 text-xs text-slate-400">Every edit is kept in the audit trail.</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
