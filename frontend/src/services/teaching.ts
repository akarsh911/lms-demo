import { config } from '@/config';
import { cancelExtra, scheduleExtra } from '@/fixtures/extra-classes';
import { myWeek } from '@/fixtures/my-week';
import { mySubjects } from '@/fixtures/teaching';
import type { ExtraClass, ExtraClassWrite } from '@/types/extra-class';
import type { MySubject } from '@/types/teaching';
import type { TimelineWeek } from '@/types/timetable';

import { ApiError } from './api';
import { dev } from './dev-bypass';

// Read from teacher assignments and subject enrolments in emerge-core once that list exists; refused plainly until then.
const fixtureOnly = <T>(answer: () => T): Promise<T> =>
  config.devBypass ? dev(answer) : Promise.reject(new ApiError(501, 'not_built', 'My subjects is not connected to your school yet.'));

export const teachingService = {
  mySubjects: (): Promise<MySubject[]> => fixtureOnly(() => mySubjects()),
  myWeek: (weekOf: string): Promise<TimelineWeek> => fixtureOnly(() => myWeek(weekOf)),
  scheduleExtra: (body: ExtraClassWrite): Promise<ExtraClass> => fixtureOnly(() => scheduleExtra(body)),
  cancelExtra: (id: string): Promise<void> => fixtureOnly(() => cancelExtra(id)),
};
