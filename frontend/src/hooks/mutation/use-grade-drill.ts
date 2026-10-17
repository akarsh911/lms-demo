'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { mindmapService } from '@/services/mindmap';
import type { DrillGrade, DrillGradeRequest } from '@/types/mindmap';

import { useGapEvidence } from './use-gap-evidence';

/**
 * Grade a recall attempt.
 *
 * No optimistic update, because the engine holds no state: grading is a pure
 * function of `(chapter, kind, n, seed, answers)` and the drill is REBUILT from
 * the seed rather than looked up.
 *
 * The seed in `request` must be the one the drill was fetched with. Send a
 * different one and the engine will cheerfully build a different set of
 * questions and mark the student's answers against those, with no error
 * anywhere: the ids would simply not match and everything would score zero.
 *
 * `result.node_scores` is the mastery seam. emerge-core records it while
 * relaying the result, for a tracked learner who may write mastery, so the one
 * cache to keep in step is the chapter's mastery, which is invalidated here.
 * Nothing on this side writes a graded state.
 */
export function useGradeDrill(itemId: string, sectionId: string) {
  const queryClient = useQueryClient();
  const evidence = useGapEvidence();

  return useMutation<DrillGrade, ApiError, DrillGradeRequest>({
    mutationFn: (request) => mindmapService.grade(itemId, sectionId, request),
    onSuccess: (grade) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.mastery.chapter(itemId, sectionId),
      });
      evidence.drill(itemId, sectionId, grade);
    },
  });
}
