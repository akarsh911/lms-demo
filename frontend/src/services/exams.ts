import { config } from '@/config';
import { EXAMS, EXAM_MARKS, EXAM_SITTINGS, EXAM_SUBJECTS } from '@/fixtures/data/exams';
import * as fixtures from '@/fixtures/exams';
import { where } from '@/fixtures/rows';

import { coreApi } from './api';
import { dev, devCreate, devDelete, devGet, devPatch } from './dev-bypass';
import type { PageInfo } from '@/types/roster';
import type {
  ExamMarkBatch,
  ExamMarkBatchResult,
  ExamMarkRow,
} from '@/types/exam-marks';
import type {
  ExamCreate,
  ExamPage,
  ExamPatch,
  ExamRow,
  ExamSittingCreate,
  ExamSittingRow,
  ExamSubjectCreate,
  ExamSubjectPatch,
  ExamSubjectRow,
} from '@/types/exams';

export const EXAM_MAX_PAGE = 200;

const EXAM_PAGE_LIMIT = 10;

type ExamQuery = Record<string, string | number | boolean | undefined>;

interface ListEnvelope {
  count?: number;
  page?: PageInfo;
  [key: string]: unknown;
}

async function page<T>(
  path: string,
  key: string,
  query: ExamQuery,
  signal?: AbortSignal,
): Promise<ExamPage<T>> {
  const body = await coreApi.get<ListEnvelope>(path, query, signal);
  const rows = body[key];
  const limit = typeof query.limit === 'number' ? query.limit : 0;
  const offset = typeof query.offset === 'number' ? query.offset : 0;
  return {
    rows: Array.isArray(rows) ? (rows as T[]) : [],
    count: typeof body.count === 'number' ? body.count : 0,
    page: body.page ?? { limit, offset, has_more: false },
  };
}

async function everyRow<T>(
  path: string,
  key: string,
  query: ExamQuery,
  signal?: AbortSignal,
): Promise<T[]> {
  const out: T[] = [];
  for (let index = 0; index < EXAM_PAGE_LIMIT; index += 1) {
    const answer = await page<T>(
      path,
      key,
      { ...query, limit: EXAM_MAX_PAGE, offset: index * EXAM_MAX_PAGE },
      signal,
    );
    out.push(...answer.rows);
    if (!answer.page.has_more || answer.rows.length === 0) break;
  }
  return out;
}

async function unpagedRows<T>(
  path: string,
  key: string,
  signal?: AbortSignal,
): Promise<T[]> {
  return (await page<T>(path, key, {}, signal)).rows;
}

export const examService = {
  listExams: (query: ExamQuery, signal?: AbortSignal) =>
    config.devBypass ? dev(() => where(EXAMS, query)) : everyRow<ExamRow>('exams', 'exams', query, signal),

  getExam: (id: string, signal?: AbortSignal) =>
    config.devBypass ? devGet(EXAMS, id) : coreApi.get<ExamRow>(`exams/${id}`, undefined, signal),

  createExam: (body: ExamCreate) =>
    config.devBypass ? devCreate(EXAMS, body) : coreApi.post<ExamRow>('exams', body),

  updateExam: (id: string, patch: ExamPatch) =>
    config.devBypass ? devPatch(EXAMS, id, patch) : coreApi.patch<ExamRow>(`exams/${id}`, patch),

  deleteExam: (id: string) =>
    config.devBypass ? devDelete(EXAMS, id) : coreApi.delete<void>(`exams/${id}`),

  listSubjects: (examId: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => EXAM_SUBJECTS.filter((subject) => subject.exam_id === examId))
      : unpagedRows<ExamSubjectRow>(`exams/${examId}/subjects`, 'exam_subjects', signal),

  createSubject: (examId: string, body: ExamSubjectCreate) =>
    config.devBypass
      ? devCreate(EXAM_SUBJECTS, { ...body, exam_id: examId })
      : coreApi.post<ExamSubjectRow>(`exams/${examId}/subjects`, body),

  updateSubject: (id: string, patch: ExamSubjectPatch) =>
    config.devBypass
      ? devPatch(EXAM_SUBJECTS, id, patch)
      : coreApi.patch<ExamSubjectRow>(`exam-subjects/${id}`, patch),

  deleteSubject: (id: string) =>
    config.devBypass ? devDelete(EXAM_SUBJECTS, id) : coreApi.delete<void>(`exam-subjects/${id}`),

  listSittings: (query: ExamQuery, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => where(EXAM_SITTINGS, query))
      : everyRow<ExamSittingRow>('exam-sittings', 'exam_sittings', query, signal),

  createSitting: (subjectId: string, body: ExamSittingCreate) =>
    config.devBypass
      ? dev(() => fixtures.createSitting(subjectId, body))
      : coreApi.post<ExamSittingRow>(`exam-subjects/${subjectId}/sittings`, body),

  deleteSitting: (id: string) =>
    config.devBypass ? devDelete(EXAM_SITTINGS, id) : coreApi.delete<void>(`exam-sittings/${id}`),

  listMarks: (query: ExamQuery, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => where(EXAM_MARKS, query))
      : everyRow<ExamMarkRow>('exam-marks', 'exam_marks', query, signal),

  recordMarks: (body: ExamMarkBatch) =>
    config.devBypass
      ? dev(() => fixtures.recordMarks(body))
      : coreApi.post<ExamMarkBatchResult>('exam-marks/batch', body),
};
