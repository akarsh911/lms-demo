// The size and shape of the fixture school, as plain arithmetic: who sits where, without importing a single row.
// Classes 6 to 12, seven sections each except Class 12 with six: 48 sections, 1,906 pupils on the roll.

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

export const GRADE_COUNT = 7;

export interface SectionSlot {
  grade: number;
  letter: number;
}

export const SECTION_SLOTS: readonly SectionSlot[] = Array.from({ length: GRADE_COUNT }, (_, grade) =>
  LETTERS.slice(0, grade === GRADE_COUNT - 1 ? 6 : 7).map((_, letter) => ({ grade, letter })),
).flat();

// The first 28 sections are full at 40; the rest hold 39.
export const sectionSize = (slot: number): number => (slot < 28 ? 40 : 39);

const STARTS = SECTION_SLOTS.reduce<number[]>((starts, _, slot) => [...starts, (starts[slot] ?? 0) + sectionSize(slot)], [0]);

export const PLACED = STARTS[SECTION_SLOTS.length] ?? 0;
export const UNASSIGNED = 6;
export const WITHDRAWN = 18;
export const ACTIVE = PLACED + UNASSIGNED;
export const ENROLLED = ACTIVE + WITHDRAWN;

// People who left before this year began: last year's Class 12, and last year's withdrawals.
export const GRADUATED_LAST_YEAR = 143;
export const WITHDREW_LAST_YEAR = 21;
export const STUDENT_COUNT = ENROLLED + GRADUATED_LAST_YEAR + WITHDREW_LAST_YEAR;

// The class each admitted-but-unplaced pupil is waiting on a section in.
const UNASSIGNED_GRADES = [1, 1, 2, 3, 0, 4] as const;

export type Standing = 'placed' | 'unassigned' | 'withdrawn' | 'graduated' | 'withdrew_last_year';

export interface Placement {
  standing: Standing;
  // Index into GRADE_LEVELS: this year's class, or for a leaver the class they left from.
  grade: number;
  // Index into SECTION_SLOTS, absent only for a pupil with no section yet.
  slot?: number;
  roll?: number;
}

export function placementOf(student: number): Placement {
  if (student < PLACED) {
    const slot = STARTS.findIndex((start, i) => student >= start && student < (STARTS[i + 1] ?? Infinity));
    return { standing: 'placed', grade: SECTION_SLOTS[slot]?.grade ?? 0, slot, roll: student - (STARTS[slot] ?? 0) + 1 };
  }
  if (student < ACTIVE) return { standing: 'unassigned', grade: UNASSIGNED_GRADES[student - PLACED] ?? 0 };
  if (student < ENROLLED) {
    // Five is coprime with 48, so no two of this year's leavers share a section.
    const slot = ((student - ACTIVE) * 5) % SECTION_SLOTS.length;
    return { standing: 'withdrawn', grade: SECTION_SLOTS[slot]?.grade ?? 0, slot, roll: sectionSize(slot) + 1 };
  }
  const leaver = student - ENROLLED;
  if (leaver < GRADUATED_LAST_YEAR) {
    const slot = SECTION_SLOTS.length - 6 + (leaver % 6);
    return { standing: 'graduated', grade: GRADE_COUNT - 1, slot, roll: Math.floor(leaver / 6) + 1 };
  }
  const slot = ((leaver - GRADUATED_LAST_YEAR) * 7) % (SECTION_SLOTS.length - 6);
  return { standing: 'withdrew_last_year', grade: SECTION_SLOTS[slot]?.grade ?? 0, slot, roll: 41 };
}

// How a placed pupil came to be in this year's class.
export type Entry = 'new_admission' | 'retained' | 'continuing' | 'promoted';

export function entryOf(student: number, placement: Placement): Entry {
  if (placement.standing === 'unassigned' || (placement.standing === 'placed' && student % 29 === 7)) return 'new_admission';
  if (placement.standing === 'placed' && student % 173 === 50) return 'retained';
  // Class 6 is the entry class of this campus, so nobody is promoted into it.
  return placement.grade === 0 ? 'continuing' : 'promoted';
}

export type Disposition = 'promote' | 'retain' | 'graduate' | 'not_returning' | 'undecided';

// What is planned for a pupil next year. Undecided is the case a rollover must not lose.
export function dispositionOf(student: number, placement: Placement): Disposition {
  if (student % 83 === 40) return 'undecided';
  if (student % 137 === 60) return 'not_returning';
  if (placement.grade === GRADE_COUNT - 1) return 'graduate';
  return student % 211 === 100 ? 'retain' : 'promote';
}
