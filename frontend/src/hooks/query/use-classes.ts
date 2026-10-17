'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { attendanceService } from '@/services/attendance';
import type { ClassesResponse } from '@/types/attendance';

/** The classes the signed-in user can take attendance for. */
export function useClasses() {
  return useQuery<ClassesResponse>({
    queryKey: queryKeys.attendance.classes(),
    queryFn: ({ signal }) => attendanceService.listClasses(signal),
    // A timetable does not change during a lesson.
    staleTime: 10 * 60 * 1000,
  });
}
