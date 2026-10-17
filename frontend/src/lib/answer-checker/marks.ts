import { trimNumber } from '@/lib/exams/exam';
import type { Annotation, BookletResult } from '@/types/answer-checker';
import type { ExamMarkEntry } from '@/types/exam-marks';

export interface CheckedTotal {
  studentId: string;
  name: string;
  roll: string | null;
  total: number;
  possible: number;
  note: string;
}

const MARK_QUANTUM = 0.5;

export function quantise(value: number): number {
  return Math.round(value / MARK_QUANTUM) * MARK_QUANTUM;
}

export function recordedMark(row: CheckedTotal, maximum: number | undefined, scale: boolean): number {
  if (!scale || maximum === undefined || row.possible <= 0 || row.possible === maximum) return row.total;
  return quantise((row.total / row.possible) * maximum);
}

export function needsScaling(rows: readonly CheckedTotal[], maximum: number | undefined): boolean {
  return maximum !== undefined && rows.some((row) => row.possible > 0 && row.possible !== maximum);
}

export function markEntries(
  rows: readonly CheckedTotal[],
  absentees: readonly string[],
  maximum: number | undefined,
  scale: boolean,
): ExamMarkEntry[] {
  const marked = rows.map<ExamMarkEntry>((row) => ({
    student_id: row.studentId,
    status: 'marked',
    marks_obtained: recordedMark(row, maximum, scale),
    remarks: row.note,
  }));
  const absent = absentees.map<ExamMarkEntry>((studentId) => ({ student_id: studentId, status: 'absent' }));
  return [...marked, ...absent];
}

export function effectiveAnnotations(result: BookletResult): Annotation[] {
  const perQuestion = result.results.flatMap((row) =>
    row.annotations.map((annotation) => (annotation.kind === 'question_marks' ? { ...annotation, text: `${trimNumber(row.marks)}/${trimNumber(row.max_marks)}` } : annotation)),
  );
  return [...perQuestion, ...result.page_annotations];
}
