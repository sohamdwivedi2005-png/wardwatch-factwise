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
        {/* left: identity + guidance */}
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600">
              <Activity className="h-6 w-6 text-white" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">WardWatch</h1>
              <p className="text-sm text-slate-500">Daily temperature &amp; discharge tracking</p>
            </div>
          </div>

          <Card className="mt-6 border-teal-100 bg-white">
            <div className="p-4">
              <p className="text-sm font-semibold text-slate-900">Try this flow</p>
              <ol className="mt-2 space-y-1.5 text-sm text-slate-600">
                <li><span className="mr-1.5 font-semibold text-teal-700">1.</span>Sign in as <b>Nurse Priya Nair</b> and record a normal temperature (e.g. 37.0) for a patient tagged <b>Demo</b> — they become eligible for discharge.</li>
                <li><span className="mr-1.5 font-semibold text-teal-700">2.</span>Sign in as <b>Dr. Kavya Mehta</b>, open that patient, log a visit, then sign off the discharge.</li>
                <li><span className="mr-1.5 font-semibold text-teal-700">3.</span>Sign in as <b>Rahul Joshi</b> (admin), complete the discharge, then admit a new patient into the freed bed.</li>
                <li><span className="mr-1.5 font-semibold text-teal-700">4.</span>Sign in as <b>Dr. Anil Rao</b> (head doctor) to see the quality dashboard and the mortality alert.</li>
              </ol>
            </div>
          </Card>

          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-slate-400" />
            Prototype with synthetic patient data. Not a certified clinical system.
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
