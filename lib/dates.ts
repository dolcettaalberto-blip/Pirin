const DAY_MS = 86_400_000;

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const WEEKDAY_KEYS: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Parse an ISO date (YYYY-MM-DD) as UTC midnight. All date math in the app is UTC-based. */
export function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toIso(new Date(parseIso(iso).getTime() + days * DAY_MS));
}

export function daysBetween(fromIso: string, toIsoDate: string): number {
  return Math.round((parseIso(toIsoDate).getTime() - parseIso(fromIso).getTime()) / DAY_MS);
}

export function weekdayKey(iso: string): WeekdayKey {
  return WEEKDAY_KEYS[parseIso(iso).getUTCDay()];
}

/** Today's date in the athlete's timezone (defaults to Europe/Rome; override with APP_TIMEZONE). */
export function todayIso(): string {
  const tz = process.env.APP_TIMEZONE ?? "Europe/Rome";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

export function formatShort(iso: string): string {
  const d = parseIso(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function formatWeekday(iso: string): string {
  return parseIso(iso).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
}
