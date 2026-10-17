import type { LeaveKind, LeaveStatus } from '@/types/leave';

import { seedId } from '../ids';
import { dayFrom, LEAVE_REQUESTS } from './actions';
import { TEACHERS } from './people';

export interface StaffLeaveRow {
  id: string;
  teacher_id: string;
  from: string;
  to: string;
  half_day: boolean;
  kind: LeaveKind;
  reason: string;
  status: LeaveStatus;
  applied_at: string;
  decided_at: string | null;
  note: string | null;
}

const row = (teacher: number, from: number, to: number, kind: LeaveKind, reason: string, status: LeaveStatus, i: number): StaffLeaveRow => ({
  id: seedId('staff-leave', teacher, from, i),
  teacher_id: TEACHERS[teacher]?.id ?? '',
  from: dayFrom(from),
  to: dayFrom(to),
  half_day: false,
  kind,
  reason,
  status,
  applied_at: `${dayFrom(Math.min(from, 0) - 3)}T10:00:00Z`,
  decided_at: status === 'pending' ? null : `${dayFrom(Math.min(from, 0) - 2)}T12:00:00Z`,
  note: status === 'declined' ? 'Half-yearly marking is due that week' : null,
});

// The requests the office is waiting on, and the fixture teacher's own history so their page has a past.
export const STAFF_LEAVES: StaffLeaveRow[] = [
  ...LEAVE_REQUESTS.map((l, i) => row(l.teacher, l.from, l.to, l.reason.startsWith('Medical') ? 'sick' : 'casual', l.reason, 'pending', i)),
  row(0, -32, -31, 'sick', 'Viral fever', 'approved', 10),
  row(0, -12, -12, 'casual', 'Bank and passport office', 'approved', 11),
  row(0, -5, -5, 'casual', 'Family function', 'declined', 12),
];
