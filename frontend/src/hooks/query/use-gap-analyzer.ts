'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { gapAnalyzerService } from '@/services/gap-analyzer';
import type { ClassAnalysis, GapScope, LearnerAnalysis, SchoolAnalysis } from '@/types/gap-analyzer';

const ANALYSIS_STALE_MS = 60_000;

export function useGapScope() {
  return useQuery<GapScope, ApiError>({
    queryKey: queryKeys.gapAnalyzer.scope(),
    queryFn: ({ signal }) => gapAnalyzerService.scope(signal),
    staleTime: ANALYSIS_STALE_MS,
  });
}

export function useLearnerGaps(studentId: string | null) {
  return useQuery<LearnerAnalysis, ApiError>({
    queryKey: queryKeys.gapAnalyzer.learner(studentId ?? ''),
    queryFn: ({ signal }) => gapAnalyzerService.learner(studentId ?? '', signal),
    enabled: Boolean(studentId),
    staleTime: 0,
  });
}

export function useClassGaps(sectionId: string | null, subjectCode: string | null) {
  return useQuery<ClassAnalysis, ApiError>({
    queryKey: queryKeys.gapAnalyzer.section(sectionId ?? '', subjectCode ?? ''),
    queryFn: ({ signal }) => gapAnalyzerService.section(sectionId ?? '', subjectCode ?? '', signal),
    enabled: Boolean(sectionId && subjectCode),
    staleTime: ANALYSIS_STALE_MS,
  });
}

export function useGradeGaps(grade: number | null, subjectCode: string) {
  return useQuery<SchoolAnalysis, ApiError>({
    queryKey: queryKeys.gapAnalyzer.grade(grade ?? 0, subjectCode),
    queryFn: ({ signal }) => gapAnalyzerService.grade(grade ?? 0, subjectCode, signal),
    enabled: grade !== null,
    staleTime: ANALYSIS_STALE_MS,
  });
}
