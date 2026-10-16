import type { AssignmentType } from './classroom';

export const HOMEWORK_TYPES = ['worksheet', 'practice', 'reading', 'project', 'test'] as const satisfies readonly AssignmentType[];

// Derived from status and dates: open runs until the due time, `due` is past it with grading still going.
export type HomeworkState = 'draft' | 'scheduled' | 'open' | 'due' | 'closed';

export type WorkStatus = 'pending' | 'missing' | 'submitted' | 'late' | 'graded' | 'returned' | 'excused';

export interface Homework {
  id: string;
  title: string;
  type: AssignmentType;
  subject: string;
  subject_id: string;
  class_name: string;
  grade_level_id: string;
  section_id: string;
  section: string;
  offering_id: string;
  teacher: string;
  teacher_id: string;
  mine: boolean;
  state: HomeworkState;
  available_from: string | null;
  due_at: string;
  max_marks: number;
  late_allowed: boolean;
  // Null when the whole section has it; otherwise the named students.
  students_only: number | null;
  assigned: number;
  submitted: number;
  late: number;
  graded: number;
  missing: number;
  // Percentage of maximum marks across graded work.
  average: number | null;
}

export interface HomeworkAttachment {
  name: string;
  kind: 'pdf' | 'doc' | 'image' | 'link';
}

export interface StudentWork {
  enrollment_id: string;
  student_id: string;
  name: string;
  roll: string | null;
  status: WorkStatus;
  submitted_at: string | null;
  attempt: number;
  marks: number | null;
  feedback: string | null;
  // What the student handed in, as the file names they attached.
  files: string[];
}

export interface HomeworkDetail extends Homework {
  description: string;
  instructions: string;
  attachments: HomeworkAttachment[];
  items: { position: number; label: string; marks: number }[];
  work: StudentWork[];
  reminders_sent: number;
}

// An assignments board fixed to one subject in one section.
export interface HomeworkScope {
  label: string;
  offering_id: string;
  grade_level_id: string;
  subject_id: string;
  section_id: string;
  // Shown to someone who reads this subject but does not teach it.
  readOnly?: boolean;
}

export interface HomeworkSummary {
  open: number;
  past_due: number;
  // Percentage of maximum marks across every graded piece of work.
  average: number | null;
  due_this_week: number;
  to_grade: number;
  missing: number;
}

export interface HomeworkSectionOption {
  section_id: string;
  section: string;
  offering_id: string;
  teacher: string | null;
  students: { student_id: string; name: string; roll: string | null }[];
}

export interface HomeworkOptions {
  classes: { id: string; name: string; subjects: { subject_id: string; name: string; sections: HomeworkSectionOption[] }[] }[];
}

export interface HomeworkWrite {
  title: string;
  type: AssignmentType;
  description: string;
  instructions: string;
  grade_level_id: string;
  subject_id: string;
  section_ids: string[];
  // Empty sends it to everyone in the chosen sections.
  student_ids: string[];
  attachments: HomeworkAttachment[];
  available_from: string | null;
  due_at: string;
  max_marks: number;
  late_allowed: boolean;
  max_attempts: number;
  draft: boolean;
}

export interface GradeWrite {
  student_id: string;
  marks: number | null;
  feedback: string;
  return_now: boolean;
}

// One assignment as the pupil it was set for sees it: the brief, and their own work on it.
export interface MyWork {
  id: string;
  title: string;
  type: AssignmentType;
  subject: string;
  offering_id: string;
  teacher: string;
  state: HomeworkState;
  due_at: string;
  max_marks: number;
  late_allowed: boolean;
  description: string;
  instructions: string;
  attachments: HomeworkAttachment[];
  status: WorkStatus;
  submitted_at: string | null;
  marks: number | null;
  feedback: string | null;
  files: string[];
}

export interface HandIn {
  files: string[];
}
