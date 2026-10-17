import type { SectionRow, TeacherAssignmentRow } from '@/types/academic';
import type { TeacherRow } from '@/types/roster';
import type {
  BellSchedule,
  BellSchedulePeriod,
  CalendarDay,
  CalendarDaySchedule,
  DayType,
  Period,
  PeriodKind,
  PeriodScheme,
  PeriodSchemeGradeLevel,
  Timetable,
  TimetableSlot,
} from '@/types/school';

import { seedId } from '../ids';
import { TEACHERS } from './people';
import { BRANCH, CURRENT_SECTIONS, CURRENT_SESSION, GRADE_LEVELS, LAB_ROOM_BY_SUBJECT, OFFERINGS, PAST_SESSION, SECTIONS, gradeSequenceOf, planFor, subjectByCode } from './structure';

export const SCHEME: PeriodScheme = {
  id: seedId('scheme', 'regular'),
  academic_session_id: CURRENT_SESSION.id,
  branch_id: BRANCH.id,
  name: 'Regular week',
  code: 'REG',
  status: 'active',
};

export const PERIOD_SCHEMES: PeriodScheme[] = [SCHEME];

const PERIOD_DEFS: readonly { code: string; name: string; kind: PeriodKind; start: number; end: number }[] = [
  { code: 'ASM', name: 'Assembly', kind: 'assembly', start: 480, end: 500 },
  { code: 'P1', name: 'Period 1', kind: 'teaching', start: 500, end: 540 },
  { code: 'P2', name: 'Period 2', kind: 'teaching', start: 540, end: 580 },
  { code: 'P3', name: 'Period 3', kind: 'teaching', start: 580, end: 620 },
  { code: 'P4', name: 'Period 4', kind: 'teaching', start: 620, end: 660 },
  { code: 'LUN', name: 'Lunch', kind: 'break', start: 660, end: 690 },
  { code: 'P5', name: 'Period 5', kind: 'teaching', start: 690, end: 730 },
  { code: 'P6', name: 'Period 6', kind: 'teaching', start: 730, end: 770 },
  { code: 'P7', name: 'Period 7', kind: 'teaching', start: 770, end: 810 },
];

export const PERIODS: Period[] = PERIOD_DEFS.map((d, i) => ({
  id: seedId('period', d.code),
  period_scheme_id: SCHEME.id,
  name: d.name,
  code: d.code,
  sequence: i + 1,
  kind: d.kind,
  status: 'active',
}));

const periodId = (code: string): string => seedId('period', code);

export const BELLS: BellSchedule[] = [
  { id: seedId('bell', 'regular'), period_scheme_id: SCHEME.id, name: 'Regular', code: 'REG', is_default: true, status: 'active' },
  { id: seedId('bell', 'saturday'), period_scheme_id: SCHEME.id, name: 'Saturday', code: 'SAT', is_default: false, status: 'active' },
];

const [REGULAR_BELL, SATURDAY_BELL] = BELLS as [BellSchedule, BellSchedule];

// Saturday drops the last two teaching periods.
export const BELL_PERIODS: BellSchedulePeriod[] = BELLS.flatMap((bell) =>
  PERIOD_DEFS.map((d) => ({
    id: seedId('bell-period', bell.code ?? '', d.code),
    bell_schedule_id: bell.id,
    period_id: periodId(d.code),
    start_minute: d.start,
    end_minute: d.end,
    runs: bell.code === 'SAT' ? !['P6', 'P7'].includes(d.code) : true,
  })),
);

export const SCHEME_GRADES: PeriodSchemeGradeLevel[] = GRADE_LEVELS.map((grade) => ({
  id: seedId('scheme-grade', grade.id),
  period_scheme_id: SCHEME.id,
  grade_level_id: grade.id,
  edges: { grade_level: { id: grade.id, name: grade.name, code: grade.code, sequence: grade.sequence } },
}));

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const isoDay = (d: Date): number => ((d.getUTCDay() + 6) % 7) + 1;

const NAMED: Readonly<Record<string, { type: DayType; name: string }>> = {
  '2026-08-15': { type: 'holiday', name: 'Independence Day' },
  '2026-10-02': { type: 'holiday', name: 'Gandhi Jayanti' },
  '2026-10-20': { type: 'holiday', name: 'Dussehra' },
  '2026-12-25': { type: 'holiday', name: 'Christmas' },
  '2027-01-26': { type: 'holiday', name: 'Republic Day' },
  '2027-03-04': { type: 'holiday', name: 'Holi' },
};

const RANGES: readonly { from: string; to: string; type: DayType; name: string }[] = [
  { from: '2026-05-11', to: '2026-06-30', type: 'vacation', name: 'Summer vacation' },
  { from: '2026-09-21', to: '2026-09-30', type: 'exam', name: 'Half-yearly examinations' },
  { from: '2026-11-09', to: '2026-11-12', type: 'vacation', name: 'Diwali break' },
  { from: '2026-12-28', to: '2027-01-02', type: 'vacation', name: 'Winter vacation' },
  { from: '2027-03-01', to: '2027-03-19', type: 'exam', name: 'Annual examinations' },
];

function classify(date: string, day: number): { type: DayType; name?: string; open: boolean } {
  const named = NAMED[date];
  if (named) return { ...named, open: false };
  const range = RANGES.find((r) => date >= r.from && date <= r.to);
  if (range?.type === 'vacation') return { type: 'vacation', name: range.name, open: false };
  if (day === 7) return { type: 'weekend', open: false };
  if (range) return { type: range.type, name: range.name, open: true };
  return { type: 'instructional', open: true };
}

const dayRows = (() => {
  const days: CalendarDay[] = [];
  const schedules: CalendarDaySchedule[] = [];
  for (let t = Date.UTC(2026, 3, 1); t <= Date.UTC(2027, 2, 31); t += 86_400_000) {
    const date = new Date(t);
    const key = iso(date);
    const day = isoDay(date);
    const { type, name, open } = classify(key, day);
    const id = seedId('calendar-day', key);
    days.push({
      id,
      academic_session_id: CURRENT_SESSION.id,
      branch_id: BRANCH.id,
      calendar_date: `${key}T00:00:00Z`,
      day_type: type,
      forenoon_open: open,
      afternoon_open: open && day !== 6,
      name,
    });
    if (open) {
      schedules.push({
        id: seedId('calendar-day-schedule', key),
        calendar_day_id: id,
        period_scheme_id: SCHEME.id,
        bell_schedule_id: day === 6 ? SATURDAY_BELL.id : REGULAR_BELL.id,
      });
    }
  }
  return { days, schedules };
})();

export const CALENDAR_DAYS: CalendarDay[] = dayRows.days;
export const CALENDAR_DAY_SCHEDULES: CalendarDaySchedule[] = dayRows.schedules;

export const TIMETABLE: Timetable = {
  id: seedId('timetable', 'v1'),
  academic_session_id: CURRENT_SESSION.id,
  period_scheme_id: SCHEME.id,
  name: 'Regular week, version 1',
  version: 1,
  effective_from: '2026-04-01T00:00:00Z',
  status: 'published',
  published_at: '2026-03-25T09:00:00Z',
};

// The generator only runs on a draft: one empty, one half-built by hand that supersedes the week in force.
export const DRAFT_EMPTY: Timetable = {
  id: seedId('timetable', 'draft-empty'),
  academic_session_id: CURRENT_SESSION.id,
  period_scheme_id: SCHEME.id,
  name: 'Regular week, next term',
  version: 3,
  effective_from: '2026-11-02T00:00:00Z',
  status: 'draft',
};

export const DRAFT_PARTIAL: Timetable = {
  id: seedId('timetable', 'draft-partial'),
  academic_session_id: CURRENT_SESSION.id,
  period_scheme_id: SCHEME.id,
  name: 'Regular week, half-built by hand',
  version: 2,
  effective_from: '2027-01-04T00:00:00Z',
  status: 'draft',
  supersedes_id: TIMETABLE.id,
};

export const TIMETABLES: Timetable[] = [TIMETABLE, DRAFT_PARTIAL, DRAFT_EMPTY];

const SPECIALISATION: Readonly<Record<string, readonly string[]>> = {
  MATH: ['Mathematics'],
  SCI: ['Physics', 'Chemistry', 'Biology'],
  PHY: ['Physics'],
  CHE: ['Chemistry'],
  BIO: ['Biology'],
  ENG: ['English'],
  HIN: ['Hindi'],
  SST: ['Social Science'],
  CS: ['Computer Science'],
  PE: ['Physical Education'],
};

const TEACHING = PERIOD_DEFS.filter((d) => d.kind === 'teaching').map((d) => periodId(d.code));
export const TEACHING_DAYS = [1, 2, 3, 4, 5] as const;
const DAYS = TEACHING_DAYS;
const CELLS = TEACHING.length * DAYS.length;

// Deals each subject's periods across different days, then pads the rest with free periods.
function weekGrid(gradeSequence: number): (string | null)[][] {
  const tokens: (string | null)[] = planFor(gradeSequence).flatMap((e) => Array<string>(e.periods).fill(e.code));
  while (tokens.length < CELLS) tokens.push(null);
  return DAYS.map((_, d) => tokens.filter((_, i) => i % DAYS.length === d));
}

const offeringById = new Map(OFFERINGS.map((o) => [o.id, o]));

const slotsAndAssignments = (() => {
  const slots: TimetableSlot[] = [];
  const busy = new Set<string>();
  const taught = new Map<string, Map<string, number>>();

  // Each class opens the day with its class teacher, who takes the register: she is booked for that period before anything else is placed.
  const firstPeriod = TEACHING[0] ?? '';
  for (const section of CURRENT_SECTIONS) if (section.class_teacher_id) for (const day of DAYS) busy.add(`${day}|${firstPeriod}|${section.class_teacher_id}`);

  // One teacher per subject per class, the least loaded specialist, and the class teacher for her own subject in her own class.
  const load = new Map<string, number>();
  const chosen = new Map<string, TeacherRow>();
  const teacherFor = (section: SectionRow, code: string, s: number): TeacherRow | undefined => {
    const key = `${section.id}|${code}`;
    const known = chosen.get(key);
    if (known) return known;
    const wanted = SPECIALISATION[code] ?? [];
    const lead = TEACHERS.find((t) => t.id === section.class_teacher_id);
    const pool = TEACHERS.filter((t) => wanted.includes(t.specialization ?? ''));
    const rotated = [...pool.slice(s % Math.max(pool.length, 1)), ...pool.slice(0, s % Math.max(pool.length, 1))];
    const pick = lead && wanted.includes(lead.specialization ?? '') ? lead : [...rotated].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0];
    if (pick) chosen.set(key, pick);
    return pick;
  };

  CURRENT_SECTIONS.forEach((section, s) => {
    const grid = weekGrid(gradeSequenceOf(section));
    const lead = TEACHERS.find((t) => t.id === section.class_teacher_id);

    DAYS.forEach((day, d) => {
      const rotation = (s * 3 + d * 2) % TEACHING.length;
      const remaining = TEACHING.map((_, p) => grid[d]?.[(p + rotation) % TEACHING.length] ?? null);

      TEACHING.forEach((pid, p) => {
        const id = seedId('slot', section.id, day, pid);
        const base = { id, timetable_id: TIMETABLE.id, section_id: section.id, period_id: pid, day_of_week: day };
        const opening = p === 0 && lead !== undefined;
        const free = (code: string | null): boolean => code !== null && !busy.has(`${day}|${pid}|${teacherFor(section, code, s)?.id ?? ''}`);
        // The opening period takes the class teacher's subject when the day has it; any other takes a subject whose teacher is free now.
        const at = opening
          ? remaining.findIndex((c) => c !== null && teacherFor(section, c, s)?.id === lead.id)
          : remaining.findIndex(free);
        const index = at >= 0 ? at : remaining.findIndex((c) => c === null) >= 0 ? remaining.findIndex((c) => c === null) : 0;
        const code = remaining.splice(index, 1)[0] ?? null;

        if (!code) {
          slots.push(opening ? { ...base, teacher_id: lead.id, room_id: section.room_id, label: 'Class teacher period' } : { ...base, label: 'Library' });
          return;
        }

        const own = teacherFor(section, code, s);
        const idle = (t: TeacherRow): boolean => !busy.has(`${day}|${pid}|${t.id}`);
        const lightest = (list: readonly TeacherRow[]): TeacherRow | undefined => [...list].filter(idle).sort((x, y) => (load.get(x.id) ?? 0) - (load.get(y.id) ?? 0))[0];
        // A stand-in is a free specialist in the subject where there is one, else the least loaded free teacher.
        const teacher = opening ? lead : own && idle(own) ? own : (lightest(TEACHERS.filter((t) => (SPECIALISATION[code] ?? []).includes(t.specialization ?? ''))) ?? lightest(TEACHERS));
        if (!teacher) return;
        busy.add(`${day}|${pid}|${teacher.id}`);
        load.set(teacher.id, (load.get(teacher.id) ?? 0) + 1);

        const offering = offeringById.get(seedId('offering', section.id, code));

        const lab = LAB_ROOM_BY_SUBJECT[code];
        const labFree = lab !== undefined && !busy.has(`${day}|${pid}|${lab}`);
        if (labFree) busy.add(`${day}|${pid}|${lab}`);

        slots.push({
          ...base,
          subject_offering_id: offering?.id,
          teacher_id: teacher.id,
          room_id: labFree ? lab : section.room_id,
          label: subjectByCode(code).name,
        });
      });
    });
  });

  // A lesson that went to a stand-in swaps, where both teachers are free, with another lesson of the same class that day.
  const ownOf = (slot: TimetableSlot): string | undefined => chosen.get(`${slot.section_id}|${offeringById.get(slot.subject_offering_id ?? '')?.edges?.subject?.code ?? ''}`)?.id;
  const freeAt = (day: number, pid: string, teacherId: string | undefined): boolean => teacherId !== undefined && !busy.has(`${day}|${pid}|${teacherId}`);
  for (const x of slots) {
    const ox = ownOf(x);
    if (!x.subject_offering_id || !x.teacher_id || !ox || x.teacher_id === ox) continue;
    const lead = CURRENT_SECTIONS.find((c) => c.id === x.section_id)?.class_teacher_id;
    const y = slots.find((c) => {
      if (c === x || c.section_id !== x.section_id || c.day_of_week !== x.day_of_week || (lead && c.period_id === firstPeriod)) return false;
      if (!freeAt(c.day_of_week ?? 0, c.period_id ?? '', ox)) return false;
      if (!c.subject_offering_id) return true;
      const oy = ownOf(c);
      return c.teacher_id === oy && freeAt(x.day_of_week ?? 0, x.period_id ?? '', oy);
    });
    if (!y) continue;
    const day = x.day_of_week ?? 0;
    busy.delete(`${day}|${x.period_id}|${x.teacher_id}`);
    if (y.teacher_id) busy.delete(`${day}|${y.period_id}|${y.teacher_id}`);
    const moved = { subject_offering_id: x.subject_offering_id, room_id: x.room_id, label: x.label };
    Object.assign(x, { subject_offering_id: y.subject_offering_id, teacher_id: y.teacher_id, room_id: y.room_id ?? x.room_id, label: y.label });
    Object.assign(y, { ...moved, teacher_id: ox });
    busy.add(`${day}|${y.period_id}|${ox}`);
    if (x.teacher_id) busy.add(`${day}|${x.period_id}|${x.teacher_id}`);
  }
  for (const slot of slots) {
    if (!slot.subject_offering_id || !slot.teacher_id) continue;
    const counts = taught.get(slot.subject_offering_id) ?? new Map<string, number>();
    counts.set(slot.teacher_id, (counts.get(slot.teacher_id) ?? 0) + 1);
    taught.set(slot.subject_offering_id, counts);
  }

  const assignments: TeacherAssignmentRow[] = [...taught.entries()].map(([offeringId, counts]) => {
    const [teacherId] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    const offering = offeringById.get(offeringId);
    return {
      id: seedId('assignment', offeringId),
      academic_session_id: CURRENT_SESSION.id,
      teacher_id: teacherId,
      section_id: offering?.section_id,
      subject_offering_id: offeringId,
      role_type: 'subject_teacher',
      is_primary: true,
      valid_from: '2026-04-01',
      status: 'active',
    };
  });

  return { slots, assignments };
})();

// Monday to Wednesday of the first section, copied from the published week so the draft starts clash-free.
const PARTIAL_SLOTS: readonly TimetableSlot[] = slotsAndAssignments.slots
  .filter((slot) => slot.section_id === CURRENT_SECTIONS[0]?.id && (slot.day_of_week ?? 0) <= 3)
  .map((slot) => ({ ...slot, id: seedId('slot', 'draft-partial', slot.id), timetable_id: DRAFT_PARTIAL.id }));

export const SLOTS: TimetableSlot[] = [...slotsAndAssignments.slots, ...PARTIAL_SLOTS];
// Four subjects are on the timetable with no teacher formally assigned to them: a gap the year has to close.
// Four subjects lost their teacher during the year (data/staffing.ts); they are kept here so the gap can be named.
const VACATED = [37, 141, 263, 388];
export const VACATED_ASSIGNMENTS: TeacherAssignmentRow[] = VACATED.flatMap((i) => slotsAndAssignments.assignments[i] ?? []);
export const TEACHER_ASSIGNMENTS: TeacherAssignmentRow[] = slotsAndAssignments.assignments.filter((_, i) => !VACATED.includes(i));

// Last year's teaching is this year's carried back: the same teacher on the same section letter and subject, no gaps.
const pastSectionByCode = new Map(SECTIONS.filter((s) => s.academic_session_id === PAST_SESSION.id).map((s) => [s.code ?? '', s]));
const currentSectionCode = new Map(CURRENT_SECTIONS.map((s) => [s.id, s.code ?? '']));
export const PAST_TEACHER_ASSIGNMENTS: TeacherAssignmentRow[] = slotsAndAssignments.assignments.flatMap((row) => {
  const offering = offeringById.get(row.subject_offering_id ?? '');
  const section = pastSectionByCode.get(currentSectionCode.get(offering?.section_id ?? '') ?? '');
  const code = offering?.edges?.subject?.code ?? '';
  if (!section || !code) return [];
  const pastOffering = seedId('offering', section.id, code);
  return [{ ...row, id: seedId('assignment', pastOffering), academic_session_id: PAST_SESSION.id, section_id: section.id, subject_offering_id: pastOffering, valid_from: '2025-04-01' }];
});

export const teacherAssignmentsOf = (sessionId: string): TeacherAssignmentRow[] => (sessionId === PAST_SESSION.id ? PAST_TEACHER_ASSIGNMENTS : TEACHER_ASSIGNMENTS);
