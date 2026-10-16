export const LESSON_BLOCK_KINDS = ['warm_up', 'explanation', 'activity', 'check', 'homework'] as const;

export type LessonBlockKind = (typeof LESSON_BLOCK_KINDS)[number];

export const LESSON_PLAN_STATUSES = ['scheduled', 'in_progress', 'taught'] as const;

export type LessonPlanStatus = (typeof LESSON_PLAN_STATUSES)[number];

export interface TextbookCitation {
  content_item_id: string;
  title: string;
  page_start: number;
  page_end: number;
}

export type LessonResource =
  | {
      kind: 'mindmap';
      title: string;
      item_id: string;
      section_id: string;
      page_start: number | null;
      page_end: number | null;
    }
  | { kind: 'playground'; title: string; thread_id: string; grade: number }
  | { kind: 'playground_tool'; title: string; tool_id: string; grade: number }
  | { kind: 'flashcards'; title: string; chapter_id: string }
  | { kind: 'debate'; title: string; motion_id: string }
  | { kind: 'paper_setter'; title: string; question_count: number };

export type LessonResourceKind = LessonResource['kind'];

export interface LessonBlock {
  id: string;
  kind: LessonBlockKind;
  title: string;
  minutes: number;
  summary: string;
  steps: string[];
  citations: TextbookCitation[];
  resources: LessonResource[];
  variant: number;
}

export interface WeeklySlot {
  slot_id: string;
  day_of_week: number;
  period_id: string;
  period_name: string;
  start_minute: number;
  end_minute: number;
}

export interface ScheduledSlot extends WeeklySlot {
  date: string;
}

export interface TaughtRecord {
  taught_at: string;
  reflection: string;
}

export interface LessonPeriod {
  id: string;
  sequence: number;
  focus: string;
  blocks: LessonBlock[];
  slot: ScheduledSlot | null;
  taught: TaughtRecord | null;
}

export interface PlannerOffering {
  offering_id: string;
  section_id: string;
  section_label: string;
  grade: number;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  curriculum_id: string | null;
  periods_per_week: number;
  period_minutes: number;
  mine: boolean;
  week: WeeklySlot[];
}

export interface PlannerContext {
  today: string;
  offerings: PlannerOffering[];
}

export interface PlannerTopic {
  id: string;
  title: string;
}

export interface PlannerChapter {
  id: string;
  title: string;
  sequence: number;
  topics: PlannerTopic[];
  objectives: string[];
  suggested_periods: number;
  citations: TextbookCitation[];
  resources: LessonResource[];
}

export interface PlannerOutline {
  curriculum_id: string;
  chapters: PlannerChapter[];
}

export interface GenerateRequest {
  offering_id: string;
  curriculum_node_id: string;
  topic_ids: string[];
  focus_topics?: string[];
  period_count: number;
  objectives: string[];
}

export interface DraftPlan {
  offering_id: string;
  section_label: string;
  grade: number;
  subject_name: string;
  curriculum_node_id: string;
  chapter_title: string;
  topic_titles: string[];
  objectives: string[];
  period_minutes: number;
  periods: LessonPeriod[];
}

export interface RegenerateBlockRequest {
  offering_id: string;
  curriculum_node_id: string;
  kind: LessonBlockKind;
  focus: string;
  period_sequence: number;
  period_count: number;
  minutes: number;
  variant: number;
}

export interface LessonPlan extends DraftPlan {
  id: string;
  title: string;
  author_name: string;
  status: LessonPlanStatus;
  created_at: string;
  updated_at: string;
}

export interface LessonPlanCreate {
  draft: DraftPlan;
  title: string;
  start_date: string;
}

export interface LessonPlanPatch {
  title?: string;
  objectives?: string[];
  periods?: LessonPeriod[];
}

export interface TaughtWrite {
  reflection: string;
}

export interface PlannerWeekDay {
  date: string;
  day_of_week: number;
  open: boolean;
  name: string | null;
}

export interface PlannerWeekPeriod {
  period_id: string;
  period_name: string;
  start_minute: number;
  end_minute: number;
}

export interface WeekLesson {
  date: string;
  period_id: string;
  offering_id: string;
  section_label: string;
  subject_name: string;
  plan_id: string | null;
  plan_title: string | null;
  period_sequence: number | null;
  period_count: number | null;
  focus: string | null;
  taught: boolean;
}

export interface PlannerWeek {
  from: string;
  to: string;
  section_label: string | null;
  days: PlannerWeekDay[];
  periods: PlannerWeekPeriod[];
  lessons: WeekLesson[];
}

export const TERM_DAY_KINDS = ['teaching', 'holiday', 'vacation', 'weekend', 'event'] as const;

export type TermDayKind = (typeof TERM_DAY_KINDS)[number];

export interface TermDay {
  date: string;
  kind: TermDayKind;
  label: string | null;
}

export interface PlannerTerm {
  id: string;
  name: string;
  start: string;
  end: string;
}

export interface TermExam {
  id: string;
  name: string;
  start: string;
  end: string;
  syllabus: string[];
  deferrable: string[];
  revision_periods: number;
}

export interface TermUnit {
  id: string;
  title: string;
}

export interface TermChapter {
  id: string;
  title: string;
  sequence: number;
  unit_id: string | null;
  weight: number;
}

export interface TaughtPeriod {
  date: string;
  period_id: string;
  chapter_id: string;
}

export interface TermContext {
  offering_id: string;
  section_label: string;
  subject_name: string;
  grade: number;
  today: string;
  terms: PlannerTerm[];
  current_term_id: string;
  days: TermDay[];
  exams: TermExam[];
  units: TermUnit[];
  chapters: TermChapter[];
  week: WeeklySlot[];
  taught: TaughtPeriod[];
}

export interface TermClosure {
  date: string;
  label: string;
}

export interface TermPlanSettings {
  offering_id: string;
  term_id: string;
  start_date: string;
  first_chapter_id: string | null;
  order: string[];
  weights: Record<string, number>;
  closures: TermClosure[];
  exam_starts: Record<string, string>;
  revision: Record<string, number>;
  extra_periods: Record<string, number>;
  deferred: Record<string, string[]>;
  saved_at: string | null;
}

export const CHAPTER_COVERAGE_STATES = ['taught', 'in_progress'] as const;

export type ChapterCoverageState = (typeof CHAPTER_COVERAGE_STATES)[number];

export interface ChapterCoverage {
  chapter_id: string;
  state: ChapterCoverageState;
  taught_topic_ids: string[];
}
