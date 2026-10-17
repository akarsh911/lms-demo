import * as fixtures from '@/fixtures/flashcards';

import { apiRequest, flashcardsApi, retrievalApi } from './api';
import { dev, liveOrFixture } from './dev-bypass';
import type {
  AnswerEvaluation,
  CatalogResponse,
  DeckAttempt,
  DeckReport,
  DocumentPageText,
  FlashcardDeck,
  GenerateFromRetrievalRequest,
} from '@/types/flashcards';

/**
 * The flashcard engine. Transport only.
 *
 * Generation goes through `generate/from-retrieval`, which is ONE request from
 * here: the engine plans the retrieval and calls the corpus itself. Doing it the
 * other way, fetching passages here and posting them to `POST /generate`, would
 * put this front end in charge of turning a student's options into a retrieval
 * request, and `planner.py` is the one place that is supposed to happen.
 */
export const flashcardsService = {
  /** The chapters a deck can be built from. Only sections that hold chunks. */
  catalog: (
    params: { subject?: string; grade?: number } = {},
    signal?: AbortSignal,
  ) =>
    liveOrFixture(
      'flashcards',
      'catalog',
      () => flashcardsApi.get<CatalogResponse>('catalog', params, signal),
      () => dev(() => fixtures.catalog),
    ),

  deck: (deckId: string, signal?: AbortSignal) =>
    liveOrFixture(
      'flashcards',
      'deck',
      () => flashcardsApi.get<FlashcardDeck>(`deck/${encodeURIComponent(deckId)}`, undefined, signal),
      () => dev(() => fixtures.deckById(deckId)),
    ),

  generate: (request: GenerateFromRetrievalRequest) =>
    liveOrFixture(
      'flashcards',
      'generate',
      () =>
        apiRequest<FlashcardDeck>('flashcards', 'generate/from-retrieval', {
          method: 'POST',
          body: request,
        }),
      () => dev(() => fixtures.buildDeck(request)),
    ),

  /**
   * Mark one answer.
   *
   * The body carries only the answer: the marking key is the card's own `back`,
   * looked up server-side, so it cannot be swapped for an easier one and the
   * request stays one short string.
   */
  evaluate: (deckId: string, cardId: string, answer: string) =>
    liveOrFixture(
      'flashcards',
      'evaluate',
      () =>
        apiRequest<AnswerEvaluation>('flashcards', `decks/${encodeURIComponent(deckId)}/evaluate`, {
          method: 'POST',
          body: { card_id: cardId, answer },
        }),
      () => dev(() => fixtures.evaluateAnswer(deckId, cardId, answer)),
    ),

  sourcePage: (documentId: string, page: number, signal?: AbortSignal) =>
    liveOrFixture(
      'flashcards',
      'sourcePage',
      () =>
        retrievalApi.get<DocumentPageText>(
          `documents/${encodeURIComponent(documentId)}/pages/${page}`,
          undefined,
          signal,
        ),
      () => dev(() => fixtures.sourcePage(documentId, page)),
    ),

  /** A pure function of the deck and the attempts. Nothing is persisted. */
  report: (deckId: string, attempts: DeckAttempt[]) =>
    liveOrFixture(
      'flashcards',
      'report',
      () =>
        apiRequest<DeckReport>('flashcards', `decks/${encodeURIComponent(deckId)}/report`, {
          method: 'POST',
          body: { attempts },
        }),
      () => dev(() => fixtures.buildReport(deckId, attempts)),
    ),
};
