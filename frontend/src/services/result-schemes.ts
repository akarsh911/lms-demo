import { config } from '@/config';
import { ASSIGNMENTS } from '@/fixtures/data/classroom';
import {
  COMPONENT_ASSIGNMENTS,
  COMPONENT_EXAMS,
  EXAMS,
  RESULT_COMPONENTS,
  RESULT_SCHEMES,
} from '@/fixtures/data/exams';
import * as fixtures from '@/fixtures/exams';
import { where } from '@/fixtures/rows';

import { coreApi } from './api';
import { dev, devDelete, devPatch } from './dev-bypass';
import { MAX_PAGE, type ListQuery } from './school';
import type { AssignmentRow } from '@/types/classroom';
import type {
  ExamRow,
  ResultComponent,
  ResultComponentAssignmentLink,
  ResultComponentExamLink,
  ResultComponentWrite,
  ResultScheme,
  ResultSchemeCreate,
  ResultSchemePatch,
} from '@/types/result-scheme';

interface ListEnvelope {
  count?: number;
  [key: string]: unknown;
}

async function rows<T>(
  path: string,
  key: string,
  query: ListQuery,
  signal?: AbortSignal,
): Promise<T[]> {
  const body = await coreApi.get<ListEnvelope>(path, query, signal);
  const list = body[key];
  return Array.isArray(list) ? (list as T[]) : [];
}

function unwrap<T>(key: string) {
  return (body: Record<string, unknown>): T => body[key] as T;
}

const scheme = unwrap<ResultScheme>('result_scheme');
const component = unwrap<ResultComponent>('result_component');

export const resultSchemeService = {
  listSchemes: (sessionId: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => where(RESULT_SCHEMES, { academic_session_id: sessionId }))
      : rows<ResultScheme>(
          'result-schemes',
          'result_schemes',
          { limit: MAX_PAGE, offset: 0, academic_session_id: sessionId },
          signal,
        ),

  createScheme: (body: ResultSchemeCreate) =>
    config.devBypass
      ? dev(() => fixtures.createScheme(body))
      : coreApi.post<Record<string, unknown>>('result-schemes', body).then(scheme),

  reviseScheme: (id: string, patch: ResultSchemePatch) =>
    config.devBypass
      ? devPatch(RESULT_SCHEMES, id, patch)
      : coreApi.patch<Record<string, unknown>>(`result-schemes/${id}`, patch).then(scheme),

  deleteScheme: (id: string) =>
    config.devBypass ? devDelete(RESULT_SCHEMES, id) : coreApi.delete<void>(`result-schemes/${id}`),

  listComponents: (schemeId: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => RESULT_COMPONENTS.filter((row) => row.result_scheme_id === schemeId))
      : rows<ResultComponent>(
          `result-schemes/${schemeId}/components`,
          'result_components',
          {},
          signal,
        ),

  createComponent: (schemeId: string, body: ResultComponentWrite) =>
    config.devBypass
      ? dev(() => fixtures.createComponent(schemeId, body))
      : coreApi
          .post<Record<string, unknown>>(`result-schemes/${schemeId}/components`, body)
          .then(component),

  updateComponent: (id: string, body: ResultComponentWrite) =>
    config.devBypass
      ? devPatch(RESULT_COMPONENTS, id, body)
      : coreApi
          .patch<Record<string, unknown>>(`result-components/${id}`, body)
          .then(component),

  deleteComponent: (id: string) =>
    config.devBypass ? devDelete(RESULT_COMPONENTS, id) : coreApi.delete<void>(`result-components/${id}`),

  listComponentExams: (componentId: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => COMPONENT_EXAMS.filter((link) => link.result_component_id === componentId))
      : rows<ResultComponentExamLink>(
          `result-components/${componentId}/exams`,
          'result_component_exams',
          {},
          signal,
        ),

  linkExam: (componentId: string, examId: string) =>
    config.devBypass
      ? dev(() => fixtures.linkExam(componentId, examId))
      : coreApi.post<Record<string, unknown>>(`result-components/${componentId}/exams`, {
          exam_id: examId,
        }),

  unlinkExam: (componentId: string, examId: string) =>
    config.devBypass
      ? dev(() => fixtures.unlinkExam(componentId, examId))
      : coreApi.delete<void>(`result-components/${componentId}/exams/${examId}`),

  listComponentAssignments: (componentId: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => COMPONENT_ASSIGNMENTS.filter((link) => link.result_component_id === componentId))
      : rows<ResultComponentAssignmentLink>(
          `result-components/${componentId}/assignments`,
          'result_component_assignments',
          {},
          signal,
        ),

  linkAssignment: (componentId: string, assignmentId: string) =>
    config.devBypass
      ? dev(() => fixtures.linkAssignment(componentId, assignmentId))
      : coreApi.post<Record<string, unknown>>(
          `result-components/${componentId}/assignments`,
          { assignment_id: assignmentId },
        ),

  unlinkAssignment: (componentId: string, assignmentId: string) =>
    config.devBypass
      ? dev(() => fixtures.unlinkAssignment(componentId, assignmentId))
      : coreApi.delete<void>(
          `result-components/${componentId}/assignments/${assignmentId}`,
        ),

  listExams: (sessionId: string, branchId: string | null, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => where(EXAMS, { academic_session_id: sessionId, branch_id: branchId ?? undefined }))
      : rows<ExamRow>(
          'exams',
          'exams',
          {
            limit: MAX_PAGE,
            offset: 0,
            academic_session_id: sessionId,
            ...(branchId ? { branch_id: branchId } : {}),
          },
          signal,
        ),

  listAssignments: (sessionId: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => where(ASSIGNMENTS, { academic_session_id: sessionId }))
      : rows<AssignmentRow>(
          'assignments',
          'assignments',
          { limit: MAX_PAGE, offset: 0, academic_session_id: sessionId },
          signal,
        ),
};
