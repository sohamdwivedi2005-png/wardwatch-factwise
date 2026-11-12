"use client";
import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useWard } from "@/store/wardwatch-store";
import { AppShell } from "@/components/layout/app-shell";
import { Card, Input, Badge } from "@/components/ui/primitives";
import { StatusChip, EmptyState } from "@/components/shared/clinical";
import type { PatientStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: { key: PatientStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "admitted", label: "Admitted" },
  { key: "discharged", label: "Discharged" },
  { key: "deceased", label: "Deceased" },
  { key: "transferred", label: "Transferred" },
];

export default function PatientsPage() {
  return (
    <AppShell allow={["nurse", "doctor", "head_doctor", "admin"]}>
      <Directory />
    </AppShell>
  );
}

function Directory() {
  const patients = useWard((s) => s.patients);
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<PatientStatus | "all">("all");

  let list = patients.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.mrn.toLowerCase().includes(q.toLowerCase()) ||
      String(p.bedId ?? "").includes(q)
  );
  if (filter !== "all") list = list.filter((p) => p.status === filter);
  list = [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status === "admitted" ? -1 : 1;
    return (a.bedId ?? 9999) - (b.bedId ?? 9999);
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Patients</h1>
        <p className="text-sm text-slate-500">All current and closed cases.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search name, MRN or bed" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn("whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium", filter === f.key ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState title="No patients match" />
      ) : (
        <Card className="divide-y divide-slate-100">
          {list.slice(0, 120).map((p) => (
            <Link key={p.id} href={`/patients/${p.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-50">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
                {p.bedId ?? "—"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                <p className="text-xs text-slate-500">{p.mrn} · {p.age}y · {p.sex}</p>
              </div>
              <StatusChip status={p.status} />
            </Link>
          ))}
          {list.length > 120 && <p className="p-3 text-center text-xs text-slate-400">Showing first 120 of {list.length}.</p>}
        </Card>
      )}
    </div>
  );
}
