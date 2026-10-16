import type { ComputedResult, ResultComposition } from '@/types/results';

export type ReportSubjectStatus =
  | 'final'
  | 'provisional'
  | 'partly_composed'
  | 'in_progress'
  | 'awaiting_marks'
  | 'exempt'
  | 'not_composed'
  | 'result_scheme_unfilled_for_offering'
  | 'result_not_computable';

export interface ReportGrade {
  grading_scheme_id: string;
  grading_scheme: string;
  kind: string;
  percentage: number;
  label: string;
  points?: number;
  min_percent: number;
  max_percent: number;
  description?: string;
  provisional: boolean;
}

export interface ReportGradeGap {
  grading_scheme_id: string | null;
  grading_scheme?: string;
  reason: string;
}

export interface ReportSubjectLine {
  subject_offering_id: string;
  subject_id: string;
  subject: string;
  subject_code: string;
  status: ReportSubjectStatus;
  reason?: string;
  final: boolean;
  result_scheme_id: string | null;
  result_scheme?: string;
  result: ComputedResult | null;
  composition?: ResultComposition;
  grade: ReportGrade | null;
  grade_not_named?: ReportGradeGap;
}

export interface ReportCard {
  student_id: string;
  academic_session_id: string;
  subjects: ReportSubjectLine[];
  count: number;
  covers_every_subject: boolean;
  coverage_reason?: string;
  final: boolean;
  provisional: boolean;
  subjects_by_status: Record<string, number>;
  aggregate: null;
  aggregate_reason: string;
  reason?: string;
}
