'use client';

import * as React from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { LIBRARY_PAGE_SIZE } from '@/constants/library';
import type { ApiError } from '@/services/api';
import { libraryService } from '@/services/library';
import type { Curriculum, CurriculumNode } from '@/types/library';

import type {
  ComposePreview,
  ComposeRequest,
  ComposeResult,
  PaperSetterSettings,
  TemplateCreateRequest,
  TemplateDetail,
  TemplateSummary,
  TemplateUpdateRequest,
} from './contract';
import { paperSetterApi } from './data/paper-setter-api';
import { curriculumShape, type MalformedNode, type TreeNode } from './node-tree';

export const paperSetterKeys = {
  all: ['paper-setter'] as const,
  settings: () => [...paperSetterKeys.all, 'settings'] as const,
  templates: () => [...paperSetterKeys.all, 'templates'] as const,
  template: (templateId: string) =>
    [...paperSetterKeys.all, 'template', templateId] as const,
  curricula: (subjectId: string, gradeLevelId: string) =>
    [...paperSetterKeys.all, 'curricula', subjectId, gradeLevelId] as const,
  nodes: (curriculumId: string) => [...paperSetterKeys.all, 'nodes', curriculumId] as const,
  preview: (request: ComposeRequest | null) =>
    [...paperSetterKeys.all, 'preview', request] as const,
};

export const NODE_PAGE_SIZE = 500;

const PREVIEW_DEBOUNCE_MS = 400;

export function useDebounced<T>(value: T, delay = PREVIEW_DEBOUNCE_MS): T {
  const [settled, setSettled] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}

export function usePaperSetterSettings() {
  return useQuery<PaperSetterSettings, ApiError>({
    queryKey: paperSetterKeys.settings(),
    queryFn: ({ signal }) => paperSetterApi().settings(signal),
  });
}

export function usePaperSetterTemplates(enabled: boolean) {
  return useQuery<TemplateSummary[], ApiError>({
    queryKey: paperSetterKeys.templates(),
    queryFn: ({ signal }) => paperSetterApi().templates(signal),
    enabled,
  });
}

export function usePaperSetterTemplate(templateId: string | null) {
  return useQuery<TemplateDetail, ApiError>({
    queryKey: paperSetterKeys.template(templateId ?? ''),
    queryFn: ({ signal }) => paperSetterApi().template(templateId!, signal),
    enabled: Boolean(templateId),
  });
}

function useTemplateListInvalidation(): () => void {
  const client = useQueryClient();
  return React.useCallback(() => {
    void client.invalidateQueries({ queryKey: paperSetterKeys.templates() });
    void client.invalidateQueries({ queryKey: paperSetterKeys.settings() });
  }, [client]);
}

export function useCreateTemplate() {
  const invalidate = useTemplateListInvalidation();

  return useMutation<TemplateDetail, ApiError, TemplateCreateRequest>({
    mutationFn: (request) => paperSetterApi().createTemplate(request),
    onSuccess: invalidate,
  });
}

export interface TemplateEdit {
  templateId: string;
  request: TemplateUpdateRequest;
}

export function useUpdateTemplate() {
  const client = useQueryClient();
  const invalidate = useTemplateListInvalidation();

  return useMutation<TemplateDetail, ApiError, TemplateEdit>({
    mutationFn: ({ templateId, request }) =>
      paperSetterApi().updateTemplate(templateId, request),
    onSuccess: (detail) => {
      client.setQueryData(paperSetterKeys.template(detail.id), detail);
      invalidate();
    },
  });
}

export function useDeleteTemplate() {
  const client = useQueryClient();
  const invalidate = useTemplateListInvalidation();

  return useMutation<void, ApiError, string>({
    mutationFn: (templateId) => paperSetterApi().deleteTemplate(templateId),
    onSuccess: (_result, templateId) => {
      client.removeQueries({ queryKey: paperSetterKeys.template(templateId) });
      invalidate();
    },
  });
}

export function usePaperSetterCurricula(
  subjectId: string | null,
  gradeLevelId: string | null,
) {
  return useQuery<Curriculum[], ApiError>({
    queryKey: paperSetterKeys.curricula(subjectId ?? '', gradeLevelId ?? ''),
    queryFn: async ({ signal }) => {
      const page = await libraryService.listCurricula(
        {
          limit: LIBRARY_PAGE_SIZE,
          offset: 0,
          filters: {
            subject_id: subjectId ?? undefined,
            grade_level_id: gradeLevelId ?? undefined,
          },
        },
        signal,
      );
      return page.rows;
    },
    enabled: Boolean(subjectId) && Boolean(gradeLevelId),
  });
}

export interface CurriculumTree {
  tree: TreeNode[];
  malformed: MalformedNode[];
  hasUnits: boolean;
  isPending: boolean;
  isError: boolean;
  error: ApiError | null;
  isEmpty: boolean;
  refetch: () => void;
}

export function useCurriculumTree(curriculumId: string | null): CurriculumTree {
  const nodes = useQuery<CurriculumNode[], ApiError>({
    queryKey: paperSetterKeys.nodes(curriculumId ?? ''),
    queryFn: async ({ signal }) => {
      const page = await libraryService.listNodes(
        curriculumId!,
        { limit: NODE_PAGE_SIZE, offset: 0 },
        signal,
      );
      return page.rows;
    },
    enabled: Boolean(curriculumId),
  });

  const rows = nodes.data;
  const shape = React.useMemo(() => curriculumShape(rows ?? []), [rows]);

  return {
    tree: shape.tree,
    malformed: shape.malformed,
    hasUnits: shape.hasUnits,
    isPending: Boolean(curriculumId) && nodes.isPending,
    isError: nodes.isError,
    error: nodes.error ?? null,
    isEmpty: rows !== undefined && rows.length === 0,
    refetch: () => void nodes.refetch(),
  };
}

export function useComposePreview(request: ComposeRequest | null) {
  const settled = useDebounced(request);

  return useQuery<ComposePreview, ApiError>({
    queryKey: paperSetterKeys.preview(settled),
    queryFn: () => paperSetterApi().preview(settled!),
    enabled: settled !== null,
    placeholderData: keepPreviousData,
  });
}

export function useComposeRun() {
  return useMutation<ComposeResult, ApiError, ComposeRequest>({
    mutationFn: (request) => paperSetterApi().compose(request),
  });
}
