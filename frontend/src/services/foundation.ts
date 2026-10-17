import { config } from '@/config';
import { roomInsightOf, roomInsights, saveWorkingWeek, workingWeek } from '@/fixtures/foundation';
import { schoolOverview, schoolProfile, schoolSetup, updateSchoolProfile } from '@/fixtures/school-overview';
import { createEvent, yearEvents } from '@/fixtures/year-events';
import { yearTeaching } from '@/fixtures/year-teaching';
import {
  activateYear,
  bringForward,
  pendingTasks,
  placeStudent,
  setDocument,
  setupAreas,
  yearClasses,
  visibleEnrollments,
  yearRegister,
  yearRegisters,
  yearTransition,
} from '@/fixtures/year-register';
import type { DocumentState, SchoolProfileWrite, WorkingDays, YearEventWrite } from '@/types/foundation';

import { ApiError } from './api';
import { dev } from './dev-bypass';

// No backend serves any of this yet, so outside the bypass it refuses plainly instead of calling a route that is not there.
const fixtureOnly = <T>(answer: () => T): Promise<T> =>
  config.devBypass
    ? dev(answer)
    : Promise.reject(new ApiError(501, 'not_built', 'This part of Emerge is not connected to your school yet.'));

export const foundationService = {
  getOverview: () => fixtureOnly(schoolOverview),
  getSetup: () => fixtureOnly(schoolSetup),
  getProfile: () => fixtureOnly(schoolProfile),
  updateProfile: (body: SchoolProfileWrite) => fixtureOnly(() => updateSchoolProfile(body)),

  // The year as a register: one enrolment collection, and everything else derived from it.
  listYearRegisters: () => fixtureOnly(yearRegisters),
  getYearRegister: (yearId: string) => fixtureOnly(() => yearRegister(yearId)),
  listYearEnrollments: (yearId: string) => fixtureOnly(() => visibleEnrollments(yearId)),
  listSetupAreas: (yearId: string) => fixtureOnly(() => setupAreas(yearId)),
  listPendingTasks: (yearId: string) => fixtureOnly(() => pendingTasks(yearId)),
  listYearClasses: (yearId: string) => fixtureOnly(() => yearClasses(yearId)),
  getYearTeaching: (yearId: string) => fixtureOnly(() => yearTeaching(yearId)),
  listYearEvents: (yearId: string) => fixtureOnly(() => yearEvents(yearId)),
  createYearEvent: (yearId: string, body: YearEventWrite) => fixtureOnly(() => createEvent(yearId, body)),
  getYearTransition: (yearId: string) => fixtureOnly(() => yearTransition(yearId)),
  placeStudent: (enrollmentId: string, sectionId: string) => fixtureOnly(() => placeStudent(enrollmentId, sectionId)),
  setDocument: (enrollmentId: string, key: string, state: DocumentState) => fixtureOnly(() => setDocument(enrollmentId, key, state)),
  bringForward: (fromId: string, toId: string) => fixtureOnly(() => bringForward(fromId, toId)),
  activateYear: (yearId: string) => fixtureOnly(() => activateYear(yearId)),

  getWorkingWeek: (yearId: string) => fixtureOnly(() => workingWeek(yearId)),
  saveWorkingWeek: (yearId: string, days: WorkingDays) => fixtureOnly(() => saveWorkingWeek(yearId, days)),

  listRoomInsights: () => fixtureOnly(roomInsights),
  getRoomInsight: (roomId: string) => fixtureOnly(() => roomInsightOf(roomId)),
};
