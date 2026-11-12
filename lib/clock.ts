// lib/clock.ts
// Single source of facility time. The demo offset is measured in MINUTES
// (not just days) so advancing 4 hours genuinely moves now() forward and
// triggers time-based escalations honestly.

let offsetMinutes = 0;

export function setOffsetMinutes(n: number): void {
  offsetMinutes = n;
}

export function getOffsetMinutes(): number {
  return offsetMinutes;
}

/** Real wall-clock time plus the demo offset. */
export function now(dateNow: number = Date.now()): Date {
  return new Date(dateNow + offsetMinutes * 60_000);
}

/** Format a Date as a facility day string (local), yyyy-MM-dd. */
export function toDayString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Current facility day. */
export function today(): string {
  return toDayString(now());
}

export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysStr(day: string, delta: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + delta);
  return toDayString(d);
}

/** Whole-day difference a - b (both yyyy-MM-dd). */
export function dayDiff(a: string, b: string): number {
  const da = parseDay(a).getTime();
  const db = parseDay(b).getTime();
  return Math.round((da - db) / 86_400_000);
}

export function hoursBetween(laterIso: string, earlierIso: string): number {
  return (
    (new Date(laterIso).getTime() - new Date(earlierIso).getTime()) / 3_600_000
  );
}

/**
 * Minutes to add to reach ~08:00 of the next facility day, used by the
 * "Advance to next day" demo control. Computed from the current facility now.
 */
export function minutesToNextMorning(from: Date = now()): number {
  const next = new Date(from);
  next.setDate(next.getDate() + 1);
  next.setHours(8, 0, 0, 0);
  return Math.round((next.getTime() - from.getTime()) / 60_000);
}
