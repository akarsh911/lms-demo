import { CANCELLED_OCCURRENCE_STATE } from '@/constants/people-detail';
import type {
  BellSchedulePeriodRow,
  CalendarDayRow,
  PeriodRow,
  TimetableOccurrence,
} from '@/types/people-detail';

export type DayOpening = 'unknown' | 'closed' | 'open';

export function openingOf(day: CalendarDayRow | undefined): DayOpening {
  if (!day) return 'closed';
  if (day.forenoon_open === false && day.afternoon_open === false) return 'closed';
  return 'open';
}

export interface DaySlot {
  periodId: string;
  name: string;
  code: string | null;
  kind: string | null;
  sequence: number;
  startMinute: number | null;
  endMinute: number | null;
  occurrences: TimetableOccurrence[];
  state: SlotState;
}

export type SlotState = 'free' | 'teaching' | 'cancelled';

export interface DayShape {
  slots: DaySlot[];
  freeCount: number;
  busyCount: number;
  cancelledCount: number;
  unplaced: TimetableOccurrence[];
}

export function shapeOfDay(
  periods: readonly PeriodRow[],
  bellPeriods: readonly BellSchedulePeriodRow[],
  occurrences: readonly TimetableOccurrence[],
): DayShape {
  const times = new Map<string, BellSchedulePeriodRow>();
  for (const row of bellPeriods) {
    if (row.period_id) times.set(row.period_id, row);
  }

  const held = new Map<string, TimetableOccurrence[]>();
  for (const occurrence of occurrences) {
    if (!occurrence.period_id) continue;
    held.set(occurrence.period_id, [...(held.get(occurrence.period_id) ?? []), occurrence]);
  }

  const slots: DaySlot[] = periods.map((period) => {
    const mine = held.get(period.id) ?? [];
    const live = mine.filter(
      (occurrence) => occurrence.state !== CANCELLED_OCCURRENCE_STATE,
    );
    const bell = times.get(period.id);
    const state: SlotState =
      live.length > 0 ? 'teaching' : mine.length > 0 ? 'cancelled' : 'free';
    return {
      periodId: period.id,
      name: period.name ?? period.code ?? 'Period',
      code: period.code ?? null,
      kind: period.kind ?? null,
      sequence: period.sequence ?? 0,
      startMinute: typeof bell?.start_minute === 'number' ? bell.start_minute : null,
      endMinute: typeof bell?.end_minute === 'number' ? bell.end_minute : null,
      occurrences: mine,
      state,
    };
  });

  slots.sort((a, b) => {
    if (a.startMinute !== null && b.startMinute !== null) {
      return a.startMinute - b.startMinute || a.sequence - b.sequence;
    }
    return a.sequence - b.sequence;
  });

  const known = new Set(periods.map((period) => period.id));
  const unplaced = occurrences.filter(
    (occurrence) => !occurrence.period_id || !known.has(occurrence.period_id),
  );

  return {
    slots,
    freeCount: slots.filter((slot) => slot.state === 'free').length,
    busyCount: slots.filter((slot) => slot.state === 'teaching').length,
    cancelledCount: slots.filter((slot) => slot.state === 'cancelled').length,
    unplaced,
  };
}
