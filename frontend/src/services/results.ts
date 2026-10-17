import { config } from '@/config';
import { offeringResults } from '@/fixtures/exams';

import { coreApi } from './api';
import { dev } from './dev-bypass';
import type { OfferingResults } from '@/types/results';

export const RESULT_ROSTER_PAGE = 200;

export interface OfferingResultsQuery {
  student_id?: string;
  limit?: number;
  offset?: number;
}

export const resultsService = {
  listOfferingResults: (
    offeringId: string,
    query: OfferingResultsQuery,
    signal?: AbortSignal,
  ) =>
    config.devBypass
      ? dev(() => offeringResults(offeringId, { ...query }))
      : coreApi.get<OfferingResults>(
          `subject-offerings/${offeringId}/results`,
          { ...query },
          signal,
        ),
};
