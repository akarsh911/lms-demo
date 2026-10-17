'use client';

import { useQueries, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { resultSchemeService } from '@/services/result-schemes';
import type { ComponentSources } from '@/lib/school/result-composition';
import type { ApiError } from '@/services/api';
import type { AssignmentRow } from '@/types/classroom';
import type {
  ExamRow,
  ResultComponent,
  ResultComponentAssignmentLink,
  ResultComponentExamLink,
  ResultScheme,
} from '@/types/result-scheme';

export function useResultSchemes(sessionId: string | null) {
  return useQuery<ResultScheme[], ApiError>({
    queryKey: queryKeys.results.schemes(sessionId ?? ''),
    queryFn: ({ signal }) => resultSchemeService.listSchemes(sessionId!, signal),
    enabled: Boolean(sessionId),
  });
}

export function useResultComponents(schemeId: string | null) {
  return useQuery<ResultComponent[], ApiError>({
    queryKey: queryKeys.results.components(schemeId ?? ''),
    queryFn: ({ signal }) => resultSchemeService.listComponents(schemeId!, signal),
    enabled: Boolean(schemeId),
  });
}

export function useComponentExams(componentId: string | null) {
  return useQuery<ResultComponentExamLink[], ApiError>({
    queryKey: queryKeys.results.componentExams(componentId ?? ''),
    queryFn: ({ signal }) =>
      resultSchemeService.listComponentExams(componentId!, signal),
    enabled: Boolean(componentId),
  });
}

export function useComponentAssignments(componentId: string | null) {
  return useQuery<ResultComponentAssignmentLink[], ApiError>({
    queryKey: queryKeys.results.componentAssignments(componentId ?? ''),
    queryFn: ({ signal }) =>
      resultSchemeService.listComponentAssignments(componentId!, signal),
    enabled: Boolean(componentId),
  });
}

export function useSessionExams(sessionId: string | null, branchId: string | null) {
  return useQuery<ExamRow[], ApiError>({
    queryKey: queryKeys.results.exams(sessionId ?? '', branchId ?? ''),
    queryFn: ({ signal }) =>
      resultSchemeService.listExams(sessionId!, branchId, signal),
    enabled: Boolean(sessionId),
  });
}

export function useSessionAssignments(sessionId: string | null) {
  return useQuery<AssignmentRow[], ApiError>({
    queryKey: queryKeys.results.assignments(sessionId ?? ''),
    queryFn: ({ signal }) => resultSchemeService.listAssignments(sessionId!, signal),
    enabled: Boolean(sessionId),
  });
}

export interface SourceTally {
  byComponent: ReadonlyMap<string, ComponentSources>;
  isPending: boolean;
  isError: boolean;
}

export interface ComponentLinks {
  exams: readonly ResultComponentExamLink[];
  assignments: readonly ResultComponentAssignmentLink[];
}

export interface LinkTally {
  byComponent: ReadonlyMap<string, ComponentLinks>;
  isPending: boolean;
  isError: boolean;
}

export const NO_LINKS: ComponentLinks = { exams: [], assignments: [] };

export function useComponentLinks(components: readonly ResultComponent[]): LinkTally {
  const ids = components.map((row) => row.id);

  const exams = useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.results.componentExams(id),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        resultSchemeService.listComponentExams(id, signal),
    })),
  });

  const assignments = useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.results.componentAssignments(id),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        resultSchemeService.listComponentAssignments(id, signal),
    })),
  });

  const byComponent = new Map<string, ComponentLinks>();
  ids.forEach((id, index) => {
    byComponent.set(id, {
      exams: exams[index]?.data ?? NO_LINKS.exams,
      assignments: assignments[index]?.data ?? NO_LINKS.assignments,
    });
  });

  return {
    byComponent,
    isPending: [...exams, ...assignments].some((query) => query.isPending),
    isError: [...exams, ...assignments].some((query) => query.isError),
  };
}

export function useComponentSources(components: readonly ResultComponent[]): SourceTally {
  const links = useComponentLinks(components);

  const byComponent = new Map<string, ComponentSources>();
  for (const [id, linked] of links.byComponent) {
    byComponent.set(id, {
      exams: linked.exams.length,
      assignments: linked.assignments.length,
    });
  }

  return {
    byComponent,
    isPending: links.isPending,
    isError: links.isError,
  };
}
