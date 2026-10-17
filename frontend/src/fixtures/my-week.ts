import type { ExtraClass } from '@/types/extra-class';
import type { TimelineDay, TimelineSlot, TimelineWeek } from '@/types/timetable';

import { ATTENDANCE_DAYS, TODAY } from './data/classroom';
import { ENROLLMENTS } from './data/enrollment';
import { STAFF, PERSONS, TEACHERS } from './data/people';
import { GRADE_LEVELS, ROOMS, SECTIONS } from './data/structure';
import { BELL_PERIODS, CALENDAR_DAY_SCHEDULES, CALENDAR_DAYS, PERIODS, TEACHING_DAYS } from './data/timetable';
import { extrasOn } from './extra-classes';
import { leaveOn } from './leave';
import { resolveOccurrences } from './occurrences';
import { reachNow } from './reach';
import { fail } from './rows';

const DAY = 86_400_000;
const FIRST_TEACHING = [...PERIODS].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)).find((p) => p.kind === 'teaching')?.id;
const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const mondayOf = (date: string): string => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));

const teacherName = (id: string | undefined): string | null => {
  const staff = STAFF.find((s) => s.id === TEACHERS.find((t) => t.id === id)?.staff_id);
  return PERSONS.find((p) => p.id === staff?.person_id)?.display_name ?? null;
};
const sectionLabel = (id: string): string => {
  const section = SECTIONS.find((s) => s.id === id);
  return `${(GRADE_LEVELS.find((g) => g.id === section?.grade_level_id)?.name ?? '').replace('Class ', '')}${section?.name ?? ''}`;
};

// A register counts as taken once anyone in the section has a mark for that day.
const takenOn = (sectionId: string, date: string): boolean => {
  const roll = new Set(ENROLLMENTS.filter((e) => e.section_id === sectionId).map((e) => e.student_id));
  return ATTENDANCE_DAYS.some((r) => (r.attendance_date ?? '').startsWith(date) && roll.has(r.student_id));
};

const extraSlot = (x: ExtraClass): TimelineSlot => ({
  ...blank(x.id, 'extra', 'Extra class', x.start, x.end),
  subject: x.subject,
  section_id: x.section_id,
  grade_level_id: SECTIONS.find((s) => s.id === x.section_id)?.grade_level_id ?? null,
  label: x.label,
  offering_id: x.offering_id,
  room: x.room,
  teacher: teacherName(x.teacher_id),
  note: `${x.topic}${x.student_ids.length > 0 ? ` · ${x.student_ids.length} chosen pupils` : ''}`,
});

const blank = (id: string, kind: TimelineSlot['kind'], name: string, start: number, end: number): TimelineSlot => ({
  id, kind, name, start, end, subject: null, section_id: null, grade_level_id: null, label: null, offering_id: null, room: null, teacher: null, cover: false, cancelled: false, register: false, taken: false, note: null,
});

// One week, Monday to Saturday, as a teacher teaches it or a pupil sits it: every bell period filled with a lesson, a free period or a break.
export function myWeek(weekOf: string): TimelineWeek {
  const reach = reachNow();
  if (reach.kind !== 'teaching' && reach.kind !== 'self') fail(403, 'forbidden', 'A timetable belongs to a teacher or a pupil.');
  const monday = mondayOf(weekOf || TODAY);
  const days: TimelineDay[] = [0, 1, 2, 3, 4, 5].map((offset) => {
    const date = addDays(monday, offset);
    const calendar = CALENDAR_DAYS.find((d) => (d.calendar_date ?? '').startsWith(date));
    const schedule = CALENDAR_DAY_SCHEDULES.find((s) => s.calendar_day_id === calendar?.id);
    const extras = extrasOn(date).map(extraSlot);
    // A day with no timetable still shows the extra classes booked on it.
    const closed = (why: string): TimelineDay => ({ date, open: extras.length > 0, closed_for: why, away: null, slots: extras });
    if (!calendar?.forenoon_open || !schedule) return closed(calendar?.name ?? 'No school');
    // The timetable runs Monday to Friday; a Saturday is for activities and extra classes, not lessons.
    if (!TEACHING_DAYS.some((d) => d === offset + 1)) return closed('No timetabled lessons on Saturday');

    const lessons = resolveOccurrences({ ...(reach.kind === 'teaching' ? { teacherId: reach.teacherId } : { sectionId: reach.sectionId ?? '' }), from: date, to: date }).filter(
      (o) => o.period_kind === 'teaching' && (reach.kind !== 'teaching' || o.teacher_id === reach.teacherId),
    );
    const bell = BELL_PERIODS.filter((b) => b.bell_schedule_id === schedule.bell_schedule_id && b.runs !== false).sort((a, b) => (a.start_minute ?? 0) - (b.start_minute ?? 0));

    const slots = bell.flatMap((b): TimelineSlot[] => {
      const period = PERIODS.find((p) => p.id === b.period_id);
      if (!period) return [];
      const start = b.start_minute ?? 0;
      const end = b.end_minute ?? 0;
      if (period.kind !== 'teaching') return [blank(`${date}-${period.id}`, 'break', period.name ?? '', start, end)];
      const o = lessons.find((x) => x.period_id === period.id);
      if (!o) return [blank(`${date}-${period.id}`, 'free', reach.kind === 'teaching' ? 'Free period' : 'Free', start, end)];
      const section = SECTIONS.find((s) => s.id === o.section_id);
      const register = reach.kind === 'teaching' && section?.class_teacher_id === reach.teacherId && period.id === FIRST_TEACHING;
      return [
        {
          ...blank(o.id, 'lesson', period.name ?? '', o.start_minute, o.end_minute),
          subject: o.label ?? null,
          section_id: o.section_id,
          grade_level_id: section?.grade_level_id ?? null,
          label: sectionLabel(o.section_id),
          offering_id: o.subject_offering_id ?? null,
          room: ROOMS.find((r) => r.id === o.room_id)?.name ?? null,
          teacher: teacherName(o.teacher_id),
          cover: Boolean(o.planned_teacher_id && o.planned_teacher_id !== o.teacher_id),
          cancelled: o.state === 'cancelled',
          register,
          taken: register && takenOn(o.section_id, date),
          note: o.reason ?? null,
        },
      ];
    });
    const leave = reach.kind === 'teaching' ? leaveOn(reach.teacherId, date) : undefined;
    return { date, open: true, closed_for: null, away: leave ? { kind: leave.kind, reason: leave.reason, half_day: leave.half_day } : null, slots: [...slots, ...extras].sort((a, b) => a.start - b.start) };
  });
  return { week_of: monday, today: TODAY, days };
}
