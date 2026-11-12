"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  LogOut,
  ChevronDown,
  Clock,
  RotateCcw,
  FastForward,
  CalendarPlus,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { useWard } from "@/store/wardwatch-store";
import { landingPath } from "@/lib/permissions";
import { today, now } from "@/lib/clock";
import type { StaffRole } from "@/lib/types";
import { Button, Skeleton } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<StaffRole, string> = {
  nurse: "Nurse",
  doctor: "Doctor",
  head_doctor: "Head Doctor",
  admin: "Admin",
};

function navFor(role: StaffRole): { href: string; label: string }[] {
  switch (role) {
    case "nurse":
      return [
        { href: "/nurse", label: "Rounds" },
        { href: "/patients", label: "Patients" },
      ];
    case "doctor":
      return [
        { href: "/doctor", label: "Queue" },
        { href: "/patients", label: "Patients" },
        { href: "/dashboard", label: "Quality" },
      ];
    case "head_doctor":
      return [
        { href: "/dashboard", label: "Quality" },
        { href: "/doctor", label: "Queue" },
        { href: "/patients", label: "Patients" },
      ];
    case "admin":
      return [
        { href: "/admin", label: "Bed Board" },
        { href: "/admin/discharges", label: "Discharges" },
        { href: "/admin/admit", label: "Admit" },
        { href: "/patients", label: "Patients" },
        { href: "/dashboard", label: "Occupancy" },
      ];
  }
}

export function AppShell({
  children,
  allow,
  maxWidth = "max-w-6xl",
}: {
  children: React.ReactNode;
  allow: StaffRole[];
  maxWidth?: string;
}) {
  const router = useRouter();
  const hydrated = useWard((s) => s.hydrated);
  const user = useWard((s) => (s.currentUserId ? s.staff.find((x) => x.id === s.currentUserId) ?? null : null));

  React.useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!allow.includes(user.role)) {
      toast("You don't have access to that page.", { variant: "error" });
      router.replace(landingPath(user.role));
    }
  }, [hydrated, user, allow, router]);

  if (!hydrated || !user || !allow.includes(user.role)) {
    return (
      <div className="mx-auto w-full max-w-6xl p-4">
        <Skeleton className="mb-4 h-14 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header role={user.role} name={user.name} />
      <main className={cn("mx-auto w-full px-4 py-4 sm:py-6", maxWidth)}>{children}</main>
    </div>
  );
}

function Header({ role, name }: { role: StaffRole; name: string }) {
  const pathname = usePathname();
  const nav = navFor(role);
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <Link href={landingPath(role)} className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600">
            <Activity className="h-5 w-5 text-white" />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-slate-900">WardWatch</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((n) => {
            const active = pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium",
                  active ? "bg-teal-50 text-teal-700" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <AlertsBell role={role} />
          <UserMenu role={role} name={name} />
        </div>
      </div>
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-slate-100 px-3 py-1.5 md:hidden">
        {nav.map((n) => {
          const active = pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href));
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium",
                active ? "bg-teal-50 text-teal-700" : "text-slate-600"
              )}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

function AlertsBell({ role }: { role: StaffRole }) {
  const [open, setOpen] = React.useState(false);
  const alerts = useWard((s) => s.alerts);
  const resolveAlert = useWard((s) => s.resolveAlert);
  const router = useRouter();
  const mine = alerts.filter((a) => a.audience.includes(role)).sort((a, b) => (a.at < b.at ? 1 : -1));
  const unread = mine.filter((a) => !a.resolved).length;
  return (
    <div className="relative">
      <Button variant="ghost" size="icon" aria-label="Alerts" onClick={() => setOpen((o) => !o)} className="relative">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-[min(92vw,360px)] rounded-xl border border-slate-200 bg-white shadow-lg ww-in">
            <div className="border-b border-slate-100 p-3 text-sm font-semibold text-slate-900">Alerts</div>
            <div className="max-h-80 overflow-y-auto">
              {mine.length === 0 && <p className="p-4 text-sm text-slate-400">No alerts.</p>}
              {mine.map((a) => {
                const Icon = a.level === "critical" ? AlertTriangle : a.level === "warn" ? AlertTriangle : Info;
                return (
                  <div key={a.id} className={cn("flex gap-2.5 border-b border-slate-50 p-3", a.resolved && "opacity-50")}>
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", a.level === "critical" ? "text-red-600" : a.level === "warn" ? "text-amber-600" : "text-teal-600")} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-700">{a.text}</p>
                      <div className="mt-1 flex items-center gap-2">
                        {a.patientId && !a.patientId.startsWith("cl") && (
                          <button
                            className="text-[11px] font-medium text-teal-700 hover:underline"
                            onClick={() => {
                              setOpen(false);
                              router.push(`/patients/${a.patientId}`);
                            }}
                          >
                            View patient
                          </button>
                        )}
                        {!a.resolved && (
                          <button className="text-[11px] font-medium text-slate-500 hover:underline" onClick={() => resolveAlert(a.id)}>
                            Mark resolved
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function UserMenu({ role, name }: { role: StaffRole; name: string }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const logout = useWard((s) => s.logout);
  const advanceHours = useWard((s) => s.advanceHours);
  const advanceDay = useWard((s) => s.advanceDay);
  const reset = useWard((s) => s.reset);
  const offset = useWard((s) => s.offsetMinutes);
  const fac = React.useMemo(() => {
    void offset;
    return { day: today(), time: now().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
  }, [offset]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
          {name.split(" ").slice(-1)[0]?.[0] ?? "U"}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-xs font-semibold leading-tight text-slate-900">{name}</span>
          <span className="block text-[11px] leading-tight text-slate-500">{ROLE_LABEL[role]}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg ww-in">
            <div className="rounded-lg bg-slate-50 p-2.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Clock className="h-3.5 w-3.5" /> Facility clock
              </div>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {fac.day} · {fac.time}
              </p>
            </div>
            <div className="mt-2 space-y-1">
              <p className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Demo controls</p>
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-100" onClick={() => { advanceHours(4); toast("Advanced 4 hours", { variant: "info" }); }}>
                <FastForward className="h-4 w-4 text-slate-400" /> Advance 4 hours
              </button>
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-100" onClick={() => { advanceDay(); toast("Advanced to next day", { variant: "info" }); }}>
                <CalendarPlus className="h-4 w-4 text-slate-400" /> Advance to next day
              </button>
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-100" onClick={() => { reset(); toast("Demo data reset", { variant: "success" }); }}>
                <RotateCcw className="h-4 w-4 text-slate-400" /> Reset demo data
              </button>
            </div>
            <div className="my-2 border-t border-slate-100" />
            <button
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              onClick={() => { logout(); router.replace("/"); }}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export { ROLE_LABEL, CheckCircle2 };
