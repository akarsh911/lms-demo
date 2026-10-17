import { config } from '@/config';
import * as fixtures from '@/fixtures/omr';
import { demoOmrSeed } from '@/fixtures/omr-seed';
import type { OmrAnswerKey, OmrKeySaved, OmrSheetIn, OmrSheetResult } from '@/types/answer-checker';

import { ApiError, createServiceApi, serviceUrl } from './api';
import { dev, fixtureServed, liveOrFixture } from './dev-bypass';

const SERVICE = 'omr';
const omrApi = createServiceApi(SERVICE);

const paper = (paperId: string, rest: string): string => `papers/${encodeURIComponent(paperId)}${rest}`;

async function postImage(paperId: string, image: File, rollNumber: string, name: string): Promise<OmrSheetResult> {
  const form = new FormData();
  form.append('image', image, image.name);
  form.append('roll_number', rollNumber);
  form.append('name', name);
  const response = await fetch(serviceUrl(SERVICE, paper(paperId, '/sheets/image')), { method: 'POST', body: form, credentials: 'same-origin' });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const refusal = (body ?? {}) as { code?: string; message?: string };
    throw new ApiError(response.status, refusal.code ?? 'request_failed', refusal.message ?? `Request failed with status ${response.status}`, body);
  }
  return body as OmrSheetResult;
}

async function liveSheets(paperId: string, signal?: AbortSignal): Promise<{ sheets: OmrSheetResult[] }> {
  const listed = await omrApi.get<{ sheets: OmrSheetResult[] }>(paper(paperId, '/sheets'), undefined, signal);
  const seed = config.devBypass ? demoOmrSeed() : null;
  if (!seed || seed.paperId !== paperId || listed.sheets.length > 0) return listed;
  await omrApi.put(paper(paperId, '/key'), seed.key);
  for (const sheet of seed.sheets) await omrApi.post(paper(paperId, '/sheets'), sheet);
  return omrApi.get<{ sheets: OmrSheetResult[] }>(paper(paperId, '/sheets'), undefined, signal);
}

export const omrService = {
  putKey: (paperId: string, key: OmrAnswerKey): Promise<OmrKeySaved> =>
    liveOrFixture(SERVICE, 'putKey', () => omrApi.put<OmrKeySaved>(paper(paperId, '/key'), key), () => dev(() => fixtures.putKey(paperId, key))),

  submitSheet: (paperId: string, sheet: OmrSheetIn): Promise<OmrSheetResult> =>
    liveOrFixture(SERVICE, 'submitSheet', () => omrApi.post<OmrSheetResult>(paper(paperId, '/sheets'), sheet), () => dev(() => fixtures.postSheet(paperId, sheet))),

  submitImage: (paperId: string, image: File, rollNumber: string, name: string): Promise<OmrSheetResult> =>
    liveOrFixture(SERVICE, 'submitImage', () => postImage(paperId, image, rollNumber, name), () => dev(() => fixtures.postImage(paperId))),

  listSheets: (paperId: string, signal?: AbortSignal): Promise<{ sheets: OmrSheetResult[] }> =>
    liveOrFixture(SERVICE, 'listSheets', () => liveSheets(paperId, signal), () => dev(() => fixtures.listSheets(paperId))),

  clearSheets: (paperId: string): Promise<{ deleted: number }> =>
    liveOrFixture(SERVICE, 'clearSheets', () => omrApi.delete<{ deleted: number }>(paper(paperId, '/sheets')), () => dev(() => fixtures.clearSheets(paperId))),

  reseedDemo: async (): Promise<void> => {
    const seed = config.devBypass ? demoOmrSeed() : null;
    if (!seed) return;
    await omrService.clearSheets(seed.paperId);
    if (fixtureServed(SERVICE)) fixtures.seedDemoSheets();
    else await liveSheets(seed.paperId);
  },

  templateUrl: (paperId: string): string | null => (fixtureServed(SERVICE) ? null : serviceUrl(SERVICE, paper(paperId, '/template.png'))),
};
