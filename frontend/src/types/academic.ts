import type { PageInfo } from './roster';
import type { StudentRow } from './roster';

/**
 * The academic structure: sections, what is taught in them, and who is in them.
 *
 * Same envelope as the roster — `{ <plural>, count, page }` — and the same
 * `has_more`-without-a-total contract. Two differences from the roster are
 * worth stating because they change what the UI must handle.
 *
 * ## Sections and offerings are not field-projected
 *
 * `listSections` and `listOfferings` query the tenant client directly and
 * return the rows as they are; only `s.can(...)` gates them
 * (`internal/transport/http/sections.go`, `subjects.go`). So `edges` is always
 * present and never half-there, and a row is all-or-nothing rather than
 * column-by-column. Enrollments ARE projected and scoped per viewer, so they
 * behave like the roster.
 *
 * ## The CURRENT session is the default, silently
 *
 * All three filter to the session flagged `is_current` unless the request
 * names `academic_session_id` or passes `all_sessions=true`
 * (`SectionFilters.sessionPredicate`, and the same shape in the other two). A
 * screen that does not say so appears to have lost last year entirely. This
 * application asks for the default and LABELS it, rather than passing
 * `all_sessions` and mixing two years into one list.
 */

export interface AcademicSessionRef {
  id: string;
  name?: string;
  code?: string;
  is_current?: boolean;
  start_date?: string;
  end_date?: string;
}

export interface GradeLevelRef {
  id: string;
  name?: string;
  code?: string;
}

export interface BranchRef {
  id: string;
  name?: string;
  code?: string;
}

export interface SubjectRef {
  id: string;
  name?: string;
  code?: string;
}

export interface SectionRow {
  id: string;
  academic_session_id?: string;
  branch_id?: string;
  grade_level_id?: string;
  name?: string;
  code?: string;
  capacity?: number;
  room_id?: string;
  class_teacher_id?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  /** `WithGradeLevel().WithBranch()` on the list; the read adds the session. */
  edges?: {
    grade_level?: GradeLevelRef;
    branch?: BranchRef;
    academic_session?: AcademicSessionRef;
  };
}

export interface SubjectOfferingRow {
  id: string;
  academic_session_id?: string;
  section_id?: string;
  subject_id?: string;
  subject_group_id?: string;
  periods_per_week?: number;
  maximum_marks?: number;
  pass_marks?: number;
  grading_scheme_id?: string;
  result_scheme_id?: string;
  status?: string;
  /** `WithSubject().WithSection()`. */
  edges?: { subject?: SubjectRef; section?: SectionRow };
}

export interface EnrollmentRow {
  id: string;
  student_id?: string;
  academic_session_id?: string;
  section_id?: string;
  roll_number?: string;
  enrollment_number?: string;
  enrollment_date?: string;
  exit_date?: string;
  promotion_status?: string;
  status?: string;
  /** `Basic()` is `WithSection().WithStudent()`; the student carries no person. */
  edges?: { student?: StudentRow; section?: SectionRow };
}

export interface AcademicPage<T> {
  rows: T[];
  count: number;
  page: PageInfo;
}

export interface TeacherAssignmentRow {
  id: string;
  academic_session_id?: string;
  teacher_id?: string;
  section_id?: string;
  subject_offering_id?: string;
  role_type?: string;
  is_primary?: boolean;
  valid_from?: string;
  valid_to?: string;
  status?: string;
  edges?: { section?: SectionRow; subject_offering?: SubjectOfferingRow };
}
