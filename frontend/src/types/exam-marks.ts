export type ExamMarkStatus = 'marked' | 'absent' | 'exempt';

export const EXAM_MARK_STATUSES: readonly ExamMarkStatus[] = [
  'marked',
  'absent',
  'exempt',
];

export interface ExamMarkRow {
  id: string;
  exam_subject_id?: string;
  student_id?: string;
  exam_sitting_id?: string;
  status?: ExamMarkStatus;
  marks_obtained?: number;
  provisional?: boolean;
  remarks?: string;
  marked_by?: string;
  marked_at?: string;
}

export interface ExamMarkEntry {
  student_id: string;
  status: ExamMarkStatus;
  marks_obtained?: number;
  remarks?: string;
}

export interface ExamMarkBatch {
  exam_subject_id: string;
  exam_sitting_id?: string;
  marks: ExamMarkEntry[];
}

export interface ExamMarkBatchResult {
  exam_marks: ExamMarkRow[];
  created: number;
  updated: number;
  count: number;
}

export interface ExamMarkRefusal {
  message?: string;
  index?: number;
  student_id?: string;
  unreachable?: string[];
  not_enrolled?: string[];
}

export const EXAM_MARK_BATCH_LIMIT = 200;
