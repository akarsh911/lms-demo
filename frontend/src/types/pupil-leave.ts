export type PupilLeaveStatus = 'pending' | 'approved' | 'declined';

// A note from home asking for a pupil's absence to be excused; the class teacher decides it.
export interface PupilLeave {
  id: string;
  student_id: string;
  student: string;
  section: string;
  from: string;
  to: string;
  reason: string;
  status: PupilLeaveStatus;
  applied_at: string;
  decided_by: string | null;
  days: number;
}

export interface PupilLeaveWrite {
  from: string;
  to: string;
  reason: string;
}

export interface MyPupilLeave {
  notes: PupilLeave[];
  // Days absent in the last four weeks with no reason given, to send a note for.
  unexplained: string[];
  class_teacher: string | null;
}
