'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { reportCardsService } from '@/services/report-cards';
import type { ReportCard } from '@/types/report-card';

export type ReportCardQueryResult = UseQueryResult<ReportCard, ApiError>;

export function useReportCard(
  studentId: string | null,
  sessionId: string | null,
  enabled: boolean,
): ReportCardQueryResult {
  return useQuery<ReportCard, ApiError>({
    queryKey: queryKeys.results.reportCard(studentId ?? '', sessionId ?? ''),
    queryFn: ({ signal }) =>
      reportCardsService.getStudentReportCard(
        studentId!,
        sessionId ? { academic_session_id: sessionId } : {},
        signal,
      ),
    enabled: enabled && Boolean(studentId),
    retry: false,
  });
}
