'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { retrievalService } from '@/services/retrieval';
import type { BooksResponse } from '@/types/retrieval';

/** A published textbook does not change under a student; an hour is conservative. */
export const TEXTBOOK_STALE_MS = 60 * 60 * 1000;

/** The books the retrieval engine holds for one subject and grade. */
export function useRetrievalBooks(subject: string, grade: number) {
  return useQuery<BooksResponse>({
    queryKey: queryKeys.retrieval.books(subject, grade),
    queryFn: ({ signal }) => retrievalService.books(subject, grade, signal),
    staleTime: TEXTBOOK_STALE_MS,
  });
}
