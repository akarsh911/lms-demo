'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ROSTER_PAGE_SIZE } from '@/constants/roster';
import { rosterService } from '@/services/roster';
import { schoolService, MAX_PAGE } from '@/services/school';
import type { ApiError } from '@/services/api';
import type { RosterPage, TeacherRow } from '@/types/roster';
import type { CorePerson } from '@/types/core';
import type {
  AcademicSessionRow,
  ClashReport,
  BellSchedule,
  BellSchedulePeriod,
  BranchRow,
  CalendarDay,
  GradeLevelRef,
  GradingScheme,
  CalendarDaySchedule,
  Period,
  PeriodScheme,
  PeriodSchemeGradeLevel,
  Room,
  SchoolOfferingRow,
  SchemeBellLinks,
  SchemeGradeLinks,
  SchoolPage,
  SectionRow,
  TeacherAssignmentRow,
  Timetable,
  TimetableSlot,
} from '@/types/school';

/**
 * Reads for the school-administrator screens.
 *
 * Every one is `enabled` on the id it needs, so a screen renders its pickers
 * before anything below them has been chosen rather than firing a request with
 * an empty filter — emerge-core reads `branch_id=` as absent for some
 * parameters and refuses it with a 400 for others, and neither is what the
 * screen meant.
 */

export function useBranches() {
  return useQuery<SchoolPage<BranchRow>, ApiError>({
    queryKey: queryKeys.school.branches(),
    queryFn: ({ signal }) => schoolService.listBranches(signal),
  });
}

/**
 * The academic sessions. The one flagged `is_current` is the year every other
 * list here defaults to, and it is what a new calendar day is created under.
 */
export function useAcademicSessions() {
  return useQuery<SchoolPage<AcademicSessionRow>, ApiError>({
    queryKey: queryKeys.school.sessions(),
    queryFn: ({ signal }) => schoolService.listAcademicSessions(signal),
  });
}

export function useCalendarDays(branchId: string | null, from: string, to: string) {
  return useQuery<CalendarDay[], ApiError>({
    queryKey: queryKeys.school.calendarDays(branchId ?? '', from, to),
    queryFn: ({ signal }) =>
      schoolService.listCalendarDays({ branch_id: branchId!, from, to }, signal),
    enabled: Boolean(branchId) && from !== '' && to !== '',
  });
}

export function useDaySchedules(dayId: string | null) {
  return useQuery<SchoolPage<CalendarDaySchedule>, ApiError>({
    queryKey: queryKeys.school.daySchedules(dayId ?? ''),
    queryFn: ({ signal }) => schoolService.listDaySchedules(dayId!, signal),
    enabled: Boolean(dayId),
  });
}

export function usePeriodSchemes(branchId: string | null) {
  return useQuery<SchoolPage<PeriodScheme>, ApiError>({
    queryKey: queryKeys.school.schemes(branchId ?? ''),
    queryFn: ({ signal }) =>
      schoolService.listPeriodSchemes(
        { branch_id: branchId!, limit: MAX_PAGE, offset: 0 },
        signal,
      ),
    enabled: Boolean(branchId),
  });
}

export function usePeriods(schemeId: string | null) {
  return useQuery<SchoolPage<Period>, ApiError>({
    queryKey: queryKeys.school.periods(schemeId ?? ''),
    queryFn: ({ signal }) => schoolService.listPeriods(schemeId!, signal),
    enabled: Boolean(schemeId),
  });
}

export function useBellSchedules(schemeId: string | null) {
  return useQuery<SchoolPage<BellSchedule>, ApiError>({
    queryKey: queryKeys.school.bells(schemeId ?? ''),
    queryFn: ({ signal }) => schoolService.listBellSchedules(schemeId!, signal),
    enabled: Boolean(schemeId),
  });
}

export function useBellPeriods(bellId: string | null) {
  return useQuery<SchoolPage<BellSchedulePeriod>, ApiError>({
    queryKey: queryKeys.school.bellPeriods(bellId ?? ''),
    queryFn: ({ signal }) => schoolService.listBellPeriods(bellId!, signal),
    enabled: Boolean(bellId),
  });
}

export function useSchemeGrades(schemeId: string | null) {
  return useQuery<SchoolPage<PeriodSchemeGradeLevel>, ApiError>({
    queryKey: queryKeys.school.schemeGrades(schemeId ?? ''),
    queryFn: ({ signal }) => schoolService.listSchemeGrades(schemeId!, signal),
    enabled: Boolean(schemeId),
  });
}

export function useBranchSchemeGrades(schemeIds: readonly string[]) {
  const identity = [...schemeIds].sort().join(',');
  return useQuery<SchemeGradeLinks[], ApiError>({
    queryKey: queryKeys.school.branchSchemeGrades(identity),
    queryFn: ({ signal }) =>
      Promise.all(
        schemeIds.map(async (schemeId) => ({
          schemeId,
          rows: (await schoolService.listSchemeGrades(schemeId, signal)).rows,
        })),
      ),
    enabled: schemeIds.length > 0,
  });
}

export function useBranchSchemeBells(schemeIds: readonly string[]) {
  const identity = [...schemeIds].sort().join(',');
  return useQuery<SchemeBellLinks[], ApiError>({
    queryKey: queryKeys.school.branchSchemeBells(identity),
    queryFn: ({ signal }) =>
      Promise.all(
        schemeIds.map(async (schemeId) => ({
          schemeId,
          rows: (await schoolService.listBellSchedules(schemeId, signal)).rows,
        })),
      ),
    enabled: schemeIds.length > 0,
  });
}

export function useGradingSchemes(sessionId: string | undefined) {
  return useQuery<SchoolPage<GradingScheme>, ApiError>({
    queryKey: queryKeys.school.gradingSchemes(sessionId ?? ''),
    queryFn: ({ signal }) => schoolService.listGradingSchemes(sessionId, signal),
  });
}

export function useGradeLevels() {
  return useQuery<SchoolPage<GradeLevelRef>, ApiError>({
    queryKey: queryKeys.school.gradeLevels(),
    queryFn: ({ signal }) => schoolService.listGradeLevels(signal),
  });
}

export function useRooms(branchId: string | null) {
  return useQuery<SchoolPage<Room>, ApiError>({
    queryKey: queryKeys.school.rooms(branchId ?? ''),
    queryFn: ({ signal }) =>
      schoolService.listRooms({ branch_id: branchId!, limit: MAX_PAGE, offset: 0 }, signal),
    enabled: Boolean(branchId),
  });
}

/**
 * The timetables of one period scheme.
 *
 * There is at most one PUBLISHED timetable effective on a given date — a
 * partial unique index enforces it — but drafts and superseded versions sit
 * beside it, so the builder names the one it is editing rather than assuming.
 */
export function useTimetables(schemeId: string | null) {
  return useQuery<SchoolPage<Timetable>, ApiError>({
    queryKey: queryKeys.school.timetables(schemeId ?? ''),
    queryFn: ({ signal }) =>
      schoolService.listTimetables(
        { period_scheme_id: schemeId!, limit: MAX_PAGE, offset: 0 },
        signal,
      ),
    enabled: Boolean(schemeId),
  });
}

/**
 * Every slot in the timetable, for every section.
 *
 * All of them, not just the section on screen: one timetable carries the whole
 * school's week, and a teacher booked in two sections at once is only visible
 * from the whole. The grid is a view over this, filtered in the browser.
 */
export function useSlots(timetableId: string | null) {
  return useQuery<TimetableSlot[], ApiError>({
    queryKey: queryKeys.school.slots(timetableId ?? ''),
    queryFn: ({ signal }) => schoolService.listSlots(timetableId!, signal),
    enabled: Boolean(timetableId),
  });
}

/**
 * The whole timetable judged against itself.
 *
 * `clash-check` with no proposals reports every collision already in the week,
 * including the ones somebody accepted: `blocking` and `overridden` are
 * counted separately so an accepted double-booking still appears. This is the
 * standing verdict at the top of the builder, not a gate on anything.
 */
export function useTimetableReport(timetableId: string | null) {
  return useQuery<ClashReport, ApiError>({
    queryKey: queryKeys.school.clashReport(timetableId ?? ''),
    queryFn: () => schoolService.checkClashes(timetableId!, {}),
    enabled: Boolean(timetableId),
  });
}

/** Whoever accepted an override, by the person id the slot row carries. */
export function usePerson(personId: string | undefined) {
  return useQuery<CorePerson, ApiError>({
    queryKey: queryKeys.school.person(personId ?? ''),
    queryFn: ({ signal }) => schoolService.getPerson(personId!, signal),
    enabled: Boolean(personId),
    retry: false,
  });
}

export function useSchoolSections(branchId: string | null) {
  return useQuery<SchoolPage<SectionRow>, ApiError>({
    queryKey: queryKeys.school.sections(branchId ?? ''),
    queryFn: ({ signal }) =>
      schoolService.listSections(
        { branch_id: branchId!, limit: MAX_PAGE, offset: 0 },
        signal,
      ),
    enabled: Boolean(branchId),
  });
}

/**
 * Every offering in the current session.
 *
 * The builder needs all of them, not just the ones in the section on screen: a
 * clash names a counterpart in ANOTHER section, and a report that could not say
 * which subject that was would be telling a timetabler to go and look it up.
 * `/subject-offerings` has no branch filter, so this is the whole school — 42
 * rows in the seeded one, a single page.
 */
export function useAllOfferings(enabled: boolean) {
  return useQuery<SchoolOfferingRow[], ApiError>({
    queryKey: queryKeys.school.offerings('all'),
    queryFn: ({ signal }) => schoolService.listOfferings({}, signal),
    enabled,
  });
}

export function useSectionOfferings(sectionId: string | null) {
  return useQuery<SchoolOfferingRow[], ApiError>({
    queryKey: queryKeys.school.offerings(sectionId ?? ''),
    queryFn: ({ signal }) =>
      schoolService.listOfferings({ section_id: sectionId! }, signal),
    enabled: Boolean(sectionId),
  });
}

/**
 * Who is assigned to teach in this section.
 *
 * This is the shortlist a slot's teacher is chosen from, and it is also the
 * only list of teachers this screen can rely on: `/teachers` needs
 * `core.teachers.read`, which a principal holding `core.teachers.read_all` does
 * NOT imply, so the directory can refuse while the assignments answer.
 */
export function useSectionTeachers(sectionId: string | null) {
  return useQuery<TeacherAssignmentRow[], ApiError>({
    queryKey: queryKeys.school.assignments(sectionId ?? ''),
    queryFn: ({ signal }) =>
      schoolService.listTeacherAssignments({ section_id: sectionId! }, signal),
    enabled: Boolean(sectionId),
  });
}

/**
 * The teacher directory, for names.
 *
 * `retry: false` and a tolerated failure: a caller without `core.teachers.read`
 * gets a 403 here and the builder falls back to naming a teacher by their
 * assignment, which is worse but true. Retrying a denial three times would just
 * delay the fallback.
 */
export function useTeacherDirectory(enabled: boolean) {
  return useQuery<RosterPage<TeacherRow>, ApiError>({
    queryKey: queryKeys.school.teachers(),
    queryFn: ({ signal }) =>
      rosterService.list<TeacherRow>(
        'teachers',
        { limit: ROSTER_PAGE_SIZE * 8, offset: 0 },
        signal,
      ),
    enabled,
    retry: false,
  });
}
