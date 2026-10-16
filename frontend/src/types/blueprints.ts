export type BlueprintStatus = 'draft' | 'published' | 'archived';

export const BLUEPRINT_STATUSES: readonly BlueprintStatus[] = [
  'draft',
  'published',
  'archived',
];

export type ConstraintType = 'difficulty' | 'bloom' | 'topic' | 'outcome' | 'type';

export const CONSTRAINT_TYPES: readonly ConstraintType[] = [
  'difficulty',
  'bloom',
  'topic',
  'outcome',
  'type',
];

export interface CognitiveBand {
  key: string;
  label: string;
  weight_percent?: number;
  min_percent?: number;
  max_percent?: number;
}

export interface CognitiveScheme {
  name: string;
  bands: CognitiveBand[];
}

export interface UnitWeight {
  key: string;
  label?: string;
  weight_percent?: number;
  marks?: number;
}

export interface UnitWeightage {
  units: UnitWeight[];
}

export interface BlueprintRow {
  id: string;
  academic_session_id?: string;
  grade_level_id?: string;
  subject_id?: string;
  code?: string;
  name?: string;
  description?: string;
  total_marks?: number;
  duration_minutes?: number;
  version?: number;
  status?: BlueprintStatus;
  cognitive_scheme?: CognitiveScheme;
  unit_weightage?: UnitWeightage;
  created_at?: string;
  updated_at?: string;
}

export interface BlueprintSectionRow {
  id: string;
  blueprint_id?: string;
  name?: string;
  section_code?: string;
  position?: number;
  question_count?: number;
  marks_per_question?: number;
  total_marks?: number;
  duration_minutes?: number;
}

export interface BlueprintConstraintRow {
  id: string;
  blueprint_section_id?: string;
  constraint_type?: ConstraintType;
  value_json?: Record<string, unknown>;
  min_value?: number;
  max_value?: number;
}

export interface BlueprintSectionBlock {
  section: BlueprintSectionRow;
  constraints: BlueprintConstraintRow[];
}

export interface BlueprintDetail {
  blueprint: BlueprintRow;
  sections: BlueprintSectionBlock[];
}

export interface BlueprintCreate {
  grade_level_id: string;
  subject_id: string;
  code: string;
  name: string;
  total_marks: number;
  duration_minutes: number;
  cognitive_scheme: CognitiveScheme;
  academic_session_id?: string;
  description?: string;
  version?: number;
  status?: BlueprintStatus;
  unit_weightage?: UnitWeightage;
}

export interface BlueprintPatch {
  name?: string;
  description?: string | null;
  total_marks?: number;
  duration_minutes?: number;
  status?: BlueprintStatus;
  cognitive_scheme?: CognitiveScheme;
  unit_weightage?: UnitWeightage | null;
}

export interface BlueprintSectionCreate {
  name: string;
  section_code: string;
  position: number;
  question_count: number;
  total_marks: number;
  marks_per_question?: number;
  duration_minutes?: number;
}

export interface BlueprintConstraintCreate {
  constraint_type: ConstraintType;
  value_json: Record<string, unknown>;
  min_value?: number;
  max_value?: number;
}
