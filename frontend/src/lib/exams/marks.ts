import { ApiError } from '@/services/api';
import type {
  ExamMarkBatch,
  ExamMarkEntry,
  ExamMarkRefusal,
  ExamMarkRow,
  ExamMarkStatus,
} from '@/types/exam-marks';
import { trimNumber } from './exam';

export type DraftStatus = ExamMarkStatus | 'blank';

export interface MarkDraft {
  status: DraftStatus;
  value: string;
}

export const BLANK_DRAFT: MarkDraft = { status: 'blank', value: '' };

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  blank: 'Not entered',
  marked: 'Marked',
  absent: 'Absent',
  exempt: 'Exempt',
};

const NUMBER_SHAPE = /^\d+(?:[.,]\d+)?$/;

export function parseMark(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!NUMBER_SHAPE.test(trimmed)) return null;
  const parsed = Number.parseFloat(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function draftFromRow(row: ExamMarkRow | undefined): MarkDraft {
  if (!row?.status) return BLANK_DRAFT;
  if (row.status !== 'marked') return { status: row.status, value: '' };
  return {
    status: 'marked',
    value: row.marks_obtained === undefined ? '' : trimNumber(row.marks_obtained),
  };
}

export function markWithheld(row: ExamMarkRow | undefined): boolean {
  return row?.status === 'marked' && row.marks_obtained === undefined;
}

export function draftProblem(
  draft: MarkDraft,
  maximum: number | undefined,
): string | null {
  if (draft.status !== 'marked') return null;
  if (draft.value.trim() === '') {
    return 'Type a mark, or record this pupil as absent or exempt.';
  }
  const parsed = parseMark(draft.value);
  if (parsed === null) return 'A mark is a number.';
  if (parsed < 0) return 'A mark cannot be negative.';
  if (maximum !== undefined && parsed > maximum) {
    return `Above the ${trimNumber(maximum)} this paper is marked out of.`;
  }
  return null;
}

export function rowProblem(
  draft: MarkDraft,
  row: ExamMarkRow | undefined,
  maximum: number | undefined,
): string | null {
  if (markWithheld(row) && sameAsSaved(draft, row)) return null;
  return draftProblem(draft, maximum);
}

export function sameAsSaved(draft: MarkDraft, row: ExamMarkRow | undefined): boolean {
  if (!row?.status) return draft.status === 'blank';
  if (row.status !== 'marked') return draft.status === row.status;
  if (draft.status !== 'marked') return false;
  if (markWithheld(row)) return draft.value.trim() === '';
  return parseMark(draft.value) === row.marks_obtained;
}

export function entryFor(
  studentId: string,
  draft: MarkDraft,
  row: ExamMarkRow | undefined,
): ExamMarkEntry | null {
  if (draft.status === 'blank') return null;
  const entry: ExamMarkEntry = { student_id: studentId, status: draft.status };
  if (draft.status === 'marked') {
    const parsed = parseMark(draft.value);
    if (parsed === null) return null;
    entry.marks_obtained = parsed;
  }
  if (row?.remarks !== undefined) entry.remarks = row.remarks;
  return entry;
}

export function entriesToSend(
  order: readonly string[],
  drafts: ReadonlyMap<string, MarkDraft>,
  saved: ReadonlyMap<string, ExamMarkRow>,
): ExamMarkEntry[] {
  const out: ExamMarkEntry[] = [];
  for (const studentId of order) {
    const draft = drafts.get(studentId) ?? BLANK_DRAFT;
    const row = saved.get(studentId);
    if (sameAsSaved(draft, row)) continue;
    const entry = entryFor(studentId, draft, row);
    if (entry) out.push(entry);
  }
  return out;
}

export function buildBatch(
  examSubjectId: string,
  sittingId: string | null,
  entries: readonly ExamMarkEntry[],
): ExamMarkBatch {
  const batch: ExamMarkBatch = { exam_subject_id: examSubjectId, marks: [...entries] };
  if (sittingId) batch.exam_sitting_id = sittingId;
  return batch;
}

function refusalOf(error: unknown): ExamMarkRefusal | null {
  if (!(error instanceof ApiError)) return null;
  const details = error.details;
  if (typeof details !== 'object' || details === null) return null;
  return details as ExamMarkRefusal;
}

export function isUnsavableClear(
  draft: MarkDraft,
  row: ExamMarkRow | undefined,
): boolean {
  return draft.status === 'blank' && Boolean(row?.status);
}

export function unsavableClearCount(
  order: readonly string[],
  drafts: ReadonlyMap<string, MarkDraft>,
  saved: ReadonlyMap<string, ExamMarkRow>,
): number {
  let count = 0;
  for (const studentId of order) {
    if (isUnsavableClear(drafts.get(studentId) ?? BLANK_DRAFT, saved.get(studentId))) {
      count += 1;
    }
  }
  return count;
}

export function refusedStudents(error: unknown): string[] {
  const refusal = refusalOf(error);
  if (!refusal) return [];
  const out: string[] = [];
  if (typeof refusal.student_id === 'string') out.push(refusal.student_id);
  for (const list of [refusal.unreachable, refusal.not_enrolled]) {
    if (!Array.isArray(list)) continue;
    out.push(...list.filter((value): value is string => typeof value === 'string'));
  }
  return out;
}

export interface DraftTally {
  marked: number;
  absent: number;
  exempt: number;
  blank: number;
}

export function tallyDrafts(
  order: readonly string[],
  drafts: ReadonlyMap<string, MarkDraft>,
): DraftTally {
  const tally: DraftTally = { marked: 0, absent: 0, exempt: 0, blank: 0 };
  for (const studentId of order) {
    tally[(drafts.get(studentId) ?? BLANK_DRAFT).status] += 1;
  }
  return tally;
}

export function problemCount(
  order: readonly string[],
  drafts: ReadonlyMap<string, MarkDraft>,
  saved: ReadonlyMap<string, ExamMarkRow>,
  maximum: number | undefined,
): number {
  let count = 0;
  for (const studentId of order) {
    const draft = drafts.get(studentId) ?? BLANK_DRAFT;
    if (rowProblem(draft, saved.get(studentId), maximum)) count += 1;
  }
  return count;
}
