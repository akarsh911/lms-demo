'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { flashcardsService } from '@/services/flashcards';
import type { CatalogResponse, DocumentPageText, FlashcardDeck } from '@/types/flashcards';

/** The catalog is a projection of the syllabus and changes only on re-ingest. */
export const CATALOG_STALE_MS = 30 * 60 * 1000;

export function useFlashcardCatalog(
  params: { subject?: string; grade?: number } = {},
  enabled = true,
) {
  return useQuery<CatalogResponse>({
    queryKey: queryKeys.flashcards.catalog(params.subject ?? '', params.grade ?? 0),
    queryFn: ({ signal }) => flashcardsService.catalog(params, signal),
    enabled,
    staleTime: CATALOG_STALE_MS,
  });
}

/** A stored deck by id. Decks are immutable once generated. */
export function useFlashcardDeck(deckId: string | null | undefined) {
  return useQuery<FlashcardDeck>({
    queryKey: queryKeys.flashcards.deck(deckId ?? ''),
    queryFn: ({ signal }) => flashcardsService.deck(deckId!, signal),
    enabled: Boolean(deckId),
    staleTime: Infinity,
  });
}

export function useSourcePage(documentId: string | null | undefined, page: number | null | undefined) {
  return useQuery<DocumentPageText>({
    queryKey: queryKeys.flashcards.sourcePage(documentId ?? '', page ?? 0),
    queryFn: ({ signal }) => flashcardsService.sourcePage(documentId!, page!, signal),
    enabled: Boolean(documentId) && typeof page === 'number',
    staleTime: Infinity,
    retry: false,
  });
}
