/** Wire types for the attendance service. */

/** A class the signed-in user may take attendance for. */
export interface ClassRef {
  id: string;
  name: string;
}

export interface ClassesResponse {
  classes: ClassRef[];
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceSummary {
  classId: string;
  className: string;
  date: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
}

export interface AttendanceRosterEntry {
  studentId: string;
  studentName: string;
  status: AttendanceStatus | null;
}

export interface AttendanceRoster {
  classId: string;
  date: string;
  entries: AttendanceRosterEntry[];
}

export interface MarkAttendanceInput {
  classId: string;
  date: string;
  marks: { studentId: string; status: AttendanceStatus }[];
}

export interface MarkAttendanceResult {
  updated: number;
}

export type LeaveKind = 'medical' | 'family' | 'travel' | 'event';

// A student away with the school's knowledge: applied for by a parent, approved or still waiting.
export interface StudentLeave {
  id: string;
  student_id: string;
  name: string;
  roll: string | null;
  kind: LeaveKind;
  reason: string;
  from: string;
  to: string;
  approved: boolean;
}

// How far one section's register has got on one day.
export interface RegisterProgress {
  section_id: string;
  label: string;
  class_name: string;
  total: number;
  marked: number;
  absent: number;
  on_leave: number;
  // The caller is this section's class teacher and marks its register.
  led: boolean;
}
