"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, AlertTriangle } from "lucide-react";
import { useWard } from "@/store/wardwatch-store";
import { AppShell } from "@/components/layout/app-shell";
import { Button, Card, Badge } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toaster";
import { EmptyState } from "@/components/shared/clinical";
import { now } from "@/lib/clock";
import { hoursBetween } from "@/lib/clock";
import { ESCALATION_HOURS } from "@/lib/rules";
import type { Patient } from "@/lib/types";

export default function DischargesPage() {
  return (
    <AppShell allow={["admin"]}>
      <DischargeQueue />
    </AppShell>
  );
}

function waitHours(iso: string) {
  return hoursBetween(now().toISOString(), iso);
}

function DischargeQueue() {
  const router = useRouter();
  const patients = useWard((s) => s.patients);
  const complete = useWard((s) => s.completeDischarge);
  const user = useWard((s) => s.staff.find((x) => x.id === s.currentUserId)!);
  const [confirm, setConfirm] = React.useState<Patient | null>(null);
  const [admitPrompt, setAdmitPrompt] = React.useState(false);

  const cleared = patients.filter((p) => p.status === "admitted" && p.clearance)
    .sort((a, b) => (a.clearance!.clearedAt < b.clearance!.clearedAt ? -1 : 1));
  const awaiting = patients.filter((p) => p.status === "admitted" && p.eligibleSince && !p.clearance)
    .sort((a, b) => (a.eligibleSince! < b.eligibleSince! ? -1 : 1));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Discharge Queue</h1>
        <p className="text-sm text-slate-500">Complete discharges to free beds. Target turnaround &lt; {ESCALATION_HOURS}h.</p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Cleared — ready to discharge ({cleared.length})</h2>
        {cleared.length === 0 ? (
          <EmptyState title="No cleared patients" hint="Doctors sign off eligible patients first." />
        ) : (
          <Card className="divide-y divide-slate-100">
            {cleared.map((p) => {
              const h = waitHours(p.clearance!.clearedAt);
              const overdue = h > ESCALATION_HOURS;
              return (
                <div key={p.id} className="flex items-center gap-3 p-3">
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-green-50 text-green-700">
                    <span className="text-[10px] leading-none">BED</span>
                    <span className="text-sm font-bold leading-tight">{p.bedId}</span>
                  </div>
                  <Link href={`/patients/${p.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 hover:text-teal-700">{p.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="h-3 w-3" /> Cleared {h.toFixed(1)}h ago
                      {overdue && <Badge tone="red" className="ml-1"><AlertTriangle className="h-3 w-3" /> Overdue</Badge>}
                    </p>
                  </Link>
                  <Button size="sm" onClick={() => setConfirm(p)}>Complete discharge</Button>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Awaiting doctor sign-off ({awaiting.length})</h2>
        {awaiting.length === 0 ? (
          <EmptyState title="Nothing awaiting sign-off" />
        ) : (
          <Card className="divide-y divide-slate-100">
            {awaiting.map((p) => {
              const h = waitHours(p.eligibleSince!);
              const overdue = h > ESCALATION_HOURS;
              return (
                <div key={p.id} className="flex items-center gap-3 p-3">
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                    <span className="text-[10px] leading-none">BED</span>
                    <span className="text-sm font-bold leading-tight">{p.bedId}</span>
                  </div>
                  <Link href={`/patients/${p.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 hover:text-teal-700">{p.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="h-3 w-3" /> Eligible {h.toFixed(1)}h ago
                      {overdue && <Badge tone="amber" className="ml-1">Doctor overdue</Badge>}
                    </p>
                  </Link>
                  <Badge tone="amber">Awaiting sign-off</Badge>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title="Complete discharge?"
        footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button onClick={() => {
            if (!confirm) return;
            const r = complete(confirm.id, user.id);
            setConfirm(null);
            if (!r.ok) return toast(r.error!, { variant: "error" });
            toast("Discharged — bed freed", { variant: "success" });
            setAdmitPrompt(true);
          }}>Confirm discharge</Button></>}>
        <p className="text-sm text-slate-600">{confirm?.name} (Bed {confirm?.bedId}) will be discharged and the bed freed.</p>
      </Dialog>

      <Dialog open={admitPrompt} onClose={() => setAdmitPrompt(false)} title="Bed freed"
        footer={<><Button variant="secondary" onClick={() => setAdmitPrompt(false)}>Later</Button>
          <Button onClick={() => router.push("/admin/admit")}>Admit next patient</Button></>}>
        <p className="text-sm text-slate-600">A bed is now free. Would you like to admit the next patient?</p>
      </Dialog>
    </div>
  );
}
