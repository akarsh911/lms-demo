'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ApiError } from '@/services/api';
import { coreService } from '@/services/core';
import type { CoreIdentity, CorePerson, PersonUpdate } from '@/types/core';

/**
 * Edit a person's own record.
 *
 * The full optimistic cycle, for the reason the reference hook gives: without
 * `cancelQueries` an in-flight read of `/auth/me` resolves after the optimistic
 * write and overwrites it, and the edit appears to apply and then silently
 * revert.
 *
 * The optimistic patch is applied to the IDENTITY cache rather than to a person
 * cache, because `/auth/me` is where the profile screen reads its person from
 * and there is no separate `GET /persons/{id}` query in this application yet.
 *
 * A 403 here is the real answer and is not rolled back quietly: emerge-core
 * checks the field policy BEFORE it writes, so a refused submission changed
 * nothing, and its message names the columns. The form surfaces those names —
 * see `deniedFieldsFrom`.
 */
export function useUpdatePerson(personId: string | undefined) {
  const queryClient = useQueryClient();
  const identityKey = queryKeys.core.identity();

  return useMutation<
    CorePerson,
    ApiError,
    PersonUpdate,
    { previous: CoreIdentity | undefined }
  >({
    mutationFn: (patch) => {
      if (!personId) {
        // Unreachable from the form, which does not render a submit control
        // without an id. Stated anyway: a mutation with no subject must not
        // become a PATCH to `persons/undefined`.
        throw new ApiError(400, 'no_person', 'There is no person record to edit.');
      }
      return coreService.updatePerson(personId, patch);
    },

    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: identityKey });
      const previous = queryClient.getQueryData<CoreIdentity>(identityKey);

      if (previous?.person) {
        queryClient.setQueryData<CoreIdentity>(identityKey, {
          ...previous,
          person: { ...previous.person, ...stripNulls(patch) },
        });
      }

      return { previous };
    },

    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(identityKey, context.previous);
    },

    onSettled: () => {
      // The whole `core` prefix. The PATCH returns the raw row, unprojected,
      // so it is not what the screen should believe; `/auth/me` re-applies the
      // caller's field policy and is. Capabilities go with it because a status
      // change can alter what the guard allows next.
      void queryClient.invalidateQueries({ queryKey: queryKeys.core.all });
    },
  });
}

/**
 * `null` clears a nullable column server-side, which is a legitimate edit, but
 * it is not a value the optimistic copy of `CorePerson` can hold: its fields
 * are `string | undefined`, where undefined means withheld. Dropped from the
 * optimistic patch only — the request still carries it, and `onSettled` brings
 * back what the server actually stored.
 */
function stripNulls(patch: PersonUpdate): Partial<CorePerson> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out as Partial<CorePerson>;
}
