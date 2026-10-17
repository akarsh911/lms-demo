'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { flashcardsService } from '@/services/flashcards';
import type {
  AnswerEvaluation,
  DeckAttempt,
  DeckReport,
  FlashcardDeck,
  GenerateFromRetrievalRequest,
} from '@/types/flashcards';

import { useGapEvidence } from './use-gap-evidence';

/**
 * Generate a deck.
 *
 * A mutation rather than a query even though it reads nothing of the student's:
 * it is expensive, it calls a language model, and it must happen exactly when
 * asked. As a query it would be refetched on a window focus and quietly build a
 * second deck.
 *
 * The new deck is seeded into the cache so the study screen can read it by id
 * without a second round trip for something we are already holding.
 */
export function useGenerateDeck() {
  const queryClient = useQueryClient();

  return useMutation<FlashcardDeck, Error, GenerateFromRetrievalRequest>({
    mutationFn: (request) => flashcardsService.generate(request),
    onSuccess: (deck) => {
      queryClient.setQueryData(queryKeys.flashcards.deck(deck.id), deck);
    },
  });
}

/**
 * Mark one answer.
 *
 * Deliberately NOT optimistic. Every other mutation in this app knows the
 * outcome before the server answers; this one cannot, because the whole point is
 * that a model reads the answer for understanding. Guessing a verdict and
 * correcting it a second later would show a student "correct" and then take it
 * away.
 */
export function useEvaluateAnswer(deckId: string) {
  return useMutation<AnswerEvaluation, Error, { cardId: string; answer: string }>({
    mutationFn: ({ cardId, answer }) => flashcardsService.evaluate(deckId, cardId, answer),
  });
}

/** The end-of-deck report. A pure function of the deck and the attempts. */
export function useDeckReport(deckId: string) {
  const evidence = useGapEvidence();
  return useMutation<DeckReport, Error, DeckAttempt[]>({
    mutationFn: (attempts) => flashcardsService.report(deckId, attempts),
    onSuccess: (report) => evidence.flashcards(deckId, report),
  });
}
