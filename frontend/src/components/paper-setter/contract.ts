import type { CurriculumNodeKind } from '@/types/library';

export interface ComposeSource {
  curriculum_id: string;
  node_ids: string[];
}

export type WeightMap = Record<string, number>;

export interface NodeAvailability {
  node_id: string;
  title: string;
  kind: CurriculumNodeKind | '';
  target_share: number;
  available_share: number;
  placements: number;
  readable: number;
  exact: number;
  indexed: number;
  stale: number;
  not_indexed: number;
  unpublished: number;
  source_deleted: number;
  unreadable?: number;
  supply?: string;
}

export interface ComposeBook {
  id: string;
  title: string;
  content_item_id?: string;
  engine_document_id?: string;
  unit_id: string;
  unit_title: string;
  resolved: boolean;
  reason?: string;
}

export interface ChapterTarget {
  document_id: string;
  document_title: string;
  chapter_index: number;
  chapter_display: string;
  share: number;
}

export interface Refusal {
  code: string;
  message: string;
  detail: Record<string, unknown> | null;
  signedOut: boolean;
}

export type PaperShape = 'preset' | 'template' | 'mix';

export type BlueprintRef =
  | { preset: string }
  | { template_id: string }
  | { mix: string }
  | Record<string, never>;

export interface ComposeOverrides {
  kind: string;
  class_id: string;
  section_id?: string;
  exam_name?: string;
  focus?: string[];
}

export interface ComposeRequest {
  source: ComposeSource;
  blueprint: BlueprintRef;
  overrides: ComposeOverrides;
  weights?: WeightMap;
}

export interface ComposePreview {
  sample?: boolean;
  blueprint: BlueprintShape;
  nodes: NodeAvailability[];
  books: ComposeBook[];
  chapter_targets: ChapterTarget[];
  warnings: string[];
  unplaceable_share?: number;
  unplaceable_node_ids?: string[];
  unplaceable_reasons?: string[];
}

export interface ComposeResult {
  paper_id: string;
  sample?: boolean;
  warnings?: string[];
  unplaceable_share?: number;
  books?: ComposeBook[];
  questions?: number;
  marks?: number;
  status?: string;
}

export interface PresetSummary {
  id: string;
  name: string;
  kind: string;
  writable: boolean;
  total_marks: number;
  question_count: number;
  duration_min: number;
  subject: string;
}

export interface PaperSetterSettings {
  presets: PresetSummary[];
  cooldown_months: number;
  default_mode: string | null;
  teacher_may_choose_mode: boolean | null;
  oversupply_factor: number;
  quality_gate: number;
  cost_pricing_configured: boolean;
  core_backed_stores: boolean;
}

export interface TemplateSummary {
  id: string;
  name: string;
  kind: string;
  writable: boolean;
  created_at?: string;
  total_marks?: number;
  question_count?: number;
  duration_min?: number;
  subject?: string;
}

export interface SectionItemIn {
  question_type: string;
  marks: number;
  count: number;
}

export interface SectionIn {
  id: string;
  title: string;
  instruction: string;
  items: SectionItemIn[];
  two_column: boolean;
  internal_choice: number;
  attempt_any: number;
}

export interface BlueprintShape {
  name: string;
  sections?: SectionIn[];
  subject?: string;
  class_label?: string;
  duration_min?: number;
  pass_mark_pct?: number;
  page_budget?: number;
  persona_id?: string;
  pattern_year?: string;
}

export interface TemplateDetail extends TemplateSummary {
  blueprint: BlueprintShape;
}

export interface TemplateCreateRequest {
  name: string;
  preset?: string;
  mix?: string;
  sections?: SectionIn[];
  subject?: string;
  class_label?: string;
  marks?: number;
  duration_min?: number;
  pages?: number;
  pass_mark_pct?: number;
  persona_id?: string;
}

export interface TemplateUpdateRequest {
  name?: string;
  sections?: SectionIn[];
  subject?: string;
  class_label?: string;
  duration_min?: number;
  pages?: number;
  pass_mark_pct?: number;
  persona_id?: string;
}
