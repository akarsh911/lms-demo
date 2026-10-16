export const CLASS_DUTIES = ['Blackboard', 'Attendance helper', 'Library', 'Plants and cleanliness', 'Sports kit', 'Lights and fans'] as const;
export type ClassDuty = (typeof CLASS_DUTIES)[number];

export interface ClassPupil {
  student_id: string;
  name: string;
  roll: string | null;
}

// A section's own offices: who leads it among the pupils and who looks after what.
export interface ClassRoles {
  section_id: string;
  label: string;
  class_teacher: string | null;
  monitor: ClassPupil | null;
  vice_monitor: ClassPupil | null;
  duties: { duty: ClassDuty; pupils: ClassPupil[] }[];
  // Everyone in the section, in roll order, to choose from.
  pupils: ClassPupil[];
}

// What a pupil holds in their own class, for their Home.
export interface MyClassRole {
  label: string;
  class_teacher: string | null;
  monitor: string | null;
  office: 'monitor' | 'vice_monitor' | null;
  duties: ClassDuty[];
}
