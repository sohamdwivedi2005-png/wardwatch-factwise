"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useWard } from "@/store/wardwatch-store";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/primitives";
import { wardForBed } from "@/lib/rules";
import { cn } from "@/lib/utils";
import type { Ward } from "@/lib/types";

export default function AdminPage() {
  return (
    <AppShell allow={["admin"]}>
      <BedBoard />
    </AppShell>
  );
}

function BedBoard() {
  const router = useRouter();
  const patients = useWard((s) => s.patients);
  const beds = useWard((s) => s.beds);

  const byId = new Map(patients.map((p) => [p.id, p]));
  const occupied = beds.filter((b) => b.patientId).length;
  const free = 74 - occupied;
  const cleared = patients.filter((p) => p.status === "admitted" && p.clearance).length;
  const awaiting = patients.filter((p) => p.status === "admitted" && p.eligibleSince && !p.clearance).length;

  const wards: Ward[] = ["A", "B", "C", "D"];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Bed Board</h1>
        <p className="text-sm text-slate-500">74 beds across wards A–D.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Occupied" value={`${occupied}/74`} />
        <Stat label="Free beds" value={free} tone={free > 0 ? "teal" : "slate"} />
        <Stat label="Cleared" value={cleared} tone="green" />
        <Stat label="Awaiting sign-off" value={awaiting} tone="amber" />
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <Legend color="bg-green-500" label="Cleared" />
        <Legend color="bg-amber-400" label="Awaiting sign-off" />
        <Legend color="bg-white border border-slate-300" label="Admitted" />
        <Legend color="border border-dashed border-slate-300 bg-slate-50" label="Free" />
      </div>

      {wards.map((w) => (
        <div key={w}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Ward {w}</p>
          <Card className="p-3">
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
              {beds.filter((b) => wardForBed(b.id) === w).map((b) => {
                const p = b.patientId ? byId.get(b.patientId) : null;
                const cleared = p?.clearance && p.status === "admitted";
                const awaitingSign = p?.eligibleSince && !p?.clearance;
                const tone = !p
                  ? "border border-dashed border-slate-300 bg-slate-50 text-slate-400"
                  : cleared
                  ? "bg-green-500 text-white"
                  : awaitingSign
                  ? "bg-amber-400 text-white"
                  : "bg-white border border-slate-300 text-slate-700";
                return (
                  <button
                    key={b.id}
                    title={p ? `${p.name}` : "Free bed — click to admit"}
                    onClick={() => (p ? router.push(`/patients/${p.id}`) : router.push("/admin/admit"))}
                    className={cn("flex aspect-square flex-col items-center justify-center rounded-lg text-xs font-semibold transition-transform hover:scale-105", tone)}
                  >
                    {b.id}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, tone = "slate" }: { label: string; value: React.ReactNode; tone?: "slate" | "teal" | "green" | "amber" }) {
  const toneMap = { slate: "text-slate-900", teal: "text-teal-700", green: "text-green-700", amber: "text-amber-700" };
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", toneMap[tone])}>{value}</p>
    </Card>
  );
}
function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={cn("h-3 w-3 rounded", color)} /> {label}</span>;
}
