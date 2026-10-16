import type { YearLifecycle } from './foundation';

export interface Readiness {
  value: number;
  total: number;
}

export type GroupKind = 'stream' | 'batch';

// A stream or batch inside a section: a named subset of its pupils, only where a class needs one.
export interface AcademicGroup {
  id: string;
  section_id: string;
  name: string;
  kind: GroupKind;
  student_ids: string[];
}

export interface StructureSection {
  id: string;
  name: string;
  grade_level_id: string;
  class_name: string;
  capacity: number | null;
  students: number;
  archived: boolean;
  room: { id: string; name: string; capacity: number | null } | null;
  class_teacher: { id: string; name: string } | null;
  rolls: { assigned: number; missing: number };
  teaching: Readiness;
  groups: AcademicGroup[];
}

export type StructureFix = 'sections' | 'arrange' | 'teacher' | 'room' | 'rolls' | 'teaching' | 'capacity';

// One thing wrong with a class or a section, and the place it is fixed.
export interface StructureIssue {
  id: string;
  fix: StructureFix;
  title: string;
  detail: string;
  grade_level_id: string;
  section_id: string | null;
  count: number;
}

export interface StructureClass {
  grade_level_id: string;
  name: string;
  order: number;
  students: number;
  unassigned: number;
  // Taught as one group: no sections are shown, and the class's own record carries its teacher, room and timetable.
  undivided: boolean;
  // That record, when the class is undivided and has one; null for a class not set up yet.
  whole: StructureSection | null;
  // Two or more, or none: a class is never split into a single section.
  sections: StructureSection[];
  class_teachers: Readiness;
  rooms: Readiness;
  teaching: Readiness;
  issues: StructureIssue[];
}

// What a later timetable needs to be true of the year; only counted here.
export interface TimetableReadiness {
  sections: number;
  subjects_configured: Readiness;
  periods_set: Readiness;
  teachers_assigned: Readiness;
  rooms_assigned: Readiness;
}

export interface YearStructure {
  academic_session_id: string;
  lifecycle: YearLifecycle;
  classes: StructureClass[];
  timetable: TimetableReadiness;
}

export interface ClassSubject {
  subject: string;
  subject_id: string;
  elective: boolean;
  applies_to: string;
  periods: number;
  sections: { section_id: string; section: string; offering_id: string; teacher: string | null; teacher_id: string | null }[];
  missing: string[];
}

// A subject put on the timetable of chosen sections; `name` with no id adds it to the school's catalogue first.
export interface SubjectAdd {
  subject_id: string | null;
  name: string;
  elective: boolean;
  section_ids: string[];
  periods: number;
}

export interface SectionWrite {
  name?: string;
  capacity?: number | null;
  room_id?: string | null;
  class_teacher_id?: string | null;
}

// One pupil's destination; null is the class's unassigned pool.
export interface SectionMove {
  enrollment_id: string;
  to_section_id: string | null;
}

export interface RollAssignment {
  enrollment_id: string;
  roll: string;
}

export interface ProposedMove extends SectionMove {
  student_id: string;
  name: string;
  from_section: string | null;
  to_section: string | null;
}

// A placement the school's system proposes; the screen shows it and applies it, never computes it.
export interface DistributionProposal {
  grade_level_id: string;
  summary: string;
  moves: ProposedMove[];
}

export interface RoomOption {
  id: string;
  name: string;
  where: string;
  capacity: number | null;
  // The section of this year already in the room, if any.
  used_by: string | null;
}

export interface TeacherOption {
  id: string;
  name: string;
  subjects: string[];
  // The section this teacher is already class teacher of, this year.
  class_teacher_of: string | null;
}

export interface MergePreview {
  from: string;
  into: string;
  students: number;
  room: string | null;
  class_teacher: string | null;
  teaching: number;
}
