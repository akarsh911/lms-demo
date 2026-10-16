import type { CorePerson } from './core';
import type { Qualification } from './people-detail';

/**
 * The roster: students, staff, teachers and guardians as emerge-core lists them.
 *
 * Every list route answers the same envelope —
 * `{ school, <plural>, count, page }` — and every row is the raw ent model,
 * projected through the caller's field policy. Three properties of that shape
 * decide most of what the UI has to do, and all three read as bugs if you do
 * not know them.
 *
 * ## 1. `page` has no total, deliberately
 *
 * `pageOf` derives `has_more` from whether the page came back FULL
 * (`returned === limit`), not from a counting query
 * (`internal/transport/http/common.go`). So:
 *
 *   - there is no page count and no "page 3 of 9" to render;
 *   - a last page that happens to be exactly `limit` long reports
 *     `has_more: true`, and the page after it is empty. An empty page at a
 *     non-zero offset is a legitimate end, not an error.
 *
 * ## 2. `count` is NOT the length of the array
 *
 * `count` is `len(rows)` BEFORE projection. `projectPerRow` then drops any row
 * whose id is not covered by a per-row grant, so the array can be shorter than
 * `count` and can be empty while `count` is not
 * (`internal/transport/http/fields.go`). Rendering `count` as "N results" tells
 * the user they are looking at rows that are not there.
 *
 * ## 3. `edges` is deleted wholesale by any field policy
 *
 * A row carries its person on `edges.person` (a teacher on
 * `edges.staff.edges.person`). `project()` deletes the whole `edges` key from a
 * restricted row before it deletes anything else, so a caller with any field
 * policy gets rows with no person attached at all — ids and codes, no names.
 *
 * Because the ent model tags `edges` WITHOUT `omitempty`, an unrestricted row
 * always has the key, even when empty. So the presence of `edges` is an exact
 * test for "this row was not field-restricted", which is what
 * `personOf` uses. A missing name is then reported as withheld rather than
 * drawn blank.
 */

export interface PageInfo {
  limit: number;
  offset: number;
  /** `returned === limit`. Never a total, never a page count. See above. */
  has_more: boolean;
}

/** What every list route returns, once the per-endpoint array key is resolved. */
export interface RosterPage<T> {
  /** The school CODE, echoed by the endpoint. Not the id the proxy sent. */
  school?: string;
  /** Rows the caller may see. May be SHORTER than `count`. */
  rows: T[];
  /** Rows the page matched, before per-row projection dropped any. */
  count: number;
  page: PageInfo;
}

/** Fields every roster row shares. `id` is readable regardless of policy. */
interface RosterRowBase {
  id: string;
  created_at?: string;
  updated_at?: string;
  status?: string;
}

export interface StudentRow extends RosterRowBase {
  person_id?: string;
  admission_number?: string;
  student_code?: string;
  admission_date?: string;
  withdrawal_date?: string;
  withdrawal_reason?: string;
  house_id?: string;
  edges?: { person?: CorePerson };
}

export interface StaffRow extends RosterRowBase {
  person_id?: string;
  employee_code?: string;
  department_id?: string;
  branch_id?: string;
  designation?: string;
  employment_type?: string;
  joining_date?: string;
  leaving_date?: string;
  edges?: { person?: CorePerson };
}

export interface TeacherRow extends RosterRowBase {
  staff_id?: string;
  teacher_code?: string;
  specialization?: string;
  qualification_json?: Qualification[];
  /** A teacher reaches its person through staff, not directly. */
  edges?: { staff?: StaffRow };
}

export interface GuardianRow extends RosterRowBase {
  person_id?: string;
  occupation?: string;
  employer?: string;
  edges?: { person?: CorePerson };
}

export type RosterRow = StudentRow | StaffRow | TeacherRow | GuardianRow;
