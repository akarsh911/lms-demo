'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { coreService } from '@/services/core';
import type { CoreIdentity } from '@/types/core';

/**
 * The caller's own record in emerge-core.
 *
 * No parameters, and none are possible: the tenant is attached by the proxy
 * from the sealed session and the person is whoever the bearer token is. There
 * is nothing here a caller could point at someone else.
 */
export function useIdentity() {
  return useQuery<CoreIdentity>({
    queryKey: queryKeys.core.identity(),
    queryFn: ({ signal }) => coreService.getIdentity(signal),
  });
}
