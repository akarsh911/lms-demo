export interface Week {
  from: string;
  to: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === 'string' && ISO_DATE.test(value);
}

export function dayOf(instant: string): string {
  return instant.slice(0, 10);
}

function toUtcNoon(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!, 12);
}

function toDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return toDay(toUtcNoon(day) + days * DAY_MS);
}

export function weekOf(day: string): Week {
  const at = toUtcNoon(day);
  const weekday = new Date(at).getUTCDay();
  const backToMonday = (weekday + 6) % 7;
  const from = toDay(at - backToMonday * DAY_MS);
  return { from, to: addDays(from, 6) };
}

export function shiftWeek(week: Week, weeks: number): Week {
  return weekOf(addDays(week.from, weeks * 7));
}

export function daysOf(week: Week): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i += 1) out.push(addDays(week.from, i));
  return out;
}

export function todayInSchool(timezone: string | undefined): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

export function clockOf(minuteOfDay: number): string {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function longDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function shortDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function shortRange(week: Week): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  };
  const from = new Date(`${week.from}T12:00:00Z`).toLocaleDateString(undefined, opts);
  const to = new Date(`${week.to}T12:00:00Z`).toLocaleDateString(undefined, opts);
  return `${from} – ${to}`;
}
