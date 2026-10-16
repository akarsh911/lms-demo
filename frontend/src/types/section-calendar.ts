import type { OccurrenceRow } from './classroom';

export interface SectionCalendarSchedule {
  period_scheme_id: string;
  bell_schedule_id: string;
}

export interface ExamSittingRow {
  id: string;
  exam_subject_id?: string;
  calendar_day_id?: string;
  period_id?: string;
  section_id?: string;
  room_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SectionCalendarDay {
  date: string;
  day_of_week: number;
  in_session: boolean | null;
  calendar_day_id: string | null;
  day_type?: string;
  name?: string | null;
  forenoon_open: boolean | null;
  afternoon_open: boolean | null;
  schedules: SectionCalendarSchedule[];
  lessons: OccurrenceRow[];
  exam_sittings: ExamSittingRow[];
}

export interface SectionCalendarWindow {
  section_id: string;
  branch_id: string;
  from: string;
  to: string;
  days: SectionCalendarDay[];
  count: number;
  lesson_count: number;
  exam_sitting_count: number;
}

export const DEVIATION_KINDS = [
  'cancelled',
  'substitution',
  'room_change',
  'time_change',
  'added',
] as const;

export type DeviationKind = (typeof DEVIATION_KINDS)[number];

export interface TimetableDeviationRow {
  id: string;
  timetable_slot_id?: string | null;
  deviation_date?: string;
  kind?: DeviationKind;
  section_id?: string;
  period_id?: string;
  subject_offering_id?: string | null;
  substitute_teacher_id?: string | null;
  room_id?: string | null;
  start_minute?: number | null;
  end_minute?: number | null;
  reason?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DeviationCreate {
  deviation_date: string;
  kind: DeviationKind;
  timetable_slot_id?: string;
  section_id?: string;
  period_id?: string;
  subject_offering_id?: string;
  substitute_teacher_id?: string;
  room_id?: string;
  start_minute?: number;
  end_minute?: number;
  reason?: string;
}

export interface DeviationPatch {
  kind: DeviationKind;
  subject_offering_id?: string;
  substitute_teacher_id?: string | null;
  room_id?: string | null;
  start_minute?: number | null;
  end_minute?: number | null;
  reason?: string | null;
}
