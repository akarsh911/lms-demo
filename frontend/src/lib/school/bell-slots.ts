import type { BellSchedulePeriod, Period, PeriodKind } from '@/types/school';

import { clockOf } from '../dates';

// One row of a bell schedule as a person sees it: a named stretch of the day with a start and an end.
export interface BellSlot {
  periodId: string;
  bellPeriodId: string;
  label: string;
  kind: PeriodKind;
  start: number;
  end: number;
}

// The backend keeps the name on the period and the time on the schedule; this joins them, in the order the day runs.
export function slotsOf(periods: readonly Period[], times: readonly BellSchedulePeriod[]): BellSlot[] {
  return times
    .flatMap((time) => {
      const period = periods.find((p) => p.id === time.period_id);
      if (!period || time.runs === false || time.start_minute === undefined || time.end_minute === undefined) return [];
      return [
        {
          periodId: period.id,
          bellPeriodId: time.id,
          label: period.name ?? period.code ?? 'Slot',
          kind: period.kind ?? 'other',
          start: time.start_minute,
          end: time.end_minute,
        },
      ];
    })
    .sort((a, b) => a.start - b.start);
}

export function daySpan(slots: readonly BellSlot[]): string | null {
  const first = slots[0];
  const last = slots[slots.length - 1];
  return first && last ? `${clockOf(first.start)} to ${clockOf(Math.max(...slots.map((s) => s.end), last.end))}` : null;
}

export const durationOf = (slot: Pick<BellSlot, 'start' | 'end'>): string => {
  const minutes = slot.end - slot.start;
  return minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} hr` : `${minutes} min`;
};

// The slot these times would run into, if any. Touching end-to-start is not an overlap.
export function slotClash(slots: readonly BellSlot[], start: number, end: number, ignoreId?: string): BellSlot | undefined {
  return slots.find((slot) => slot.bellPeriodId !== ignoreId && start < slot.end && slot.start < end);
}

// A period of this name that this schedule does not use yet: the Saturday schedule adopts "Period 1" rather than making a second one.
export function reusablePeriod(periods: readonly Period[], slots: readonly BellSlot[], label: string): Period | undefined {
  const used = new Set(slots.map((slot) => slot.periodId));
  const wanted = label.trim().toLowerCase();
  return periods.find((period) => !used.has(period.id) && (period.name ?? '').trim().toLowerCase() === wanted);
}

// A short code no other period in the day uses, as the backend requires one per period.
export function periodCode(periods: readonly Period[], label: string): string {
  const taken = new Set(periods.map((period) => period.code));
  const stem = label.replace(/[^a-z0-9]+/gi, '').slice(0, 4).toUpperCase() || 'SLOT';
  for (let n = 0; n < 100; n += 1) {
    const code = n === 0 ? stem : `${stem}${n + 1}`;
    if (!taken.has(code)) return code;
  }
  return `${stem}${Date.now() % 1000}`;
}

export const nextSequence = (periods: readonly Period[]): number => Math.max(0, ...periods.map((period) => period.sequence ?? 0)) + 1;
