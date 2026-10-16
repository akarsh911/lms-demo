/** Wire types for the timetable service. */

export interface TimetablePeriod {
  id: string;
  startsAt: string;
  endsAt: string;
  subject: string;
  room: string | null;
  teacherName: string | null;
  // The class taught, on a teacher's day where it changes period to period.
  section?: string | null;
}

export interface TimetableDay {
  date: string;
  periods: TimetablePeriod[];
}

export type TimelineKind = 'lesson' | 'free' | 'break' | 'extra' | 'leave';

// One block of a day on a timeline: a lesson, a free period, a break, an extra class, or a day away.
export interface TimelineSlot {
  id: string;
  kind: TimelineKind;
  name: string;
  start: number;
  end: number;
  subject: string | null;
  section_id: string | null;
  grade_level_id: string | null;
  label: string | null;
  offering_id: string | null;
  room: string | null;
  teacher: string | null;
  cover: boolean;
  cancelled: boolean;
  // The class teacher's first period in her own class, where the register is taken.
  register: boolean;
  // For a register period: whether that day's register has been taken.
  taken: boolean;
  note: string | null;
}

export interface TimelineDay {
  date: string;
  open: boolean;
  closed_for: string | null;
  // The caller's approved leave covering this day, if any.
  away: { kind: string; reason: string; half_day: boolean } | null;
  slots: TimelineSlot[];
}

export interface TimelineWeek {
  week_of: string;
  today: string;
  days: TimelineDay[];
}
