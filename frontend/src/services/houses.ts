import { config } from '@/config';
import { awardPoints, myHouse, setCaptain } from '@/fixtures/houses';
import type { HouseAward, MyHouse } from '@/types/house';

import { ApiError } from './api';
import { dev } from './dev-bypass';

// Houses, their heads and points have no endpoint yet; outside the bypass this refuses plainly.
const fixtureOnly = <T>(answer: () => T): Promise<T> =>
  config.devBypass ? dev(answer) : Promise.reject(new ApiError(501, 'not_built', 'Houses are not connected to your school yet.'));

export const houseService = {
  mine: (): Promise<MyHouse> => fixtureOnly(myHouse),
  award: (body: HouseAward): Promise<MyHouse> => fixtureOnly(() => awardPoints(body)),
  captain: (office: 'captain' | 'vice', studentId: string): Promise<MyHouse> => fixtureOnly(() => setCaptain(office, studentId)),
};
