import { config } from '@/config';
import {
  BRANCHES,
  CURRENT_SESSION,
  GRADE_LEVELS,
  HOUSES,
  OFFERINGS,
  SECTIONS,
  SESSIONS,
  SUBJECTS,
  SUBJECT_GROUPS,
} from '@/fixtures/data/structure';

import { coreApi } from './api';
import { devCreate, devDelete, devList, devPatch } from './dev-bypass';
import { MAX_PAGE, type ListQuery } from './school';
import type { SchoolPage, SectionRow } from '@/types/school';
import type { SchoolOfferingRow } from '@/types/school';
import type { PageInfo } from '@/types/roster';
import type {
  AcademicSession,
  AcademicSessionWrite,
  Branch,
  BranchWrite,
  GradeLevel,
  GradeLevelWrite,
  OfferingWrite,
  SchoolHouse,
  SchoolHouseWrite,
  SectionWrite,
  Subject,
  SubjectGroup,
  SubjectGroupWrite,
  SubjectWrite,
} from '@/types/mdm';

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

const ALL = { limit: MAX_PAGE };

// Sections and offerings answer for the current session unless one is named, as the real routes do.
const thisYear = (query: ListQuery): ListQuery =>
  query.all_sessions ? { ...ALL, ...query } : { academic_session_id: CURRENT_SESSION.id, ...ALL, ...query };

export const mdmService = {
  listBranches: (signal?: AbortSignal) =>
    config.devBypass ? devList(BRANCHES, ALL) : list<Branch>('branches', 'branches', {}, signal),

  createBranch: (body: BranchWrite) =>
    config.devBypass ? devCreate(BRANCHES, body) : coreApi.post<Branch>('branches', body),

  updateBranch: (id: string, body: BranchWrite) =>
    config.devBypass ? devPatch(BRANCHES, id, body) : coreApi.patch<Branch>(`branches/${id}`, body),

  deleteBranch: (id: string) =>
    config.devBypass ? devDelete(BRANCHES, id) : coreApi.delete<void>(`branches/${id}`),

  listSessions: (signal?: AbortSignal) =>
    config.devBypass
      ? devList(SESSIONS, ALL)
      : list<AcademicSession>('academic-sessions', 'academic_sessions', {}, signal),

  createSession: (body: AcademicSessionWrite) =>
    config.devBypass ? devCreate(SESSIONS, body) : coreApi.post<AcademicSession>('academic-sessions', body),

  updateSession: (id: string, body: AcademicSessionWrite) =>
    config.devBypass
      ? devPatch(SESSIONS, id, body)
      : coreApi.patch<AcademicSession>(`academic-sessions/${id}`, body),

  deleteSession: (id: string) =>
    config.devBypass ? devDelete(SESSIONS, id) : coreApi.delete<void>(`academic-sessions/${id}`),

  listGradeLevels: (signal?: AbortSignal) =>
    config.devBypass ? devList(GRADE_LEVELS, ALL) : list<GradeLevel>('grade-levels', 'grade_levels', {}, signal),

  createGradeLevel: (body: GradeLevelWrite) =>
    config.devBypass ? devCreate(GRADE_LEVELS, body) : coreApi.post<GradeLevel>('grade-levels', body),

  updateGradeLevel: (id: string, body: GradeLevelWrite) =>
    config.devBypass ? devPatch(GRADE_LEVELS, id, body) : coreApi.patch<GradeLevel>(`grade-levels/${id}`, body),

  deleteGradeLevel: (id: string) =>
    config.devBypass ? devDelete(GRADE_LEVELS, id) : coreApi.delete<void>(`grade-levels/${id}`),

  listHouses: (signal?: AbortSignal) =>
    config.devBypass ? devList(HOUSES, ALL) : list<SchoolHouse>('school-houses', 'school_houses', {}, signal),

  createHouse: (body: SchoolHouseWrite) =>
    config.devBypass ? devCreate(HOUSES, body) : coreApi.post<SchoolHouse>('school-houses', body),

  updateHouse: (id: string, body: SchoolHouseWrite) =>
    config.devBypass ? devPatch(HOUSES, id, body) : coreApi.patch<SchoolHouse>(`school-houses/${id}`, body),

  deleteHouse: (id: string) =>
    config.devBypass ? devDelete(HOUSES, id) : coreApi.delete<void>(`school-houses/${id}`),

  listSubjects: (signal?: AbortSignal) =>
    config.devBypass ? devList(SUBJECTS, ALL) : list<Subject>('subjects', 'subjects', {}, signal),

  createSubject: (body: SubjectWrite) =>
    config.devBypass ? devCreate(SUBJECTS, body) : coreApi.post<Subject>('subjects', body),

  updateSubject: (id: string, body: SubjectWrite) =>
    config.devBypass ? devPatch(SUBJECTS, id, body) : coreApi.patch<Subject>(`subjects/${id}`, body),

  deleteSubject: (id: string) =>
    config.devBypass ? devDelete(SUBJECTS, id) : coreApi.delete<void>(`subjects/${id}`),

  listSubjectGroups: (signal?: AbortSignal) =>
    config.devBypass
      ? devList(SUBJECT_GROUPS, ALL)
      : list<SubjectGroup>('subject-groups', 'subject_groups', {}, signal),

  createSubjectGroup: (body: SubjectGroupWrite) =>
    config.devBypass ? devCreate(SUBJECT_GROUPS, body) : coreApi.post<SubjectGroup>('subject-groups', body),

  updateSubjectGroup: (id: string, body: SubjectGroupWrite) =>
    config.devBypass
      ? devPatch(SUBJECT_GROUPS, id, body)
      : coreApi.patch<SubjectGroup>(`subject-groups/${id}`, body),

  deleteSubjectGroup: (id: string) =>
    config.devBypass ? devDelete(SUBJECT_GROUPS, id) : coreApi.delete<void>(`subject-groups/${id}`),

  listSections: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList(SECTIONS, thisYear(query))
      : list<SectionRow>('sections', 'sections', query, signal),

  createSection: (body: SectionWrite) =>
    config.devBypass ? devCreate(SECTIONS, body) : coreApi.post<SectionRow>('sections', body),

  updateSection: (id: string, body: SectionWrite) =>
    config.devBypass ? devPatch(SECTIONS, id, body) : coreApi.patch<SectionRow>(`sections/${id}`, body),

  deleteSection: (id: string) =>
    config.devBypass ? devDelete(SECTIONS, id) : coreApi.delete<void>(`sections/${id}`),

  listOfferings: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList(OFFERINGS, thisYear(query))
      : list<SchoolOfferingRow>('subject-offerings', 'subject_offerings', query, signal),

  createOffering: (body: OfferingWrite) =>
    config.devBypass ? devCreate(OFFERINGS, body) : coreApi.post<SchoolOfferingRow>('subject-offerings', body),

  updateOffering: (id: string, body: OfferingWrite) =>
    config.devBypass
      ? devPatch(OFFERINGS, id, body)
      : coreApi.patch<SchoolOfferingRow>(`subject-offerings/${id}`, body),

  deleteOffering: (id: string) =>
    config.devBypass ? devDelete(OFFERINGS, id) : coreApi.delete<void>(`subject-offerings/${id}`),
};
