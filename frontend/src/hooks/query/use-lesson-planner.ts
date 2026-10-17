'use client';

import * as React from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { lessonPlannerService } from '@/services/lesson-planner';
import type { LessonPlan, PlannerContext, PlannerOutline, PlannerWeek, TermContext, TermPlanSettings } from '@/types/lesson-planner';

const OUTLINE_STALE_MS = 10 * 60 * 1000;

export function useLessonPlannerContext() {
  return useQuery<PlannerContext>({
    queryKey: queryKeys.lessonPlanner.context(),
    queryFn: ({ signal }) => lessonPlannerService.context(signal),
    staleTime: OUTLINE_STALE_MS,
  });
}

export function useLessonOutline(curriculumId: string | null) {
  return useQuery<PlannerOutline>({
    queryKey: queryKeys.lessonPlanner.outline(curriculumId ?? ''),
    queryFn: ({ signal }) => lessonPlannerService.outline(curriculumId ?? '', signal),
    enabled: Boolean(curriculumId),
    staleTime: OUTLINE_STALE_MS,
  });
}

export function useLessonPlans() {
  return useQuery<LessonPlan[]>({
    queryKey: queryKeys.lessonPlanner.plans(),
    queryFn: ({ signal }) => lessonPlannerService.listPlans(signal),
  });
}

export function useLessonPlan(id: string | null) {
  return useQuery<LessonPlan>({
    queryKey: queryKeys.lessonPlanner.plan(id ?? ''),
    queryFn: ({ signal }) => lessonPlannerService.getPlan(id ?? '', signal),
    enabled: Boolean(id),
  });
}

function mergeWeeks(weeks: readonly PlannerWeek[]): PlannerWeek | undefined {
  const [first] = weeks;
  if (!first) return undefined;
  const periods = new Map(weeks.flatMap((week) => week.periods).map((period) => [period.period_id, period]));
  return {
    ...first,
    section_label: weeks.length === 1 ? first.section_label : null,
    periods: [...periods.values()].sort((a, b) => a.start_minute - b.start_minute),
    lessons: weeks.flatMap((week) => week.lessons),
  };
}

export function usePlannerWeeks(from: string | null, sectionIds: readonly string[] | null) {
  const sections: readonly (string | null)[] = sectionIds ?? [null];
  return useQueries({
    queries: sections.map((sectionId) => ({
      queryKey: queryKeys.lessonPlanner.week(from ?? '', sectionId ?? ''),
      queryFn: ({ signal }: { signal: AbortSignal }) => lessonPlannerService.week(from ?? '', sectionId, signal),
      enabled: Boolean(from),
      placeholderData: (previous: PlannerWeek | undefined) => previous,
    })),
    combine: (results) => {
      const failed = results.find((result) => result.isError);
      const weeks = results.flatMap((result) => (result.data ? [result.data] : []));
      return {
        data: weeks.length === results.length ? mergeWeeks(weeks) : undefined,
        isPending: results.some((result) => result.isPending),
        isFetching: results.some((result) => result.isFetching),
        isError: failed !== undefined,
        error: failed?.error ?? null,
        refetch: () => results.forEach((result) => void result.refetch()),
      };
    },
  });
}

export function useTermContext(offeringId: string | null) {
  return useQuery<TermContext>({
    queryKey: queryKeys.lessonPlanner.termContext(offeringId ?? ''),
    queryFn: ({ signal }) => lessonPlannerService.termContext(offeringId ?? '', signal),
    enabled: Boolean(offeringId),
  });
}

export function useTermPlan(offeringId: string | null) {
  return useQuery<TermPlanSettings>({
    queryKey: queryKeys.lessonPlanner.termPlan(offeringId ?? ''),
    queryFn: ({ signal }) => lessonPlannerService.termPlan(offeringId ?? '', signal),
    enabled: Boolean(offeringId),
  });
}

export function useFetchOutline(): (curriculumId: string) => Promise<PlannerOutline> {
  const queryClient = useQueryClient();
  return React.useCallback(
    (curriculumId: string) =>
      queryClient.fetchQuery({
        queryKey: queryKeys.lessonPlanner.outline(curriculumId),
        queryFn: ({ signal }) => lessonPlannerService.outline(curriculumId, signal),
        staleTime: OUTLINE_STALE_MS,
      }),
    [queryClient],
  );
}
