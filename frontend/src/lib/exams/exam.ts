import { apiFailureKind, SESSION_ENDED, STEP_UP_NEEDED } from '@/lib/api-failure';
import { ApiError } from '@/services/api';
import type { AssessmentKind, ExamRow, ExamStatus, ExamType } from '@/types/exams';

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  unit_test: 'Unit test',
  term: 'Term examination',
  practice: 'Practice paper',
  board: 'Board examination',
};

export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

export const ASSESSMENT_KIND_LABELS: Record<AssessmentKind, string> = {
  evaluative: 'Counts toward the report card',
  practice: 'Does not count toward the report card',
};

export const ASSESSMENT_KIND_CHOICE: Record<AssessmentKind, string> = {
  evaluative: 'Evaluative — every mark counts toward the report card',
  practice: 'Practice — marked and shown, and counted toward nothing',
};

export type ResultsStance = 'counts' | 'practice' | 'unstated';

export function resultsStance(exam: ExamRow | undefined): ResultsStance {
  if (exam?.assessment_kind === 'practice') return 'practice';
  if (exam?.assessment_kind === 'evaluative') return 'counts';
  return 'unstated';
}

export function assessmentKindOf(exam: ExamRow | undefined): AssessmentKind {
  return exam?.assessment_kind === 'practice' ? 'practice' : 'evaluative';
}

export function practiceCount(exams: readonly ExamRow[]): number {
  return exams.filter((exam) => resultsStance(exam) === 'practice').length;
}

export function namedPaperButCounts(
  type: ExamType | undefined,
  kind: AssessmentKind,
): boolean {
  return type === 'practice' && kind === 'evaluative';
}

export function countedNowhereDespiteType(
  type: ExamType | undefined,
  kind: AssessmentKind,
): boolean {
  return kind === 'practice' && type !== undefined && type !== 'practice';
}

export function examLabel(exam: ExamRow | undefined): string {
  if (!exam) return 'Unknown assessment';
  return exam.name ?? exam.code ?? 'Assessment';
}

export function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function instantDate(instant: string | undefined): string {
  if (!instant) return '';
  const at = new Date(instant);
  return Number.isNaN(at.getTime()) ? '' : localParts(at).date;
}

export function instantLabel(instant: string | undefined): string | null {
  if (!instant) return null;
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function examWindowLabel(exam: ExamRow | undefined): string | null {
  const from = instantLabel(exam?.start_at);
  const to = instantLabel(exam?.end_at);
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return null;
}

export function toLocalInput(instant: string | undefined): string {
  if (!instant) return '';
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return '';
  const parts = localParts(at);
  return `${parts.date}T${parts.time}`;
}

export function toInstant(local: string): string | undefined {
  if (local.trim() === '') return undefined;
  const at = new Date(local);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

export function windowIsBackwards(start: string, end: string): boolean {
  if (start.trim() === '' || end.trim() === '') return false;
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return false;
  return to < from;
}

export function failureText(error: unknown): string {
  const kind = apiFailureKind(error);
  if (kind === 'signed_out') return SESSION_ENDED;
  if (kind === 'step_up') return STEP_UP_NEEDED;
  if (error instanceof ApiError && error.message.trim() !== '') return error.message;
  return 'That could not be saved. Try again in a moment.';
}

function localParts(at: Date): { date: string; time: string } {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return {
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  };
}
