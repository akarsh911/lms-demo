import type { PageInfo } from './roster';

export type ExamType = 'unit_test' | 'term' | 'practice' | 'board';

export type ExamStatus = 'draft' | 'published' | 'archived';

export type AssessmentKind = 'evaluative' | 'practice';

export const EXAM_TYPES: readonly ExamType[] = ['unit_test', 'term', 'practice', 'board'];

export const EXAM_STATUSES: readonly ExamStatus[] = ['draft', 'published', 'archived'];

export const ASSESSMENT_KINDS: readonly AssessmentKind[] = ['evaluative', 'practice'];

export interface ExamRow {
  id: string;
  academic_session_id?: string;
  branch_id?: string;
  name?: string;
  code?: string;
  exam_type?: ExamType;
  start_at?: string;
  end_at?: string;
  instructions?: string;
  status?: ExamStatus;
  assessment_kind?: AssessmentKind;
}

export interface ExamCreate {
  academic_session_id: string;
  branch_id: string;
  name: string;
  code: string;
  exam_type?: ExamType;
  start_at?: string;
  end_at?: string;
  instructions?: string;
  status?: ExamStatus;
  assessment_kind?: AssessmentKind;
}

export interface ExamPatch {
  name?: string;
  code?: string;
  exam_type?: ExamType;
  start_at?: string;
  end_at?: string;
  instructions?: string;
  status?: ExamStatus;
  assessment_kind?: AssessmentKind;
}

export interface ExamSubjectRow {
  id: string;
  exam_id?: string;
  subject_offering_id?: string;
  maximum_marks?: number;
  pass_marks?: number;
  grading_scheme_id?: string;
}

export interface ExamSubjectCreate {
  subject_offering_id: string;
  maximum_marks: number;
  pass_marks?: number;
  grading_scheme_id?: string;
}

export interface ExamSubjectPatch {
  maximum_marks?: number;
  pass_marks?: number | null;
  grading_scheme_id?: string | null;
}

export interface ExamSittingRow {
  id: string;
  exam_subject_id?: string;
  calendar_day_id?: string;
  period_id?: string;
  section_id?: string;
  room_id?: string;
}

export interface ExamSittingCreate {
  date: string;
  period_id: string;
  room_id?: string;
}

export interface ExamPage<T> {
  rows: T[];
  count: number;
  page: PageInfo;
}
