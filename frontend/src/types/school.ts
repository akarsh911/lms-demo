import type { PageInfo } from './roster';
import type { SectionRow, SubjectOfferingRow } from './academic';
import type { RoomUnavailability } from './foundation';

/**
 * The school-administrator wire contract: the year, the shape of a day, the
 * rooms and the week. Transcribed from `internal/transport/http/timetable.go`
 * and the ent schemas it writes, not from a spec.
 *
 * # Times are integers, and only bell schedules carry them
 *
 * `start_minute` and `end_minute` are minutes from midnight, so 545 is 09:05.
 * They live on `bell_schedule_periods`. A `period` carries NO time at all,
 * deliberately: one abstract pattern of periods serves both the Regular and the
 * Saturday bells, and giving a period a time would force a second pattern into
 * existence to say the same lesson happens earlier. Render minutes as local
 * time at the edge; never store a formatted string.
 *
 * # A date is in session only when a row says so
 *
 * A `calendar_days` row for (branch, date) with the relevant half open is what
 * puts a date in session. NO ROW MEANS NOT IN SESSION. A holiday is that same
 * row with both halves false and a name on it — the same fact with a label, not
 * a competing representation, which is why nothing here models "closed" as the
 * absence of a row.
 *
 * # One timetable carries every section's week
 *
 * `timetables` hang off `period_scheme_id`; the SECTION is on the slot. There is
 * no timetable-per-section, and that is exactly what makes a teacher booked in
 * two sections at once answerable. A per-section grid is a view over one
 * timetable, never a timetable of its own.
 */

export interface SchoolPage<T> {
  rows: T[];
  count: number;
  page: PageInfo;
}

export interface BranchRow {
  id: string;
  name?: string;
  code?: string;
  status?: string;
}

export interface AcademicSessionRow {
  id: string;
  name?: string;
  code?: string;
  start_date?: string;
  end_date?: string;
  is_current?: boolean;
  status?: string;
}

export type DayType =
  | 'instructional'
  | 'exam'
  | 'event'
  | 'holiday'
  | 'weekend'
  | 'vacation';

export const DAY_TYPES: readonly DayType[] = [
  'instructional',
  'exam',
  'event',
  'holiday',
  'weekend',
  'vacation',
];

export interface CalendarDay {
  id: string;
  academic_session_id?: string;
  branch_id?: string;
  /** RFC3339 at midnight UTC. The date part is the whole of the fact. */
  calendar_date?: string;
  day_type?: DayType;
  forenoon_open?: boolean;
  afternoon_open?: boolean;
  name?: string;
  notes?: string;
}

export interface CalendarDayCreate {
  academic_session_id: string;
  branch_id: string;
  calendar_date: string;
  day_type?: DayType;
  forenoon_open?: boolean;
  afternoon_open?: boolean;
  name?: string;
  notes?: string;
}

/**
 * A patch. `calendar_date`, `branch_id` and `academic_session_id` are recorded
 * when the day is created and answering them is a 422 naming the field, so
 * they are absent from this type rather than merely unused.
 */
export interface CalendarDayPatch {
  day_type?: DayType;
  forenoon_open?: boolean;
  afternoon_open?: boolean;
  name?: string | null;
  notes?: string | null;
}

export interface CalendarDaySchedule {
  id: string;
  calendar_day_id?: string;
  period_scheme_id?: string;
  bell_schedule_id?: string;
}

export interface PeriodScheme {
  id: string;
  academic_session_id?: string;
  branch_id?: string;
  name?: string;
  code?: string;
  description?: string;
  status?: string;
}

export interface PeriodSchemeWrite {
  academic_session_id: string;
  branch_id: string;
  name: string;
  code: string;
  description?: string;
}

export interface PeriodSchemePatch {
  name?: string;
  code?: string;
  description?: string;
  status?: string;
}

// `activity` is not a kind emerge-core accepts yet; the bell-schedule editor offers it and the fixtures keep it.
export type PeriodKind = 'teaching' | 'break' | 'assembly' | 'activity' | 'other';

export const PERIOD_KINDS: readonly PeriodKind[] = [
  'teaching',
  'break',
  'assembly',
  'activity',
  'other',
];

export interface Period {
  id: string;
  period_scheme_id?: string;
  name?: string;
  code?: string;
  sequence?: number;
  kind?: PeriodKind;
  status?: string;
}

export interface PeriodWrite {
  name?: string;
  code?: string;
  sequence?: number;
  kind?: PeriodKind;
  status?: string;
}

export interface BellSchedule {
  id: string;
  period_scheme_id?: string;
  name?: string;
  code?: string;
  is_default?: boolean;
  status?: string;
}

export interface BellScheduleWrite {
  name?: string;
  code?: string;
  is_default?: boolean;
  status?: string;
}

export interface BellSchedulePeriod {
  id: string;
  bell_schedule_id?: string;
  period_id?: string;
  start_minute?: number;
  end_minute?: number;
  runs?: boolean;
}

export interface GradeBand {
  label: string;
  min_percent: number;
  max_percent: number;
  points?: number;
  description?: string;
}

export interface GradingScheme {
  id: string;
  academic_session_id?: string;
  name?: string;
  code?: string;
  description?: string;
  kind?: 'marks' | 'grade' | 'gpa' | 'descriptive';
  maximum_marks?: number;
  pass_marks?: number;
  scale_json?: GradeBand[];
  pass_rule_json?: Record<string, unknown>;
  supersedes_id?: string;
  status?: string;
}

export interface GradeLevelRef {
  id: string;
  name?: string;
  code?: string;
  sequence?: number;
}

export interface PeriodSchemeGradeLevel {
  id: string;
  period_scheme_id?: string;
  grade_level_id?: string;
  edges?: { grade_level?: GradeLevelRef };
}

export interface SchemeGradeLinks {
  schemeId: string;
  rows: PeriodSchemeGradeLevel[];
}

export interface SchemeBellLinks {
  schemeId: string;
  rows: BellSchedule[];
}

export interface Room {
  id: string;
  branch_id?: string;
  name?: string;
  code?: string;
  room_type?: string;
  building?: string;
  floor?: string;
  capacity?: number;
  status?: string;
  // Fixture-only until the backend has columns for them: emerge-core's room has neither.
  facilities?: string[];
  notes?: string;
  unavailable?: RoomUnavailability | null;
}

export interface RoomWrite {
  branch_id?: string;
  name?: string;
  code?: string;
  room_type?: string;
  building?: string | null;
  floor?: string | null;
  capacity?: number | null;
  status?: string;
  facilities?: string[];
  notes?: string | null;
  unavailable?: RoomUnavailability | null;
}

export interface Timetable {
  id: string;
  academic_session_id?: string;
  period_scheme_id?: string;
  name?: string;
  version?: number;
  effective_from?: string;
  effective_to?: string;
  status?: string;
  supersedes_id?: string;
  published_at?: string;
  published_by?: string;
}

/**
 * A slot: one section, one day, one period, for the life of the timetable.
 *
 * The clash fields are the record of a double-booking somebody accepted on
 * purpose. They stay on the row so a week can be read back as it was decided —
 * an override that stopped showing would be indistinguishable from a clash
 * nobody ever noticed.
 */
export interface TimetableSlot {
  id: string;
  timetable_id?: string;
  section_id?: string;
  period_id?: string;
  day_of_week?: number;
  subject_offering_id?: string;
  teacher_id?: string;
  room_id?: string;
  label?: string;
  clash_override?: boolean;
  clash_override_reason?: string;
  clash_overridden_by?: string;
  clash_overridden_at?: string;
  clash_override_json?: AcceptedClash[];
}

export interface AcceptedClash {
  rule?: string;
  scope?: string;
  day_of_week?: number;
  period_id?: string;
  counterpart_timetable_slot_id?: string;
  counterpart_timetable_deviation_id?: string;
  teacher_id?: string;
  room_id?: string;
  student_count?: number;
}

export interface SlotWrite {
  section_id?: string;
  period_id?: string;
  day_of_week?: number;
  subject_offering_id?: string | null;
  teacher_id?: string | null;
  room_id?: string | null;
  label?: string | null;
  clash_override?: boolean;
  clash_override_reason?: string;
}

export type ClashRule = 'teacher' | 'room' | 'student_set';

export interface ClashParty {
  ref?: string;
  timetable_slot_id?: string;
  timetable_deviation_id?: string;
  timetable_id?: string;
  section_id?: string;
  period_id?: string;
  subject_offering_id?: string;
  teacher_id?: string;
  room_id?: string;
  start_minute?: number;
  end_minute?: number;
}

export interface ClashOverrideNote {
  reason?: string;
  overridden_by?: string;
  overridden_at?: string;
  timetable_slot_id?: string;
}

/**
 * One collision. `overridable` is the API's own answer and the only thing an
 * override control may be drawn from: a `student_set` clash never is, because
 * the same pupil owed a mark in two registers for one period makes the losing
 * register read as an absence.
 */
export interface Clash {
  rule: ClashRule;
  scope?: 'pattern' | 'date';
  day_of_week?: number;
  period_id?: string;
  date?: string;
  effective_from?: string;
  effective_to?: string;
  teacher_id?: string;
  room_id?: string;
  student_ids?: string[];
  student_count?: number;
  overridable: boolean;
  overridden?: boolean;
  override?: ClashOverrideNote;
  left: ClashParty;
  right: ClashParty;
}

/**
 * `POST /timetables/{id}/clash-check` — a REPORT, answered 200 whatever it
 * finds. `blocking` counts the clashes nothing has accepted and `overridden`
 * the ones somebody has; both are present so an accepted double-booking still
 * reads as a double-booking instead of disappearing.
 */
export interface ClashReport {
  clashes: Clash[];
  count: number;
  clear: boolean;
  blocking: number;
  overridden: number;
  dates_checked?: string[];
}

/** The 409 body. The same clashes, no counts, and `code` is `timetable_clash`. */
export interface ClashRefusal {
  error?: string;
  message?: string;
  code?: string;
  clashes?: Clash[];
  count?: number;
  dates_checked?: string[];
}

export interface ClashProposal {
  ref: string;
  replaces_timetable_slot_id?: string;
  section_id: string;
  period_id: string;
  day_of_week: number;
  subject_offering_id?: string;
  teacher_id?: string;
  room_id?: string;
}

export interface TeacherAssignmentRow {
  id: string;
  teacher_id?: string;
  section_id?: string;
  subject_offering_id?: string;
  role_type?: string;
  is_primary?: boolean;
  status?: string;
}

/**
 * An offering plus the obligation nobody else reads.
 *
 * `minutes_per_week` is on the row (`internal/ent/schema/subject.go`) and comes
 * back on every read, but it is NOT in `types/academic.ts` because nothing else
 * in the product reports against it. `periods_per_week` is the hard placement
 * constraint; `minutes_per_week` is the stated obligation. The two can
 * legitimately disagree — a 40-minute period six times a week is 240, not the
 * 300 a syllabus may demand — and that gap is a finding to show, not an error.
 */
export interface SchoolOfferingRow extends SubjectOfferingRow {
  minutes_per_week?: number;
  result_scheme_id?: string;
}

export type { SectionRow, SubjectOfferingRow };
