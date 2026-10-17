'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { paperService } from '@/services/papers';
import type { ApiError } from '@/services/api';
import type { GenerationRunRow, PaperDetail, PaperRow } from '@/types/papers';
import type { SchoolPage } from '@/types/school';

export function usePapers(sessionId: string | null) {
  return useQuery<SchoolPage<PaperRow>, ApiError>({
    queryKey: queryKeys.papers.list(sessionId ?? ''),
    queryFn: ({ signal }) =>
      paperService.listPapers(
        sessionId ? { academic_session_id: sessionId } : {},
        signal,
      ),
  });
}

export function usePaper(paperId: string | null) {
  return useQuery<PaperDetail, ApiError>({
    queryKey: queryKeys.papers.paper(paperId ?? ''),
    queryFn: ({ signal }) => paperService.getPaper(paperId!, signal),
    enabled: Boolean(paperId),
  });
}

export function useGenerationRun(runId: string | null | undefined) {
  return useQuery<GenerationRunRow, ApiError>({
    queryKey: queryKeys.papers.run(runId ?? ''),
    queryFn: ({ signal }) => paperService.getGenerationRun(runId!, signal),
    enabled: Boolean(runId),
  });
}

export function useBlueprintRuns(blueprintId: string | null) {
  return useQuery<SchoolPage<GenerationRunRow>, ApiError>({
    queryKey: queryKeys.papers.runs(blueprintId ?? ''),
    queryFn: ({ signal }) =>
      paperService.listGenerationRuns({ blueprint_id: blueprintId! }, signal),
    enabled: Boolean(blueprintId),
  });
}
