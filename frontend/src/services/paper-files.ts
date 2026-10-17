import { config } from '@/config';
import { fixtureSetterPaper } from '@/fixtures/papers';
import { demoPaperArtefacts, sampleFileHref } from '@/fixtures/paper-files';
import type { PaperArtefacts } from '@/types/answer-checker';

import { serviceUrl } from './api';
import { checkingPaperService } from './answer-checker';
import { dev, fixtureServed } from './dev-bypass';

const none = (paperId: string): PaperArtefacts => ({ paper_id: paperId, artefacts: [] });

const setterFilePath = (paperId: string, name: string): string =>
  `api/v1/papers/${encodeURIComponent(paperId)}/files/${encodeURIComponent(name)}`;

function heldWithoutFiles(paperId: string): boolean {
  return config.devBypass && (fixtureServed('papersetter') || fixtureSetterPaper(paperId) !== undefined);
}

const sampleHref = (paperId: string, name: string): string | null => (config.devBypass ? sampleFileHref(paperId, name) : null);

export const paperFilesService = {
  list: (paperId: string, signal?: AbortSignal): Promise<PaperArtefacts> => {
    const sample = demoPaperArtefacts(paperId);
    if (sample) return dev(() => sample);
    if (heldWithoutFiles(paperId)) return Promise.resolve(none(paperId));
    return checkingPaperService.artefacts(paperId, signal);
  },

  url: (paperId: string, name: string): string => sampleHref(paperId, name) ?? serviceUrl('papersetter', setterFilePath(paperId, name)),
};
