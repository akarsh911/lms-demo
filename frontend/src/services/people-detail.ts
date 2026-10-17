import { config } from '@/config';
import * as classroom from '@/fixtures/classroom';
import { ASSIGNMENTS, SUBJECT_ENROLLMENTS, SUBMISSIONS } from '@/fixtures/data/classroom';
import { ENROLLMENTS } from '@/fixtures/data/enrollment';
import { OFFERINGS, SECTIONS, SUBJECTS } from '@/fixtures/data/structure';
import { BELL_PERIODS, CALENDAR_DAY_SCHEDULES, PERIODS, TEACHER_ASSIGNMENTS } from '@/fixtures/data/timetable';
import { page } from '@/fixtures/rows';

import { coreApi } from './api';
import { dev, devList } from './dev-bypass';
import type {
  AssignmentRow,
  AssignmentSubmissionRow,
  AttendanceDayRow,
  AttendancePeriodRow,
  BellSchedulePeriodRow,
  CalendarDayRow,
  CalendarDayScheduleRow,
  DetailPage,
  OccurrenceAnswer,
  PeriodRow,
  StreamPostRow,
  StudentEnrollmentRow,
  SubjectEnrollmentRow,
  SubjectRow,
  TeacherAssignmentRow,
} from '@/types/people-detail';
import type { SubjectOfferingRow } from '@/types/academic';
import type { PageInfo } from '@/types/roster';

interface ListEnvelope {
  count?: number;
  page?: PageInfo;
  [key: string]: unknown;
}

export type ListFilters = Record<string, string | number | boolean | undefined>;

async function list<T>(
  path: string,
  key: string,
  filters: ListFilters,
  signal?: AbortSignal,
): Promise<DetailPage<T>> {
  const body = await coreApi.get<ListEnvelope>(path, filters, signal);
  const rows = body[key];
  const limit = typeof filters.limit === 'number' ? filters.limit : 0;
  const offset = typeof filters.offset === 'number' ? filters.offset : 0;
  return {
    rows: Array.isArray(rows) ? (rows as T[]) : [],
    count: typeof body.count === 'number' ? body.count : 0,
    page: body.page ?? { limit, offset, has_more: false },
  };
}

export const MAX_TARGET_IDS = 200;

export function targetIdParam(ids: readonly string[]): string | undefined {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, MAX_TARGET_IDS);
  return unique.length > 0 ? unique.join(',') : undefined;
}

// The real handler expands the section and the offering on each row; the fixture rows carry the ids only, so the edges are joined here.
const sectionById = new Map(SECTIONS.map((section) => [section.id, section]));
const offeringById = new Map(OFFERINGS.map((offering) => [offering.id, offering]));
const withSection = (rows: StudentEnrollmentRow[]): StudentEnrollmentRow[] => rows.map((row) => ({ ...row, edges: { ...row.edges, section: sectionById.get(row.section_id ?? '') } }));
const withOffering = (rows: SubjectEnrollmentRow[]): SubjectEnrollmentRow[] => rows.map((row) => ({ ...row, edges: { ...row.edges, subject_offering: offeringById.get(row.subject_offering_id ?? '') } }));

export const peopleDetailService = {
  listStudentEnrollments: (studentId: string, filters: ListFilters, signal?: AbortSignal) =>
    config.devBypass
      ? devList<StudentEnrollmentRow>(ENROLLMENTS, { ...filters, student_id: studentId }).then((result) => ({ ...result, rows: withSection(result.rows) }))
      : list<StudentEnrollmentRow>(
          'enrollments',
          'enrollments',
          { ...filters, student_id: studentId },
          signal,
        ),

  listSubjectEnrollments: (studentId: string, filters: ListFilters, signal?: AbortSignal) =>
    config.devBypass
      ? devList<SubjectEnrollmentRow>(SUBJECT_ENROLLMENTS, { ...filters, student_id: studentId }).then((result) => ({ ...result, rows: withOffering(result.rows) }))
      : list<SubjectEnrollmentRow>(
          'subject-enrollments',
          'subject_enrollments',
          { ...filters, student_id: studentId },
          signal,
        ),

  listTeacherAssignments: (teacherId: string, filters: ListFilters, signal?: AbortSignal) =>
    config.devBypass
      ? devList<TeacherAssignmentRow>(TEACHER_ASSIGNMENTS, { ...filters, teacher_id: teacherId })
      : list<TeacherAssignmentRow>(
          'teacher-assignments',
          'teacher_assignments',
          { ...filters, teacher_id: teacherId },
          signal,
        ),

  listAttendanceDays: (filters: ListFilters, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => classroom.attendanceDays(filters))
      : list<AttendanceDayRow>('attendance/days', 'attendance_days', filters, signal),

  listAttendancePeriods: (filters: ListFilters, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => classroom.attendancePeriods(filters))
      : list<AttendancePeriodRow>('attendance/periods', 'attendance_periods', filters, signal),

  listAssignments: (filters: ListFilters, signal?: AbortSignal) =>
    config.devBypass
      ? devList<AssignmentRow>(ASSIGNMENTS, filters)
      : list<AssignmentRow>('assignments', 'assignments', filters, signal),

  listSubmissions: (filters: ListFilters, signal?: AbortSignal) =>
    config.devBypass
      ? devList<AssignmentSubmissionRow>(SUBMISSIONS, filters)
      : list<AssignmentSubmissionRow>(
          'assignment-submissions',
          'assignment_submissions',
          filters,
          signal,
        ),

  listStreamPosts: (filters: ListFilters, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => classroom.streamPosts(filters))
      : list<StreamPostRow>('stream-posts', 'stream_posts', filters, signal),

  listSubjects: (filters: ListFilters, signal?: AbortSignal) =>
    config.devBypass
      ? devList<SubjectRow>(SUBJECTS, filters)
      : list<SubjectRow>('subjects', 'subjects', filters, signal),

  resolveOccurrences: (filters: ListFilters, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => classroom.occurrences<OccurrenceAnswer>(filters))
      : coreApi.get<OccurrenceAnswer>('timetable-occurrences', filters, signal),

  listOfferings: (filters: ListFilters, signal?: AbortSignal) =>
    config.devBypass
      ? devList<SubjectOfferingRow>(OFFERINGS, filters)
      : list<SubjectOfferingRow>('subject-offerings', 'subject_offerings', filters, signal),

  listCalendarDays: (filters: ListFilters, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => page<CalendarDayRow>(classroom.calendarDays(filters), { limit: filters.limit, offset: filters.offset }))
      : list<CalendarDayRow>('calendar-days', 'calendar_days', filters, signal),

  listCalendarDaySchedules: (dayId: string, filters: ListFilters, signal?: AbortSignal) =>
    config.devBypass
      ? devList<CalendarDayScheduleRow>(CALENDAR_DAY_SCHEDULES, { ...filters, calendar_day_id: dayId })
      : list<CalendarDayScheduleRow>(
          `calendar-days/${dayId}/schedules`,
          'calendar_day_schedules',
          filters,
          signal,
        ),

  listSchemePeriods: (schemeId: string, filters: ListFilters, signal?: AbortSignal) =>
    config.devBypass
      ? devList<PeriodRow>(PERIODS, { ...filters, period_scheme_id: schemeId })
      : list<PeriodRow>(`period-schemes/${schemeId}/periods`, 'periods', filters, signal),

  listBellSchedulePeriods: (bellId: string, filters: ListFilters, signal?: AbortSignal) =>
    config.devBypass
      ? devList<BellSchedulePeriodRow>(BELL_PERIODS, { ...filters, bell_schedule_id: bellId })
      : list<BellSchedulePeriodRow>(
          `bell-schedules/${bellId}/periods`,
          'bell_schedule_periods',
          filters,
          signal,
        ),
};
