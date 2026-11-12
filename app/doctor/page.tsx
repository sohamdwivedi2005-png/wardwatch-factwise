"use client";
import * as React from "react";
import Link from "next/link";
import { Stethoscope, BellRing, ClipboardCheck, CheckCircle2, ChevronRight } from "lucide-react";
import { useWard } from "@/store/wardwatch-store";
import { AppShell } from "@/components/layout/app-shell";
import { Button, Card, Badge, Textarea, Input, Progress } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toaster";
import { TempValue, FeverBadge, EmptyState, lastReading } from "@/components/shared/clinical";
import { hasReadingToday, primaryVisitToday, isFever, feverFreeStreak } from "@/lib/rules";
import { today, dayDiff } from "@/lib/clock";
import type { Patient } from "@/lib/types";

export default function DoctorPage() {
  return (
    <AppShell allow={["doctor", "head_doctor"]}>
      <DoctorQueue />
    </AppShell>
  );
}

function Row({ patient, right }: { patient: Patient; right: React.ReactNode }) {
  const readings = useWard((s) => s.readings);
  const t = today();
  const todayReading = readings.find((r) => r.patientId === patient.id && r.day === t) ?? lastReading(readings, patient.id);
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-slate-100 text-slate-700">
        <span className="text-[10px] leading-none text-slate-400">BED</span>
        <span className="text-sm font-bold leading-tight">{patient.bedId}</span>
      </div>
      <Link href={`/patients/${patient.id}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900 hover:text-teal-700">{patient.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
          <span>{patient.age}y · Day {dayDiff(t, patient.admittedOn) + 1}</span>
          {todayReading && <TempValue c={todayReading.valueC} />}
          {todayReading && isFever(todayReading.valueC) && <FeverBadge c={todayReading.valueC} />}
        </div>
      </Link>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

function DoctorQueue() {
  const patients = useWard((s) => s.patients);
  const readings = useWard((s) => s.readings);
  const visits = useWard((s) => s.visits);
  const notifyNurse = useWard((s) => s.notifyNurse);
  const user = useWard((s) => s.staff.find((x) => x.id === s.currentUserId)!);
  const [visitFor, setVisitFor] = React.useState<Patient | null>(null);

  const t = today();
  const admitted = patients.filter((p) => p.status === "admitted");

  const ready = admitted
    .filter((p) => hasReadingToday(readings, p.id, t) && !primaryVisitToday(visits, p.id, t))
    .sort((a, b) => {
      const fa = isFever(readings.find((r) => r.patientId === a.id && r.day === t)?.valueC ?? 0);
      const fb = isFever(readings.find((r) => r.patientId === b.id && r.day === t)?.valueC ?? 0);
      if (fa !== fb) return fa ? -1 : 1;
      return (a.bedId ?? 0) - (b.bedId ?? 0);
    });
  const awaiting = admitted.filter((p) => !hasReadingToday(readings, p.id, t)).sort((a, b) => (a.bedId ?? 0) - (b.bedId ?? 0));
  const visited = admitted.filter((p) => primaryVisitToday(visits, p.id, t));
  const signoffs = admitted.filter((p) => p.eligibleSince && !p.clearance);

  const visitProgress = admitted.length ? visited.length / admitted.length : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Visit Queue</h1>
        <p className="text-sm text-slate-500">Patients are ready once today&apos;s temperature is recorded.</p>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Primary visits today</span>
          <span className="font-semibold tabular-nums text-slate-900">{visited.length} / {admitted.length}</span>
        </div>
        <Progress className="mt-2" value={visitProgress * 100} />
      </Card>

      <Section title="Discharge sign-offs" icon={<ClipboardCheck className="h-4 w-4 text-teal-600" />} count={signoffs.length}>
        {signoffs.length === 0 ? (
          <EmptyState title="No patients awaiting sign-off" />
        ) : (
          <Card className="divide-y divide-slate-100">
            {signoffs.map((p) => (
              <Row key={p.id} patient={p} right={<SignOffButton patientId={p.id} by={user.id} />} />
            ))}
          </Card>
        )}
      </Section>

      <Section title="Ready for visit" icon={<Stethoscope className="h-4 w-4 text-slate-500" />} count={ready.length}>
        {ready.length === 0 ? (
          <EmptyState title="No patients ready" hint="Temperatures pending or all visited." />
        ) : (
          <Card className="divide-y divide-slate-100">
            {ready.map((p) => {
              const streak = feverFreeStreak(readings, p, t);
              return (
                <Row
                  key={p.id}
                  patient={p}
                  right={
                    <div className="flex items-center gap-2">
                      {streak >= 3 && <Badge tone="green">Eligible</Badge>}
                      <Button size="sm" onClick={() => setVisitFor(p)}>Log visit</Button>
                    </div>
                  }
                />
              );
            })}
          </Card>
        )}
      </Section>

      <Section title="Awaiting temperature" icon={<BellRing className="h-4 w-4 text-amber-500" />} count={awaiting.length}>
        {awaiting.length === 0 ? (
          <EmptyState title="All temperatures recorded" />
        ) : (
          <Card className="divide-y divide-slate-100">
            {awaiting.slice(0, 20).map((p) => (
              <Row
                key={p.id}
                patient={p}
                right={
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-amber-600">Temp not recorded</span>
                    <Button size="sm" variant="secondary" onClick={() => { notifyNurse(p.id, user.id); toast("Nurse notified", { variant: "info" }); }}>
                      Notify nurse
                    </Button>
                  </div>
                }
              />
            ))}
            {awaiting.length > 20 && <p className="p-3 text-center text-xs text-slate-400">+{awaiting.length - 20} more awaiting temperature</p>}
          </Card>
        )}
      </Section>

      <Section title="Visited today" icon={<CheckCircle2 className="h-4 w-4 text-green-600" />} count={visited.length}>
        {visited.length === 0 ? (
          <EmptyState title="No visits logged yet" />
        ) : (
          <Card className="divide-y divide-slate-100">
            {visited.slice(0, 15).map((p) => (
              <Row key={p.id} patient={p} right={<Link href={`/patients/${p.id}`} className="text-slate-300 hover:text-slate-500"><ChevronRight className="h-5 w-5" /></Link>} />
            ))}
          </Card>
        )}
      </Section>

      {visitFor && <LogVisitDialog patient={visitFor} doctorId={user.id} onClose={() => setVisitFor(null)} />}
    </div>
  );
}

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{count}</span>
      </div>
      {children}
    </section>
  );
}

function SignOffButton({ patientId, by }: { patientId: string; by: string }) {
  const signOff = useWard((s) => s.signOff);
  return (
    <Button
      size="sm"
      onClick={() => {
        const r = signOff(patientId, by);
        if (!r.ok) return toast(r.error!, { variant: "error" });
        toast("Discharge signed off", { variant: "success", description: "Admin notified to complete discharge." });
      }}
    >
      Sign off discharge
    </Button>
  );
}

function LogVisitDialog({ patient, doctorId, onClose }: { patient: Patient; doctorId: string; onClose: () => void }) {
  const logVisit = useWard((s) => s.logVisit);
  const [notes, setNotes] = React.useState("");
  const [treatment, setTreatment] = React.useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Log visit · ${patient.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              const r = logVisit(patient.id, doctorId, notes, treatment);
              if (!r.ok) return toast(r.error!, { variant: "error" });
              toast("Visit logged", { variant: "success" });
              onClose();
            }}
          >
            Save visit
          </Button>
        </>
      }
    >
      <label className="text-sm font-medium text-slate-700">Visit notes <span className="text-red-500">*</span></label>
      <Textarea className="mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Clinical findings, plan… (min 5 characters)" />
      <label className="mt-4 block text-sm font-medium text-slate-700">Treatment (optional)</label>
      <Input className="mt-1.5" value={treatment} onChange={(e) => setTreatment(e.target.value)} placeholder="e.g. Paracetamol PRN, IV fluids" />
    </Dialog>
  );
}
