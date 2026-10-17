'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { lessonPlannerService } from '@/services/lesson-planner';
import type {
  DraftPlan,
  GenerateRequest,
  LessonBlock,
  LessonPlan,
  LessonPlanCreate,
  LessonPlanPatch,
  RegenerateBlockRequest,
  TermPlanSettings,
} from '@/types/lesson-planner';

function usePlanWrite<TData, TVars>(mutationFn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn,
    onSuccess: (data) => {
      if (data && typeof data === 'object' && 'id' in data) {
        queryClient.setQueryData(queryKeys.lessonPlanner.plan(String(data.id)), data);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lessonPlanner.plans() });
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.lessonPlanner.all, 'week'] });
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.lessonPlanner.all, 'term-context'] });
    },
  });
}

export function useGenerateLessonPlan() {
  return useMutation<DraftPlan, ApiError, GenerateRequest>({
    mutationFn: (request) => lessonPlannerService.generate(request),
  });
}

export function useRegenerateBlock() {
  return useMutation<LessonBlock, ApiError, RegenerateBlockRequest>({
    mutationFn: (request) => lessonPlannerService.regenerateBlock(request),
  });
}

export function useCreateLessonPlan() {
  return usePlanWrite<LessonPlan, LessonPlanCreate>((body) => lessonPlannerService.createPlan(body));
}

export function useUpdateLessonPlan() {
  return usePlanWrite<LessonPlan, { id: string; patch: LessonPlanPatch }>(({ id, patch }) =>
    lessonPlannerService.updatePlan(id, patch),
  );
}

export function useDeleteLessonPlan() {
  return usePlanWrite<void, string>((id) => lessonPlannerService.deletePlan(id));
}

export function useMarkTaught() {
  return usePlanWrite<LessonPlan, { planId: string; periodId: string; reflection: string }>(
    ({ planId, periodId, reflection }) => lessonPlannerService.markTaught(planId, periodId, { reflection }),
  );
}

export function useClearTaught() {
  return usePlanWrite<LessonPlan, { planId: string; periodId: string }>(({ planId, periodId }) =>
    lessonPlannerService.clearTaught(planId, periodId),
  );
}

export function useSaveTermPlan() {
  const queryClient = useQueryClient();
  return useMutation<TermPlanSettings, ApiError, TermPlanSettings>({
    mutationFn: (settings) => lessonPlannerService.saveTermPlan(settings),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.lessonPlanner.termPlan(saved.offering_id), saved);
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.lessonPlanner.all, 'week'] });
    },
  });
}
