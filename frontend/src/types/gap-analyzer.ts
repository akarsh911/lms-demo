export const GAP_SOURCES = ['exam', 'omr', 'answer_sheet', 'paper', 'mindmap', 'flashcards', 'debate', 'read'] as const;

export type GapSource = (typeof GAP_SOURCES)[number];

export type GapStatus = 'gap' | 'at_risk' | 'not_taught' | 'strong' | 'no_data';

export type Coverage = 'taught' | 'not_taught' | 'unrecorded';

export type ConfidenceBand = 'high' | 'medium' | 'low';

export type Trend = 'improving' | 'declining' | 'steady' | 'unknown';

export type GapRefKind = 'exam_mark' | 'answer_sheet' | 'omr_sheet' | 'practice_paper' | 'mastery' | 'flashcard_report' | 'debate_report';

export interface GapRef {
  kind: GapRefKind;
  record_id: string;
  title: string;
  student_id: string;
  exam_id?: string;
  paper_id?: string;
  question?: string;
}

export interface GapEvidence {
  id: string;
  student_id: string;
  topic_id: string;
  source: GapSource;
  signal: number;
  weight: number;
  date: string;
  label: string;
  detail: string;
  ref: GapRef;
}

export interface WeighedEvidence extends GapEvidence {
  effective_weight: number;
}

export interface TrendPoint {
  date: string;
  score: number;
}

export type GapActionKind = 'mindmap' | 'flashcards' | 'playground' | 'debate' | 'quiz' | 'reteach';

export type GapAction =
  | { kind: 'mindmap'; title: string; reason: string; item_id: string; section_id: string; page_start: number | null; page_end: number | null }
  | { kind: 'flashcards'; title: string; reason: string; chapter_id: string; topic: string }
  | { kind: 'playground'; title: string; reason: string; thread_id: string; grade: number }
  | { kind: 'debate'; title: string; reason: string; motion_id: string }
  | {
      kind: 'quiz';
      title: string;
      reason: string;
      question_count: number;
      grade: number;
      subject_code: string;
      subject_name: string;
      chapter_id: string;
      chapter_title: string;
      topic_id: string;
      topic_title: string;
    }
  | { kind: 'reteach'; title: string; reason: string; offering_id: string };

export interface TopicAnalysis {
  topic_id: string;
  title: string;
  chapter_id: string;
  status: GapStatus;
  coverage: Coverage;
  score: number | null;
  confidence: number;
  confidence_band: ConfidenceBand;
  agreement: number;
  assessed: boolean;
  sources: GapSource[];
  trend: Trend;
  trend_points: TrendPoint[];
  reasons: string[];
  evidence: WeighedEvidence[];
  actions: GapAction[];
}

export interface StatusCounts {
  gap: number;
  at_risk: number;
  not_taught: number;
  strong: number;
  no_data: number;
}

export interface ChapterAnalysis {
  chapter_id: string;
  title: string;
  sequence: number;
  unit: string | null;
  coverage: Coverage;
  score: number | null;
  counts: StatusCounts;
  topics: TopicAnalysis[];
}

export interface SubjectAnalysis {
  subject_code: string;
  subject_name: string;
  curriculum_id: string;
  score: number | null;
  counts: StatusCounts;
  chapters: ChapterAnalysis[];
}

export interface LearnerRef {
  student_id: string;
  name: string;
  section_id: string;
  section_label: string;
  grade: number;
  roll_number: string | null;
}

export interface LearnerAnalysis {
  learner: LearnerRef;
  as_of: string;
  subjects: SubjectAnalysis[];
}

export interface ScopeSubject {
  code: string;
  name: string;
  mine: boolean;
  offering_id: string;
}

export interface ScopeSection {
  section_id: string;
  label: string;
  grade: number;
  subjects: ScopeSubject[];
  learners_with_evidence: number;
}

export interface GapScope {
  as_of: string;
  self: LearnerRef | null;
  wards: LearnerRef[];
  sections: ScopeSection[];
  school: { grades: number[] } | null;
}

export interface ClassCell {
  student_id: string;
  topic_id: string;
  status: GapStatus;
  score: number | null;
  confidence_band: ConfidenceBand;
  topic_specific: boolean;
}

export interface ClassTopicSummary {
  topic_id: string;
  title: string;
  chapter_id: string;
  chapter_title: string;
  coverage: Coverage;
  learners_with_data: number;
  weak: number;
  weak_share: number;
  mean_score: number | null;
  class_wide: boolean;
  actions: GapAction[];
}

export interface ClassAnalysis {
  section: ScopeSection;
  subject: ScopeSubject;
  as_of: string;
  learners: LearnerRef[];
  chapters: { chapter_id: string; title: string; topic_ids: string[] }[];
  topics: ClassTopicSummary[];
  cells: ClassCell[];
  reteach: ClassTopicSummary[];
}

export interface SchoolSectionRow {
  section_id: string;
  label: string;
  learners: number;
  chapters: { chapter_id: string; weak_share: number | null; learners_with_data: number }[];
  gap_rate: number | null;
}

export interface SchoolTopicRow {
  topic_id: string;
  title: string;
  chapter_title: string;
  weak_share: number;
  sections_affected: number;
}

export interface SchoolAnalysis {
  grade: number;
  subject_code: string;
  subject_name: string;
  subjects: { code: string; name: string }[];
  as_of: string;
  chapters: { chapter_id: string; title: string; sequence: number }[];
  sections: SchoolSectionRow[];
  weakest: SchoolTopicRow[];
}
