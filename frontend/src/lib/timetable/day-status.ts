import type { TimetablePeriod } from '@/types/timetable';

export type DayPhase = 'before' | 'during' | 'between' | 'after' | 'empty';

export interface DayStatus {
  phase: DayPhase;
  // The lesson running at `now`, if one is.
  current: TimetablePeriod | null;
  // The first lesson still to start.
  next: TimetablePeriod | null;
  // Ids of lessons that have ended, so a list can set them back.
  past: ReadonlySet<string>;
}

// Where `now` falls in a day's lessons. Pure: the caller supplies the clock.
export function dayStatus(periods: readonly TimetablePeriod[], now: number): DayStatus {
  const past = new Set<string>();
  let current: TimetablePeriod | null = null;
  let next: TimetablePeriod | null = null;

  for (const period of periods) {
    const start = new Date(period.startsAt).getTime();
    const end = new Date(period.endsAt).getTime();
    if (end <= now) past.add(period.id);
    else if (start <= now) current ??= period;
    else next ??= period;
  }

  const phase: DayPhase =
    periods.length === 0 ? 'empty' : current ? 'during' : !next ? 'after' : past.size === 0 ? 'before' : 'between';

  return { phase, current, next, past };
}
