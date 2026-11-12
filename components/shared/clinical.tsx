"use client";
import { Badge } from "@/components/ui/primitives";
import { fmtF } from "@/lib/rules";
import type { Patient, TempReading } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TempValue({ c, className }: { c: number; className?: string }) {
  return (
    <span className={cn("tabular-nums", className)}>
      <span className="font-semibold">{c.toFixed(1)}°C</span>
      <span className="ml-1 text-xs text-slate-400">{fmtF(c).toFixed(1)}°F</span>
    </span>
  );
}

export function FeverBadge({ c }: { c: number }) {
  return c >= 38 ? <Badge tone="red">Fever</Badge> : <Badge tone="green">Normal</Badge>;
}

export function StatusChip({ status }: { status: Patient["status"] }) {
  const map = {
    admitted: { tone: "white" as const, label: "Admitted" },
    discharged: { tone: "green" as const, label: "Discharged" },
    deceased: { tone: "slate" as const, label: "Deceased" },
    transferred: { tone: "slate" as const, label: "Transferred" },
  };
  const m = map[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

/** up to 3 dots representing the fever-free streak toward eligibility */
export function StreakDots({ streak }: { streak: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${streak} fever-free day(s)`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn("h-2 w-2 rounded-full", i < streak ? "bg-teal-500" : "bg-slate-200")}
        />
      ))}
      {streak >= 3 && <span className="ml-1 text-xs font-medium text-teal-700">Eligible</span>}
    </span>
  );
}

export function lastReading(readings: TempReading[], patientId: string): TempReading | undefined {
  return readings
    .filter((r) => r.patientId === patientId)
    .sort((a, b) => (a.day < b.day ? 1 : -1))[0];
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
