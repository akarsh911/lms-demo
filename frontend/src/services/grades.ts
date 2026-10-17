import { config } from '@/config';
import { classmates, examCatalogue, examDetail, markDetail, questionPaper, searchStudents, studentGrades } from '@/fixtures/grades';
import type { ExamFilter } from '@/types/grades';

import { ApiError } from './api';
import { dev } from './dev-bypass';

// Examination analytics have no backend yet; outside the bypass this refuses plainly rather than calling a route that is not there.
const fixtureOnly = <T>(answer: () => T): Promise<T> =>
  config.devBypass
    ? dev(answer)
    : Promise.reject(new ApiError(501, 'not_built', 'Examination results are not connected to your school yet.'));

export const gradesService = {
  listExams: (sessionId?: string) => fixtureOnly(() => examCatalogue(sessionId)),
  getExam: (examId: string, filter: ExamFilter) => fixtureOnly(() => examDetail(examId, filter)),
  getStudent: (studentId: string, sessionId?: string) => fixtureOnly(() => studentGrades(studentId, sessionId)),
  getMark: (markId: string) => fixtureOnly(() => markDetail(markId)),
  getQuestionPaper: (examSubjectId: string) => fixtureOnly(() => questionPaper(examSubjectId)),
  searchStudents: (query: string) => fixtureOnly(() => searchStudents(query)),
  getClassmates: (studentId: string, sessionId: string | undefined, scope: 'section' | 'class', gradeId?: string, sectionId?: string) =>
    fixtureOnly(() => classmates(studentId, sessionId, scope, gradeId, sectionId)),
};
