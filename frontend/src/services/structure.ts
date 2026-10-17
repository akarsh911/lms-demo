import { config } from '@/config';
import {
  applyMoves,
  applyNextYearProposal,
  assignRolls,
  classSubjects,
  createGroup,
  createSection,
  keepAsOneClass,
  addSubject,
  setSubjectTeacher,
  mergePreview,
  mergeSections,
  nextYearProposal,
  recommendedDistribution,
  removeGroup,
  roomOptions,
  teacherOptions,
  setGroupMembers,
  updateSection,
  yearStructure,
} from '@/fixtures/year-structure';
import type { GroupKind, RollAssignment, SectionMove, SectionWrite, SubjectAdd } from '@/types/structure';

import { ApiError } from './api';
import { dev } from './dev-bypass';

// The year's class structure as one answer has no backend endpoint yet; outside the bypass this refuses plainly.
const fixtureOnly = <T>(answer: () => T): Promise<T> =>
  config.devBypass ? dev(answer) : Promise.reject(new ApiError(501, 'not_built', 'Classes & Sections is not connected to your school yet.'));

export const structureService = {
  getStructure: (yearId: string) => fixtureOnly(() => yearStructure(yearId)),
  listRoomOptions: (yearId: string) => fixtureOnly(() => roomOptions(yearId)),
  listTeacherOptions: (yearId: string) => fixtureOnly(() => teacherOptions(yearId)),
  listClassSubjects: (yearId: string, gradeId: string) => fixtureOnly(() => classSubjects(yearId, gradeId)),
  createSection: (yearId: string, gradeId: string, body: SectionWrite) => fixtureOnly(() => createSection(yearId, gradeId, body)),
  setSubjectTeacher: (offeringId: string, teacherId: string | null) => fixtureOnly(() => setSubjectTeacher(offeringId, teacherId)),
  addSubject: (yearId: string, body: SubjectAdd) => fixtureOnly(() => addSubject(yearId, body)),
  keepAsOneClass: (yearId: string, gradeId: string) => fixtureOnly(() => keepAsOneClass(yearId, gradeId)),
  updateSection: (sectionId: string, body: SectionWrite) => fixtureOnly(() => updateSection(sectionId, body)),
  applyMoves: (yearId: string, moves: readonly SectionMove[], reason?: string) => fixtureOnly(() => applyMoves(yearId, moves, reason)),
  assignRolls: (sectionId: string, rolls: readonly RollAssignment[]) => fixtureOnly(() => assignRolls(sectionId, rolls)),
  mergePreview: (fromId: string, intoId: string) => fixtureOnly(() => mergePreview(fromId, intoId)),
  mergeSections: (fromId: string, intoId: string) => fixtureOnly(() => mergeSections(fromId, intoId)),
  createGroup: (sectionId: string, name: string, kind: GroupKind) => fixtureOnly(() => createGroup(sectionId, name, kind)),
  setGroupMembers: (groupId: string, studentIds: readonly string[]) => fixtureOnly(() => setGroupMembers(groupId, studentIds)),
  removeGroup: (groupId: string) => fixtureOnly(() => removeGroup(groupId)),
  getRecommendation: (yearId: string, gradeId: string) => fixtureOnly(() => recommendedDistribution(yearId, gradeId)),
  getNextYearProposal: (yearId: string, gradeId: string) => fixtureOnly(() => nextYearProposal(yearId, gradeId)),
  applyNextYearProposal: (yearId: string, gradeId: string, moves: readonly SectionMove[]) => fixtureOnly(() => applyNextYearProposal(yearId, gradeId, moves)),
};
