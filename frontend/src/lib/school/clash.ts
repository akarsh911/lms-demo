import { ApiError } from '@/services/api';
import type { Clash, ClashParty, ClashRefusal, ClashRule } from '@/types/school';

/**
 * Reading what the timetable service says about a collision.
 *
 * Pure. No React, no fetch.
 *
 * ## A report and a refusal are the same body
 *
 * `POST /timetables/{id}/clash-check` answers 200 with `clashes` whatever it
 * finds: it is a REPORT, used live while a slot is being placed. `POST
 * /timetables/{id}/slots` answers 409 with the SAME `clashes` array and
 * `code: "timetable_clash"` when it refuses one. So both go through the same
 * readers here, and a screen never has two vocabularies for one fact.
 *
 * ## An overridden clash is still a clash
 *
 * The report carries `blocking` and `overridden` separately and every clash
 * carries `overridable` / `overridden` / `override`. A week full of accepted
 * double-bookings must LOOK full of them; nothing here filters an overridden
 * clash out of a list, it only stops counting it as blocking.
 *
 * ## `student_set` is never overridable, and that is a decision, not a gap
 *
 * A teacher in two rooms is a fiction a school knowingly accepts. A pupil in
 * two rooms corrupts attendance quietly: the same pupil is owed a mark in two
 * registers for one period, and the register that loses reads as an absence.
 * The API refuses it outright, so no override control may be drawn for one —
 * `overridable` is the only thing that decides, never the rule name in the UI.
 */

export const CLASH_CODE = 'timetable_clash';

/** The 409's body, when the failure was a clash. `null` for anything else. */
export function clashRefusalFrom(error: unknown): ClashRefusal | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status !== 409 || error.code !== CLASH_CODE) return null;
  const details = error.details as ClashRefusal | null;
  if (!details || !Array.isArray(details.clashes)) {
    return { code: error.code, message: error.message, clashes: [] };
  }
  return details;
}

/**
 * A refusal that named the missing power rather than the clash.
 *
 * `clash_override` needs `core.timetable.override`, which `core.timetable.write`
 * does not imply. The 403 says so, and saying it back is far more use than
 * "could not be saved".
 */
export function overrideForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

/** A reason that is only whitespace is a 422, so it is caught before sending. */
export function reasonIsUsable(reason: string): boolean {
  return reason.trim().length > 0;
}

export function blockingOf(clashes: readonly Clash[]): Clash[] {
  return clashes.filter((clash) => !clash.overridden);
}

/**
 * Whether an override control may be offered at all.
 *
 * True only when there is something blocking AND every blocking clash says it
 * is overridable. One `student_set` among them makes the whole placement
 * unacceptable, and offering a button the API will refuse teaches a user that
 * the product lies.
 */
export function everyBlockingIsOverridable(clashes: readonly Clash[]): boolean {
  const blocking = blockingOf(clashes);
  return blocking.length > 0 && blocking.every((clash) => clash.overridable);
}

export function firstUnoverridable(clashes: readonly Clash[]): Clash | undefined {
  return blockingOf(clashes).find((clash) => !clash.overridable);
}

export const CLASH_RULE_LABELS: Record<ClashRule, string> = {
  teacher: 'Teacher double-booked',
  room: 'Room double-booked',
  student_set: 'Pupils in two places',
};

/**
 * Why this clash is a problem, in a sentence, without naming a database table.
 *
 * The student-set line says "pupils", not "this class": the unit the rule works
 * in is the INTERSECTING STUDENT SET, not the section. Grade XI runs Physics,
 * History and Commerce in one period and a pupil attends exactly one of them,
 * so two slots on one section in one period are not automatically a clash — and
 * describing it as one would train a timetabler to work around a rule that was
 * never in their way.
 */
export function explainClash(clash: Clash): string {
  switch (clash.rule) {
    case 'teacher':
      return 'The same teacher is already teaching somewhere else in this period.';
    case 'room':
      return 'The same room is already in use in this period.';
    case 'student_set':
      return clash.student_count
        ? `${clash.student_count} ${clash.student_count === 1 ? 'pupil takes' : 'pupils take'} both of these and cannot attend both.`
        : 'The same pupils are expected in both of these at once.';
    default:
      return 'These two cannot both happen in this period.';
  }
}

/** The party that is NOT the thing being placed, which is what the user needs. */
export function counterpartOf(clash: Clash, ref: string): ClashParty {
  if (clash.right.ref === ref) return clash.left;
  if (clash.left.ref === ref) return clash.right;
  return clash.left;
}

/**
 * The reference every proposal is sent under.
 *
 * The API echoes it back on whichever side of a clash the proposal is, which is
 * how the counterpart is picked out. One constant, because a proposal that
 * arrived under one ref and was looked up under another silently reports the
 * wrong side of every clash.
 */
export const PROPOSAL_REF = 'proposed';
