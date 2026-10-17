import { config } from '@/config';
import { feeOverview, myFees } from '@/fixtures/fees';
import { reportIncident } from '@/fixtures/incidents';
import { myCalendar } from '@/fixtures/my-calendar';
import { applyPupilLeave, cancelPupilLeave, myPupilLeave } from '@/fixtures/pupil-leave';
import type { FeeOverview, MyFees } from '@/types/fees';
import type { IncidentReport } from '@/types/incident';
import type { MyCalendar } from '@/types/my-calendar';
import type { MyPupilLeave, PupilLeave, PupilLeaveWrite } from '@/types/pupil-leave';

import { ApiError } from './api';
import { dev } from './dev-bypass';

// The calendar, leave notes, fees and incident reports have no endpoint yet; outside the bypass these refuse plainly.
const fixtureOnly = <T>(answer: () => T): Promise<T> =>
  config.devBypass ? dev(answer) : Promise.reject(new ApiError(501, 'not_built', 'This is not connected to your school yet.'));

export const schoolLifeService = {
  calendar: (): Promise<MyCalendar> => fixtureOnly(myCalendar),
  pupilLeave: (): Promise<MyPupilLeave> => fixtureOnly(myPupilLeave),
  applyPupilLeave: (body: PupilLeaveWrite): Promise<PupilLeave> => fixtureOnly(() => applyPupilLeave(body)),
  cancelPupilLeave: (id: string): Promise<void> => fixtureOnly(() => cancelPupilLeave(id)),
  myFees: (): Promise<MyFees> => fixtureOnly(myFees),
  feeOverview: (): Promise<FeeOverview> => fixtureOnly(feeOverview),
  reportIncident: (body: IncidentReport): Promise<{ id: string }> => fixtureOnly(() => reportIncident(body)),
};
