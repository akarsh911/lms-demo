'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { timelineService } from '@/services/timeline';
import type { TimelineContext, TimelineData } from '@/types/timeline';

export function useTimelineData() {
  return useQuery<TimelineData>({
    queryKey: queryKeys.timeline.data(),
    queryFn: () => timelineService.data(),
    staleTime: Infinity,
  });
}

export function useTimelineContext(code: string | null) {
  return useQuery<TimelineContext>({
    queryKey: queryKeys.timeline.context(code ?? ''),
    queryFn: () => timelineService.context(code ?? ''),
    enabled: code !== null,
    staleTime: Infinity,
  });
}
