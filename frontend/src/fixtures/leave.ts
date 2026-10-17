import type { LeaveBalance, LeaveKind, LeaveWrite, MyLeave, StaffLeave } from '@/types/leave';

import { TODAY } from './data/classroom';
import { PERSONS, STAFF, TEACHERS } from './data/people';
import { STAFF_LEAVES, type StaffLeaveRow } from './data/staff-leave';
import { CALENDAR_DAYS } from './data/timetable';
import { newId } from './ids';
import { resolveOccurrences } from './occurrences';
import { reachNow } from './reach';
import { fail, must } from './rows';

// Days a teacher is allowed in a year, by kind; duty leave is the school's own business and has no ceiling.
const ALLOWED: Readonly<Record<LeaveKind, number>> = { casual: 12, sick: 10, earned: 15, duty: 0 };
const YEAR_START = '2026-04-01';
const DAY = 86_400_000;
const shift = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

const teacherName = (id: string): string => {
  const staff = STAFF.find((s) => s.id === TEACHERS.find((t) => t.id === id)?.staff_id);
  return PERSONS.find((p) => p.id === staff?.person_id)?.display_name ?? 'A teacher';
};

const schoolDays = (from: string, to: string): number => CALENDAR_DAYS.filter((d) => d.forenoon_open && (d.calendar_date ?? '').slice(0, 10) >= from && (d.calendar_date ?? '').slice(0, 10) <= to).length;

const lessonsIn = (teacherId: string, from: string, to: string): number =>
  resolveOccurrences({ teacherId, from, to }).filter((o) => o.period_kind === 'teaching' && o.teacher_id === teacherId).length;

function toLeave(row: StaffLeaveRow): StaffLeave {
  const days = schoolDays(row.from, row.to);
  return { ...row, teacher: teacherName(row.teacher_id), days: row.half_day ? days / 2 : days, lessons: lessonsIn(row.teacher_id, row.from, row.to) };
}

function used(teacherId: string, kind: LeaveKind, except?: string): number {
  return STAFF_LEAVES.filter((r) => r.teacher_id === teacherId && r.kind === kind && r.id !== except && (r.status === 'approved' || r.status === 'pending') && r.from >= YEAR_START).reduce((t, r) => t + toLeave(r).days, 0);
}

function caller(): string {
  const reach = reachNow();
  if (reach.kind !== 'teaching') fail(403, 'forbidden', 'Leave is applied for by a teacher.');
  return reach.teacherId;
}

export function myLeave(): MyLeave {
  const teacherId = caller();
  const balance: LeaveBalance[] = (['casual', 'sick', 'earned'] as const).map((kind) => ({ kind, allowed: ALLOWED[kind], used: used(teacherId, kind) }));
  return { requests: STAFF_LEAVES.filter((r) => r.teacher_id === teacherId).map(toLeave).sort((a, b) => b.from.localeCompare(a.from)), balance };
}

export function applyLeave(body: LeaveWrite): StaffLeave {
  const teacherId = caller();
  if (!body.from || !body.to || body.to < body.from) fail(422, 'validation_failed', 'Choose a first and a last day, the last on or after the first.');
  if (body.half_day && body.from !== body.to) fail(422, 'validation_failed', 'A half day is a single day.');
  const earliest = body.kind === 'sick' ? shift(TODAY, -7) : TODAY;
  if (body.from < earliest) fail(422, 'validation_failed', body.kind === 'sick' ? 'Sick leave can be recorded up to a week after.' : 'Leave is applied for before the day.');
  if (body.reason.trim().length < 4) fail(422, 'validation_failed', 'Give the reason in a few words.');
  if (schoolDays(body.from, body.to) === 0) fail(422, 'validation_failed', 'There is no school on those days.');
  const clash = STAFF_LEAVES.find((r) => r.teacher_id === teacherId && (r.status === 'pending' || r.status === 'approved') && r.from <= body.to && r.to >= body.from);
  if (clash) fail(409, 'overlaps', `You already have leave from ${clash.from} to ${clash.to}.`);
  const days = body.half_day ? 0.5 : schoolDays(body.from, body.to);
  if (body.kind !== 'duty' && used(teacherId, body.kind) + days > ALLOWED[body.kind]) fail(409, 'over_allowance', `That is more ${body.kind} leave than you have left this year.`);
  const row: StaffLeaveRow = { id: newId(), teacher_id: teacherId, from: body.from, to: body.to, half_day: body.half_day, kind: body.kind, reason: body.reason.trim(), status: 'pending', applied_at: new Date().toISOString(), decided_at: null, note: null };
  STAFF_LEAVES.unshift(row);
  return toLeave(row);
}

// A teacher withdraws a request still waiting, or approved leave that has not begun.
export function cancelLeave(id: string): StaffLeave {
  const teacherId = caller();
  const row = must(STAFF_LEAVES, id, 'leave request');
  if (row.teacher_id !== teacherId) fail(403, 'forbidden', 'That is not your request.');
  if (row.status === 'declined' || row.status === 'cancelled' || row.from <= TODAY) fail(409, 'started', 'Only a request for days still ahead can be withdrawn.');
  row.status = 'cancelled';
  return toLeave(row);
}

export function decideLeave(id: string, approve: boolean, note?: string): StaffLeave {
  if (reachNow().kind !== 'school') fail(403, 'forbidden', 'Leave is decided by the school office.');
  const row = must(STAFF_LEAVES, id, 'leave request');
  if (row.status !== 'pending') fail(409, 'decided', 'This request has already been decided.');
  Object.assign(row, { status: approve ? 'approved' : 'declined', decided_at: new Date().toISOString(), note: note?.trim() || null });
  return toLeave(row);
}

export const pendingLeave = (): StaffLeave[] => STAFF_LEAVES.filter((r) => r.status === 'pending').map(toLeave);

// Approved leave covering a date, for the teacher's timeline.
export const leaveOn = (teacherId: string, date: string): StaffLeaveRow | undefined =>
  STAFF_LEAVES.find((r) => r.teacher_id === teacherId && r.status === 'approved' && r.from <= date && r.to >= date);
