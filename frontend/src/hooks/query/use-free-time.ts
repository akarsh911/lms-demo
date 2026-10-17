'use client';

import { useQuery } from '@tanstack/react-query';

import { STRUCTURE_PAGE_SIZE } from '@/constants/people-detail';
import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { peopleDetailService } from '@/services/people-detail';
import type {
  BellSchedulePeriodRow,
  CalendarDayRow,
  CalendarDayScheduleRow,
  DetailPage,
  OccurrenceAnswer,
  PeriodRow,
} from '@/types/people-detail';

const page = { limit: STRUCTURE_PAGE_SIZE, offset: 0 };

export interface FreeTimeQueries {
  day: ReturnType<typeof useCalendarDay>;
  schedules: ReturnType<typeof useDaySchedules>;
  occurrences: ReturnType<typeof useDayOccurrences>;
  periods: ReturnType<typeof useSchemePeriods>;
  bell: ReturnType<typeof useBellPeriods>;
  dayRow: CalendarDayRow | undefined;
  schemeId: string | null;
  bellScheduleId: string | null;
  schemeCount: number;
}

function useCalendarDay(branchId: string | null, date: string) {
  return useQuery<DetailPage<CalendarDayRow>, ApiError>({
    queryKey: queryKeys.person.calendarDay(branchId ?? '', date),
    queryFn: ({ signal }) =>
      peopleDetailService.listCalendarDays(
        { ...page, branch_id: branchId!, from: date, to: date },
        signal,
      ),
    enabled: Boolean(branchId),
    retry: false,
  });
}

function useDaySchedules(dayId: string | null) {
  return useQuery<DetailPage<CalendarDayScheduleRow>, ApiError>({
    queryKey: queryKeys.person.daySchedules(dayId ?? ''),
    queryFn: ({ signal }) =>
      peopleDetailService.listCalendarDaySchedules(dayId!, page, signal),
    enabled: Boolean(dayId),
    retry: false,
  });
}

function useDayOccurrences(teacherId: string, branchId: string | null, date: string) {
  return useQuery<OccurrenceAnswer, ApiError>({
    queryKey: queryKeys.person.occurrences(teacherId, branchId ?? '', date, date),
    queryFn: ({ signal }) =>
      peopleDetailService.resolveOccurrences(
        { teacher_id: teacherId, branch_id: branchId!, date },
        signal,
      ),
    enabled: Boolean(branchId),
    retry: false,
  });
}

function useSchemePeriods(schemeId: string | null) {
  return useQuery<DetailPage<PeriodRow>, ApiError>({
    queryKey: queryKeys.person.schemePeriods(schemeId ?? ''),
    queryFn: ({ signal }) =>
      peopleDetailService.listSchemePeriods(schemeId!, page, signal),
    enabled: Boolean(schemeId),
    retry: false,
  });
}

function useBellPeriods(bellId: string | null) {
  return useQuery<DetailPage<BellSchedulePeriodRow>, ApiError>({
    queryKey: queryKeys.person.bellPeriods(bellId ?? ''),
    queryFn: ({ signal }) =>
      peopleDetailService.listBellSchedulePeriods(bellId!, page, signal),
    enabled: Boolean(bellId),
    retry: false,
  });
}

export function useFreeTime(
  teacherId: string,
  branchId: string | null,
  date: string,
): FreeTimeQueries {
  const day = useCalendarDay(branchId, date);
  const dayRow = day.data?.rows[0];
  const schedules = useDaySchedules(dayRow?.id ?? null);
  const occurrences = useDayOccurrences(teacherId, branchId, date);

  const scheduleRows = schedules.data?.rows ?? [];
  const taught = occurrences.data?.occurrences ?? [];

  const fromLesson = taught.find((occurrence) => occurrence.period_scheme_id);
  const matching = fromLesson
    ? scheduleRows.find((row) => row.period_scheme_id === fromLesson.period_scheme_id)
    : undefined;
  const chosen = matching ?? scheduleRows[0];

  const schemeId = fromLesson?.period_scheme_id ?? chosen?.period_scheme_id ?? null;
  const bellScheduleId =
    chosen?.bell_schedule_id ??
    taught.find((occurrence) => occurrence.bell_schedule_id)?.bell_schedule_id ??
    null;

  return {
    day,
    schedules,
    occurrences,
    periods: useSchemePeriods(schemeId),
    bell: useBellPeriods(bellScheduleId),
    dayRow,
    schemeId,
    bellScheduleId,
    schemeCount: scheduleRows.length,
  };
}
