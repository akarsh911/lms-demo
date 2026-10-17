import { config } from '@/config';
import { applyLeave, cancelLeave, myLeave } from '@/fixtures/leave';
import type { LeaveWrite, MyLeave, StaffLeave } from '@/types/leave';

import { ApiError } from './api';
import { dev } from './dev-bypass';

// Staff leave has no endpoint yet; outside the bypass this refuses plainly.
const fixtureOnly = <T>(answer: () => T): Promise<T> =>
  config.devBypass ? dev(answer) : Promise.reject(new ApiError(501, 'not_built', 'Leave is not connected to your school yet.'));

export const leaveService = {
  mine: (): Promise<MyLeave> => fixtureOnly(myLeave),
  apply: (body: LeaveWrite): Promise<StaffLeave> => fixtureOnly(() => applyLeave(body)),
  cancel: (id: string): Promise<StaffLeave> => fixtureOnly(() => cancelLeave(id)),
};
