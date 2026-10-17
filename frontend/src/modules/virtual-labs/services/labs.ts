import { config } from '@/config';
import * as fixtures from '@/fixtures/daily';
import { labsApi } from '@/services/api';
import { dev } from '@/services/dev-bypass';
import type {
  LabAttemptSummary,
  LabAttemptsResponse,
  LabBenchId,
  LabFeaturesResponse,
  SubmitLabAttemptInput,
} from '@labs/types/labs';

/** The labs service: attempt records of completed practicals. Transport only. */
export const labsService = {
  listAttempts: (bench: LabBenchId, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => fixtures.labAttempts(bench))
      : labsApi.get<LabAttemptsResponse>('attempts', { bench }, signal),

  /**
   * Which teaching layers this bench runs with, for this school. A READ, so it
   * belongs to a query hook; the bench is a parameter because an administrator
   * may switch a layer off for one practical and not the rest.
   */
  features: (bench: LabBenchId, signal?: AbortSignal) =>
    config.devBypass
      ? dev(fixtures.labFeatures)
      : labsApi.get<LabFeaturesResponse>('features', { bench }, signal),

  submitAttempt: <R>(input: SubmitLabAttemptInput<R>) =>
    config.devBypass
      ? dev(() => fixtures.submitLabAttempt(input))
      : labsApi.post<LabAttemptSummary>('attempts', input),
};
