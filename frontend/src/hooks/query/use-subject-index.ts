'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { SUBJECT_INDEX_PAGE_SIZE } from '@/constants/people-detail';
import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { peopleDetailService } from '@/services/people-detail';
import type { DetailPage, SubjectRow } from '@/types/people-detail';

export interface SubjectIndex {
  nameOf: (subjectId: string | undefined) => string | null;
  codeOf: (subjectId: string | undefined) => string | null;
  readable: boolean;
  isPending: boolean;
}

export function useSubjectIndex(enabled: boolean): SubjectIndex {
  const query = useQuery<DetailPage<SubjectRow>, ApiError>({
    queryKey: queryKeys.person.subjects(),
    queryFn: ({ signal }) =>
      peopleDetailService.listSubjects(
        { limit: SUBJECT_INDEX_PAGE_SIZE, offset: 0 },
        signal,
      ),
    enabled,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const byId = React.useMemo(() => {
    const out = new Map<string, SubjectRow>();
    for (const row of query.data?.rows ?? []) out.set(row.id, row);
    return out;
  }, [query.data]);

  return {
    nameOf: (id) => (id ? (byId.get(id)?.name ?? null) : null),
    codeOf: (id) => (id ? (byId.get(id)?.code ?? null) : null),
    readable: !query.isError,
    isPending: query.isPending && enabled,
  };
}
