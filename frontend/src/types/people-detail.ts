import type { SectionRow, SubjectOfferingRow } from './academic';
import type { CorePerson } from './core';
import type { PageInfo, StudentRow } from './roster';

export interface DetailPage<T> {
  rows: T[];
  count: number;
  page: PageInfo;
}

export interface SubjectRow {
  id: string;
  name?: string;
  code?: string;
  subject_type?: string;
  status?: string;
}

export interface StudentEnrollmentRow {
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
  edges?: { student?: StudentRow; section?: SectionRow };
}

export interface SubjectEnrollmentRow {
  id: string;
  student_id?: string;
  student_enrollment_id?: string;
  subject_offering_id?: string;
  academic_session_id?: string;
  is_elective_choice?: boolean;
  enrolled_on?: string;
  dropped_on?: string;
  status?: string;
  edges?: { subject_offering?: SubjectOfferingRow; student?: StudentRow };
}

export interface TeacherAssignmentRow {
  id: string;
  teacher_id?: string;
  section_id?: string;
  subject_offering_id?: string;
  academic_session_id?: string;
  role_type?: string;
  is_primary?: boolean;
  valid_from?: string;
  valid_to?: string;
  assigned_by?: string;
  status?: string;
  edges?: { section?: SectionRow; subject_offering?: SubjectOfferingRow };
}

export interface AttendanceDayRow {
  id: string;
  student_id?: string;
  academic_session_id?: string;
  section_id?: string;
  attendance_date?: string;
  forenoon_status?: string;
  afternoon_status?: string;
  reason_code?: string;
  remarks?: string;
  source?: string;
}

export interface AttendancePeriodRow {
  id: string;
  student_id?: string;
  academic_session_id?: string;
  subject_offering_id?: string;
  period_id?: string;
  attendance_date?: string;
  status?: string;
  timetable_slot_id?: string;
  teacher_id?: string;
  reason_code?: string;
  remarks?: string;
  source?: string;
}

export interface AssignmentRow {
  id: string;
  academic_session_id?: string;
  teacher_id?: string;
  subject_offering_id?: string;
  title?: string;
  description?: string;
  instructions?: string;
  assignment_type?: string;
  content_id?: string;
  available_from?: string;
  due_at?: string;
  late_submission_allowed?: boolean;
  max_attempts?: number;
  maximum_marks?: number;
  status?: string;
  created_at?: string;
}

export interface AssignmentSubmissionRow {
  id: string;
  assignment_id?: string;
  student_id?: string;
  attempt_number?: number;
  submitted_at?: string;
  status?: string;
  late?: boolean;
  total_marks?: number;
  marks_obtained?: number;
  graded_at?: string;
  graded_by?: string;
}

export interface StreamTargetRow {
  id: string;
  post_id?: string;
  target_type?: string;
  target_id?: string;
}

export interface StreamPostRow {
  id: string;
  author_person_id?: string;
  academic_session_id?: string;
  post_type?: string;
  title?: string;
  body?: string;
  pinned?: boolean;
  published_at?: string;
  expires_at?: string;
  status?: string;
  created_at?: string;
  edges?: { author?: CorePerson; targets?: StreamTargetRow[] };
}

export interface TimetableOccurrence {
  id: string;
  date?: string;
  day_of_week?: number;
  half?: string;
  state?: string;
  branch_id?: string;
  calendar_day_id?: string;
  day_type?: string;
  period_scheme_id?: string;
  bell_schedule_id?: string;
  timetable_id?: string;
  timetable_slot_id?: string;
  timetable_deviation_id?: string;
  deviation_kind?: string;
  section_id?: string;
  period_id?: string;
  period_code?: string;
  period_name?: string;
  period_sequence?: number;
  period_kind?: string;
  subject_offering_id?: string;
  teacher_id?: string;
  planned_teacher_id?: string;
  room_id?: string;
  planned_room_id?: string;
  label?: string;
  reason?: string;
  start_minute?: number;
  end_minute?: number;
  times_resolved?: boolean;
}

export interface OccurrenceAnswer {
  occurrences: TimetableOccurrence[];
  count: number;
  branch_id?: string;
  from?: string;
  to?: string;
  half?: string;
}

export interface Qualification {
  degree?: string;
  institution?: string;
  field?: string;
  year?: number;
  grade_or_cgpa?: string;
}

export interface CalendarDayRow {
  id: string;
  academic_session_id?: string;
  branch_id?: string;
  calendar_date?: string;
  day_type?: string;
  forenoon_open?: boolean;
  afternoon_open?: boolean;
  name?: string;
  notes?: string;
}

export interface CalendarDayScheduleRow {
  id: string;
  calendar_day_id?: string;
  period_scheme_id?: string;
  bell_schedule_id?: string;
}

export interface PeriodRow {
  id: string;
  period_scheme_id?: string;
  name?: string;
  code?: string;
  sequence?: number;
  kind?: string;
  status?: string;
}

export interface BellSchedulePeriodRow {
  id: string;
  bell_schedule_id?: string;
  period_id?: string;
  start_minute?: number;
  end_minute?: number;
}

export type IdentifiablePerson = CorePerson & { cas_user_id?: string };
