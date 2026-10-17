'use client';

import { useQuery } from '@tanstack/react-query';

import { STRUCTURE_PAGE_SIZE } from '@/constants/people-detail';
import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { peopleDetailService } from '@/services/people-detail';
import type { SubjectOfferingRow } from '@/types/academic';
import type { DetailPage } from '@/types/people-detail';

export interface OfferingIndex {
  get: (offeringId: string | undefined) => SubjectOfferingRow | undefined;
  readable: boolean;
  partial: boolean;
}

export function useOfferingIndex(enabled: boolean): OfferingIndex {
  const query = useQuery<DetailPage<SubjectOfferingRow>, ApiError>({
    queryKey: queryKeys.person.offerings(),
    queryFn: ({ signal }) =>
      peopleDetailService.listOfferings({ limit: STRUCTURE_PAGE_SIZE, offset: 0 }, signal),
    enabled,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const byId = new Map<string, SubjectOfferingRow>();
  for (const row of query.data?.rows ?? []) byId.set(row.id, row);

  return {
    get: (id) => (id ? byId.get(id) : undefined),
    readable: !query.isError,
    partial: query.data?.page.has_more ?? false,
  };
}
