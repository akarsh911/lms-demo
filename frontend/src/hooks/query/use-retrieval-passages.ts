'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { retrievalService } from '@/services/retrieval';
import type { ScopedRetrieveResponse, SectionRef } from '@/types/retrieval';

import { TEXTBOOK_STALE_MS } from './use-retrieval-books';

/**
 * Verbatim passages from one chapter, ranked against a query.
 *
 * Restricted to text extracted from the printed page (`pdf`), because what a
 * student is shown is quoted as the book says it, with a page citation.
 */
export function useRetrievalPassages(
  section: SectionRef | null | undefined,
  query: string,
  topK: number,
  enabled = true,
) {
  return useQuery<ScopedRetrieveResponse>({
    queryKey: queryKeys.retrieval.scoped(section?.id ?? '', query, topK),
    queryFn: ({ signal }) =>
      retrievalService.scoped(
        {
          document_ids: [section!.document_id],
          section_ids: [section!.id],
          query,
          extraction_sources: ['pdf'],
          top_k: topK,
        },
        signal,
      ),
    enabled: enabled && Boolean(section),
    staleTime: TEXTBOOK_STALE_MS,
  });
}
