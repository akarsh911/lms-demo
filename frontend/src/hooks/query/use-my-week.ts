'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { teachingService } from '@/services/teaching';
import type { TimelineWeek } from '@/types/timetable';

export function useMyWeek(weekOf: string) {
  return useQuery<TimelineWeek, ApiError>({
    queryKey: queryKeys.teaching.week(weekOf),
    queryFn: () => teachingService.myWeek(weekOf),
    placeholderData: keepPreviousData,
  });
}
