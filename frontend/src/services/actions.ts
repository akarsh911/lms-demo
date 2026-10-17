import { config } from '@/config';
import { actionDetail, actionOwners, actionSummary, assignAction, listActions, noteOnAction, quickAction, reopenAction, resolveAction, snoozeAction } from '@/fixtures/actions';

import { ApiError } from './api';
import { dev } from './dev-bypass';

// Actions gathers what every other area raises; no service assembles it yet, so outside the bypass it refuses.
const fixtureOnly = <T>(answer: () => T): Promise<T> =>
  config.devBypass ? dev(answer) : Promise.reject(new ApiError(501, 'not_built', 'Actions is not connected to your school yet.'));

export const actionsService = {
  list: () => fixtureOnly(listActions),
  summary: () => fixtureOnly(actionSummary),
  detail: (id: string) => fixtureOnly(() => actionDetail(id)),
  owners: () => fixtureOnly(actionOwners),
  assign: (id: string, ownerId: string | null) => fixtureOnly(() => assignAction(id, ownerId)),
  snooze: (id: string, until: string) => fixtureOnly(() => snoozeAction(id, until)),
  resolve: (id: string, note: string) => fixtureOnly(() => resolveAction(id, note)),
  reopen: (id: string) => fixtureOnly(() => reopenAction(id)),
  note: (id: string, text: string) => fixtureOnly(() => noteOnAction(id, text)),
  quick: (id: string) => fixtureOnly(() => quickAction(id)),
};
