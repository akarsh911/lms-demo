'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { labsService } from '@labs/services/labs';
import type { LabFeaturesResponse } from '@labs/types/labs';

/**
 * Which teaching layers this bench runs with.
 *
 * An administrator's setting, not a student's, so it is stale-free for the
 * length of a session rather than refetched: a flag flipping halfway through a
 * practical would take a control out from under the student's finger. It is
 * re-read when the bench is next opened.
 */
export function useLabFeatures(bench: string) {
  return useQuery<LabFeaturesResponse>({
    queryKey: queryKeys.labs.features(bench),
    queryFn: ({ signal }) => labsService.features(bench, signal),
    staleTime: Infinity,
    // A bench whose flags cannot be fetched runs with everything on, which is
    // what `labFeature` already does with an absent flag. Retrying would only
    // delay the bench.
    retry: false,
  });
}
