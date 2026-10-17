'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { RosterKind } from '@/constants/roster';
import type { ApiError } from '@/services/api';
import { rosterService } from '@/services/roster';
import type { RosterRow } from '@/types/roster';

/**
 * One roster row, read on its own.
 *
 * Fetched rather than lifted out of the list page, because `GET /{kind}/{id}`
 * is the read the backend actually authorizes: it applies reach and the field
 * policy to that row specifically. Reusing the list entry would show a row
 * this caller might no longer reach and would never exercise the 404 the
 * backend answers for one outside their reach.
 *
 * `enabled` guards the id here rather than at the call site, because a hook
 * cannot be called conditionally.
 */
export function useRosterMember<T extends RosterRow>(
  kind: RosterKind,
  id: string | null,
) {
  // Typed on `ApiError` so a caller can read `status`: a 404 from a read is the
  // ordinary answer for a row outside the caller reach, and it deserves a
  // different sentence from a failure.
  return useQuery<T, ApiError>({
    queryKey: queryKeys.roster.member(kind, id ?? ''),
    queryFn: ({ signal }) => rosterService.get<T>(kind, id!, signal),
    enabled: Boolean(id),
  });
}
