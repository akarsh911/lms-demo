'use client';

import { useQueries, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { SetQuestion } from '@/lib/answer-checker/paper';
import { answerCheckerService, checkingPaperService } from '@/services/answer-checker';
import { omrService } from '@/services/omr';
import type { ApiError } from '@/services/api';
import type {
  BookletRef,
  CheckerExamDetail,
  CheckerExamSummary,
  CheckerHealth,
  CheckerJob,
  ClassResults,
  MarkedBooklet,
  OmrSheetResult,
  RubricWithAudit,
} from '@/types/answer-checker';
import type { Paper, PaperSummary } from '@/types/papersetter';
import type { EnrichedPassage } from '@/types/retrieval';

const JOB_POLL_MS = 800;
const FINISHED = new Set(['done', 'failed', 'cancelled']);

export function useCheckerHealth() {
  return useQuery<CheckerHealth, ApiError>({
    queryKey: queryKeys.answerChecker.health(),
    queryFn: ({ signal }) => answerCheckerService.health(signal),
    staleTime: 60_000,
  });
}

export function useCheckablePapers() {
  return useQuery<PaperSummary[], ApiError>({
    queryKey: queryKeys.answerChecker.papers(),
    queryFn: ({ signal }) => checkingPaperService.listPapers(signal),
  });
}

export function useCheckablePaper(paperId: string | null) {
  return useQuery<Paper, ApiError>({
    queryKey: queryKeys.answerChecker.paper(paperId ?? ''),
    queryFn: ({ signal }) => checkingPaperService.getPaper(paperId ?? '', signal),
    enabled: Boolean(paperId),
    retry: (failures, error) => error.status !== 404 && failures < 3,
  });
}

export function useQuestionReferences(paper: Paper | undefined, questions: readonly SetQuestion[]) {
  return useQueries({
    queries: questions.map((question) => ({
      queryKey: queryKeys.answerChecker.references(paper?.paper_id ?? '', question.n),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        paper ? checkingPaperService.references(paper, question.n, question.text, signal) : Promise.resolve<EnrichedPassage[]>([]),
      enabled: Boolean(paper),
      staleTime: Infinity,
    })),
  });
}

export function useCheckerExams() {
  return useQuery<CheckerExamSummary[], ApiError>({
    queryKey: queryKeys.answerChecker.exams(),
    queryFn: ({ signal }) => answerCheckerService.listExams(signal),
  });
}

export function useCheckerExam(examId: string | null) {
  return useQuery<CheckerExamDetail, ApiError>({
    queryKey: queryKeys.answerChecker.exam(examId ?? ''),
    queryFn: ({ signal }) => answerCheckerService.getExam(examId ?? '', signal),
    enabled: Boolean(examId),
  });
}

export function useCheckerRubric(examId: string | null, enabled: boolean) {
  return useQuery<RubricWithAudit, ApiError>({
    queryKey: queryKeys.answerChecker.rubric(examId ?? ''),
    queryFn: ({ signal }) => answerCheckerService.getRubric(examId ?? '', signal),
    enabled: Boolean(examId) && enabled,
  });
}

export function useCheckerBooklets(examId: string | null) {
  return useQuery<BookletRef[], ApiError>({
    queryKey: queryKeys.answerChecker.booklets(examId ?? ''),
    queryFn: ({ signal }) => answerCheckerService.listBooklets(examId ?? '', signal),
    enabled: Boolean(examId),
  });
}

export function useMarkedBooklet(examId: string | null, bookletId: string | null) {
  return useQuery<MarkedBooklet, ApiError>({
    queryKey: queryKeys.answerChecker.booklet(examId ?? '', bookletId ?? ''),
    queryFn: ({ signal }) => answerCheckerService.getBooklet(examId ?? '', bookletId ?? '', signal),
    enabled: Boolean(examId) && Boolean(bookletId),
  });
}

export function useClassResults(examId: string | null, enabled = true) {
  return useQuery<ClassResults, ApiError>({
    queryKey: queryKeys.answerChecker.results(examId ?? ''),
    queryFn: ({ signal }) => answerCheckerService.results(examId ?? '', signal),
    enabled: Boolean(examId) && enabled,
  });
}

export function useCheckerJob(jobId: string | null) {
  return useQuery<CheckerJob, ApiError>({
    queryKey: queryKeys.answerChecker.job(jobId ?? ''),
    queryFn: ({ signal }) => answerCheckerService.job(jobId ?? '', signal),
    enabled: Boolean(jobId),
    refetchInterval: (query) => (query.state.data && FINISHED.has(query.state.data.state) ? false : JOB_POLL_MS),
  });
}

export function jobFinished(job: CheckerJob | undefined): boolean {
  return Boolean(job && FINISHED.has(job.state));
}

export function useOmrSheets(paperId: string) {
  return useQuery<{ sheets: OmrSheetResult[] }, ApiError>({
    queryKey: queryKeys.answerChecker.omrSheets(paperId),
    queryFn: ({ signal }) => omrService.listSheets(paperId, signal),
  });
}
