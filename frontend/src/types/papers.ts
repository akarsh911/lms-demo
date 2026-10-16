export type PaperStatus = 'draft' | 'reviewed' | 'approved' | 'published';

export const PAPER_STATUSES: readonly PaperStatus[] = [
  'draft',
  'reviewed',
  'approved',
  'published',
];

export interface PaperRow {
  id: string;
  academic_session_id?: string;
  exam_id?: string;
  blueprint_id?: string;
  generation_run_id?: string;
  paper_code?: string;
  title?: string;
  version?: number;
  status?: PaperStatus;
  total_marks?: number;
  duration_minutes?: number;
  approved_by?: string;
  approved_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PaperSectionRow {
  id: string;
  paper_id?: string;
  name?: string;
  code?: string;
  position?: number;
  instructions?: string;
  created_at?: string;
}

export interface PaperQuestionRow {
  id: string;
  paper_section_id?: string;
  question_id?: string;
  question_version_id?: string;
  question_number?: string;
  marks?: number;
  position?: number;
  variant_group?: string;
}

export interface PaperSectionBlock {
  section: PaperSectionRow;
  questions: PaperQuestionRow[];
}

export interface PaperDetail {
  paper: PaperRow;
  sections: PaperSectionBlock[];
}

export interface PaperCreate {
  academic_session_id: string;
  paper_code: string;
  title: string;
  total_marks: number;
  exam_id?: string;
  blueprint_id?: string;
  version?: number;
  status?: PaperStatus;
  duration_minutes?: number;
}

export interface PaperPatch {
  title?: string;
  status?: PaperStatus;
  total_marks?: number;
  duration_minutes?: number | null;
  exam_id?: string | null;
  blueprint_id?: string | null;
}

export interface PaperQuestionCreate {
  question_id: string;
  question_version_id: string;
  question_number: string;
  marks: number;
  position: number;
  variant_group?: string;
}

export interface PaperSectionCreate {
  name: string;
  code: string;
  position: number;
  instructions?: string;
}

export type GenerationMethod = 'ai' | 'manual' | 'hybrid';

export type GenerationRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface GenerationRunRow {
  id: string;
  blueprint_id?: string;
  academic_session_id?: string;
  generation_method?: GenerationMethod;
  algorithm?: string;
  model_version?: string;
  status?: GenerationRunStatus;
  requested_by?: string;
  started_at?: string;
  completed_at?: string;
  prompt_hash?: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_amount?: number;
  cost_currency?: string;
  failure_reason?: string;
  created_at?: string;
}
