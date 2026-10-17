import { config } from '@/config';
import { studentReportCard } from '@/fixtures/exams';

import { coreApi } from './api';
import { dev } from './dev-bypass';
import type { ReportCard } from '@/types/report-card';

export interface ReportCardQuery {
  academic_session_id?: string;
}

export const reportCardsService = {
  getStudentReportCard: (studentId: string, query: ReportCardQuery, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => studentReportCard(studentId, query.academic_session_id))
      : coreApi.get<ReportCard>(`students/${studentId}/report-card`, { ...query }, signal),
};
