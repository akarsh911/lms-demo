import type { YearEvent, YearEventWrite } from '@/types/foundation';

import { SCHOOL_EVENTS } from './data/events';
import { EXAMS } from './data/exams';
import { SESSIONS } from './data/structure';
import { CALENDAR_DAYS } from './data/timetable';
import { seedId } from './ids';
import { fail, must } from './rows';

const day = (iso: string | undefined): string => (iso ?? '').slice(0, 10);

// A holiday is one event however many dates it spans: a run of closed days sharing a name.
function holidayRuns(yearId: string): YearEvent[] {
  const closed = CALENDAR_DAYS.filter((d) => d.academic_session_id === yearId && (d.day_type === 'holiday' || d.day_type === 'vacation') && d.name)
    .sort((a, b) => day(a.calendar_date).localeCompare(day(b.calendar_date)));
  const runs: YearEvent[] = [];
  for (const row of closed) {
    const last = runs[runs.length - 1];
    if (last && last.title === row.name) last.end = day(row.calendar_date);
    else runs.push({ id: seedId('event', yearId, 'holiday', row.name ?? '', day(row.calendar_date)), kind: 'holiday', title: row.name ?? 'Holiday', start: day(row.calendar_date), end: day(row.calendar_date), detail: row.day_type === 'vacation' ? 'School closed' : 'Public holiday', audience: 'Whole school' });
  }
  return runs;
}

export function yearEvents(yearId: string): YearEvent[] {
  must(SESSIONS, yearId, 'academic year');
  const exams: YearEvent[] = EXAMS.filter((exam) => exam.academic_session_id === yearId && exam.assessment_kind !== 'practice').map((exam) => ({
    id: seedId('event', yearId, 'exam', exam.id),
    kind: 'exam',
    title: exam.name ?? 'Examination',
    start: day(exam.start_at),
    end: day(exam.end_at),
    detail: exam.status === 'published' ? 'Timetable published' : 'Dates set, timetable not yet published',
    audience: 'Whole school',
  }));
  const own = SCHOOL_EVENTS.filter((event) => event.academic_session_id === yearId).map(({ academic_session_id: _year, ...event }) => event);
  return [...exams, ...holidayRuns(yearId), ...own].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

export function createEvent(yearId: string, body: YearEventWrite): YearEvent {
  const year = must(SESSIONS, yearId, 'academic year');
  if (body.title.trim() === '') fail(422, 'validation_failed', 'An event needs a title.');
  if (body.end < body.start) fail(422, 'validation_failed', 'An event cannot end before it starts.');
  if (body.start < day(year.start_date) || body.end > day(year.end_date)) fail(422, 'outside_year', 'An event has to fall inside the academic year.');
  const made = { ...body, title: body.title.trim(), id: seedId('event', yearId, body.kind, body.title, body.start, String(Date.now())), academic_session_id: yearId };
  SCHOOL_EVENTS.push(made);
  return made;
}
