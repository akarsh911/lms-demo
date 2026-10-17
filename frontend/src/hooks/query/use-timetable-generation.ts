'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { schoolService } from '@/services/school';
import type { ApiError } from '@/services/api';
import type { GenerationJob } from '@/types/timetable-generation';

export const GENERATION_POLL_MS = 1500;

export function useGenerationJob(timetableId: string | null, jobId: string | null) {
  return useQuery<GenerationJob, ApiError>({
    queryKey: queryKeys.school.generation(timetableId ?? '', jobId ?? ''),
    queryFn: ({ signal }) => schoolService.getGeneration(timetableId!, jobId!, signal),
    enabled: Boolean(timetableId) && Boolean(jobId),
    retry: false,
    refetchInterval: (query) => (query.state.data?.terminal ? false : GENERATION_POLL_MS),
    refetchIntervalInBackground: true,
  });
}
