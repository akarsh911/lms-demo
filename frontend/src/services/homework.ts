import { config } from '@/config';
import {
  closeHomework,
  createHomework,
  deleteHomework,
  excuseWork,
  gradeWork,
  handIn,
  homeworkDetail,
  homeworkOptions,
  homeworkSummary,
  listHomework,
  myWork,
  remindMissing,
  returnAll,
  setHomeworkDue,
  updateHomework,
} from '@/fixtures/homework';
import type { GradeWrite, HandIn, HomeworkWrite } from '@/types/homework';

import { ApiError } from './api';
import { dev } from './dev-bypass';

// Assignments sit on emerge-core's assignment rows; the school-wide view, targets and grading have no endpoint yet.
const fixtureOnly = <T>(answer: () => T): Promise<T> =>
  config.devBypass ? dev(answer) : Promise.reject(new ApiError(501, 'not_built', 'Assignments are not connected to your school yet.'));

export const homeworkService = {
  list: () => fixtureOnly(listHomework),
  summary: () => fixtureOnly(homeworkSummary),
  detail: (id: string) => fixtureOnly(() => homeworkDetail(id)),
  options: () => fixtureOnly(homeworkOptions),
  create: (body: HomeworkWrite) => fixtureOnly(() => createHomework(body)),
  update: (id: string, body: HomeworkWrite) => fixtureOnly(() => updateHomework(id, body)),
  extend: (id: string, dueAt: string) => fixtureOnly(() => setHomeworkDue(id, dueAt)),
  close: (id: string, closed: boolean) => fixtureOnly(() => closeHomework(id, closed)),
  remove: (id: string) => fixtureOnly(() => deleteHomework(id)),
  remind: (id: string) => fixtureOnly(() => remindMissing(id)),
  grade: (id: string, body: GradeWrite) => fixtureOnly(() => gradeWork(id, body)),
  excuse: (id: string, studentId: string, excused: boolean) => fixtureOnly(() => excuseWork(id, studentId, excused)),
  returnAll: (id: string) => fixtureOnly(() => returnAll(id)),
  mine: () => fixtureOnly(myWork),
  handIn: (id: string, body: HandIn) => fixtureOnly(() => handIn(id, body)),
};
