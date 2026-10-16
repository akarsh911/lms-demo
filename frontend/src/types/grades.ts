export type MarkState = 'marked' | 'absent' | 'exempt' | 'pending';

export interface ExamMarkCell {
  mark_id: string | null;
  marks: number | null;
  max: number;
  status: MarkState;
}

// One examination as the school saw it, with the numbers that say how it went.
export interface ExamSummary {
  id: string;
  session_id: string;
  session_name: string;
  name: string;
  code: string;
  exam_type: string;
  start: string;
  end: string;
  published: boolean;
  subjects: number;
  classes: number;
  // The classes it was set for, in words: "Classes 6 to 12", "Classes 10 and 12".
  class_names: string;
  appeared: number;
  average_pct: number | null;
  pass_pct: number | null;
  highest_pct: number | null;
}

export interface ExamScheduleRow {
  subject: string;
  date: string | null;
  time: string;
  max: number;
  classes: string;
  question_papers: { exam_subject_id: string; grade_level_id: string; class_name: string; answer_key: boolean }[];
}

export interface ScoreBand {
  label: string;
  from: number;
  to: number;
  count: number;
}

export interface NamedAverage {
  id: string;
  name: string;
  average_pct: number | null;
  pass_pct: number | null;
  appeared: number;
}

export interface RankedStudent {
  student_id: string;
  name: string;
  where: string;
  pct: number;
}

// What a selection of marks adds up to. Computed for whatever is on screen, never stored.
export interface MarksAnalytics {
  appeared: number;
  marked: number;
  absent: number;
  average_pct: number | null;
  median_pct: number | null;
  pass_pct: number | null;
  highest: RankedStudent | null;
  lowest: RankedStudent | null;
  bands: ScoreBand[];
  by_subject: NamedAverage[];
  by_class: NamedAverage[];
  by_section: NamedAverage[];
  top: RankedStudent[];
}

export interface ExamStudentRow {
  student_id: string;
  name: string;
  roll_number: string | null;
  admission_number: string;
  grade_level_id: string;
  class_name: string;
  class_order: number;
  section_id: string | null;
  section_name: string | null;
  cells: ExamMarkCell[];
  total: number | null;
  max: number;
  pct: number | null;
  rank: number | null;
}

export interface ExamFilter {
  grade_level_id?: string;
  section_id?: string;
  subjects?: string[];
}

export interface ExamDetail {
  exam: ExamSummary;
  schedule: ExamScheduleRow[];
  // Every class and section the examination covered, counted over the whole examination, not the selection.
  classes: { id: string; name: string; order: number; count: number }[];
  sections: { id: string; name: string; grade_level_id: string; count: number }[];
  subjects: string[];
  columns: { name: string; max: number }[];
  rows: ExamStudentRow[];
  analytics: MarksAnalytics;
}

export interface StudentSubjectMark {
  subject: string;
  mark: ExamMarkCell;
  class_average_pct: number | null;
}

export interface StudentExamRecord {
  exam_id: string;
  name: string;
  code: string;
  exam_type: string;
  start: string;
  published: boolean;
  total: number | null;
  max: number;
  pct: number | null;
  rank: number | null;
  of: number;
  class_average_pct: number | null;
  subjects: StudentSubjectMark[];
}

export interface StudentSubjectTrend {
  subject: string;
  average_pct: number | null;
  best_pct: number | null;
  // One point per examination in the session, in order; null where the subject was not marked.
  points: (number | null)[];
}

// A pupil's examinations in one session, read for the trend and the strengths as much as the marks.
export interface StudentGrades {
  student_id: string;
  name: string;
  admission_number: string;
  sessions: { id: string; name: string; current: boolean }[];
  session_id: string;
  class_name: string | null;
  section_name: string | null;
  exams: StudentExamRecord[];
  subjects: StudentSubjectTrend[];
  overall_pct: number | null;
  strongest: string | null;
  weakest: string | null;
}

// The key a setter uploaded with the paper: the objective answers and the marking scheme for the rest.
export interface AnswerKey {
  uploaded_by: string;
  uploaded_at: string;
  file_name: string;
  objective: { no: number; answer: string }[];
  scheme: { section: string; note: string }[];
}

export interface StudentOption {
  id: string;
  name: string;
  admission_number: string;
  where: string;
}

export interface QuestionPaper {
  exam_subject_id: string;
  exam: string;
  subject: string;
  class_name: string;
  max: number;
  duration_minutes: number;
  date: string | null;
  instructions: string[];
  sections: { title: string; count: number; marks_each: number }[];
  file_name: string;
  answer_key: AnswerKey | null;
}

export interface AnswerSheet {
  questions: { no: number; max: number; scored: number }[];
  checked_by: string | null;
  checked_at: string | null;
  file_name: string;
}

// One mark, opened: the number, the remark, who marked it, the paper and the checked sheet.
export interface MarkDetail {
  mark_id: string;
  student_id: string;
  student: string;
  subject: string;
  exam: string;
  exam_subject_id: string;
  marks: number | null;
  max: number;
  status: MarkState;
  remarks: string | null;
  marked_by: string | null;
  marked_at: string | null;
  answer_sheet: AnswerSheet | null;
}

export interface Classmate {
  id: string;
  name: string;
  roll_number: string | null;
  section_name: string | null;
  // Mean of the pupil's examinations held in the session; null before any.
  overall_pct: number | null;
}

// The pupils beside one in a session, in roll order, for moving through a section or a class.
export interface ClassmateList {
  scope: 'section' | 'class';
  label: string;
  grade_level_id: string | null;
  section_id: string | null;
  // Every class of the session with its sections, for choosing another roster.
  classes: { id: string; name: string; sections: { id: string; name: string }[] }[];
  students: Classmate[];
}
