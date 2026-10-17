'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ApiError } from '@/services/api';
import { labsService } from '@labs/services/labs';
import type { LabAttemptSummary, SubmitLabAttemptInput } from '@labs/types/labs';

/**
 * Persist a completed practical's attempt record.
 *
 * Not optimistic, deliberately: an attempt is created once and its id comes from
 * the server, so there is no existing cache entry to patch. What matters is the
 * invalidation, so a "recent attempts" panel on the same page shows the new row
 * as soon as it exists.
 */
export function useSubmitLabAttempt() {
  const queryClient = useQueryClient();

  return useMutation<LabAttemptSummary, ApiError, SubmitLabAttemptInput>({
    mutationFn: (input) => labsService.submitAttempt(input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.labs.all });
    },
  });
}
