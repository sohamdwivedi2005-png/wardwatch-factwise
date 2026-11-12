"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight, ShieldCheck } from "lucide-react";
import { useWard } from "@/store/wardwatch-store";
import { landingPath } from "@/lib/permissions";
import { Button, Card, Input, Label, Skeleton } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import type { StaffRole } from "@/lib/types";

const GROUPS: { role: StaffRole; label: string }[] = [
  { role: "nurse", label: "Nurses" },
  { role: "doctor", label: "Doctors" },
  { role: "head_doctor", label: "Head Doctor" },
  { role: "admin", label: "Admin" },
];

export default function LoginPage() {
  const router = useRouter();
  const hydrated = useWard((s) => s.hydrated);
  const staff = useWard((s) => s.staff);
  const login = useWard((s) => s.login);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [pin, setPin] = React.useState("");

  const sel = staff.find((s) => s.id === selected);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const res = login(selected, pin);
    if (!res.ok) {
      toast(res.error ?? "Login failed", { variant: "error" });
      return;
    }
    const role = staff.find((s) => s.id === selected)!.role;
    router.replace(landingPath(role));
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto grid min-h-screen w-full max-w-5xl items-center gap-8 px-4 py-10 lg:grid-cols-[1.1fr_1fr]">
        {/* left: brand hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 via-teal-700 to-teal-800 p-6 text-white shadow-float sm:p-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-12 h-60 w-60 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2.5">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                <Activity className="h-6 w-6 text-white" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">WardWatch</h1>
                <p className="text-sm text-teal-50/80">Daily temperature &amp; discharge tracking</p>
              </div>
            </div>

            <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-teal-50/90">
              One calm, structured view of the day — temperatures, doctor visits, discharges and bed turnover across all 74 beds.
            </p>

            <div className="mt-6 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
              <p className="text-sm font-semibold">Try this flow</p>
              <ol className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-teal-50/90">
                {[
                  <>Sign in as <b className="text-white">Nurse Priya Nair</b> and record a normal temperature (e.g. 37.0) for a patient tagged <b className="text-white">Demo</b> — they become eligible for discharge.</>,
                  <>Sign in as <b className="text-white">Dr. Kavya Mehta</b>, open that patient, log a visit, then sign off the discharge.</>,
                  <>Sign in as <b className="text-white">Rahul Joshi</b> (admin), complete the discharge, then admit a new patient into the freed bed.</>,
                  <>Sign in as <b className="text-white">Dr. Anil Rao</b> (head doctor) to see the quality dashboard and the mortality alert.</>,
                ].map((step, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-[11px] font-bold">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-5 flex items-center gap-2 text-xs text-teal-50/70">
              <ShieldCheck className="h-4 w-4" />
              Prototype with synthetic patient data. Not a certified clinical system.
            </div>
          </div>
        </div>

        {/* right: staff + PIN */}
        <Card className="p-5">
          {!hydrated ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">Staff sign-in</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Demo PIN: 1234</span>
              </div>
              <div className="mt-4 space-y-4">
                {GROUPS.map((g) => (
                  <div key={g.role}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.label}</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {staff.filter((s) => s.role === g.role).map((s) => (
                        <button
                          type="button"
                          key={s.id}
                          onClick={() => { setSelected(s.id); setPin(""); }}
                          className={cn(
                            "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                            selected === s.id ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:border-slate-300"
                          )}
                        >
                          <span className="font-medium text-slate-800">{s.name}</span>
                          {selected === s.id && <ArrowRight className="h-4 w-4 text-teal-600" />}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {sel && (
                <div className="mt-5 rounded-lg bg-slate-50 p-3 ww-in">
                  <Label htmlFor="pin">Enter PIN for {sel.name}</Label>
                  <div className="mt-1.5 flex gap-2">
                    <Input
                      id="pin"
                      inputMode="numeric"
                      autoFocus
                      placeholder="1234"
                      value={pin}
                      maxLength={4}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    />
                    <Button type="submit" disabled={pin.length < 4}>
                      Sign in
                    </Button>
                  </div>
                </div>
              )}
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
