import type { ExamMarkBatch, ExamMarkBatchResult, ExamMarkRow } from '@/types/exam-marks';
import type { ExamSittingCreate, ExamSittingRow } from '@/types/exams';
import type { ReportCard } from '@/types/report-card';
import type { ResultScheme, ResultSchemeCreate } from '@/types/result-scheme';
import type { OfferingResults } from '@/types/results';

import { ASSIGNMENTS, SUBJECT_ENROLLMENTS } from './data/classroom';
import {
  COMPONENT_ASSIGNMENTS,
  COMPONENT_EXAMS,
  EXAMS,
  EXAM_MARKS,
  EXAM_SITTINGS,
  EXAM_SUBJECTS,
  RESULT_COMPONENTS,
  RESULT_SCHEMES,
} from './data/exams';
import { CURRENT_SESSION, OFFERINGS } from './data/structure';
import { CALENDAR_DAYS } from './data/timetable';
import { computeResult, reportCard, resultLookups } from './results';
import { byId, fail, insert, must, notFound, patch, remove, type Query } from './rows';

const BATCH_LIMIT = 200;

// Refuses the whole batch for one unenrolled student or one mark out of range, before anything is saved.
export function recordMarks(batch: ExamMarkBatch): ExamMarkBatchResult {
  const subject = must(EXAM_SUBJECTS, batch.exam_subject_id, 'exam subject');
  const entries = batch.marks ?? [];
  if (entries.length === 0 || entries.length > BATCH_LIMIT) fail(422, 'invalid_input', `marks must hold 1 to ${BATCH_LIMIT} entries`);

  const enrolled = new Set(
    SUBJECT_ENROLLMENTS.filter((e) => e.subject_offering_id === subject.subject_offering_id).map((e) => e.student_id),
  );
  const max = subject.maximum_marks ?? 0;
  entries.forEach((entry, index) => {
    const student = entry.student_id ?? '';
    if (!enrolled.has(student)) {
      fail(422, 'invalid_input', 'student is not enrolled in this subject', { index, student_id: student, not_enrolled: [student] });
    }
    const obtained = entry.marks_obtained;
    if (entry.status === 'marked' && (typeof obtained !== 'number' || obtained < 0 || obtained > max)) {
      fail(422, 'invalid_input', `marks_obtained must be between 0 and ${max}`, { index, student_id: student });
    }
  });

  const existing = new Map(EXAM_MARKS.filter((m) => m.exam_subject_id === subject.id).map((m) => [m.student_id, m]));
  const rows: ExamMarkRow[] = [];
  let created = 0;
  for (const entry of entries) {
    const status = entry.status === 'absent' || entry.status === 'exempt' ? entry.status : 'marked';
    const fields = {
      status,
      marks_obtained: status === 'marked' ? (entry.marks_obtained ?? undefined) : undefined,
      remarks: entry.remarks ?? undefined,
      exam_sitting_id: batch.exam_sitting_id ?? undefined,
      provisional: false,
      marked_at: new Date().toISOString(),
    } as Partial<ExamMarkRow>;
    const current = existing.get(entry.student_id);
    if (!current) created += 1;
    const row = current
      ? patch(EXAM_MARKS, current.id, fields)
      : insert(EXAM_MARKS, { ...fields, exam_subject_id: subject.id, student_id: entry.student_id } as Omit<ExamMarkRow, 'id'>);
    if (row) rows.push(row);
  }
  return { exam_marks: rows, created, updated: rows.length - created, count: rows.length } as ExamMarkBatchResult;
}

export function createSitting(subjectId: string, body: ExamSittingCreate): ExamSittingRow {
  const subject = must(EXAM_SUBJECTS, subjectId, 'exam subject');
  if (!body.date || !body.period_id) fail(422, 'invalid_input', 'date and period_id are required');
  const day = CALENDAR_DAYS.find((d) => (d.calendar_date ?? '').startsWith(body.date));
  if (!day) return fail(422, 'invalid_input', 'the date is not in the school calendar');
  return insert(EXAM_SITTINGS, {
    exam_subject_id: subject.id,
    calendar_day_id: day.id,
    period_id: body.period_id,
    section_id: byId(OFFERINGS, subject.subject_offering_id)?.section_id,
    room_id: body.room_id ?? undefined,
  } as Omit<ExamSittingRow, 'id'>);
}

// Computed from the marks and the scheme's components each time, so an edited mark changes the result.
export function offeringResults(offeringId: string, query: Query): OfferingResults {
  const offering = must(OFFERINGS, offeringId, 'subject offering');
  if (!byId(RESULT_SCHEMES, offering.result_scheme_id ?? undefined)) {
    return {
      subject_offering_id: offering.id,
      result_scheme_id: null,
      composed: false,
      reason: 'no result scheme is set for this offering',
      results: [],
      count: 0,
    } as unknown as OfferingResults;
  }

  const roll = SUBJECT_ENROLLMENTS.filter(
    (e) => e.subject_offering_id === offering.id && (!query.student_id || e.student_id === query.student_id),
  );
  const limit = Number(query.limit) || 50;
  const offset = Number(query.offset) || 0;
  const shown = roll.slice(offset, offset + limit);
  const lookups = resultLookups();
  const computed = shown.map((e) => ({ student: e.student_id ?? '', ...computeResult(offering, e.student_id ?? '', lookups) }));
  return {
    subject_offering_id: offering.id,
    result_scheme_id: offering.result_scheme_id ?? null,
    composed: true,
    composition: computed[0]?.composition,
    results: computed.flatMap((c) =>
      c.result ? [{ student_id: c.student, final: c.result.complete && !c.result.provisional, result: c.result }] : [],
    ),
    count: computed.length,
    page: { limit, offset, has_more: shown.length === limit },
  } as unknown as OfferingResults;
}

export const studentReportCard = (studentId: string, sessionId?: string): ReportCard =>
  reportCard(studentId, sessionId ?? CURRENT_SESSION.id) ?? notFound('student');

export function createScheme(body: ResultSchemeCreate): ResultScheme {
  if (!body.name || !body.code) fail(422, 'invalid_input', 'name and code are required');
  return insert(RESULT_SCHEMES, { ...body, total_marks: body.total_marks ?? 100, status: 'draft' } as Omit<ResultScheme, 'id'>);
}

export function createComponent(schemeId: string, body: object): (typeof RESULT_COMPONENTS)[number] {
  const position = RESULT_COMPONENTS.filter((c) => c.result_scheme_id === schemeId).length + 1;
  return insert(RESULT_COMPONENTS, { position, ...body, result_scheme_id: schemeId } as Omit<(typeof RESULT_COMPONENTS)[number], 'id'>);
}

export function linkExam(componentId: string, examId: string): Record<string, unknown> {
  if (!byId(EXAMS, examId)) fail(422, 'invalid_input', 'a known exam_id is required');
  return { result_component_exam: insert(COMPONENT_EXAMS, { result_component_id: componentId, exam_id: examId }) };
}

export function unlinkExam(componentId: string, examId: string): void {
  const link = COMPONENT_EXAMS.find((l) => l.result_component_id === componentId && l.exam_id === examId);
  if (!link || !remove(COMPONENT_EXAMS, link.id)) notFound('link');
}

export function linkAssignment(componentId: string, assignmentId: string): Record<string, unknown> {
  if (!byId(ASSIGNMENTS, assignmentId)) fail(422, 'invalid_input', 'a known assignment_id is required');
  return {
    result_component_assignment: insert(COMPONENT_ASSIGNMENTS, { result_component_id: componentId, assignment_id: assignmentId }),
  };
}

export function unlinkAssignment(componentId: string, assignmentId: string): void {
  const link = COMPONENT_ASSIGNMENTS.find((l) => l.result_component_id === componentId && l.assignment_id === assignmentId);
  if (!link || !remove(COMPONENT_ASSIGNMENTS, link.id)) notFound('link');
}
