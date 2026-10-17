'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { sectionCalendarService } from '@/services/section-calendar';
import type { SectionCalendarWindow } from '@/types/section-calendar';

export function useSectionCalendar(sectionId: string, from: string, to: string) {
  return useQuery<SectionCalendarWindow, ApiError>({
    queryKey: queryKeys.classroom.sectionCalendar(sectionId, from, to),
    queryFn: ({ signal }) =>
      sectionCalendarService.getWindow(sectionId, from, to, signal),
    enabled: Boolean(sectionId && from && to),
    placeholderData: keepPreviousData,
  });
}
