import { config } from '@/config';
import { classRoles, myClassRole, setDuty, setMonitor } from '@/fixtures/class-roles';
import type { ClassDuty, ClassRoles, MyClassRole } from '@/types/class-roles';

import { ApiError } from './api';
import { dev } from './dev-bypass';

// Class monitors and duties have no endpoint yet; outside the bypass this refuses plainly.
const fixtureOnly = <T>(answer: () => T): Promise<T> =>
  config.devBypass ? dev(answer) : Promise.reject(new ApiError(501, 'not_built', 'Class roles are not connected to your school yet.'));

export const classRolesService = {
  get: (sectionId: string): Promise<ClassRoles> => fixtureOnly(() => classRoles(sectionId)),
  mine: (): Promise<MyClassRole | null> => fixtureOnly(myClassRole),
  setMonitor: (sectionId: string, role: 'monitor' | 'vice_monitor', studentId: string | null): Promise<ClassRoles> => fixtureOnly(() => setMonitor(sectionId, role, studentId)),
  setDuty: (sectionId: string, duty: ClassDuty, studentIds: readonly string[]): Promise<ClassRoles> => fixtureOnly(() => setDuty(sectionId, duty, studentIds)),
};
