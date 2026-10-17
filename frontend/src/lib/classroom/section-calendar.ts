import type { OccurrenceRow } from '@/types/classroom';
import type {
  DeviationCreate,
  DeviationKind,
  DeviationPatch,
  ExamSittingRow,
  SectionCalendarDay,
} from '@/types/section-calendar';
import type { Period } from '@/types/school';

export type SessionState = 'open' | 'closed' | 'unscheduled' | 'unknown';

export function sessionStateOf(day: SectionCalendarDay | undefined): SessionState {
  if (!day) return 'unscheduled';
  if (day.in_session === null || day.in_session === undefined) return 'unknown';
  if (day.in_session) return 'open';
  return day.calendar_day_id ? 'closed' : 'unscheduled';
}

export type HalvesState = 'both' | 'forenoon' | 'afternoon' | 'neither' | 'unknown';

export function halvesOf(day: SectionCalendarDay | undefined): HalvesState {
  const forenoon = day?.forenoon_open;
  const afternoon = day?.afternoon_open;
  if (typeof forenoon !== 'boolean' || typeof afternoon !== 'boolean') return 'unknown';
  if (forenoon && afternoon) return 'both';
  if (forenoon) return 'forenoon';
  if (afternoon) return 'afternoon';
  return 'neither';
}

export function schemeOf(days: readonly SectionCalendarDay[]): string | null {
  const tally = new Map<string, number>();
  for (const day of days) {
    for (const schedule of day.schedules ?? []) {
      const id = schedule.period_scheme_id;
      if (id) tally.set(id, (tally.get(id) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of tally) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

export function cellKey(date: string, periodId: string): string {
  return `${date}|${periodId}`;
}

export function dayIndex(
  days: readonly SectionCalendarDay[],
): Map<string, SectionCalendarDay> {
  return new Map(days.map((day) => [day.date, day]));
}

export function lessonsByCell(
  days: readonly SectionCalendarDay[],
): Map<string, OccurrenceRow[]> {
  const out = new Map<string, OccurrenceRow[]>();
  for (const day of days) {
    for (const lesson of day.lessons ?? []) {
      if (!lesson.period_id) continue;
      const key = cellKey(day.date, lesson.period_id);
      const bucket = out.get(key) ?? [];
      bucket.push(lesson);
      out.set(key, bucket);
    }
  }
  for (const bucket of out.values()) {
    bucket.sort((a, b) => (a.start_minute ?? 0) - (b.start_minute ?? 0));
  }
  return out;
}

export function sittingsByCell(
  days: readonly SectionCalendarDay[],
): Map<string, ExamSittingRow[]> {
  const out = new Map<string, ExamSittingRow[]>();
  for (const day of days) {
    for (const sitting of day.exam_sittings ?? []) {
      if (!sitting.period_id) continue;
      const key = cellKey(day.date, sitting.period_id);
      const bucket = out.get(key) ?? [];
      bucket.push(sitting);
      out.set(key, bucket);
    }
  }
  return out;
}

export interface PeriodAxisRow {
  id: string;
  name: string;
  sequence: number;
  kind?: string;
  startMinute?: number;
  endMinute?: number;
}

export function periodAxis(
  days: readonly SectionCalendarDay[],
  schemePeriods: readonly Period[],
): PeriodAxisRow[] {
  const rows = new Map<string, PeriodAxisRow>();

  for (const period of schemePeriods) {
    rows.set(period.id, {
      id: period.id,
      name: period.name ?? period.code ?? `Period ${period.sequence ?? ''}`.trim(),
      sequence: period.sequence ?? Number.MAX_SAFE_INTEGER,
      kind: period.kind,
    });
  }

  for (const day of days) {
    for (const lesson of day.lessons ?? []) {
      if (!lesson.period_id) continue;
      const known = rows.get(lesson.period_id);
      const named =
        lesson.period_name ??
        lesson.period_code ??
        known?.name ??
        `Period ${lesson.period_sequence ?? ''}`.trim();
      rows.set(lesson.period_id, {
        id: lesson.period_id,
        name: named === '' ? 'Period' : named,
        sequence: lesson.period_sequence ?? known?.sequence ?? Number.MAX_SAFE_INTEGER,
        kind: lesson.period_kind ?? known?.kind,
        startMinute: lesson.times_resolved
          ? (lesson.start_minute ?? known?.startMinute)
          : known?.startMinute,
        endMinute: lesson.times_resolved
          ? (lesson.end_minute ?? known?.endMinute)
          : known?.endMinute,
      });
    }
    for (const sitting of day.exam_sittings ?? []) {
      if (!sitting.period_id || rows.has(sitting.period_id)) continue;
      rows.set(sitting.period_id, {
        id: sitting.period_id,
        name: 'Period',
        sequence: Number.MAX_SAFE_INTEGER,
      });
    }
  }

  return [...rows.values()].sort(
    (a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name),
  );
}

export interface DayTally {
  lessons: number;
  cancelled: number;
  changed: number;
  sittings: number;
}

export function tallyOf(day: SectionCalendarDay | undefined): DayTally {
  const lessons = day?.lessons ?? [];
  return {
    lessons: lessons.length,
    cancelled: lessons.filter((lesson) => lesson.state === 'cancelled').length,
    changed: lessons.filter(
      (lesson) => lesson.state !== 'planned' && lesson.state !== 'cancelled',
    ).length,
    sittings: (day?.exam_sittings ?? []).length,
  };
}

export interface DeviationDraft {
  kind: DeviationKind;
  date: string;
  slotId?: string;
  sectionId: string;
  periodId: string;
  offeringId?: string;
  substituteTeacherId?: string;
  roomId?: string;
  startMinute?: number;
  endMinute?: number;
  reason?: string;
}

export function kindNeedsSlot(kind: DeviationKind): boolean {
  return kind !== 'added';
}

function spanGiven(draft: DeviationDraft): boolean {
  return typeof draft.startMinute === 'number' || typeof draft.endMinute === 'number';
}

export function spanValid(draft: DeviationDraft): boolean {
  const { startMinute: start, endMinute: end } = draft;
  if (typeof start !== 'number' || typeof end !== 'number') return false;
  return start >= 0 && end <= 1440 && end > start;
}

export function draftComplete(draft: DeviationDraft): boolean {
  switch (draft.kind) {
    case 'cancelled':
      return Boolean(draft.slotId);
    case 'substitution':
      return Boolean(draft.slotId && draft.substituteTeacherId);
    case 'room_change':
      return Boolean(draft.slotId && draft.roomId);
    case 'time_change':
      return Boolean(draft.slotId) && spanValid(draft);
    case 'added':
      return (
        Boolean(draft.sectionId && draft.periodId && draft.offeringId) &&
        (!spanGiven(draft) || spanValid(draft))
      );
  }
}

export function deviationCreateFrom(draft: DeviationDraft): DeviationCreate {
  const reason = draft.reason?.trim();
  const base = {
    deviation_date: draft.date,
    kind: draft.kind,
    ...(reason ? { reason } : {}),
  };

  if (draft.kind === 'added') {
    return {
      ...base,
      section_id: draft.sectionId,
      period_id: draft.periodId,
      ...(draft.offeringId ? { subject_offering_id: draft.offeringId } : {}),
      ...(draft.substituteTeacherId
        ? { substitute_teacher_id: draft.substituteTeacherId }
        : {}),
      ...(draft.roomId ? { room_id: draft.roomId } : {}),
      ...(spanValid(draft)
        ? { start_minute: draft.startMinute, end_minute: draft.endMinute }
        : {}),
    };
  }

  return {
    ...base,
    ...(draft.slotId ? { timetable_slot_id: draft.slotId } : {}),
    ...(draft.kind === 'substitution' && draft.substituteTeacherId
      ? { substitute_teacher_id: draft.substituteTeacherId }
      : {}),
    ...(draft.kind === 'room_change' && draft.roomId ? { room_id: draft.roomId } : {}),
    ...(draft.kind === 'time_change' && spanValid(draft)
      ? { start_minute: draft.startMinute, end_minute: draft.endMinute }
      : {}),
  };
}

export function deviationPatchFrom(draft: DeviationDraft): DeviationPatch {
  const reason = draft.reason?.trim();
  const added = draft.kind === 'added';
  const carriesSubstitute = added || draft.kind === 'substitution';
  const carriesRoom = added || draft.kind === 'room_change';
  const carriesSpan = (added || draft.kind === 'time_change') && spanValid(draft);

  return {
    kind: draft.kind,
    ...(added && draft.offeringId ? { subject_offering_id: draft.offeringId } : {}),
    substitute_teacher_id:
      carriesSubstitute && draft.substituteTeacherId ? draft.substituteTeacherId : null,
    room_id: carriesRoom && draft.roomId ? draft.roomId : null,
    start_minute: carriesSpan ? (draft.startMinute ?? null) : null,
    end_minute: carriesSpan ? (draft.endMinute ?? null) : null,
    reason: reason ? reason : null,
  };
}
