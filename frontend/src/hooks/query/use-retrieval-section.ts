'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { retrievalService } from '@/services/retrieval';
import type { SectionResolveResponse } from '@/types/retrieval';

import { TEXTBOOK_STALE_MS } from './use-retrieval-books';

/**
 * A chapter of a book, resolved by name at runtime.
 *
 * Section ids change whenever a book is re-ingested, so a bench names its
 * chapter (`Electricity`) and asks, rather than hardcoding `sec_…`.
 */
export function useRetrievalSection(documentId: string | undefined, query: string) {
  return useQuery<SectionResolveResponse>({
    queryKey: queryKeys.retrieval.section(documentId ?? '', query),
    queryFn: ({ signal }) => retrievalService.resolveSection(query, documentId!, signal),
    enabled: Boolean(documentId),
    staleTime: TEXTBOOK_STALE_MS,
  });
}
