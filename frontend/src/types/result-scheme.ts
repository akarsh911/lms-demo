export type ResultSchemeStatus = 'draft' | 'active' | 'inactive';

export const RESULT_SCHEME_STATUSES: readonly ResultSchemeStatus[] = [
  'draft',
  'active',
  'inactive',
];

export type ResultAggregation = 'single' | 'sum' | 'best_of' | 'average';

export const RESULT_AGGREGATIONS: readonly ResultAggregation[] = [
  'single',
  'sum',
  'best_of',
  'average',
];

export interface ResultScheme {
  id: string;
  academic_session_id?: string;
  name?: string;
  code?: string;
  description?: string;
  total_marks?: number;
  supersedes_id?: string;
  status?: ResultSchemeStatus;
  created_at?: string;
}

export interface ResultSchemeCreate {
  academic_session_id: string;
  name: string;
  code: string;
  description?: string;
  total_marks?: number;
}

export interface ResultSchemePatch {
  name?: string;
  code?: string;
  description?: string;
  total_marks?: number;
  status?: ResultSchemeStatus;
}

export interface ResultComponent {
  id: string;
  result_scheme_id?: string;
  name?: string;
  maximum_marks?: number;
  weight?: number;
  aggregation?: ResultAggregation;
  take_best?: number;
  position?: number;
}

export interface ResultComponentWrite {
  name?: string;
  maximum_marks?: number;
  weight?: number;
  aggregation?: ResultAggregation;
  take_best?: number | null;
  position?: number;
}

export interface ResultComponentExamLink {
  id: string;
  result_component_id?: string;
  exam_id?: string;
}

export interface ResultComponentAssignmentLink {
  id: string;
  result_component_id?: string;
  assignment_id?: string;
}

export type ExamAssessmentKind = 'evaluative' | 'practice';

export interface ExamRow {
  id: string;
  academic_session_id?: string;
  branch_id?: string;
  name?: string;
  code?: string;
  exam_type?: 'unit_test' | 'term' | 'practice' | 'board';
  status?: 'draft' | 'published' | 'archived';
  assessment_kind?: ExamAssessmentKind;
  start_at?: string;
  end_at?: string;
}
