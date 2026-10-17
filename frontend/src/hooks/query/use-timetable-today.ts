'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { timetableService } from '@/services/timetable';
import type { TimetableDay } from '@/types/timetable';

export function useTimetableToday(personaSlug: string) {
  return useQuery<TimetableDay>({
    // The persona is in the key because the same person sees a different
    // timetable as a teacher than as a parent. Omitting it would serve one
    // persona's cached answer to the other after a switch.
    queryKey: queryKeys.timetable.today(personaSlug),
    queryFn: ({ signal }) => timetableService.getToday(signal),
    staleTime: 5 * 60 * 1000,
  });
}
