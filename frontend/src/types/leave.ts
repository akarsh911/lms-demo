export const LEAVE_KINDS = ['casual', 'sick', 'earned', 'duty'] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];
export type LeaveStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

// A teacher's request for days away, and what the office decided.
export interface StaffLeave {
  id: string;
  teacher_id: string;
  teacher: string;
  from: string;
  to: string;
  half_day: boolean;
  kind: LeaveKind;
  reason: string;
  status: LeaveStatus;
  applied_at: string;
  decided_at: string | null;
  note: string | null;
  // School days inside the dates, and the lessons the teacher would have taught on them.
  days: number;
  lessons: number;
}

export interface LeaveWrite {
  from: string;
  to: string;
  half_day: boolean;
  kind: LeaveKind;
  reason: string;
}

export interface LeaveBalance {
  kind: LeaveKind;
  allowed: number;
  used: number;
}

export interface MyLeave {
  requests: StaffLeave[];
  balance: LeaveBalance[];
}
