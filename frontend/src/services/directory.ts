import { config } from '@/config';
import { teacherDirectory } from '@/fixtures/directory';

import { ApiError } from './api';
import { dev } from './dev-bypass';

// The teachers' load across a year has no single backend endpoint yet; outside the bypass this refuses plainly.
const fixtureOnly = <T>(answer: () => T): Promise<T> =>
  config.devBypass ? dev(answer) : Promise.reject(new ApiError(501, 'not_built', 'The teacher directory is not connected to your school yet.'));

export const directoryService = {
  listTeachers: (yearId: string) => fixtureOnly(() => teacherDirectory(yearId)),
};
