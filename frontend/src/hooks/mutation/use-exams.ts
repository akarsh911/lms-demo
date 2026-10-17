'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ApiError } from '@/services/api';
import { examService } from '@/services/exams';
import type { ExamMarkBatch, ExamMarkBatchResult } from '@/types/exam-marks';
import type {
  ExamCreate,
  ExamPatch,
  ExamRow,
  ExamSittingCreate,
  ExamSittingRow,
  ExamSubjectCreate,
  ExamSubjectPatch,
  ExamSubjectRow,
} from '@/types/exams';

import { useGapEvidence, type CheckerSource } from './use-gap-evidence';

function useExamWrite<TData, TVars>(mutationFn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.exams.all });
    },
  });
}

export function useCreateExam() {
  return useExamWrite<ExamRow, ExamCreate>((body) => examService.createExam(body));
}

export function useUpdateExam() {
  return useExamWrite<ExamRow, { id: string; patch: ExamPatch }>(({ id, patch }) =>
    examService.updateExam(id, patch),
  );
}

export function useDeleteExam() {
  return useExamWrite<void, string>((id) => examService.deleteExam(id));
}

export function useCreateExamSubject(examId: string | null) {
  return useExamWrite<ExamSubjectRow, ExamSubjectCreate>((body) => {
    if (!examId) throw noExam();
    return examService.createSubject(examId, body);
  });
}

export function useUpdateExamSubject() {
  return useExamWrite<ExamSubjectRow, { id: string; patch: ExamSubjectPatch }>(
    ({ id, patch }) => examService.updateSubject(id, patch),
  );
}

export function useDeleteExamSubject() {
  return useExamWrite<void, string>((id) => examService.deleteSubject(id));
}

export function useScheduleSitting() {
  return useExamWrite<ExamSittingRow, { subjectId: string; body: ExamSittingCreate }>(
    ({ subjectId, body }) => examService.createSitting(subjectId, body),
  );
}

export function useDeleteSitting() {
  return useExamWrite<void, string>((id) => examService.deleteSitting(id));
}

export function useRecordExamMarks(checker?: CheckerSource) {
  const evidence = useGapEvidence();
  return useExamWrite<ExamMarkBatchResult, ExamMarkBatch>(async (body) => {
    const result = await examService.recordMarks(body);
    evidence.marks(body, checker);
    return result;
  });
}

function noExam(): ApiError {
  return new ApiError(400, 'no_exam', 'Choose an assessment first.');
}

export interface SetTest {
  exam: ExamCreate;
  papers: ExamSubjectCreate[];
}

// A teacher's own test: the examination, then one paper for each section it is set in.
export function useSetTest() {
  const queryClient = useQueryClient();
  return useMutation<ExamRow, ApiError, SetTest>({
    mutationFn: async ({ exam, papers }) => {
      const created = await examService.createExam(exam);
      for (const paper of papers) await examService.createSubject(created.id, paper);
      return created;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.exams.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.grades.all });
    },
  });
}
