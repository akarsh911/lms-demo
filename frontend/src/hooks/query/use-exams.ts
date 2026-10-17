'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { examService } from '@/services/exams';
import { schoolService } from '@/services/school';
import type { ApiError } from '@/services/api';
import type { ExamMarkRow } from '@/types/exam-marks';
import type { ExamRow, ExamSittingRow, ExamSubjectRow } from '@/types/exams';
import type { CalendarDay, Period } from '@/types/school';

export function useExams(branchId: string | null, sessionId: string | null) {
  return useQuery<ExamRow[], ApiError>({
    queryKey: queryKeys.exams.list(branchId ?? '', sessionId ?? ''),
    queryFn: ({ signal }) =>
      examService.listExams(
        { branch_id: branchId!, academic_session_id: sessionId! },
        signal,
      ),
    enabled: Boolean(branchId) && Boolean(sessionId),
  });
}

export function useExam(examId: string | null) {
  return useQuery<ExamRow, ApiError>({
    queryKey: queryKeys.exams.exam(examId ?? ''),
    queryFn: ({ signal }) => examService.getExam(examId!, signal),
    enabled: Boolean(examId),
  });
}

export function useExamSubjects(examId: string | null) {
  return useQuery<ExamSubjectRow[], ApiError>({
    queryKey: queryKeys.exams.subjects(examId ?? ''),
    queryFn: ({ signal }) => examService.listSubjects(examId!, signal),
    enabled: Boolean(examId),
  });
}

export function useExamSittings(examId: string | null) {
  return useQuery<ExamSittingRow[], ApiError>({
    queryKey: queryKeys.exams.sittings(examId ?? ''),
    queryFn: ({ signal }) => examService.listSittings({ exam_id: examId! }, signal),
    enabled: Boolean(examId),
  });
}

export function useReachableExams() {
  return useQuery<ExamRow[], ApiError>({
    queryKey: queryKeys.exams.reachable(),
    queryFn: ({ signal }) => examService.listExams({}, signal),
  });
}

export function useExamMarks(examSubjectId: string | null) {
  return useQuery<ExamMarkRow[], ApiError>({
    queryKey: queryKeys.exams.marks(examSubjectId ?? ''),
    queryFn: ({ signal }) =>
      examService.listMarks({ exam_subject_id: examSubjectId! }, signal),
    enabled: Boolean(examSubjectId),
  });
}

export function useSittingDays(dayIds: readonly string[]) {
  const identity = [...dayIds].sort().join(',');
  return useQuery<CalendarDay[], ApiError>({
    queryKey: queryKeys.exams.sittingDays(identity),
    queryFn: ({ signal }) =>
      Promise.all(dayIds.map((id) => schoolService.getCalendarDay(id, signal))),
    enabled: dayIds.length > 0,
  });
}

export function useBranchPeriods(schemeIds: readonly string[]) {
  const identity = [...schemeIds].sort().join(',');
  return useQuery<Period[], ApiError>({
    queryKey: queryKeys.exams.branchPeriods(identity),
    queryFn: async ({ signal }) => {
      const pages = await Promise.all(
        schemeIds.map((schemeId) => schoolService.listPeriods(schemeId, signal)),
      );
      return pages.flatMap((answer) => answer.rows);
    },
    enabled: schemeIds.length > 0,
  });
}
