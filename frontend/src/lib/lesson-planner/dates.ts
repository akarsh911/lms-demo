const DAY_MS = 86_400_000;

const utc = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

export const addDays = (iso: string, days: number): string => new Date(utc(iso) + days * DAY_MS).toISOString().slice(0, 10);

export const weekdayOf = (iso: string): number => ((new Date(utc(iso)).getUTCDay() + 6) % 7) + 1;

export const mondayOf = (iso: string): string => addDays(iso, 1 - weekdayOf(iso));

export const daysBetween = (from: string, to: string): number => Math.round((utc(to) - utc(from)) / DAY_MS);

export function datesBetween(from: string, to: string): string[] {
  const span = daysBetween(from, to);
  return span < 0 ? [] : Array.from({ length: span + 1 }, (_, i) => addDays(from, i));
}

export const within = (date: string, start: string, end: string): boolean => date >= start && date <= end;
