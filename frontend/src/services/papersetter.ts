import { composedPapers, fixtureSetterPaper, seededPapers, setterPaper, setterPapers } from '@/fixtures/papers';

import { ApiError, papersApi } from './api';
import { dev, liveOrFixture, liveUnderBypass } from './dev-bypass';
import type { Paper, PaperSummary } from '@/types/papersetter';

function withFixturePapers(live: PaperSummary[]): PaperSummary[] {
  if (!liveUnderBypass('papersetter')) return live;
  const seen = new Set<string>();
  return [...composedPapers(), ...live, ...seededPapers()].filter((row) => {
    if (seen.has(row.paper_id)) return false;
    seen.add(row.paper_id);
    return true;
  });
}

interface PaperListEnvelope {
  papers?: unknown;
}

export interface UnlinkedIdentity {
  casSubject: string;
}

export function unlinkedIdentity(error: unknown): UnlinkedIdentity | null {
  if (!(error instanceof ApiError) || error.status !== 403) return null;
  if (error.code !== 'identity-not-linked') return null;
  const body = error.details;
  if (typeof body !== 'object' || body === null) return null;
  const subject = (body as { cas_subject?: unknown }).cas_subject;
  if (typeof subject !== 'string' || subject.trim() === '') return null;
  return { casSubject: subject.trim() };
}

function identified(row: unknown): row is PaperSummary {
  return (
    typeof row === 'object' &&
    row !== null &&
    typeof (row as PaperSummary).paper_id === 'string' &&
    (row as PaperSummary).paper_id !== ''
  );
}

export const paperService = {
  listPapers: (signal?: AbortSignal): Promise<PaperSummary[]> =>
    liveOrFixture(
      'papersetter',
      'listPapers',
      async () => {
        const body = await papersApi.get<PaperListEnvelope | null>('api/papers', undefined, signal);
        const rows = Array.isArray(body?.papers) ? body.papers : [];
        return withFixturePapers(rows.filter(identified));
      },
      () => dev(setterPapers),
    ),

  getPaper: (paperId: string, signal?: AbortSignal): Promise<Paper> => {
    const held = liveUnderBypass('papersetter') ? fixtureSetterPaper(paperId) : undefined;
    if (held) return dev(() => held);
    return liveOrFixture(
      'papersetter',
      'getPaper',
      () => papersApi.get<Paper>(`api/papers/${encodeURIComponent(paperId)}`, undefined, signal),
      () => dev(() => setterPaper(paperId)),
    );
  },
};
