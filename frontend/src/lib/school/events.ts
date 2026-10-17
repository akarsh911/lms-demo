import type { EventKind, YearEvent } from '@/types/foundation';

export const KIND_LABEL: Readonly<Record<EventKind, string>> = {
  exam: 'Examination',
  internal: 'Internal assessment',
  holiday: 'Holiday',
  ptm: 'Parent-teacher meeting',
  trip: 'Trip',
  camp: 'Camp',
  event: 'School event',
  personal: 'Yours',
};

export const KIND_TONE = {
  exam: 'rose',
  internal: 'violet',
  holiday: 'green',
  ptm: 'blue',
  trip: 'teal',
  camp: 'amber',
  event: 'grey',
  personal: 'lilac',
} as const satisfies Record<EventKind, string>;

export const inMonth = (event: YearEvent, month: string): boolean => event.start.slice(0, 7) <= month && event.end.slice(0, 7) >= month;

export const onDay = (event: YearEvent, day: string): boolean => event.start <= day && event.end >= day;

// The months a year spans, as YYYY-MM, so a calendar never pages outside the year.
export function monthsOf(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))];
  const last = end.slice(0, 7);
  while (`${y}-${String(m).padStart(2, '0')}` <= last && out.length < 24) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);
const DAY = 86_400_000;

// A month as Monday-first weeks of seven dates, overflowing into the neighbouring months so every row is full.
export function monthWeeks(month: string): string[][] {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  const first = Date.UTC(year, index, 1);
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  const total = Math.ceil((lead + days) / 7) * 7;
  const weeks: string[][] = [];
  for (let i = 0; i < total; i += 7) weeks.push(Array.from({ length: 7 }, (_, d) => iso(first + (i + d - lead) * DAY)));
  return weeks;
}

export interface WeekBar {
  event: YearEvent;
  // Zero-based columns within the week, inclusive.
  from: number;
  to: number;
  lane: number;
  starts: boolean;
  ends: boolean;
}

// The events crossing one week, cut to it and stacked into lanes so bars never overlap; longer and earlier bars take the top lanes.
export function weekBars(week: readonly string[], events: readonly YearEvent[]): WeekBar[] {
  const first = week[0] ?? '';
  const last = week[week.length - 1] ?? '';
  const crossing = events
    .filter((event) => event.start <= last && event.end >= first)
    .map((event) => {
      const from = Math.max(0, week.findIndex((day) => day >= event.start));
      const toIndex = week.findIndex((day) => day > event.end);
      const to = toIndex === -1 ? week.length - 1 : toIndex - 1;
      return { event, from, to, lane: 0, starts: event.start >= first, ends: event.end <= last };
    })
    .sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from) || a.event.start.localeCompare(b.event.start));
  const taken: number[][] = [];
  for (const bar of crossing) {
    let lane = 0;
    while ((taken[lane] ?? []).some((col) => col >= bar.from && col <= bar.to)) lane += 1;
    bar.lane = lane;
    taken[lane] = [...(taken[lane] ?? []), ...Array.from({ length: bar.to - bar.from + 1 }, (_, i) => bar.from + i)];
  }
  return crossing;
}

export const monthLabel = (month: string): string => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
