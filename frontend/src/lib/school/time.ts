/**
 * Minutes from midnight, and dates that are dates.
 *
 * Pure. No React, no fetch.
 *
 * ## Why a date is sliced and never parsed
 *
 * `calendar_date` arrives as `2026-07-27T00:00:00Z` — a Postgres `date` that
 * ent serialises as an RFC3339 timestamp at midnight UTC. Reading it with
 * `new Date(...)` and formatting it locally moves it a day in every timezone
 * west of Greenwich. The date part IS the fact, so it is taken as ten
 * characters of string and never becomes an instant.
 *
 * ## Why times are integers
 *
 * `start_minute`/`end_minute` are minutes from midnight on
 * `bell_schedule_periods`: 545 is 09:05. They are formatted for display at the
 * edge and parsed straight back; no formatted string is ever stored or sent.
 */

/** `2026-07-27T00:00:00Z` -> `2026-07-27`. Also safe on a bare `2026-07-27`. */
export function dateOnly(value: string | undefined): string {
  return (value ?? '').slice(0, 10);
}

/** 545 -> `09:05`. The shape an `<input type="time">` wants, too. */
export function minutesToClock(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const whole = Math.max(0, Math.min(1440, Math.round(value)));
  const hours = Math.floor(whole / 60);
  const minutes = whole % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** `09:05` -> 545. `null` when it is not a time inside the day. */
export function clockToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  const total = hours * 60 + minutes;
  return total > 1440 ? null : total;
}

/** `09:05 – 09:45`. An en dash, because it is a range and not a subtraction. */
export function minuteSpan(start?: number, end?: number): string | null {
  const from = minutesToClock(start);
  const to = minutesToClock(end);
  if (!from || !to) return null;
  return `${from} – ${to}`;
}

export function spanLength(start?: number, end?: number): number | null {
  if (typeof start !== 'number' || typeof end !== 'number') return null;
  const length = end - start;
  return length > 0 ? length : null;
}

/** 270 -> `4h 30m`. Minutes below an hour stay minutes. */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * The ISO weekday of a `YYYY-MM-DD`, Monday 1 through Sunday 7.
 *
 * Built at UTC noon so no local offset can push it into the previous day, and
 * re-based off `getUTCDay()`, where Sunday is 0.
 */
export function isoDayOf(date: string): number {
  const at = new Date(`${dateOnly(date)}T12:00:00Z`);
  const day = at.getUTCDay();
  return day === 0 ? 7 : day;
}

/** `2026-07-27` -> `Mon 27 Jul 2026`, in a fixed UTC frame for the same reason. */
export function longDate(date: string): string {
  const at = new Date(`${dateOnly(date)}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return dateOnly(date);
  return at.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Every `YYYY-MM-DD` from `from` to `to` inclusive, in order. */
export function datesBetween(from: string, to: string, cap: number): string[] {
  const start = new Date(`${dateOnly(from)}T12:00:00Z`);
  const end = new Date(`${dateOnly(to)}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && out.length < cap) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function addDays(date: string, days: number): string {
  const at = new Date(`${dateOnly(date)}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The first and last day of the month a date falls in. */
export function monthBounds(date: string): { from: string; to: string } {
  const at = new Date(`${dateOnly(date)}T12:00:00Z`);
  const from = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1, 12));
  const to = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0, 12));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function shiftMonth(date: string, months: number): string {
  const at = new Date(`${dateOnly(date)}T12:00:00Z`);
  const shifted = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + months, 1, 12));
  return shifted.toISOString().slice(0, 10);
}

export function monthLabel(date: string): string {
  const at = new Date(`${dateOnly(date)}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return dateOnly(date);
  return at.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function monthMatrix(date: string): string[][] {
  const { from, to } = monthBounds(date);
  const lead = isoDayOf(from) - 1;
  const trail = 7 - isoDayOf(to);
  const all = datesBetween(addDays(from, -lead), addDays(to, trail), 42);
  const weeks: string[][] = [];
  for (let at = 0; at + 7 <= all.length; at += 7) weeks.push(all.slice(at, at + 7));
  return weeks;
}
