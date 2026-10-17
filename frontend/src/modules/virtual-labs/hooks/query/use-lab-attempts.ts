'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { labsService } from '@labs/services/labs';
import type { LabAttemptsResponse, LabBenchId } from '@labs/types/labs';

/** The signed-in student's attempts at one bench, newest first. */
export function useLabAttempts(bench: LabBenchId) {
  return useQuery<LabAttemptsResponse>({
    queryKey: queryKeys.labs.attempts(bench),
    queryFn: ({ signal }) => labsService.listAttempts(bench, signal),
  });
}
