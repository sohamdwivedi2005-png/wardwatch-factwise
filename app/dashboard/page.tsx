"use client";
import * as React from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { useWard } from "@/store/wardwatch-store";
import { AppShell } from "@/components/layout/app-shell";
import { Card, Badge } from "@/components/ui/primitives";
import {
  mortalityRate, rolling30Mortality, successRate, mortalityAlert, closedCases,
  avgLengthOfStay, avgDischargeDelay, dischargeDelays, dailyCompliance,
  fallbackEntriesSince, MORTALITY_TARGET,
} from "@/lib/rules";
import { today, addDaysStr, dayDiff } from "@/lib/clock";
import { cn } from "@/lib/utils";
import type { Patient } from "@/lib/types";

export default function DashboardPage() {
  return (
    <AppShell allow={["head_doctor", "doctor", "admin"]}>
      <Quality />
    </AppShell>
  );
}

function pct(n: number | null) {
  return n === null ? "—" : `${(n * 100).toFixed(1)}%`;
}

function Quality() {
  const patients = useWard((s) => s.patients);
  const readings = useWard((s) => s.readings);
  const visits = useWard((s) => s.visits);
  const role = useWard((s) => s.staff.find((x) => x.id === s.currentUserId)!.role);

  const t = today();
  const view: "full" | "summary" | "ops" = role === "head_doctor" ? "full" : role === "doctor" ? "summary" : "ops";

  const alert = mortalityAlert(patients, t);
  const r30 = rolling30Mortality(patients, t);
  const allTime = mortalityRate(patients);
  const success = successRate(patients);
  const closed = closedCases(patients);
  const occupied = patients.filter((p) => p.status === "admitted").length;
  const los = avgLengthOfStay(patients);
  const delay = avgDischargeDelay(patients);
  const comp = dailyCompliance(patients, readings, visits, t);
  const fallbacks = fallbackEntriesSince(readings, addDaysStr(t, -7)).length;

  // monthly mortality (last 6 months)
  const monthly = monthlyMortality(patients, t);
  // daily compliance 14 days
  const compliance14 = Array.from({ length: 14 }, (_, i) => {
    const d = addDaysStr(t, -(13 - i));
    const c = dailyCompliance(patients, readings, visits, d);
    return { day: d.slice(5), temp: Math.round(c.tempPct * 100), visit: Math.round(c.visitPct * 100) };
  });
  // discharge delay distribution
  const delays = dischargeDelays(patients);
  const buckets = [
    { label: "0–4h", lo: 0, hi: 4 },
    { label: "4–8h", lo: 4, hi: 8 },
    { label: "8–12h", lo: 8, hi: 12 },
    { label: "12–24h", lo: 12, hi: 24 },
    { label: "24h+", lo: 24, hi: Infinity },
  ].map((b) => ({ label: b.label, count: delays.filter((d) => d >= b.lo && d < b.hi).length }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {view === "ops" ? "Occupancy & Discharge" : "Quality Dashboard"}
          </h1>
          <p className="text-sm text-slate-500">
            {view === "full" ? "Full access" : view === "summary" ? "Read-only clinical summary" : "Operational view"}
          </p>
        </div>
        {view !== "ops" && <Badge tone={success && success >= 0.85 ? "green" : "amber"}>Target 85% success</Badge>}
      </div>

      {/* mortality banner */}
      {view !== "ops" && alert.state === "alert" && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold text-red-800">Rolling 30-day mortality above target</p>
            <p className="text-sm text-red-700">
              {pct(r30)} over {alert.sample} closed cases vs {pct(MORTALITY_TARGET)} benchmark. Review recent deaths.
            </p>
          </div>
        </div>
      )}
      {view !== "ops" && alert.state === "insufficient" && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Rolling 30-day sample is {alert.sample} closed cases — below the 20-case threshold. Showing <b>insufficient sample</b> rather than a mortality alert.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {view !== "ops" && <Kpi label="30-day mortality" value={pct(r30)} sub={`target ${pct(MORTALITY_TARGET)}`} tone={r30 && r30 > MORTALITY_TARGET ? "red" : "green"} />}
        {view !== "ops" && <Kpi label="All-time mortality" value={pct(allTime)} sub={`${closed.total} closed cases`} />}
        {view !== "ops" && <Kpi label="Success rate" value={pct(success)} sub="target 85%" tone={success && success >= 0.85 ? "green" : "amber"} />}
        <Kpi label="Occupancy" value={`${occupied}/74`} sub={`${74 - occupied} free`} />
        <Kpi label="Avg length of stay" value={los === null ? "—" : `${los.toFixed(1)}d`} />
        <Kpi label="Avg discharge delay" value={delay === null ? "—" : `${delay.toFixed(1)}h`} sub="target < 4h" tone={delay && delay > 4 ? "amber" : "green"} />
        {view !== "summary" && <Kpi label="Temp compliance" value={pct(comp.tempPct)} sub={`${comp.withReading}/${comp.admitted} today`} />}
        {view === "full" && <Kpi label="Visit compliance" value={pct(comp.visitPct)} sub={`${comp.withVisit}/${comp.admitted} today`} />}
        {view === "full" && <Kpi label="Fallback entries (7d)" value={fallbacks} sub="doctor-recorded temps" />}
      </div>

      {/* charts */}
      {view !== "ops" && (
        <Card className="p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><TrendingUp className="h-4 w-4 text-slate-400" /> Monthly mortality vs 15% target</h2>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} unit="%" />
                <ReferenceLine y={15} stroke="#ef4444" strokeDasharray="4 4" />
                <Tooltip formatter={(v, n) => [`${v}%`, n === "rate" ? "mortality" : n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                  {monthly.map((m, i) => <Cell key={i} fill={m.rate > 15 ? "#ef4444" : "#0d9488"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {view !== "ops" && (
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Daily compliance — 14 days</h2>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={compliance14} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={2} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} unit="%" />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Line type="monotone" dataKey="temp" stroke="#0d9488" strokeWidth={2} dot={false} name="Temp" />
                  <Line type="monotone" dataKey="visit" stroke="#f59e0b" strokeWidth={2} dot={false} name="Visit" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Discharge-delay distribution</h2>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]}>
                  {buckets.map((b, i) => <Cell key={i} fill={i >= 3 ? "#f59e0b" : "#0d9488"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

function monthlyMortality(patients: Patient[], t: string) {
  const months: { month: string; key: string }[] = [];
  const base = new Date(t);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    months.push({ month: d.toLocaleString("en", { month: "short" }), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` });
  }
  return months.map((m) => {
    const inMonth = patients.filter((p) => (p.status === "discharged" || p.status === "deceased") && p.exit && p.exit.on.startsWith(m.key));
    const deaths = inMonth.filter((p) => p.status === "deceased").length;
    const rate = inMonth.length ? (deaths / inMonth.length) * 100 : 0;
    return { month: m.month, rate: Math.round(rate * 10) / 10 };
  });
}

function Kpi({ label, value, sub, tone = "slate" }: { label: string; value: React.ReactNode; sub?: string; tone?: "slate" | "red" | "green" | "amber" }) {
  const toneMap = { slate: "text-slate-900", red: "text-red-600", green: "text-green-700", amber: "text-amber-600" };
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", toneMap[tone])}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </Card>
  );
}

void dayDiff;
