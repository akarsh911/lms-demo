'use client';

import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { RESULT_ROSTER_PAGE, resultsService } from '@/services/results';
import type { OfferingResults } from '@/types/results';

export type OfferingResultsQuery = UseQueryResult<OfferingResults, ApiError>;

export function useOfferingResults(
  offeringId: string | null,
  studentId?: string | null,
): OfferingResultsQuery {
  return useQuery<OfferingResults, ApiError>({
    queryKey: queryKeys.results.offering(offeringId ?? '', studentId ?? ''),
    queryFn: ({ signal }) =>
      resultsService.listOfferingResults(
        offeringId!,
        studentId
          ? { student_id: studentId }
          : { limit: RESULT_ROSTER_PAGE, offset: 0 },
        signal,
      ),
    enabled: Boolean(offeringId),
    retry: false,
  });
}

export interface PupilOfferingResults {
  offeringId: string;
  query: OfferingResultsQuery;
}

export function usePupilResults(
  offeringIds: readonly string[],
  studentId: string,
  enabled: boolean,
): PupilOfferingResults[] {
  const queries = useQueries({
    queries: offeringIds.map((offeringId) => ({
      queryKey: queryKeys.results.offering(offeringId, studentId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        resultsService.listOfferingResults(offeringId, { student_id: studentId }, signal),
      enabled,
      retry: false,
    })),
  });

  return offeringIds.map((offeringId, index) => ({
    offeringId,
    query: queries[index] as OfferingResultsQuery,
  }));
}
