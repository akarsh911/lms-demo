import * as fixtures from '@/fixtures/gap-analyzer';
import type { EvidenceAccepted, EvidenceWrite } from '@/lib/gap-analyzer/records';
import type { ClassAnalysis, GapScope, LearnerAnalysis, SchoolAnalysis } from '@/types/gap-analyzer';

import { apiRequest } from './api';
import { dev, fixtureServed, liveOrFixture } from './dev-bypass';

const SERVICE = 'gapanalyzer';
const ANALYSIS_MS = 260;

const get = <T>(path: string, signal?: AbortSignal): Promise<T> => apiRequest<T>(SERVICE, path, { method: 'GET', signal });

const either = <T>(call: string, live: () => Promise<T>, fixture: () => T, ms?: number): Promise<T> =>
  liveOrFixture(SERVICE, call, live, () => dev(fixture, ms));

const segment = encodeURIComponent;

export const gapAnalyzerService = {
  recordsEvidence: (): boolean => !fixtureServed(SERVICE),

  postEvidence: (body: EvidenceWrite): Promise<EvidenceAccepted> => apiRequest<EvidenceAccepted>(SERVICE, 'evidence', { method: 'POST', body }),

  scope: (signal?: AbortSignal) => either('scope', () => get<GapScope>('scope', signal), fixtures.scope),

  learner: (studentId: string, signal?: AbortSignal) =>
    either('learner', () => get<LearnerAnalysis>(`learners/${segment(studentId)}`, signal), () => fixtures.learner(studentId), ANALYSIS_MS),

  section: (sectionId: string, subjectCode: string, signal?: AbortSignal) =>
    either(
      'section',
      () => get<ClassAnalysis>(`sections/${segment(sectionId)}/subjects/${segment(subjectCode)}`, signal),
      () => fixtures.classView(sectionId, subjectCode),
      ANALYSIS_MS,
    ),

  grade: (grade: number, subjectCode: string, signal?: AbortSignal) =>
    either(
      'grade',
      () => get<SchoolAnalysis>(`grades/${grade}/subjects/${segment(subjectCode)}`, signal),
      () => fixtures.school(grade, subjectCode),
      ANALYSIS_MS,
    ),
};
