'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { attendanceService } from '@/services/attendance';
import type { AttendanceSummary } from '@/types/attendance';

/**
 * REFERENCE QUERY HOOK — copy this shape.
 *
 * One hook per endpoint. Named `use<Thing>`, file named after the hook.
 *
 * Three things worth copying and easy to get wrong:
 *
 * 1. `signal` is forwarded. TanStack aborts a query when its component
 *    unmounts; without forwarding, a user clicking through tabs leaves a
 *    request per tab running to completion.
 * 2. `enabled` guards the params rather than the caller doing so. A hook cannot
 *    be called conditionally (rules of hooks), so the condition belongs here.
 * 3. No `try/catch`. Let the error reach TanStack — the widget's error boundary
 *    renders it, and swallowing it here produces a card stuck on "loading"
 *    forever.
 */
export function useAttendanceSummary(classId: string | null, date: string) {
  return useQuery<AttendanceSummary>({
    queryKey: queryKeys.attendance.summary(classId ?? '', date),
    queryFn: ({ signal }) => attendanceService.getSummary(classId!, date, signal),
    enabled: Boolean(classId),
  });
}
