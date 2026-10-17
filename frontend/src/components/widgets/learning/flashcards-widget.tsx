'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';

import { DeckBuilder } from '@/components/flashcards/deck-builder';
import { DeckReportView } from '@/components/flashcards/deck-report-view';
import { StudyDeck } from '@/components/flashcards/study-deck';
import { LearningScopeGate } from '@/components/learning-scope/learning-scope-gate';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useDeckReport, useGenerateDeck } from '@/hooks/mutation/use-flashcards';
import { FLASHCARDS_LINK_PARAMS } from '@/constants/flashcards';
import { useFlashcardCatalog } from '@/hooks/query/use-flashcards';
import { ApiError } from '@/services/api';
import type {
  CatalogChapter,
  CatalogResponse,
  DeckAttempt,
  DeckReport,
  FlashcardDeck,
  FlashcardEngineError,
} from '@/types/flashcards';
import type { WidgetProps } from '@/types/widget';

function offeredGrades(catalog: CatalogResponse | undefined): number[] | undefined {
  const chapters = (catalog?.subjects ?? []).flatMap((subject) => subject.chapters);
  if (chapters.length === 0 || chapters.some((chapter) => chapter.grade === null)) return undefined;
  return [...new Set(chapters.flatMap((chapter) => (chapter.grade === null ? [] : [chapter.grade])))];
}

function linkedGrade(catalog: CatalogResponse | undefined, chapterId: string | null): number | null {
  if (!chapterId) return null;
  const chapter = (catalog?.subjects ?? []).flatMap((subject) => subject.chapters).find((row) => row.id === chapterId);
  return chapter?.grade ?? null;
}

export function FlashcardsWidget(_props: WidgetProps): React.ReactElement {
  const catalog = useFlashcardCatalog();
  const linked = linkedGrade(catalog.data, useSearchParams().get(FLASHCARDS_LINK_PARAMS.chapter));
  if (catalog.isPending) {
    return (
      <Card sx={{ p: 3 }}>
        <WidgetLoading rows={4} />
      </Card>
    );
  }
  return (
    <LearningScopeGate
      mode="grade-only"
      grades={offeredGrades(catalog.data)}
      ungated={<FlashcardsSession grade={null} />}
      initial={() => (linked === null ? null : { grade: linked, sections: [], learner: null })}
      prompt="Flashcards are built from this class's textbooks."
    >
      {(scope) => <FlashcardsSession key={scope.grade.level} grade={scope.grade.level} />}
    </LearningScopeGate>
  );
}

/**
 * Flashcards, end to end: choose a chapter, build a grounded deck, answer the
 * cards, read the report.
 *
 * Three states and one linear path between them. There is no deck list, because
 * the engine stores decks but Emerge has nowhere to record which of them belong
 * to which student: it holds no learner state, by design, and inventing one here
 * would be a second answer to a question the LMS is supposed to own. A deck
 * lives for the length of the session that built it.
 */
function FlashcardsSession({ grade }: { grade: number | null }): React.ReactElement {
  const generate = useGenerateDeck();
  const deck = generate.data;
  const report = useDeckReport(deck?.id ?? '');
  const [chapter, setChapter] = React.useState<CatalogChapter | null>(null);
  const [answered, setAnswered] = React.useState<DeckAttempt[]>([]);
  const [retrying, setRetrying] = React.useState<ReadonlySet<string> | null>(null);
  const studied = React.useMemo(() => (deck && retrying ? retryDeck(deck, retrying) : deck), [deck, retrying]);

  const finish = (attempts: DeckAttempt[]): void => {
    const merged = retrying ? [...answered.filter((a) => !retrying.has(a.card_id)), ...attempts] : attempts;
    setAnswered(merged);
    setRetrying(null);
    report.mutate(merged);
  };

  return (
    <Card sx={{ minHeight: '100%', overflow: 'clip' }}>
      {/*
        No widget heading. The page already says "Flashcards" above this card,
        and each of the three screens leads with its own card header.
      */}
      {generate.error || report.error ? (
        <Stack spacing={2} sx={{ px: 3, pt: 3 }}>
          {isNoGroundedSource(generate.error) ? (
            <Alert severity="info" variant="outlined" onClose={() => generate.reset()}>
              No match in the library. Try another chapter or topic.
            </Alert>
          ) : generate.error ? (
            <WidgetError error={generate.error} onRetry={() => generate.reset()} />
          ) : null}

          {report.error ? (
            <WidgetError
              error={report.error}
              onRetry={() => report.variables && report.mutate(report.variables)}
            />
          ) : null}
        </Stack>
      ) : null}

      {report.data && deck ? (
        <DeckReportView
          report={withChapterTitle(report.data, chapter)}
          deck={deck}
          onRestart={() => {
            report.reset();
            generate.reset();
            setAnswered([]);
          }}
          onRetry={(cardIds) => {
            report.reset();
            setRetrying(new Set(cardIds));
          }}
        />
      ) : studied ? (
        <StudyDeck
          key={retrying ? `retry-${[...retrying].join()}` : studied.id}
          deck={studied}
          finishing={report.isPending}
          onFinish={finish}
        />
      ) : (
        <DeckBuilder
          grade={grade}
          generating={generate.isPending}
          onGenerate={(request, chosen) => {
            setChapter(chosen);
            generate.mutate(request);
          }}
        />
      )}
    </Card>
  );
}

function retryDeck(deck: FlashcardDeck, cardIds: ReadonlySet<string>): FlashcardDeck {
  const cards = deck.cards.filter((card) => cardIds.has(card.id));
  return { ...deck, cards, total_cards: cards.length, requested_cards: cards.length };
}

function isNoGroundedSource(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.details as Partial<FlashcardEngineError> | undefined)?.error === 'no_grounded_source'
  );
}

function withChapterTitle(report: DeckReport, chapter: CatalogChapter | null): DeckReport {
  if (!chapter) return report;
  const named = (text: string): string => text.split(chapter.id).join(chapter.title);
  return {
    ...report,
    strong: report.strong.map((t) => ({ ...t, label: named(t.label) })),
    needs_practice: report.needs_practice.map((t) => ({ ...t, label: named(t.label) })),
    recommendation: named(report.recommendation),
  };
}
