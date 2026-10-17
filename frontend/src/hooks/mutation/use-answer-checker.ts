'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { linkedExamName, questionTotal, setQuestions } from '@/lib/answer-checker/paper';
import { answerCheckerService, checkingPaperService } from '@/services/answer-checker';
import { omrService } from '@/services/omr';
import { ApiError } from '@/services/api';
import type {
  BookletRef,
  BookletResult,
  CheckerExam,
  CheckerJob,
  IdentityIn,
  OmrSheetIn,
  OmrSheetResult,
  PresetStrictness,
  QuestionEdit,
  RemarkResult,
} from '@/types/answer-checker';
import type { Paper } from '@/types/papersetter';

import { useGapEvidence } from './use-gap-evidence';

const QUESTION_PAPER = 'paper.pdf';
const ANSWER_KEY = 'answer-key.pdf';

export interface Started {
  exam: CheckerExam;
  job: CheckerJob;
}

function useInvalidateExam(): (examId: string) => Promise<void> {
  const client = useQueryClient();
  return async (examId) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.answerChecker.exam(examId) }),
      client.invalidateQueries({ queryKey: queryKeys.answerChecker.booklets(examId) }),
      client.invalidateQueries({ queryKey: queryKeys.answerChecker.results(examId) }),
      client.invalidateQueries({ queryKey: queryKeys.answerChecker.exams() }),
    ]);
  };
}

export function useStartChecking() {
  const invalidate = useInvalidateExam();
  return useMutation<Started, ApiError, { paper: Paper; klass: string }>({
    mutationFn: async ({ paper, klass }) => {
      const { artefacts } = await checkingPaperService.artefacts(paper.paper_id);
      const names = new Set(artefacts.map((artefact) => artefact.name));
      if (!names.has(ANSWER_KEY)) {
        throw new ApiError(422, 'no_answer_key', 'The paper setter holds no answer key for this paper, so the checker has nothing to build a marking scheme from.');
      }
      const [questionPaper, answerKey] = await Promise.all([
        names.has(QUESTION_PAPER) ? checkingPaperService.artefactFile(paper.paper_id, QUESTION_PAPER) : Promise.resolve(null),
        checkingPaperService.artefactFile(paper.paper_id, ANSWER_KEY),
      ]);
      const exam = await answerCheckerService.createExam({
        name: linkedExamName(paper),
        subject: paper.subject ?? '',
        klass,
        languages: ['english'],
        total_marks: questionTotal(setQuestions(paper)) || (paper.marks ?? null),
      });
      await answerCheckerService.uploadDocuments(exam.id, paper, questionPaper, answerKey);
      const job = await answerCheckerService.compileRubric(exam.id);
      return { exam, job };
    },
    onSuccess: ({ exam }) => invalidate(exam.id),
  });
}

export function useApproveRubric(examId: string) {
  const client = useQueryClient();
  const invalidate = useInvalidateExam();
  return useMutation<{ approved: boolean; version: number }, ApiError, void>({
    mutationFn: () => answerCheckerService.approveRubric(examId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.answerChecker.rubric(examId) });
      await invalidate(examId);
    },
  });
}

export function useUploadScans(examId: string) {
  const invalidate = useInvalidateExam();
  return useMutation<CheckerJob, ApiError, { files: readonly File[]; expected: number | null }>({
    mutationFn: ({ files, expected }) => answerCheckerService.uploadScans(examId, files, expected),
    onSuccess: () => invalidate(examId),
  });
}

export function useConfirmBooklets(examId: string) {
  const invalidate = useInvalidateExam();
  return useMutation<BookletRef[], ApiError, { bookletId: string; identity: IdentityIn }[]>({
    mutationFn: (rows) => Promise.all(rows.map((row) => answerCheckerService.setIdentity(examId, row.bookletId, row.identity))),
    onSettled: () => invalidate(examId),
  });
}

export function useMarkClass(examId: string) {
  const invalidate = useInvalidateExam();
  return useMutation<CheckerJob, ApiError, PresetStrictness>({
    mutationFn: async (level) => {
      await answerCheckerService.setStrictness(examId, level);
      return answerCheckerService.markAll(examId, null);
    },
    onSuccess: () => invalidate(examId),
  });
}

function useInvalidateBooklet(examId: string): (bookletId: string) => Promise<void> {
  const client = useQueryClient();
  const invalidate = useInvalidateExam();
  return async (bookletId) => {
    await client.invalidateQueries({ queryKey: queryKeys.answerChecker.booklet(examId, bookletId) });
    await invalidate(examId);
  };
}

export function useRemarkBooklet(examId: string, bookletId: string) {
  const refresh = useInvalidateBooklet(examId);
  return useMutation<RemarkResult, ApiError, PresetStrictness>({
    mutationFn: (level) => answerCheckerService.remark(examId, bookletId, level),
    onSuccess: () => refresh(bookletId),
  });
}

export function useEditQuestion(examId: string, bookletId: string) {
  const refresh = useInvalidateBooklet(examId);
  return useMutation<BookletResult, ApiError, { number: string; edit: QuestionEdit }>({
    mutationFn: ({ number, edit }) => answerCheckerService.editQuestion(examId, bookletId, number, edit),
    onSuccess: () => refresh(bookletId),
  });
}

export function useSignOff(examId: string, bookletId: string) {
  const refresh = useInvalidateBooklet(examId);
  return useMutation<{ signed_off: string }, ApiError, void>({
    mutationFn: () => answerCheckerService.signOff(examId, bookletId),
    onSuccess: () => refresh(bookletId),
  });
}

export interface ScoredSheets {
  sheets: OmrSheetResult[];
  generatedKey: boolean;
}

async function withKey(paper: Paper): Promise<boolean> {
  const { key, generated } = await checkingPaperService.answerKey(paper);
  await omrService.putKey(paper.paper_id, key);
  return generated;
}

function useInvalidateSheets(paperId: string): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: queryKeys.answerChecker.omrSheets(paperId) });
}

export function useScoreSheets(paper: Paper) {
  const invalidate = useInvalidateSheets(paper.paper_id);
  const evidence = useGapEvidence();
  return useMutation<ScoredSheets, ApiError, OmrSheetIn[]>({
    mutationFn: async (sheets) => {
      const generatedKey = await withKey(paper);
      const scored: OmrSheetResult[] = [];
      for (const sheet of sheets) scored.push(await omrService.submitSheet(paper.paper_id, sheet));
      return { sheets: scored, generatedKey };
    },
    onSuccess: ({ sheets }) => evidence.omr(paper, sheets),
    onSettled: invalidate,
  });
}

export function useUploadSheetImages(paper: Paper) {
  const invalidate = useInvalidateSheets(paper.paper_id);
  const evidence = useGapEvidence();
  return useMutation<ScoredSheets, ApiError, { file: File; roll: string; name: string }[]>({
    mutationFn: async (uploads) => {
      const generatedKey = await withKey(paper);
      const scored: OmrSheetResult[] = [];
      for (const upload of uploads) scored.push(await omrService.submitImage(paper.paper_id, upload.file, upload.roll, upload.name));
      return { sheets: scored, generatedKey };
    },
    onSuccess: ({ sheets }) => evidence.omr(paper, sheets),
    onSettled: invalidate,
  });
}

export function useResetDemo() {
  const client = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: () => answerCheckerService.resetDemo(),
    onSettled: () =>
      Promise.all([queryKeys.answerChecker.all, queryKeys.gapAnalyzer.all, queryKeys.lessonPlanner.all].map((queryKey) => client.invalidateQueries({ queryKey }))),
  });
}
