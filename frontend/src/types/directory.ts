export type TeacherStatus = 'active' | 'on_leave' | 'new';

export interface TeacherClass {
  grade_level_id: string;
  class_name: string;
  class_order: number;
  section_id: string;
  section: string;
  subject: string;
}

// One teacher as the directory lists them: who they are, what they carry this year, and how heavily.
export interface TeacherEntry {
  id: string;
  name: string;
  code: string;
  employee_code: string;
  specialization: string | null;
  email: string | null;
  phone: string | null;
  joined_on: string | null;
  status: TeacherStatus;
  class_teacher_of: { section_id: string; grade_level_id: string; label: string } | null;
  teaching: TeacherClass[];
  subjects: string[];
  periods: number;
}
