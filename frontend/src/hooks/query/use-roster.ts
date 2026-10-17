'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ROSTER_PAGE_SIZE, type RosterKind } from '@/constants/roster';
import type { ApiError } from '@/services/api';
import { rosterService } from '@/services/roster';
import type { RosterPage, RosterRow } from '@/types/roster';

/**
 * One page of a roster.
 *
 * `keepPreviousData` is the one non-obvious setting. Paging by offset
 * unmounts nothing and refetches everything, so without it every Next click
 * blanks the list to a skeleton and the page jumps. Holding the previous page
 * while the next loads keeps the rows in place; `isPlaceholderData` is what the
 * widget uses to dim them and disable the pager meanwhile.
 */
export function useRoster<T extends RosterRow>(
  kind: RosterKind,
  q: string,
  offset: number,
) {
  return useQuery<RosterPage<T>, ApiError>({
    queryKey: queryKeys.roster.list(kind, q, offset),
    queryFn: ({ signal }) =>
      rosterService.list<T>(kind, { limit: ROSTER_PAGE_SIZE, offset, q }, signal),
    placeholderData: keepPreviousData,
  });
}
