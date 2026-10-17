'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { coreService } from '@/services/core';
import type { CapabilitiesResponse } from '@/types/core';

/**
 * What emerge-core would permit this caller to do.
 *
 * WOULD. It never decides — the endpoint does, on every request, and a 403 is
 * an ordinary answer rather than a sign this was stale. Use it to choose which
 * controls to draw, never as a substitute for making the call.
 */
export function useCapabilities() {
  return useQuery<CapabilitiesResponse>({
    queryKey: queryKeys.core.capabilities(),
    queryFn: ({ signal }) => coreService.getCapabilities(signal),
  });
}
