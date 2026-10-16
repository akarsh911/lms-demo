export type QuestionType =
  | 'mcq'
  | 'multi_select'
  | 'true_false'
  | 'fill_blank'
  | 'match'
  | 'short_answer'
  | 'long_answer'
  | 'numeric'
  | 'assertion_reason'
  | 'case_study'
  | 'code';

export type QuestionStatus = 'draft' | 'reviewed' | 'published' | 'retired';

export type DifficultyLabel = 'easy' | 'medium' | 'hard';

export type QuestionSource = 'original' | 'pyq' | 'ai' | 'imported';

export interface QuestionRow {
  id: string;
  canonical_key?: string;
  subject_id?: string;
  grade_level_id?: string;
  question_type?: QuestionType;
  status?: QuestionStatus;
  difficulty_score?: number;
  difficulty_label?: DifficultyLabel;
  bloom_level?: string;
  language?: string;
  estimated_seconds?: number;
  source_type?: QuestionSource;
  created_by?: string;
  created_at?: string;
}

export interface QuestionVersionRow {
  id: string;
  question_id?: string;
  version_number?: number;
  stem?: string;
  status?: QuestionStatus;
  created_at?: string;
}
