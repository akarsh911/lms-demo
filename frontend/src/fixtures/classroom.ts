import type {
  AssignmentCreated,
  AssignmentWrite,
  OccurrenceWindow,
  StreamPostCreated,
  StreamPostRow,
  StreamPostWrite,
} from '@/types/classroom';
import type { AttendanceDayRow, AttendancePeriodRow } from '@/types/people-detail';
import type { CalendarDay } from '@/types/school';
import type { SectionCalendarDay, SectionCalendarWindow } from '@/types/section-calendar';

import { ASSIGNMENTS, ATTENDANCE_DAYS, ATTENDANCE_PERIODS, STREAM_POSTS, attendanceOf } from './data/classroom';
import { EXAM_SITTINGS } from './data/exams';
import { PERSONS } from './data/people';
import { SECTIONS } from './data/structure';
import { CALENDAR_DAYS, CALENDAR_DAY_SCHEDULES } from './data/timetable';
import { caller } from './identity';
import { newId } from './ids';
import { resolveOccurrences } from './occurrences';
import { byId, fail, insert, must, page, where, type Page, type Query } from './rows';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

const inRange = (value: string | undefined, query: Query): boolean => {
  const date = (value ?? '').slice(0, 10);
  const from = text(query.from);
  const to = text(query.to);
  return (!from || date >= from) && (!to || date <= to);
};

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`) && out.length < MAX_DAYS; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

// Accepts a single `date`, or a `from`/`to` window, as the real resolver does.
export function occurrences<T = OccurrenceWindow>(query: Query): T {
  const date = text(query.date);
  const from = date ?? text(query.from) ?? '';
  const to = date ?? text(query.to) ?? '';
  if (!DATE.test(from) || !DATE.test(to)) fail(422, 'invalid_input', 'from and to (YYYY-MM-DD), or date, are required');

  const rows = resolveOccurrences({
    branchId: text(query.branch_id),
    sectionId: text(query.section_id),
    teacherId: text(query.teacher_id),
    from,
    to,
  });
  return { occurrences: rows, count: rows.length, branch_id: text(query.branch_id), from, to, half: text(query.half) ?? '' } as T;
}

export function calendarWindow(sectionId: string, from: string, to: string): SectionCalendarWindow {
  const section = must(SECTIONS, sectionId, 'section');
  if (!DATE.test(from) || !DATE.test(to)) fail(422, 'invalid_input', 'from and to (YYYY-MM-DD) are required');

  const branchId = section.branch_id ?? '';
  const lessons = resolveOccurrences({ branchId, sectionId: section.id, from, to });
  const days: SectionCalendarDay[] = eachDate(from, to).map((date) => {
    const row = CALENDAR_DAYS.find((d) => d.branch_id === branchId && (d.calendar_date ?? '').startsWith(date));
    return {
      date,
      day_of_week: ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1,
      in_session: row ? Boolean(row.forenoon_open || row.afternoon_open) : null,
      calendar_day_id: row?.id ?? null,
      day_type: row?.day_type,
      name: row?.name ?? null,
      forenoon_open: row ? (row.forenoon_open ?? false) : null,
      afternoon_open: row ? (row.afternoon_open ?? false) : null,
      schedules: row
        ? CALENDAR_DAY_SCHEDULES.filter((s) => s.calendar_day_id === row.id).map((s) => ({
            period_scheme_id: s.period_scheme_id ?? '',
            bell_schedule_id: s.bell_schedule_id ?? '',
          }))
        : [],
      lessons: lessons.filter((l) => l.date === date),
      exam_sittings: row ? EXAM_SITTINGS.filter((x) => x.section_id === section.id && x.calendar_day_id === row.id) : [],
    };
  });
  return {
    section_id: section.id,
    branch_id: branchId,
    from,
    to,
    days,
    count: days.length,
    lesson_count: lessons.length,
    exam_sitting_count: days.reduce((n, d) => n + d.exam_sittings.length, 0),
  };
}

// `from` and `to` bound the date; every other key is an ordinary column filter.
export const calendarDays = (query: Query): CalendarDay[] =>
  where(
    CALENDAR_DAYS.filter((day) => inRange(day.calendar_date, query)),
    query,
  );

const isLive = (post: StreamPostRow, now: string): boolean =>
  post.status === 'published' && (post.published_at ?? '') <= now && (!post.expires_at || post.expires_at > now);

// Pinned first, then newest; `target_id` is a comma-separated list and `live` drops drafts and expired posts.
export function streamPosts(query: Query): Page<StreamPostRow> {
  const targets = new Set((text(query.target_id) ?? '').split(',').filter(Boolean));
  const live = String(query.live) === 'true';
  const now = new Date().toISOString();
  const rows = STREAM_POSTS.filter((p) => targets.size === 0 || (p.edges?.targets ?? []).some((t) => targets.has(t.target_id ?? '')))
    .filter((p) => !live || isLive(p, now))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.published_at ?? '').localeCompare(a.published_at ?? ''))
    .map((post) => ({ ...post, edges: { ...post.edges, author: byId(PERSONS, post.author_person_id) } }));
  return page(rows, { limit: query.limit, offset: query.offset });
}

export function createStreamPost(body: StreamPostWrite): StreamPostCreated {
  if (typeof body.body !== 'string') fail(422, 'invalid_input', 'body is required');
  const id = newId();
  const targets = (body.targets ?? []).map((target) => ({
    id: newId(),
    post_id: id,
    target_type: String(target.target_type ?? ''),
    target_id: String(target.target_id ?? ''),
  }));
  const { targets: _targets, ...fields } = body;
  const post = insert(STREAM_POSTS, {
    ...fields,
    id,
    author_person_id: caller().personId,
    post_type: body.post_type ?? 'announcement',
    pinned: body.pinned ?? false,
    published_at: body.published_at ?? new Date().toISOString(),
    status: body.status ?? 'published',
    edges: { targets },
  } as Omit<StreamPostRow, 'id'> & { id: string });
  return { stream_post: post, targets } as StreamPostCreated;
}

export function createAssignment(body: AssignmentWrite): AssignmentCreated {
  if (typeof body.title !== 'string') fail(422, 'invalid_input', 'title is required');
  const { targets: asked, ...fields } = body;
  const assignment = insert(ASSIGNMENTS, { ...fields, teacher_id: caller().teacherId, status: body.status ?? 'draft' } as Omit<
    (typeof ASSIGNMENTS)[number],
    'id'
  >);
  const targets = (asked ?? []).map((target) => ({
    id: newId(),
    assignment_id: assignment.id,
    target_type: target.target_type,
    target_id: target.target_id,
  }));
  return { assignment, targets } as AssignmentCreated;
}

export const attendanceDays = (query: Query): Page<AttendanceDayRow> =>
  page(
    (typeof query.student_id === 'string' && query.student_id ? attendanceOf(query.student_id) : ATTENDANCE_DAYS).filter((row) => inRange(row.attendance_date, query)),
    { limit: query.limit, offset: query.offset, student_id: query.student_id, section_id: query.section_id },
  );

export const attendancePeriods = (query: Query): Page<AttendancePeriodRow> =>
  page(
    ATTENDANCE_PERIODS.filter((row) => inRange(row.attendance_date, query)),
    { limit: query.limit, offset: query.offset, student_id: query.student_id, subject_offering_id: query.subject_offering_id },
  );
