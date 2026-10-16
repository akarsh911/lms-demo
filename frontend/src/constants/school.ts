import type { DayType } from '@/types/school';

/**
 * The school-administrator screens, as data.
 *
 * Labels, orders and defaults live here so four screens that all speak about
 * days, periods and bells say the same words about them.
 */

/**
 * ISO-8601 day numbering: Monday is 1 and Sunday is 7. This is the numbering
 * `timetable_slots.day_of_week` uses and the one `/timetable-occurrences`
 * answers in, so nothing here re-bases it to a JavaScript `getDay()`, where
 * Sunday is 0 — the off-by-one that produces would move an entire week's
 * lessons one day earlier and still look plausible.
 */
export const ISO_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const DAY_NAMES: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

export const DAY_SHORT: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

/**
 * What each kind of day means, in the words a principal would use.
 *
 * `instructional` carries a database check constraint —
 * `day_type <> 'instructional' OR forenoon_open OR afternoon_open` — so an
 * instructional day with both halves shut is refused by Postgres. The forms
 * say so before they send.
 */
export const DAY_TYPE_LABELS: Record<DayType, string> = {
  instructional: 'Teaching day',
  exam: 'Examination',
  event: 'School event',
  holiday: 'Holiday',
  weekend: 'Weekend',
  vacation: 'Vacation',
};

/** A holiday, a weekend and a vacation are days the school is shut all day. */
export const CLOSED_DAY_TYPES: readonly DayType[] = ['holiday', 'weekend', 'vacation'];

export const PERIOD_KIND_LABELS: Record<string, string> = {
  teaching: 'Teaching',
  break: 'Break',
  assembly: 'Assembly',
  activity: 'Activity',
  other: 'Other',
};

/**
 * Room types offered in the form.
 *
 * `room_type` is a free string server-side, not an enum, so this list is a
 * convenience and the field stays editable: a school with a Kathak studio can
 * type one.
 */
export const ROOM_TYPES: readonly string[] = [
  'classroom',
  'laboratory',
  'library',
  'hall',
  'sports',
  'activity',
];

/** Rows a calendar range asks for at once. The endpoint caps a page at 200. */
export const CALENDAR_RANGE_DAYS = 120;

/**
 * The largest range a bulk fill will create in one pass.
 *
 * A term is about 96 days and each one is its own POST — there is no bulk
 * endpoint — so this bounds a mis-typed range at something a person can wait
 * for and undo, rather than four hundred writes nobody asked for.
 */
export const BULK_FILL_MAX_DAYS = 200;

/** How long the builder waits after a change before asking for a clash report. */
export const CLASH_CHECK_DEBOUNCE_MS = 350;
