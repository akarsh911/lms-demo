// A lesson a teacher adds outside the timetable: a revision hour, a remedial group, a Saturday class.
export interface ExtraClass {
  id: string;
  teacher_id: string;
  offering_id: string;
  section_id: string;
  subject: string;
  label: string;
  date: string;
  start: number;
  end: number;
  room: string | null;
  topic: string;
  // Empty means the whole section.
  student_ids: string[];
}

export interface ExtraClassWrite {
  offering_id: string;
  date: string;
  start: number;
  end: number;
  room: string;
  topic: string;
  student_ids: string[];
}
