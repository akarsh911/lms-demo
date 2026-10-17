import * as fixtures from '@/fixtures/retrieval';

import { apiRequest, retrievalApi } from './api';
import { dev, fixtureServed } from './dev-bypass';
import type {
  BooksResponse,
  ScopedRetrieveRequest,
  ScopedRetrieveResponse,
  SectionResolveResponse,
} from '@/types/retrieval';

/**
 * The retrieval engine. Transport only, like every service here.
 *
 * Every call is a READ, including `retrieve/scoped`, which is a POST only
 * because its filters do not fit a query string. It is therefore used from a
 * query hook, with the abort signal forwarded, never from a mutation.
 */
// The hosted demo still asks the live engine; only the local bypass answers retrieval from fixtures.
const bypassed = fixtureServed('retrieval');

export const retrievalService = {
  books: (subject: string, grade: number, signal?: AbortSignal) =>
    bypassed
      ? dev(() => fixtures.books(subject, grade))
      : retrievalApi.get<BooksResponse>('books', { subject, grade }, signal),

  resolveSection: (query: string, documentId: string, signal?: AbortSignal) =>
    bypassed
      ? dev(() => fixtures.resolveSection(query, documentId))
      : retrievalApi.get<SectionResolveResponse>(
          'syllabus/sections/resolve',
          { query, document_id: documentId },
          signal,
        ),

  scoped: (request: ScopedRetrieveRequest, signal?: AbortSignal) =>
    bypassed
      ? dev(() => fixtures.scoped(request))
      : apiRequest<ScopedRetrieveResponse>('retrieval', 'retrieve/scoped', {
          method: 'POST',
          body: request,
          signal,
        }),
};
