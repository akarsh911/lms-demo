import type { ChipTone } from '@/components/ui/chip';
import type { ReportSubjectLine, ReportSubjectStatus } from '@/types/report-card';
import type { PupilResult } from '@/types/results';

export const REPORT_STATUS_LABELS: Record<ReportSubjectStatus, string> = {
  final: 'Final',
  provisional: 'Provisional',
  partly_composed: 'Scheme not whole',
  in_progress: 'Marks still coming',
  awaiting_marks: 'Awaiting marks',
  exempt: 'Exempt',
  not_composed: 'Not composed',
  result_scheme_unfilled_for_offering: 'Scheme not filled in',
  result_not_computable: 'No result could be computed',
};

export const REPORT_STATUS_TONES: Record<ReportSubjectStatus, ChipTone> = {
  final: 'green',
  provisional: 'amber',
  partly_composed: 'orange',
  in_progress: 'blue',
  awaiting_marks: 'grey',
  exempt: 'teal',
  not_composed: 'grey',
  result_scheme_unfilled_for_offering: 'lilac',
  result_not_computable: 'coral',
};

export function reportStatusLabel(status: string): string {
  return REPORT_STATUS_LABELS[status as ReportSubjectStatus] ?? status;
}

export function reportStatusTone(status: string): ChipTone {
  return REPORT_STATUS_TONES[status as ReportSubjectStatus] ?? 'grey';
}

export interface ReportStatusCount {
  status: string;
  label: string;
  tone: ChipTone;
  count: number;
}

export function reportStatusTally(
  tally: Record<string, number> | undefined,
): ReportStatusCount[] {
  return Object.entries(tally ?? {})
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({
      status,
      label: reportStatusLabel(status),
      tone: reportStatusTone(status),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function reportPupilResult(
  studentId: string,
  line: ReportSubjectLine,
): PupilResult | null {
  if (!line.result) return null;
  return { student_id: studentId, final: line.final, result: line.result };
}
