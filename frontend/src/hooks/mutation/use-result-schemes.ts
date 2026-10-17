'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { resultSchemeService } from '@/services/result-schemes';
import type { ApiError } from '@/services/api';
import type {
  ResultComponent,
  ResultComponentWrite,
  ResultScheme,
  ResultSchemeCreate,
  ResultSchemePatch,
} from '@/types/result-scheme';

function useResultWrite<TData, TVars>(mutationFn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.results.all });
    },
  });
}

export function useCreateResultScheme() {
  return useResultWrite<ResultScheme, ResultSchemeCreate>((body) =>
    resultSchemeService.createScheme(body),
  );
}

export interface SchemeRevision {
  id: string;
  patch: ResultSchemePatch;
}

export function useReviseResultScheme() {
  return useResultWrite<ResultScheme, SchemeRevision>(({ id, patch }) =>
    resultSchemeService.reviseScheme(id, patch),
  );
}

export function useDeleteResultScheme() {
  return useResultWrite<void, string>((id) => resultSchemeService.deleteScheme(id));
}

export function useCreateResultComponent() {
  return useResultWrite<
    ResultComponent,
    { schemeId: string; body: ResultComponentWrite }
  >(({ schemeId, body }) => resultSchemeService.createComponent(schemeId, body));
}

export function useUpdateResultComponent() {
  return useResultWrite<ResultComponent, { id: string; body: ResultComponentWrite }>(
    ({ id, body }) => resultSchemeService.updateComponent(id, body),
  );
}

export function useDeleteResultComponent() {
  return useResultWrite<void, string>((id) => resultSchemeService.deleteComponent(id));
}

export function useLinkComponentExam() {
  return useResultWrite<unknown, { componentId: string; examId: string }>(
    ({ componentId, examId }) => resultSchemeService.linkExam(componentId, examId),
  );
}

export function useUnlinkComponentExam() {
  return useResultWrite<void, { componentId: string; examId: string }>(
    ({ componentId, examId }) => resultSchemeService.unlinkExam(componentId, examId),
  );
}

export function useLinkComponentAssignment() {
  return useResultWrite<unknown, { componentId: string; assignmentId: string }>(
    ({ componentId, assignmentId }) =>
      resultSchemeService.linkAssignment(componentId, assignmentId),
  );
}

export function useUnlinkComponentAssignment() {
  return useResultWrite<void, { componentId: string; assignmentId: string }>(
    ({ componentId, assignmentId }) =>
      resultSchemeService.unlinkAssignment(componentId, assignmentId),
  );
}
