import { config } from '@/config';
import { calendarDays } from '@/fixtures/classroom';
import { PERSONS } from '@/fixtures/data/people';
import {
  BRANCHES,
  CURRENT_SESSION,
  GRADE_LEVELS,
  GRADING_SCHEMES,
  OFFERINGS,
  ROOMS,
  SECTIONS,
  SESSIONS,
} from '@/fixtures/data/structure';
import {
  BELLS,
  BELL_PERIODS,
  CALENDAR_DAYS,
  CALENDAR_DAY_SCHEDULES,
  PERIODS,
  PERIOD_SCHEMES,
  SCHEME_GRADES,
  SLOTS,
  TEACHER_ASSIGNMENTS,
  TIMETABLES,
} from '@/fixtures/data/timetable';
import { where } from '@/fixtures/rows';
import * as week from '@/fixtures/week';

import { coreApi } from './api';
import { dev, devCreate, devDelete, devGet, devList, devPatch } from './dev-bypass';
import type {
  AcademicSessionRow,
  BellSchedule,
  BellSchedulePeriod,
  BellScheduleWrite,
  BranchRow,
  CalendarDay,
  CalendarDayCreate,
  CalendarDayPatch,
  CalendarDaySchedule,
  ClashProposal,
  ClashReport,
  Period,
  PeriodScheme,
  PeriodSchemePatch,
  PeriodSchemeWrite,
  PeriodWrite,
  Room,
  RoomWrite,
  SchoolOfferingRow,
  SchoolPage,
  SectionRow,
  SlotWrite,
  TeacherAssignmentRow,
  Timetable,
  TimetableSlot,
  PeriodSchemeGradeLevel,
  GradeLevelRef,
  GradingScheme,
} from '@/types/school';
import type { GenerationJob, GenerationRequest } from '@/types/timetable-generation';
import type { PageInfo } from '@/types/roster';
import type { CorePerson } from '@/types/core';

/**
 * The school-administrator surface of `emerge-core`: the calendar, the shape of
 * the day, the rooms and the week.
 *
 * Transport only, like every other service file. Paths are relative to
 * `CORE_API_URL`, which carries the `/api/v1` prefix; the tenant header is
 * attached by the proxy from the sealed session and cannot be expressed here.
 *
 * ## `limit` above 200 is silently 50
 *
 * `filter.Params.Page` falls back to the DEFAULT page size when the requested
 * limit exceeds the maximum, rather than clamping to it
 * (`internal/data/filter/parse.go:106`). So `?limit=300` returns fifty rows and
 * `has_more`, which reads exactly like a short list. Everything here asks for
 * `MAX_PAGE` at most and pages properly.
 */

export const MAX_PAGE = 200;

interface ListEnvelope {
  count?: number;
  page?: PageInfo;
  [key: string]: unknown;
}

export type ListQuery = Record<string, string | number | boolean | undefined>;

async function list<T>(
  path: string,
  key: string,
  query: ListQuery,
  signal?: AbortSignal,
): Promise<SchoolPage<T>> {
  const body = await coreApi.get<ListEnvelope>(path, query, signal);
  const rows = body[key];
  const limit = typeof query.limit === 'number' ? query.limit : 0;
  const offset = typeof query.offset === 'number' ? query.offset : 0;
  return {
    rows: Array.isArray(rows) ? (rows as T[]) : [],
    count: typeof body.count === 'number' ? body.count : 0,
    page: body.page ?? { limit, offset, has_more: false },
  };
}

/**
 * Every row, followed to the end.
 *
 * The endpoints report `has_more` and no total, so a caller that wants all of
 * something has to walk. Bounded at ten pages: a section week is 246 slots
 * today, and a runaway loop against a paging bug is worse than a short answer.
 */
async function listAll<T>(
  path: string,
  key: string,
  query: ListQuery,
  signal?: AbortSignal,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 10; page += 1) {
    const answer = await list<T>(
      path,
      key,
      { ...query, limit: MAX_PAGE, offset: page * MAX_PAGE },
      signal,
    );
    out.push(...answer.rows);
    if (!answer.page.has_more || answer.rows.length === 0) break;
  }
  return out;
}

const ALL = { limit: MAX_PAGE };

// Sections, offerings and teaching answer for the current session unless one is named, as the real routes do.
const thisYear = (query: ListQuery): ListQuery =>
  query.all_sessions ? query : { academic_session_id: CURRENT_SESSION.id, ...query };

// Facilities, notes and the unavailable window have no column in emerge-core, so the real route is never sent them.
function roomColumns(body: RoomWrite): RoomWrite {
  const { facilities: _facilities, notes: _notes, unavailable: _unavailable, ...columns } = body;
  return columns;
}

export const schoolService = {
  listBranches: (signal?: AbortSignal) =>
    config.devBypass
      ? devList<BranchRow>(BRANCHES, ALL)
      : list<BranchRow>('branches', 'branches', { limit: MAX_PAGE, offset: 0 }, signal),

  listAcademicSessions: (signal?: AbortSignal) =>
    config.devBypass
      ? devList<AcademicSessionRow>(SESSIONS, ALL)
      : list<AcademicSessionRow>(
          'academic-sessions',
          'academic_sessions',
          { limit: MAX_PAGE, offset: 0 },
          signal,
        ),

  // --- the year ------------------------------------------------------------

  listCalendarDays: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => calendarDays(query))
      : listAll<CalendarDay>('calendar-days', 'calendar_days', query, signal),

  getCalendarDay: (id: string, signal?: AbortSignal) =>
    config.devBypass
      ? devGet(CALENDAR_DAYS, id)
      : coreApi.get<CalendarDay>(`calendar-days/${id}`, undefined, signal),

  createCalendarDay: (body: CalendarDayCreate) =>
    config.devBypass ? devCreate(CALENDAR_DAYS, body) : coreApi.post<CalendarDay>('calendar-days', body),

  updateCalendarDay: (id: string, patch: CalendarDayPatch) =>
    config.devBypass
      ? devPatch(CALENDAR_DAYS, id, patch)
      : coreApi.patch<CalendarDay>(`calendar-days/${id}`, patch),

  deleteCalendarDay: (id: string) =>
    config.devBypass ? devDelete(CALENDAR_DAYS, id) : coreApi.delete<void>(`calendar-days/${id}`),

  listDaySchedules: (dayId: string, signal?: AbortSignal) =>
    config.devBypass
      ? devList(CALENDAR_DAY_SCHEDULES, { ...ALL, calendar_day_id: dayId })
      : list<CalendarDaySchedule>(
          `calendar-days/${dayId}/schedules`,
          'calendar_day_schedules',
          { limit: MAX_PAGE, offset: 0 },
          signal,
        ),

  attachDaySchedule: (
    dayId: string,
    body: { period_scheme_id: string; bell_schedule_id: string },
  ) =>
    config.devBypass
      ? devCreate(CALENDAR_DAY_SCHEDULES, { ...body, calendar_day_id: dayId })
      : coreApi.post<CalendarDaySchedule>(`calendar-days/${dayId}/schedules`, body),

  updateDaySchedule: (id: string, body: { bell_schedule_id: string }) =>
    config.devBypass
      ? devPatch(CALENDAR_DAY_SCHEDULES, id, body)
      : coreApi.patch<CalendarDaySchedule>(`calendar-day-schedules/${id}`, body),

  detachDaySchedule: (id: string) =>
    config.devBypass
      ? devDelete(CALENDAR_DAY_SCHEDULES, id)
      : coreApi.delete<void>(`calendar-day-schedules/${id}`),

  // --- the shape of a day --------------------------------------------------

  listPeriodSchemes: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList(PERIOD_SCHEMES, query)
      : list<PeriodScheme>('period-schemes', 'period_schemes', query, signal),

  createPeriodScheme: (body: PeriodSchemeWrite) =>
    config.devBypass ? devCreate(PERIOD_SCHEMES, body) : coreApi.post<PeriodScheme>('period-schemes', body),

  updatePeriodScheme: (id: string, body: PeriodSchemePatch) =>
    config.devBypass
      ? devPatch(PERIOD_SCHEMES, id, body)
      : coreApi.patch<PeriodScheme>(`period-schemes/${id}`, body),

  deletePeriodScheme: (id: string) =>
    config.devBypass ? devDelete(PERIOD_SCHEMES, id) : coreApi.delete<void>(`period-schemes/${id}`),

  listPeriods: (schemeId: string, signal?: AbortSignal) =>
    config.devBypass
      ? devList(PERIODS, { ...ALL, period_scheme_id: schemeId })
      : list<Period>(
          `period-schemes/${schemeId}/periods`,
          'periods',
          { limit: MAX_PAGE, offset: 0 },
          signal,
        ),

  createPeriod: (schemeId: string, body: PeriodWrite) =>
    config.devBypass
      ? devCreate(PERIODS, { ...body, period_scheme_id: schemeId })
      : coreApi.post<Period>(`period-schemes/${schemeId}/periods`, body),

  updatePeriod: (id: string, body: PeriodWrite) =>
    config.devBypass ? devPatch(PERIODS, id, body) : coreApi.patch<Period>(`periods/${id}`, body),

  deletePeriod: (id: string) =>
    config.devBypass ? devDelete(PERIODS, id) : coreApi.delete<void>(`periods/${id}`),

  listBellSchedules: (schemeId: string, signal?: AbortSignal) =>
    config.devBypass
      ? devList(BELLS, { ...ALL, period_scheme_id: schemeId })
      : list<BellSchedule>(
          `period-schemes/${schemeId}/bell-schedules`,
          'bell_schedules',
          { limit: MAX_PAGE, offset: 0 },
          signal,
        ),

  createBellSchedule: (schemeId: string, body: BellScheduleWrite) =>
    config.devBypass
      ? devCreate(BELLS, { ...body, period_scheme_id: schemeId })
      : coreApi.post<BellSchedule>(`period-schemes/${schemeId}/bell-schedules`, body),

  updateBellSchedule: (id: string, body: BellScheduleWrite) =>
    config.devBypass ? devPatch(BELLS, id, body) : coreApi.patch<BellSchedule>(`bell-schedules/${id}`, body),

  deleteBellSchedule: (id: string) =>
    config.devBypass ? devDelete(BELLS, id) : coreApi.delete<void>(`bell-schedules/${id}`),

  listBellPeriods: (bellId: string, signal?: AbortSignal) =>
    config.devBypass
      ? devList(BELL_PERIODS, { ...ALL, bell_schedule_id: bellId })
      : list<BellSchedulePeriod>(
          `bell-schedules/${bellId}/periods`,
          'bell_schedule_periods',
          { limit: MAX_PAGE, offset: 0 },
          signal,
        ),

  createBellPeriod: (
    bellId: string,
    body: { period_id: string; start_minute: number; end_minute: number; runs?: boolean },
  ) =>
    config.devBypass
      ? devCreate(BELL_PERIODS, { ...body, bell_schedule_id: bellId })
      : coreApi.post<BellSchedulePeriod>(`bell-schedules/${bellId}/periods`, body),

  updateBellPeriod: (
    id: string,
    body: { start_minute: number; end_minute: number; runs?: boolean },
  ) =>
    config.devBypass
      ? devPatch(BELL_PERIODS, id, body)
      : coreApi.patch<BellSchedulePeriod>(`bell-schedule-periods/${id}`, body),

  deleteBellPeriod: (id: string) =>
    config.devBypass ? devDelete(BELL_PERIODS, id) : coreApi.delete<void>(`bell-schedule-periods/${id}`),

  listGradingSchemes: (sessionId: string | undefined, signal?: AbortSignal) =>
    config.devBypass
      ? devList(GRADING_SCHEMES, { ...ALL, academic_session_id: sessionId })
      : list<GradingScheme>(
          'grading-schemes',
          'grading_schemes',
          { limit: MAX_PAGE, offset: 0, ...(sessionId ? { academic_session_id: sessionId } : {}) },
          signal,
        ),

  listGradeLevels: (signal?: AbortSignal) =>
    config.devBypass
      ? devList<GradeLevelRef>(GRADE_LEVELS, ALL)
      : list<GradeLevelRef>('grade-levels', 'grade_levels', { limit: MAX_PAGE, offset: 0 }, signal),

  listSchemeGrades: (schemeId: string, signal?: AbortSignal) =>
    config.devBypass
      ? devList(SCHEME_GRADES, { ...ALL, period_scheme_id: schemeId })
      : list<PeriodSchemeGradeLevel>(
          `period-schemes/${schemeId}/grade-levels`,
          'grade_levels',
          { limit: MAX_PAGE, offset: 0 },
          signal,
        ),

  attachSchemeGrades: (schemeId: string, gradeLevelIds: string[]) =>
    config.devBypass
      ? dev(() => week.attachSchemeGrades(schemeId, gradeLevelIds))
      : coreApi.post<{ attached: number }>(`period-schemes/${schemeId}/grade-levels`, {
          grade_level_ids: gradeLevelIds,
        }),

  detachSchemeGrade: (id: string) =>
    config.devBypass ? devDelete(SCHEME_GRADES, id) : coreApi.delete<void>(`period-scheme-grade-levels/${id}`),

  clonePeriodScheme: async (
    schemeId: string,
    body: { name: string; code: string; grade_level_ids?: string[] },
  ) => {
    if (config.devBypass) return dev(() => week.cloneScheme(schemeId, body));
    const created = await coreApi.post<{ period_scheme: PeriodScheme }>(
      `period-schemes/${schemeId}/clone`,
      body,
    );
    return created.period_scheme;
  },

  // --- rooms ---------------------------------------------------------------

  listRooms: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass ? devList(ROOMS, query) : list<Room>('rooms', 'rooms', query, signal),

  createRoom: (body: RoomWrite) =>
    config.devBypass ? devCreate(ROOMS, body) : coreApi.post<Room>('rooms', roomColumns(body)),

  updateRoom: (id: string, body: RoomWrite) =>
    config.devBypass ? devPatch(ROOMS, id, body) : coreApi.patch<Room>(`rooms/${id}`, roomColumns(body)),

  deleteRoom: (id: string) =>
    config.devBypass ? devDelete(ROOMS, id) : coreApi.delete<void>(`rooms/${id}`),

  // --- the week ------------------------------------------------------------

  listTimetables: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass ? devList(TIMETABLES, query) : list<Timetable>('timetables', 'timetables', query, signal),

  listSlots: (timetableId: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => SLOTS.filter((slot) => slot.timetable_id === timetableId))
      : listAll<TimetableSlot>(`timetables/${timetableId}/slots`, 'timetable_slots', {}, signal),

  createSlot: (timetableId: string, body: SlotWrite) =>
    config.devBypass
      ? dev(() => week.createSlot(timetableId, body))
      : coreApi.post<TimetableSlot>(`timetables/${timetableId}/slots`, body),

  updateSlot: (id: string, body: SlotWrite) =>
    config.devBypass
      ? dev(() => week.updateSlot(id, body))
      : coreApi.patch<TimetableSlot>(`timetable-slots/${id}`, body),

  deleteSlot: (id: string) =>
    config.devBypass ? devDelete(SLOTS, id) : coreApi.delete<void>(`timetable-slots/${id}`),

  /**
   * The clash report. 200 whatever it finds, including nothing: this is the
   * live feedback a placement is judged by, not a gate it passes.
   */
  checkClashes: (
    timetableId: string,
    body: { proposed?: ClashProposal[]; exclude_timetable_slot_ids?: string[] },
  ) =>
    config.devBypass
      ? dev(() => week.checkClashes(timetableId, body))
      : coreApi.post<ClashReport>(`timetables/${timetableId}/clash-check`, body),

  generateTimetable: (timetableId: string, body: GenerationRequest) =>
    config.devBypass
      ? dev(() => week.startGeneration(timetableId, body))
      : coreApi.post<GenerationJob>(`timetables/${timetableId}/generate`, body),

  getGeneration: (timetableId: string, jobId: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => week.readGeneration(timetableId, jobId))
      : coreApi.get<GenerationJob>(
          `timetables/${timetableId}/generate/${jobId}`,
          undefined,
          signal,
        ),

  /** One person, for naming whoever accepted an override. */
  getPerson: (id: string, signal?: AbortSignal) =>
    config.devBypass ? devGet(PERSONS, id) : coreApi.get<CorePerson>(`persons/${id}`, undefined, signal),

  // --- what the week has to satisfy ----------------------------------------

  listSections: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList(SECTIONS, thisYear(query))
      : list<SectionRow>('sections', 'sections', query, signal),

  listOfferings: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => where(OFFERINGS, thisYear(query)))
      : listAll<SchoolOfferingRow>('subject-offerings', 'subject_offerings', query, signal),

  listTeacherAssignments: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => where(TEACHER_ASSIGNMENTS, thisYear(query)))
      : listAll<TeacherAssignmentRow>(
          'teacher-assignments',
          'teacher_assignments',
          query,
          signal,
        ),
};
