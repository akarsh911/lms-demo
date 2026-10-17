import type { LabAttemptSummary, LabAttemptsResponse, LabBenchId, LabFeaturesResponse, SubmitLabAttemptInput } from '@labs/types/labs';
import type {
  AttendanceRoster,
  AttendanceStatus,
  AttendanceSummary,
  ClassesResponse,
  MarkAttendanceInput,
  MarkAttendanceResult,
  RegisterProgress,
  StudentLeave,
} from '@/types/attendance';
import type { TimetableDay } from '@/types/timetable';
import { leadsSection, seesSection } from '@/lib/reach/reach';

import { reachNow } from './reach';
import { ATTENDANCE_DAYS, LESSON_DAY } from './data/classroom';
import { ENROLLMENTS } from './data/enrollment';
import { LEAVES } from './data/leave';
import { PERSONS, STAFF, STUDENTS, TEACHERS } from './data/people';
import { CURRENT_SESSION, GRADE_LEVELS, ROOMS, SECTIONS } from './data/structure';
import { PERSONA_STUDENT } from './identity';
import { resolveOccurrences } from './occurrences';
import { byId, fail, insert, patch } from './rows';

const STATUSES: readonly AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];
const statusOf = (value: unknown): AttendanceStatus | null => STATUSES.find((status) => status === value) ?? null;

const ATTEMPTS: LabAttemptSummary[] = [];

const sectionName = (sectionId: string): string => {
  const section = byId(SECTIONS, sectionId);
  const grade = byId(GRADE_LEVELS, section?.grade_level_id);
  return `${grade?.name ?? 'Class'} ${section?.name ?? ''}`.trim();
};

const rollOf = (sectionId: string) =>
  ENROLLMENTS.filter((e) => e.section_id === sectionId && e.academic_session_id === CURRENT_SESSION.id);

const dayRow = (studentId: string, date: string) =>
  ATTENDANCE_DAYS.find((r) => r.student_id === studentId && (r.attendance_date ?? '').startsWith(date));

const isoAt = (date: string, minute: number): string => {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 0, minute).toISOString();
};

// The demo pupil's class's lessons on the latest school day, since "today" may be a Sunday or a holiday.
// A teacher's own periods across their sections, or a pupil's section's day; anyone else is shown the fixture pupil's.
export function today(): TimetableDay {
  const reach = reachNow();
  const pupil = STUDENTS[PERSONA_STUDENT]?.id;
  const sectionId = reach.kind === 'self' ? (reach.sectionId ?? '') : (ENROLLMENTS.find((e) => e.student_id === pupil && e.academic_session_id === CURRENT_SESSION.id)?.section_id ?? '');
  const scope = reach.kind === 'teaching' ? { teacherId: reach.teacherId } : { sectionId };
  // A teacher's day is the lessons they actually take, a cover included and a lesson handed to someone else not.
  const lessons = resolveOccurrences({ ...scope, from: LESSON_DAY, to: LESSON_DAY }).filter(
    (o) => o.period_kind === 'teaching' && o.state !== 'cancelled' && (reach.kind !== 'teaching' || o.teacher_id === reach.teacherId),
  );
  const short = (id: string): string => {
    const section = byId(SECTIONS, id);
    return `${(byId(GRADE_LEVELS, section?.grade_level_id)?.name ?? '').replace('Class ', '')}${section?.name ?? ''}`;
  };
  return {
    date: LESSON_DAY,
    periods: lessons
      .map((o) => {
        const staff = byId(STAFF, byId(TEACHERS, o.teacher_id ?? undefined)?.staff_id);
        return {
          id: o.id,
          startsAt: isoAt(o.date, o.start_minute),
          endsAt: isoAt(o.date, o.end_minute),
          subject: o.label ?? o.period_name ?? '',
          room: byId(ROOMS, o.room_id ?? undefined)?.name ?? null,
          teacherName: byId(PERSONS, staff?.person_id)?.display_name ?? null,
          section: reach.kind === 'teaching' ? `${short(o.section_id)}${o.planned_teacher_id && o.planned_teacher_id !== o.teacher_id ? ' · covering' : ''}` : null,
        };
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  };
}

export const classes = (): ClassesResponse => ({
  classes: SECTIONS.filter((s) => s.academic_session_id === CURRENT_SESSION.id).map((s) => ({ id: s.id, name: sectionName(s.id) })),
});

export const attendanceRoster = (classId: string, date: string): AttendanceRoster => ({
  classId,
  date,
  entries: rollOf(classId).map((e) => ({
    studentId: e.student_id ?? '',
    studentName: byId(PERSONS, byId(STUDENTS, e.student_id)?.person_id)?.display_name ?? '',
    status: statusOf(dayRow(e.student_id ?? '', date)?.forenoon_status),
  })),
});

export function attendanceSummary(classId: string, date: string): AttendanceSummary {
  const roll = rollOf(classId);
  const count = (status: AttendanceStatus): number =>
    roll.filter((e) => dayRow(e.student_id ?? '', date)?.forenoon_status === status).length;
  return {
    classId,
    className: sectionName(classId),
    date,
    present: count('present'),
    absent: count('absent'),
    late: count('late'),
    excused: count('excused'),
    total: roll.length,
  };
}

// Writes into the same day rows the student's own attendance history reads, so a mark shows up there too.
export function markAttendance(input: MarkAttendanceInput): MarkAttendanceResult {
  for (const mark of input.marks) {
    const status = statusOf(mark.status);
    if (!status) continue;
    const fields = { forenoon_status: status, afternoon_status: status };
    const current = dayRow(mark.studentId, input.date);
    if (current) patch(ATTENDANCE_DAYS, current.id, fields);
    else {
      insert(ATTENDANCE_DAYS, {
        ...fields,
        student_id: mark.studentId,
        academic_session_id: CURRENT_SESSION.id,
        section_id: input.classId,
        attendance_date: `${input.date}T00:00:00Z`,
        source: 'teacher',
      });
    }
  }
  return { updated: input.marks.length };
}

export const labFeatures = (): LabFeaturesResponse => ({ features: {} });

export const labAttempts = (bench: LabBenchId): LabAttemptsResponse => ({
  attempts: ATTEMPTS.filter((attempt) => attempt.bench === bench).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
});

export function submitLabAttempt<R>(input: SubmitLabAttemptInput<R>): LabAttemptSummary {
  const record = input.record as { score?: unknown; max?: unknown; time?: unknown; bench_seed?: unknown };
  if (typeof record.score !== 'number' || typeof record.max !== 'number') {
    return fail(422, 'invalid_input', 'record.score and record.max must be numbers');
  }
  return insert(ATTEMPTS, {
    bench: input.bench,
    submittedAt: new Date().toISOString(),
    score: record.score,
    max: record.max,
    time: typeof record.time === 'string' ? record.time : '',
    benchSeed: typeof record.bench_seed === 'number' ? record.bench_seed : 0,
  });
}

const nameOf = (studentId: string | undefined): string => byId(PERSONS, byId(STUDENTS, studentId)?.person_id)?.display_name ?? 'Student';

// Leave covering one day in one section, approved first.
export function leavesOn(classId: string, date: string): StudentLeave[] {
  const rolls = new Map(rollOf(classId).map((e) => [e.student_id, e.roll_number ?? null]));
  return LEAVES.filter((l) => l.section_id === classId && l.from <= date && l.to >= date)
    .map((l) => ({ id: l.id, student_id: l.student_id, name: nameOf(l.student_id), roll: rolls.get(l.student_id) ?? null, kind: l.kind, reason: l.reason, from: l.from, to: l.to, approved: l.approved }))
    .sort((a, b) => Number(b.approved) - Number(a.approved) || a.name.localeCompare(b.name));
}

// Every section's register on one day: how many marked, absent and on leave. Indexed once, since a school is 1,900 rows a day.
export function registersOn(date: string): RegisterProgress[] {
  const marks = new Map<string, string>();
  for (const r of ATTENDANCE_DAYS) if ((r.attendance_date ?? '').startsWith(date)) marks.set(r.student_id ?? '', r.forenoon_status ?? '');
  const leave = new Set(LEAVES.filter((l) => l.from <= date && l.to >= date).map((l) => l.student_id));
  const reach = reachNow();
  // The office sees every register; a teacher the sections they teach, the ones they lead first.
  return SECTIONS.filter((s) => s.academic_session_id === CURRENT_SESSION.id && s.status !== 'archived' && seesSection(reach, s.id))
    .map((s) => {
      const roll = rollOf(s.id).filter((e) => e.status === 'active');
      const grade = byId(GRADE_LEVELS, s.grade_level_id);
      return {
        section_id: s.id,
        label: `${(grade?.name ?? '').replace('Class ', '')}${s.name ?? ''}`,
        class_name: grade?.name ?? 'Class',
        total: roll.length,
        marked: roll.filter((e) => marks.get(e.student_id ?? '')).length,
        absent: roll.filter((e) => marks.get(e.student_id ?? '') === 'absent').length,
        on_leave: roll.filter((e) => leave.has(e.student_id ?? '')).length,
        led: reach.kind === 'teaching' && leadsSection(reach, s.id),
      };
    })
    .sort((a, b) => Number(b.led) - Number(a.led) || a.label.localeCompare(b.label, 'en', { numeric: true }));
}
