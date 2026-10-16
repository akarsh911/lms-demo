// One subject in one section as the caller meets it: one they teach, or one they take.
export interface MySubject {
  offering_id: string;
  subject_id: string;
  subject: string;
  elective: boolean;
  section_id: string;
  grade_level_id: string;
  class_name: string;
  // "7B", or the class's own name when it is taught as one group.
  label: string;
  periods: number;
  students: number;
  teacher: string | null;
  teacher_id: string | null;
  // The caller is this section's class teacher.
  class_teacher: boolean;
}
