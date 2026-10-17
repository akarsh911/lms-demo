'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { attendanceService } from '@/services/attendance';
import type { AttendanceRoster } from '@/types/attendance';

export function useAttendanceRoster(classId: string | null, date: string) {
  return useQuery<AttendanceRoster>({
    queryKey: queryKeys.attendance.roster(classId ?? '', date),
    queryFn: ({ signal }) => attendanceService.getRoster(classId!, date, signal),
    enabled: Boolean(classId),
  });
}
