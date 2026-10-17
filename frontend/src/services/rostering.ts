import { config } from '@/config';
import { SUBJECT_ENROLLMENTS } from '@/fixtures/data/classroom';
import { ENROLLMENTS } from '@/fixtures/data/enrollment';
import { TEACHER_ASSIGNMENTS } from '@/fixtures/data/timetable';
import { createEnrollment } from '@/fixtures/roster';

import { coreApi } from './api';
import { dev, devCreate, devDelete, devList, devPatch } from './dev-bypass';
import { MAX_PAGE, type ListQuery } from './school';
import type { EnrollmentRow, TeacherAssignmentRow } from '@/types/academic';
import type { SubjectEnrollmentRow } from '@/types/people-detail';
import type { PageInfo } from '@/types/roster';
import type { SchoolPage } from '@/types/school';
import type {
  EnrollmentWrite,
  SubjectEnrollmentWrite,
  TeacherAssignmentWrite,
} from '@/types/rostering';

interface ListEnvelope {
  count?: number;
  page?: PageInfo;
  [key: string]: unknown;
}

async function list<T>(
  path: string,
  key: string,
  query: ListQuery,
  signal?: AbortSignal,
): Promise<SchoolPage<T>> {
  const body = await coreApi.get<ListEnvelope>(
    path,
    { limit: MAX_PAGE, offset: 0, ...query },
    signal,
  );
  const rows = body[key];
  return {
    rows: Array.isArray(rows) ? (rows as T[]) : [],
    count: typeof body.count === 'number' ? body.count : 0,
    page: body.page ?? { limit: MAX_PAGE, offset: 0, has_more: false },
  };
}

export const rosteringService = {
  listEnrollments: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList<EnrollmentRow>(ENROLLMENTS, { limit: MAX_PAGE, ...query })
      : list<EnrollmentRow>('enrollments', 'enrollments', query, signal),

  createEnrollment: (body: EnrollmentWrite) =>
    config.devBypass ? dev(() => createEnrollment(body)) : coreApi.post<EnrollmentRow>('enrollments', body),

  updateEnrollment: (id: string, body: EnrollmentWrite) =>
    config.devBypass
      ? devPatch<EnrollmentRow>(ENROLLMENTS, id, body)
      : coreApi.patch<EnrollmentRow>(`enrollments/${id}`, body),

  deleteEnrollment: (id: string) =>
    config.devBypass ? devDelete(ENROLLMENTS, id) : coreApi.delete<void>(`enrollments/${id}`),

  listTeacherAssignments: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList<TeacherAssignmentRow>(TEACHER_ASSIGNMENTS, { limit: MAX_PAGE, ...query })
      : list<TeacherAssignmentRow>(
          'teacher-assignments',
          'teacher_assignments',
          query,
          signal,
        ),

  createTeacherAssignment: (body: TeacherAssignmentWrite) =>
    config.devBypass
      ? devCreate<TeacherAssignmentRow>(TEACHER_ASSIGNMENTS, body)
      : coreApi.post<TeacherAssignmentRow>('teacher-assignments', body),

  updateTeacherAssignment: (id: string, body: TeacherAssignmentWrite) =>
    config.devBypass
      ? devPatch<TeacherAssignmentRow>(TEACHER_ASSIGNMENTS, id, body)
      : coreApi.patch<TeacherAssignmentRow>(`teacher-assignments/${id}`, body),

  deleteTeacherAssignment: (id: string) =>
    config.devBypass ? devDelete(TEACHER_ASSIGNMENTS, id) : coreApi.delete<void>(`teacher-assignments/${id}`),

  listSubjectEnrollments: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList<SubjectEnrollmentRow>(SUBJECT_ENROLLMENTS, { limit: MAX_PAGE, ...query })
      : list<SubjectEnrollmentRow>(
          'subject-enrollments',
          'subject_enrollments',
          query,
          signal,
        ),

  createSubjectEnrollment: (body: SubjectEnrollmentWrite) =>
    config.devBypass
      ? devCreate<SubjectEnrollmentRow>(SUBJECT_ENROLLMENTS, body)
      : coreApi.post<SubjectEnrollmentRow>('subject-enrollments', body),

  updateSubjectEnrollment: (id: string, body: SubjectEnrollmentWrite) =>
    config.devBypass
      ? devPatch<SubjectEnrollmentRow>(SUBJECT_ENROLLMENTS, id, body)
      : coreApi.patch<SubjectEnrollmentRow>(`subject-enrollments/${id}`, body),

  deleteSubjectEnrollment: (id: string) =>
    config.devBypass ? devDelete(SUBJECT_ENROLLMENTS, id) : coreApi.delete<void>(`subject-enrollments/${id}`),
};
