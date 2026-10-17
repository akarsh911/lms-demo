import type { OccurrenceRow, OccurrenceState } from '@/types/classroom';
import type { TimetableDeviationRow } from '@/types/section-calendar';

import { seedId } from './ids';
import { DEVIATIONS } from './data/classroom';
import { BELL_PERIODS, CALENDAR_DAYS, CALENDAR_DAY_SCHEDULES, PERIODS, SLOTS, TIMETABLES } from './data/timetable';

export interface OccurrenceQuery {
  branchId?: string;
  sectionId?: string;
  teacherId?: string;
  from: string;
  to: string;
}

const LUNCH_START = 660;
const dayOf = (date: string): number => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

const STATE_OF: Readonly<Record<string, OccurrenceState>> = {
  cancelled: 'cancelled',
  substitution: 'substituted',
  room_change: 'relocated',
  time_change: 'rescheduled',
  added: 'added',
};

export function resolveOccurrences(q: OccurrenceQuery): OccurrenceRow[] {
  const out: OccurrenceRow[] = [];
  const periods = new Map(PERIODS.map((p) => [p.id, p]));
  const timetables = TIMETABLES;
  const deviations = DEVIATIONS;

  for (const day of CALENDAR_DAYS) {
    const date = (day.calendar_date ?? '').slice(0, 10);
    if (date < q.from || date > q.to) continue;
    if (q.branchId && day.branch_id !== q.branchId) continue;
    const dow = dayOf(date);

    for (const schedule of CALENDAR_DAY_SCHEDULES.filter((s) => s.calendar_day_id === day.id)) {
      const bell = new Map(
        BELL_PERIODS.filter((b) => b.bell_schedule_id === schedule.bell_schedule_id).map((b) => [b.period_id, b]),
      );
      const tableIds = new Set(timetables.filter((t) => t.status === 'published' && t.period_scheme_id === schedule.period_scheme_id).map((t) => t.id));
      const dayDeviations = deviations.filter((d) => d.deviation_date === date);

      const build = (
        base: { slotId?: string; section?: string; period?: string; offering?: string; teacher?: string; room?: string; label?: string; timetable?: string },
        deviation?: TimetableDeviationRow,
      ): OccurrenceRow | null => {
        const period = periods.get(base.period ?? '');
        const times = bell.get(base.period ?? '');
        if (!period || !times || times.runs === false) return null;

        const start = deviation?.start_minute ?? times.start_minute ?? 0;
        const half = (times.start_minute ?? 0) < LUNCH_START ? 'forenoon' : 'afternoon';
        if (half === 'forenoon' ? !day.forenoon_open : !day.afternoon_open) return null;

        const kind = deviation?.kind;
        return {
          id: seedId('occurrence', date, base.slotId ?? deviation?.id ?? '', base.period ?? ''),
          date,
          day_of_week: dow,
          half,
          state: kind ? (STATE_OF[kind] ?? 'planned') : 'planned',
          branch_id: day.branch_id ?? '',
          calendar_day_id: day.id,
          day_type: day.day_type ?? 'instructional',
          timetable_slot_id: base.slotId,
          timetable_deviation_id: deviation?.id,
          deviation_kind: kind,
          section_id: base.section ?? '',
          period_id: base.period ?? '',
          period_code: period.code,
          period_name: period.name,
          period_sequence: period.sequence ?? 0,
          period_kind: period.kind,
          subject_offering_id: deviation?.subject_offering_id ?? base.offering,
          teacher_id: deviation?.substitute_teacher_id ?? base.teacher,
          planned_teacher_id: base.teacher,
          room_id: deviation?.room_id ?? base.room,
          planned_room_id: base.room,
          label: base.label,
          reason: deviation?.reason ?? undefined,
          start_minute: start,
          end_minute: deviation?.end_minute ?? times.end_minute ?? 0,
          times_resolved: true,
        };
      };

      for (const slot of SLOTS) {
        if (slot.day_of_week !== dow || !tableIds.has(slot.timetable_id ?? '')) continue;
        if (q.sectionId && slot.section_id !== q.sectionId) continue;
        const deviation = dayDeviations.find((d) => d.timetable_slot_id === slot.id);
        const row = build(
          { slotId: slot.id, section: slot.section_id, period: slot.period_id, offering: slot.subject_offering_id, teacher: slot.teacher_id, room: slot.room_id, label: slot.label },
          deviation,
        );
        if (!row) continue;
        const involves = row.teacher_id === q.teacherId || row.planned_teacher_id === q.teacherId;
        if (q.teacherId && !involves) continue;
        out.push(row);
      }

      for (const deviation of dayDeviations.filter((d) => d.kind === 'added')) {
        if (q.sectionId && deviation.section_id !== q.sectionId) continue;
        const row = build({ section: deviation.section_id, period: deviation.period_id, offering: deviation.subject_offering_id ?? undefined, teacher: deviation.substitute_teacher_id ?? undefined, room: deviation.room_id ?? undefined }, deviation);
        if (row && (!q.teacherId || row.teacher_id === q.teacherId)) out.push(row);
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start_minute - b.start_minute);
}
