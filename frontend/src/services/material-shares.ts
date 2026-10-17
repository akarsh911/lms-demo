import { config } from '@/config';
import { removeShare, shareMaterial, sharesFor } from '@/fixtures/material-shares';
import type { MaterialShare, MaterialShareWrite } from '@/types/material-share';

import { ApiError } from './api';
import { dev } from './dev-bypass';

// Material for chosen pupils has no endpoint yet; outside the bypass this refuses plainly.
const fixtureOnly = <T>(answer: () => T): Promise<T> =>
  config.devBypass ? dev(answer) : Promise.reject(new ApiError(501, 'not_built', 'Sharing with chosen pupils is not connected to your school yet.'));

export const materialShareService = {
  list: (offeringId: string): Promise<MaterialShare[]> => fixtureOnly(() => sharesFor(offeringId)),
  share: (body: MaterialShareWrite): Promise<MaterialShare> => fixtureOnly(() => shareMaterial(body)),
  remove: (id: string): Promise<void> => fixtureOnly(() => removeShare(id)),
};
