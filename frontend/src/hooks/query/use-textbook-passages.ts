'use client';

import type { EnrichedPassage, SectionRef } from '@/types/retrieval';

import { useRetrievalBooks } from './use-retrieval-books';
import { useRetrievalPassages } from './use-retrieval-passages';
import { useRetrievalSection } from './use-retrieval-section';

/** Which chapter of which book a panel grounds itself in. */
export interface TextbookScope {
  /** Exactly as the engine stores it: `Science`. */
  subject: string;
  grade: number;
  /** A chapter name to resolve, e.g. `Electricity`. */
  chapter: string;
}

export type TextbookPassages =
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: () => void }
  /** The book or chapter is not in the library, or nothing in it matched. */
  | { status: 'empty'; reason: 'no_book' | 'no_chapter' | 'no_match' }
  | { status: 'ready'; passages: EnrichedPassage[]; section: SectionRef };

/**
 * Book -> chapter -> ranked passages, as ONE state a panel can render.
 *
 * Three queries, each one endpoint and each cached on its own, so ten panels
 * grounding themselves in the same chapter resolve the book and the chapter
 * once. Collapsed into the four widget states here so no panel reassembles the
 * chain itself.
 */
export function useTextbookPassages(
  scope: TextbookScope,
  query: string,
  { topK = 3, enabled = true }: { topK?: number; enabled?: boolean } = {},
): TextbookPassages {
  const books = useRetrievalBooks(scope.subject, scope.grade);
  const book = books.data?.books[0];

  const section = useRetrievalSection(enabled ? book?.id : undefined, scope.chapter);
  const resolved = section.data?.resolved ?? null;

  const passages = useRetrievalPassages(resolved, query, topK, enabled);

  for (const q of [books, section, passages]) {
    if (q.isError) return { status: 'error', error: q.error, retry: () => void q.refetch() };
  }
  if (books.data && !book) return { status: 'empty', reason: 'no_book' };
  if (section.data && !resolved) return { status: 'empty', reason: 'no_chapter' };
  if (passages.data && resolved) {
    return passages.data.passages.length
      ? { status: 'ready', passages: passages.data.passages, section: resolved }
      : { status: 'empty', reason: 'no_match' };
  }
  return { status: 'loading' };
}
