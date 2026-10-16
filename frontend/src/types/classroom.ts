import type { PageInfo } from './roster';

export type OccurrenceState =
  | 'planned'
  | 'cancelled'
  | 'substituted'
  | 'relocated'
  | 'rescheduled'
  | 'added';

export interface OccurrenceRow {
  id: string;
  date: string;
  day_of_week: number;
  half?: string;
  state: OccurrenceState;

  branch_id: string;
  calendar_day_id: string;
  day_type: string;
  timetable_slot_id?: string;
  timetable_deviation_id?: string;
  deviation_kind?: string;

  section_id: string;
  period_id: string;
  period_code?: string;
  period_name?: string;
  period_sequence: number;
  period_kind?: string;

  subject_offering_id?: string;
  teacher_id?: string;
  planned_teacher_id?: string;
  room_id?: string;
  planned_room_id?: string;
  label?: string;
  reason?: string;

  start_minute: number;
  end_minute: number;
  times_resolved: boolean;
}

export interface OccurrenceWindow {
  occurrences: OccurrenceRow[];
  count: number;
  branch_id: string;
  from: string;
  to: string;
  half: string;
}

export type StreamPostType = 'announcement' | 'resource' | 'poll' | 'question';
export type StreamPostStatus = 'draft' | 'published' | 'archived';
export type StreamTargetType =
  | 'school'
  | 'branch'
  | 'grade'
  | 'section'
  | 'offering'
  | 'student';

export interface StreamTargetRow {
  id: string;
  post_id: string;
  target_type: StreamTargetType;
  target_id: string;
}

export interface StreamPostRow {
  id: string;
  author_person_id?: string;
  academic_session_id?: string;
  post_type?: StreamPostType;
  title?: string;
  body?: string;
  pinned?: boolean;
  published_at?: string;
  expires_at?: string;
  status?: StreamPostStatus;
  created_at?: string;
  updated_at?: string;
  edges?: { targets?: StreamTargetRow[] };
}

export interface StreamCommentRow {
  id: string;
  post_id?: string;
  author_person_id?: string;
  body?: string;
  status?: 'visible' | 'hidden';
  created_at?: string;
}

export type AssignmentType =
  | 'worksheet'
  | 'project'
  | 'reading'
  | 'practice'
  | 'test';

export interface AssignmentRow {
  id: string;
  academic_session_id?: string;
  teacher_id?: string;
  subject_offering_id?: string;
  title?: string;
  description?: string;
  instructions?: string;
  assignment_type?: AssignmentType;
  content_id?: string;
  available_from?: string;
  due_at?: string;
  late_submission_allowed?: boolean;
  max_attempts?: number;
  maximum_marks?: number;
  status?: 'draft' | 'published' | 'closed';
  created_at?: string;
}

export interface AssignmentItemRow {
  id: string;
  assignment_id?: string;
  content_item_id?: string;
  question_id?: string;
  position?: number;
  marks?: number;
  required?: boolean;
}

export interface AssignmentSubmissionRow {
  id: string;
  assignment_id?: string;
  student_id?: string;
  attempt_number?: number;
  submitted_at?: string;
  status?: 'draft' | 'submitted' | 'graded' | 'returned';
  late?: boolean;
  total_marks?: number;
  marks_obtained?: number;
  graded_at?: string;
}

export interface ClassroomPage<T> {
  rows: T[];
  count: number;
  page: PageInfo;
}

export interface StreamTargetWrite {
  target_type: StreamTargetType;
  target_id: string;
}

export interface StreamPostWrite {
  academic_session_id?: string;
  post_type?: StreamPostType;
  title?: string;
  body: string;
  pinned?: boolean;
  published_at?: string;
  expires_at?: string;
  status?: StreamPostStatus;
  targets: StreamTargetWrite[];
}

export interface StreamPostCreated {
  stream_post: StreamPostRow;
  targets: StreamTargetRow[];
}

export interface StreamCommentWrite {
  body: string;
}

export type AssignmentTargetType = 'section' | 'student' | 'offering';

export interface AssignmentTargetRow {
  id: string;
  assignment_id?: string;
  target_type?: AssignmentTargetType;
  target_id?: string;
}

export interface AssignmentTargetWrite {
  target_type: AssignmentTargetType;
  target_id: string;
}

export type AssignmentStatus = 'draft' | 'published' | 'closed';

export interface AssignmentWrite {
  academic_session_id: string;
  subject_offering_id?: string;
  title: string;
  description?: string;
  instructions?: string;
  assignment_type?: AssignmentType;
  content_id?: string;
  available_from?: string;
  due_at?: string;
  late_submission_allowed?: boolean;
  max_attempts?: number;
  maximum_marks?: number;
  status?: AssignmentStatus;
  targets: AssignmentTargetWrite[];
}

export interface AssignmentCreated {
  assignment: AssignmentRow;
  targets: AssignmentTargetRow[];
}

export interface AssignmentItemWrite {
  content_item_id?: string;
  question_id?: string;
  position: number;
  marks?: number;
  required?: boolean;
}
