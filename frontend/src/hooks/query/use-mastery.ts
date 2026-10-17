'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { masteryService } from '@/services/mastery';
import { READ_STATE, raise, type MasteryMap, type MasteryResponse } from '@/types/mastery';

/**
 * What this student has learned in one chapter of one book.
 *
 * The write is optimistic and deliberately so, unlike the flashcard marking: the
 * outcome is known here, because the caller is stating a fact about what the
 * student just did rather than asking for a judgement. A tick that waits for a
 * round trip makes a map feel broken.
 *
 * `raise` is applied on this side too, not just on the server. Without it the
 * optimistic value can briefly show a DEMOTION, which is the one thing the
 * ladder exists to prevent.
 */
export function useMastery(
  itemId: string | null | undefined,
  sectionId: string | null | undefined,
  enabled = true,
) {
  return useQuery<MasteryResponse, ApiError>({
    queryKey: queryKeys.mastery.chapter(itemId ?? '', sectionId ?? ''),
    queryFn: ({ signal }) => masteryService.forChapter(itemId!, sectionId!, signal),
    enabled: enabled && Boolean(itemId && sectionId),
    staleTime: 60_000,
  });
}

export function useMarkRead(itemId: string, sectionId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.mastery.chapter(itemId, sectionId);

  return useMutation<MasteryResponse, ApiError, readonly string[], MasteryResponse | undefined>({
    mutationFn: (nodeIds) => masteryService.markRead(itemId, sectionId, nodeIds),
    onMutate: async (nodeIds) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<MasteryResponse>(key);
      if (previous) {
        const merged: MasteryMap = { ...previous.states };
        for (const id of nodeIds) merged[id] = raise(merged[id], READ_STATE);
        queryClient.setQueryData<MasteryResponse>(key, { ...previous, states: merged });
      }
      return previous;
    },
    onError: (_err, _vars, previous) => {
      if (previous) queryClient.setQueryData(key, previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
