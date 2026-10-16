export type CheckerStage = 'created' | 'rubric' | 'collecting' | 'verifying' | 'marking' | 'reviewing' | 'done';

export type BookletState =
  | 'pending'
  | 'identified'
  | 'confirmed'
  | 'marking'
  | 'marked'
  | 'failed'
  | 'signed_off';

export type Strictness = 'easy' | 'medium' | 'strict' | 'custom';

export type PresetStrictness = Exclude<Strictness, 'custom'>;

export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export type CheckerQuestionType =
  | 'mcq'
  | 'true_false'
  | 'fill_blank'
  | 'one_word'
  | 'short_answer'
  | 'long_answer'
  | 'essay'
  | 'numerical'
  | 'derivation'
  | 'diagram'
  | 'match_following'
  | 'unknown';

export type AnnotationKind =
  | 'circle'
  | 'underline'
  | 'wavy_underline'
  | 'tick'
  | 'double_tick'
  | 'cross'
  | 'caret'
  | 'note'
  | 'margin_shorthand'
  | 'question_marks'
  | 'question_number'
  | 'overflow_marker'
  | 'freehand';

export type AnnotationColour = 'red' | 'green' | 'blue' | 'amber';

export interface StrictnessProfile {
  label: string;
  description: string;
  levers: { name: string; value: string }[];
}

export interface CheckerHealth {
  ok: boolean;
  model_configured: boolean;
  strictness: Record<PresetStrictness, StrictnessProfile>;
}

export interface CheckerJob {
  id: string;
  kind: string;
  exam_id: string;
  state: JobState;
  total: number;
  done: number;
  progress: number;
  message: string;
  detail: string[];
  error: string;
  started_at: string;
  finished_at: string;
}

export interface CheckerExamIn {
  name: string;
  subject: string;
  klass: string;
  languages: string[];
  total_marks: number | null;
}

export interface CheckerExamSummary {
  id: string;
  name: string;
  subject: string;
  klass: string;
  stage: CheckerStage;
  booklets: number;
  marked: number;
  created_at: string;
  updated_at: string;
}

export interface StudentIdentity {
  name: string | null;
  name_script: string | null;
  roll_number: string | null;
  raw_roll_number: string | null;
  klass: string | null;
  section: string | null;
  subject: string | null;
  confidence: number;
  needs_confirmation: boolean;
  confirmed_by_teacher: boolean;
  notes: string[];
}

export interface BookletRef {
  id: string;
  state: BookletState;
  student: StudentIdentity;
  page_count: number;
  source: string;
  first_page_index: number;
  supplementary_count: number;
  strictness: Strictness | null;
  total_marks: number | null;
  total_possible: number | null;
  mean_confidence: number | null;
  review_count: number;
  warnings: string[];
  error: string;
  updated_at: string;
}

export interface CheckerExam {
  id: string;
  name: string;
  subject: string;
  klass: string;
  languages: string[];
  total_marks: number | null;
  stage: CheckerStage;
  strictness: { default: Strictness; per_booklet: Record<string, Strictness> };
  booklets: BookletRef[];
  question_paper: string;
  answer_key: string;
  created_at: string;
  updated_at: string;
  notes: string[];
}

export interface CheckerExamDetail extends CheckerExam {
  counts: Record<BookletState, number>;
  duplicate_rolls: Record<string, string[]>;
  missing_rolls: string[];
  jobs: CheckerJob[];
  has_rubric: boolean;
  rubric_approved: boolean;
  rubric_questions: number;
}

export interface KeyPoint {
  id: string;
  text: string;
  marks: number;
  required: boolean;
  aliases: string[];
}

export interface FormatRules {
  word_limit: number | null;
  min_words: number | null;
  must_list_n: number | null;
  require_units: boolean;
  require_diagram: boolean;
  expected_language: string | null;
}

export interface RubricQuestion {
  number: string;
  section: string | null;
  text: string;
  type: CheckerQuestionType;
  max_marks: number;
  key_points: KeyPoint[];
  model_answer: string;
  accepts_any_valid_method: boolean;
  numeric_answer: number | null;
  numeric_tolerance: number;
  units: string | null;
  format_rules: FormatRules;
  choice_group: string | null;
  language: string | null;
  teacher_edited: boolean;
}

export interface Rubric {
  id: string;
  version: number;
  exam_name: string;
  subject: string;
  languages: string[];
  total_marks: number;
  questions: RubricQuestion[];
  choice_groups: { id: string; question_numbers: string[]; count: number; policy: 'best' | 'first' }[];
  general_instructions: string;
  compiled_from: Record<string, string>;
  teacher_approved: boolean;
  warnings: string[];
}

export interface RubricWithAudit extends Rubric {
  audit: string[];
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextLine {
  index: number;
  box: Box;
  word_indices: number[];
  is_struck: boolean;
}

export interface Word {
  index: number;
  box: Box;
  line_index: number;
  is_struck: boolean;
  is_scribbled: boolean;
}

export interface BookletPage {
  index: number;
  source_path: string;
  width: number;
  height: number;
  role: 'cover' | 'answer' | 'rough_work' | 'blank' | 'supplementary_cover';
  lines: TextLine[];
  words: Word[];
}

export interface Booklet {
  id: string;
  exam_id: string;
  student: StudentIdentity;
  pages: BookletPage[];
  warnings: string[];
}

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  target: { page_index: number; line_indices: number[]; word_indices: number[]; box: Box | null };
  colour: AnnotationColour;
  text: string;
  question_number: string | null;
  reason: string;
  key_point_id: string | null;
  source: 'ai' | 'teacher';
  confidence: number;
  points: [number, number][];
  deleted: boolean;
}

export interface PointAward {
  key_point_id: string;
  key_point_text: string;
  max_marks: number;
  awarded: number;
  found: boolean;
  evidence: string;
  evidence_line_indices: number[];
  evidence_page_index: number | null;
  confidence: number;
  reason: string;
}

export interface Deduction {
  kind: string;
  marks: number;
  reason: string;
  word_indices: number[];
  line_indices: number[];
  page_index: number | null;
  confidence: number;
  suppressed: boolean;
  suppressed_reason: string;
}

export interface QuestionResult {
  question_number: string;
  max_marks: number;
  point_awards: PointAward[];
  deductions: Deduction[];
  is_attempted: boolean;
  counted: boolean;
  not_counted_reason: string;
  comment: string;
  confidence: number;
  review_reasons: string[];
  annotations: Annotation[];
  teacher_marks_override: number | null;
  teacher_comment: string | null;
  needs_review: boolean;
  ai_marks: number;
  marks: number;
}

export interface BookletResult {
  booklet_id: string;
  student: StudentIdentity;
  rubric_id: string;
  rubric_version: number;
  strictness: Strictness;
  results: QuestionResult[];
  overall_comment: string;
  page_annotations: Annotation[];
  overflow_notes: { marker: number; question_number: string; page_index: number; text: string }[];
  warnings: string[];
  total_marks: number;
  total_possible: number;
  mean_confidence: number;
}

export interface MarkedBooklet {
  ref: BookletRef;
  booklet: Booklet;
  result: BookletResult | null;
  review: string[];
  arithmetic_problems: string[];
  warnings: string[];
  pdf_available: boolean;
}

export interface Outlier {
  booklet_id: string;
  question_number: string;
  marks: number;
  peer_median: number;
  peer_count: number;
  note: string;
}

export interface ClassResults {
  exam_id: string;
  total_possible: number;
  marked: number;
  booklets: BookletRef[];
  question_medians: Record<string, number>;
  question_means: Record<string, number>;
  outliers: Outlier[];
  duplicate_rolls: Record<string, string[]>;
  missing_rolls: string[];
  mean: number;
}

export interface IdentityIn {
  name?: string;
  roll_number?: string;
  klass?: string;
  section?: string;
  confirm: boolean;
}

export interface QuestionEdit {
  marks?: number;
  comment?: string;
  clear_review?: boolean;
  clear_override?: boolean;
}

export interface RemarkChange {
  question_number: string;
  before: number;
  after: number;
  max_marks: number;
}

export interface RemarkResult {
  strictness: Strictness;
  total_before: number | null;
  total_after: number;
  changes: RemarkChange[];
}

export interface CaptureSession {
  id: string;
  state: 'active' | 'finished' | 'abandoned';
  booklets: number;
  pages: number;
  duplicates_skipped: number;
  current_booklet_pages: number;
  current_is_supplementary: boolean;
  started_at: string;
  updated_at: string;
  needs_attention: { booklet: number; issue: string }[];
}

export interface CapturedPage {
  id: string;
  verdict: string;
  issues: string[];
  from_spread: boolean;
}

export interface CaptureSessionDetail extends CaptureSession {
  booklet_detail: { id: string; closed: boolean; is_supplementary: boolean; pages: CapturedPage[] }[];
}

export interface CaptureAdded {
  pages: CapturedPage[];
  session: CaptureSession;
}

export interface CaptureFinished {
  session: CaptureSession;
  job: CheckerJob;
}

export interface TypedSheet {
  name: string;
  roll: string;
  answers: { n: number; text: string }[];
}

export interface OnlineSource {
  id: string;
  label: string;
  detail: string;
  responses: number;
}

export interface DocumentsSaved {
  question_paper?: string;
  answer_key?: string;
}

export interface OmrResponse {
  n: number;
  chosen: number[];
}

export interface OmrKeyQuestion {
  n: number;
  marks: number;
  options: number;
  answer: number | null;
}

export interface OmrAnswerKey {
  questions: OmrKeyQuestion[];
}

export interface OmrKeySaved {
  key: OmrAnswerKey;
  rescored: number;
}

export interface OmrSheetIn {
  roll_number: string;
  name: string;
  responses: OmrResponse[];
}

export type OmrOutcome =
  | 'correct'
  | 'incorrect'
  | 'blank'
  | 'multiple'
  | 'out_of_range'
  | 'not_multiple_choice'
  | 'no_options'
  | 'no_key'
  | 'ambiguous_key'
  | 'alternative_offered';

export interface OmrQuestionMark {
  n: number;
  outcome: OmrOutcome;
  marks: number;
  awarded: number;
  chosen: number[];
}

export interface OmrMarkingResult {
  paper_id: string;
  set_label: string;
  questions: OmrQuestionMark[];
  unknown_questions: number[];
  awarded: number;
  markable_marks: number;
  paper_marks: number;
  unmarkable_questions: number[];
  unmarkable_marks: number;
  complete: boolean;
  tally: Record<string, number>;
}

export type OmrSheetRead = OmrSheetIn;

export interface OmrSheetResult {
  id: number;
  paper_id: string;
  roll_number: string;
  name: string;
  source: 'json' | 'image';
  responses: OmrResponse[];
  result: OmrMarkingResult;
  scored_at: string;
}

export interface PaperArtefact {
  name: string;
  label: string;
  url: string;
}

export interface PaperArtefacts {
  paper_id: string;
  artefacts: PaperArtefact[];
}
