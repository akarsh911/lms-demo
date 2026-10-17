import type { RosterKind } from '@/constants/roster';
import type { CorePerson } from '@/types/core';
import type { RosterRow, StaffRow, TeacherRow } from '@/types/roster';

/**
 * Finding the person on a roster row, and knowing when there is not one.
 *
 * Pure. No React, no fetch.
 */

/**
 * Whether this row came back with its fields intact.
 *
 * `project()` deletes the whole `edges` key from a restricted row BEFORE it
 * considers any column, and the ent model tags `edges` without `omitempty`, so
 * an unrestricted row always carries the key even when nothing was loaded into
 * it. The presence of `edges` is therefore an exact test for "no field policy
 * narrowed this row" — which is the only way to tell a person who has no
 * record attached from a person the caller may not see.
 */
export function fieldsIntact(row: RosterRow): boolean {
  return Object.prototype.hasOwnProperty.call(row, 'edges');
}

export type PersonOnRow =
  | { status: 'present'; person: CorePerson }
  /** The row was projected, so the person edge went with it. */
  | { status: 'withheld' }
  /** Fields intact, and there is genuinely no person loaded. */
  | { status: 'absent' };

/**
 * The person a roster row describes.
 *
 * A teacher reaches theirs through staff — `edges.staff.edges.person` — because
 * `teacher.Basic()` is `WithStaff(sq.WithPerson())`. That one indirection is
 * why this is a function and not a property read at each call site.
 */
export function personOf(kind: RosterKind, row: RosterRow): PersonOnRow {
  if (!fieldsIntact(row)) return { status: 'withheld' };

  const person =
    kind === 'teachers'
      ? staffPersonOf((row as TeacherRow).edges?.staff)
      : (row as { edges?: { person?: CorePerson } }).edges?.person;

  return person ? { status: 'present', person } : { status: 'absent' };
}

function staffPersonOf(staff: StaffRow | undefined): CorePerson | undefined {
  if (!staff) return undefined;
  // The nested staff row is projected on its own terms, so it can be narrowed
  // even when the teacher row above it was not.
  if (!fieldsIntact(staff)) return undefined;
  return staff.edges?.person;
}

/**
 * What to call someone.
 *
 * `display_name` is what the school chose to call them; the name parts are the
 * fallback when it is absent — which, on a projected person, means withheld
 * rather than unset. Returns null when there is nothing readable, so the caller
 * renders an explanation instead of an empty line.
 */
export function nameOf(person: CorePerson): string | null {
  if (person.display_name) return person.display_name;
  const parts = [person.first_name, person.middle_name, person.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * The first readable value among a row's identifying columns.
 *
 * Absent is withheld or unset and the two are indistinguishable per column, so
 * this returns null rather than an empty string and the caller says which.
 */
export function codeOf(row: RosterRow, fields: readonly string[]): string | null {
  for (const field of fields) {
    const value = (row as unknown as Record<string, unknown>)[field];
    if (typeof value === 'string' && value !== '') return value;
  }
  return null;
}

/**
 * How many rows of this page the caller may not see.
 *
 * `count` is taken before per-row projection drops uncovered rows, so the
 * difference is exactly the number withheld. Reported rather than hidden: a
 * page showing three of twelve rows with no explanation looks like a broken
 * query.
 */
export function withheldOnPage(count: number, shown: number): number {
  return Math.max(0, count - shown);
}
