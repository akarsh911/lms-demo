import { spanLength } from './time';
import type {
  BellSchedulePeriod,
  Period,
  SchoolOfferingRow,
  TimetableSlot,
} from '@/types/school';

/**
 * Turning one timetable into one section's week, and counting what that week
 * owes each subject.
 *
 * Pure. No React, no fetch.
 */

/** `${sectionId}|${dayOfWeek}|${periodId}`. */
export type CellKey = string;

export function cellKey(sectionId: string, day: number, periodId: string): CellKey {
  return `${sectionId}|${day}|${periodId}`;
}

/**
 * Every slot, indexed by the cell it is drawn in.
 *
 * A cell holds a LIST, not a slot. The unique index is
 * (timetable, section, day, period, subject_offering), so one section can
 * legitimately have two offerings in one period — that is what a setwise
 * elective looks like — and a grid that assumed one would silently hide the
 * second.
 */
export function indexSlots(slots: readonly TimetableSlot[]): Map<CellKey, TimetableSlot[]> {
  const out = new Map<CellKey, TimetableSlot[]>();
  for (const slot of slots) {
    if (!slot.section_id || !slot.period_id || !slot.day_of_week) continue;
    const key = cellKey(slot.section_id, slot.day_of_week, slot.period_id);
    const list = out.get(key);
    if (list) list.push(slot);
    else out.set(key, [slot]);
  }
  return out;
}

export function periodsInOrder(periods: readonly Period[]): Period[] {
  return [...periods].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}

/** Bell times by period id, so a row can show the clock beside the pattern. */
export function bellByPeriod(
  rows: readonly BellSchedulePeriod[],
): Map<string, BellSchedulePeriod> {
  const out = new Map<string, BellSchedulePeriod>();
  for (const row of rows) {
    if (row.period_id) out.set(row.period_id, row);
  }
  return out;
}

/** The days a timetable actually uses, so an unused Sunday column is not drawn. */
export function daysInUse(slots: readonly TimetableSlot[]): number[] {
  const days = new Set<number>();
  for (const slot of slots) {
    if (slot.day_of_week) days.add(slot.day_of_week);
  }
  return [...days].sort((a, b) => a - b);
}

/**
 * What one offering has placed against what it was promised.
 *
 * `periods_per_week` is the hard placement constraint and `minutes_per_week`
 * the stated obligation. They can legitimately disagree: six 40-minute periods
 * is 240 minutes, and a syllabus asking for 300 is not satisfied by the count
 * alone. Both are reported, separately, and neither is inferred from the other.
 *
 * `null` for either requirement means the offering does not state one. That is
 * a third case, not a zero: "0 of 0 placed" reads as a requirement met, and an
 * offering nobody has given a target to has not met anything.
 */
export interface OfferingProgress {
  offering: SchoolOfferingRow;
  placed: number;
  requiredPeriods: number | null;
  minutesPlaced: number;
  requiredMinutes: number | null;
  /** Placed periods with no time in the chosen bell, so minutes are a floor. */
  untimed: number;
  periodsMatch: boolean | null;
  minutesMatch: boolean | null;
}

export function offeringProgress(
  offerings: readonly SchoolOfferingRow[],
  slots: readonly TimetableSlot[],
  sectionId: string,
  bells: Map<string, BellSchedulePeriod>,
): OfferingProgress[] {
  const mine = slots.filter((slot) => slot.section_id === sectionId);

  return offerings.map((offering) => {
    const placedSlots = mine.filter((slot) => slot.subject_offering_id === offering.id);

    let minutesPlaced = 0;
    let untimed = 0;
    for (const slot of placedSlots) {
      const bell = slot.period_id ? bells.get(slot.period_id) : undefined;
      const length = spanLength(bell?.start_minute, bell?.end_minute);
      if (length === null) untimed += 1;
      else minutesPlaced += length;
    }

    const requiredPeriods =
      typeof offering.periods_per_week === 'number' ? offering.periods_per_week : null;
    const requiredMinutes =
      typeof offering.minutes_per_week === 'number' ? offering.minutes_per_week : null;

    return {
      offering,
      placed: placedSlots.length,
      requiredPeriods,
      minutesPlaced,
      requiredMinutes,
      untimed,
      periodsMatch: requiredPeriods === null ? null : placedSlots.length === requiredPeriods,
      minutesMatch:
        requiredMinutes === null || untimed > 0 ? null : minutesPlaced === requiredMinutes,
    };
  });
}

/** How many of a section's offerings disagree with what they were promised. */
export function countShortfalls(progress: readonly OfferingProgress[]): number {
  return progress.filter(
    (row) => row.periodsMatch === false || row.minutesMatch === false,
  ).length;
}
