'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ApiError } from '@/services/api';
import { paperService } from '@/services/papers';
import type {
  PaperCreate,
  PaperPatch,
  PaperQuestionCreate,
  PaperQuestionRow,
  PaperRow,
  PaperSectionCreate,
  PaperSectionRow,
} from '@/types/papers';

function usePaperWrite<TData, TVars>(mutationFn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.papers.all });
    },
  });
}

export function useCreatePaper() {
  return usePaperWrite<PaperRow, PaperCreate>((body) => paperService.createPaper(body));
}

export function useUpdatePaper() {
  return usePaperWrite<PaperRow, { id: string; patch: PaperPatch }>(({ id, patch }) =>
    paperService.updatePaper(id, patch),
  );
}

export function useDeletePaper() {
  return usePaperWrite<void, string>((id) => paperService.deletePaper(id));
}

export function useCreatePaperSection(paperId: string | null) {
  return usePaperWrite<PaperSectionRow, PaperSectionCreate>((body) => {
    if (!paperId) throw noPaper();
    return paperService.createSection(paperId, body);
  });
}

export function useDeletePaperSection() {
  return usePaperWrite<void, string>((id) => paperService.deleteSection(id));
}

export function useCreatePaperQuestion(sectionId: string | null) {
  return usePaperWrite<PaperQuestionRow, PaperQuestionCreate>((body) => {
    if (!sectionId) throw noSection();
    return paperService.createQuestion(sectionId, body);
  });
}

export function useDeletePaperQuestion() {
  return usePaperWrite<void, string>((id) => paperService.deleteQuestion(id));
}

function noPaper(): ApiError {
  return new ApiError(400, 'no_paper', 'Choose a paper first.');
}

function noSection(): ApiError {
  return new ApiError(400, 'no_section', 'Choose a section first.');
}
