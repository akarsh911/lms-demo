'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { Segmented } from '@/components/ui';
import { SettingsSection } from '@/components/ui/settings-section';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { FLASHCARDS_LINK_PARAMS } from '@/constants/flashcards';
import { useFlashcardCatalog } from '@/hooks/query/use-flashcards';
import type { CatalogChapter, GenerateFromRetrievalRequest, RevisionStyle } from '@/types/flashcards';

import { DeckIllustration } from './deck-illustration';
import { Hint } from './hint';

const TITLE = 'Build a deck';
const TWO_UP = { display: 'grid', columnGap: 3, rowGap: 2.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } } as const;

const STYLES: { value: RevisionStyle; label: string }[] = [
  { value: 'mixed', label: 'Mixed' },
  { value: 'definitions', label: 'Definitions' },
  { value: 'conceptual', label: 'Concepts' },
  { value: 'application', label: 'Applying' },
  { value: 'exam', label: 'Exam' },
];

const COUNTS = ['5', '10', '15', '20'] as const;

/**
 * Choosing what to revise.
 *
 * Every control is in a student's vocabulary, never retrieval's: a chapter, a
 * topic, how many cards, what kind of question. Turning those into a retrieval
 * request is `planner.py`'s job in the engine and deliberately not this
 * screen's, which is why generation is one call to `generate/from-retrieval`
 * rather than an orchestration here.
 *
 * The catalog only lists sections that actually hold chunks: a parent node with
 * none is a heading, and offering it would produce an empty deck. `cards_available`
 * is shown for the same reason the deck reports a shortfall rather than padding
 * one, so asking for twenty from a chapter that holds six is a visible choice.
 */
export function DeckBuilder({
  grade,
  onGenerate,
  generating,
}: {
  grade: number | null;
  onGenerate: (request: GenerateFromRetrievalRequest, chapter: CatalogChapter) => void;
  generating: boolean;
}): React.ReactElement {
  const catalog = useFlashcardCatalog();
  const params = useSearchParams();
  const [chapter, setChapter] = React.useState(() => params.get(FLASHCARDS_LINK_PARAMS.chapter) ?? '');
  const [topic, setTopic] = React.useState(() => params.get(FLASHCARDS_LINK_PARAMS.topic) ?? '');
  const [count, setCount] = React.useState(10);
  const [style, setStyle] = React.useState<RevisionStyle>('mixed');
  const [examFocus, setExamFocus] = React.useState(false);

  const chapters = React.useMemo(
    () =>
      (catalog.data?.subjects ?? []).flatMap((s) =>
        s.chapters.filter((c) => grade === null || c.grade === null || c.grade === grade).map((c) => ({ ...c, subject: s.subject })),
      ),
    [catalog.data, grade],
  );

  const active = chapters.some((c) => c.id === chapter) ? chapter : (chapters[0]?.id ?? '');
  const activeChapter = chapters.find((c) => c.id === active);

  if (catalog.isPending || catalog.error) {
    return (
      <>
        <CardHeader title={TITLE} />
        <CardContent>
          {catalog.error ? (
            <WidgetError error={catalog.error} onRetry={() => void catalog.refetch()} />
          ) : (
            <WidgetLoading rows={4} />
          )}
        </CardContent>
      </>
    );
  }

  if (chapters.length === 0 || generating) {
    return (
      <>
        <CardHeader title={TITLE} subheader="Every card cites its textbook page" />
        <CardContent>
          {generating ? (
            <DeckIllustration animated title="Building your deck" caption="Reading the chapter and writing cards from it." />
          ) : (
            <DeckIllustration title="No chapters yet" caption="Chapters appear here once a textbook is in the library." />
          )}
        </CardContent>
      </>
    );
  }

  return (
    <>
      <CardHeader
        title={TITLE}
        subheader="Every card cites its textbook page"
      />

      <SettingsSection title="Chapter" hint="What the cards are built from.">
        <Box sx={TWO_UP}>
          <TextField
            select
            label="Chapter"
            value={active}
            onChange={(e) => setChapter(e.target.value)}
            helperText={activeChapter ? `${activeChapter.cards_available} passages` : undefined}
          >
            {chapters.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.subject} · {c.title}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Topic (optional)"
            placeholder="e.g. the nephron"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </Box>
      </SettingsSection>

      {/*
        Buttons rather than a select: there are five, they are the shape of
        the session, and a student should see the choice rather than open a
        menu to discover it.
      */}
      <SettingsSection title="Questions" hint="The kind, and how many.">
        <Box sx={TWO_UP}>
          <Stack spacing={1}>
            <Typography variant="eyebrow" color="text.secondary">
              Style
            </Typography>
            <Segmented ariaLabel="Question style" options={STYLES} value={style} onChange={setStyle} />
          </Stack>
          <Stack spacing={1}>
            <Typography variant="eyebrow" color="text.secondary">
              Cards
            </Typography>
            <Segmented
              ariaLabel="How many cards"
              options={COUNTS.map((n) => ({ value: n, label: n }))}
              value={String(count) as (typeof COUNTS)[number]}
              onChange={(next) => setCount(Number(next))}
            />
          </Stack>
        </Box>
      </SettingsSection>

      <SettingsSection title="Focus" hint="Optional weighting.">
        <Stack direction="row" sx={{ alignItems: 'center' }}>
          <FormControlLabel
            sx={{ mr: 0.5 }}
            control={
              <Switch
                checked={examFocus}
                onChange={(event) => setExamFocus(event.target.checked)}
                size="small"
              />
            }
            label="Past-paper focus"
          />
          <Hint title="Favour what previous-year papers examined." />
        </Stack>
      </SettingsSection>

      <CardActions sx={{ justifyContent: 'flex-end', gap: 1 }}>
        <Button
          variant="contained"
          loading={generating}
          disabled={!activeChapter}
          onClick={() => {
            if (!activeChapter) return;
            onGenerate(
              {
                spec: {
                  title: activeChapter.title,
                  chapter: activeChapter.id,
                  topic: topic.trim() || undefined,
                  count,
                  revision_style: style,
                  focus: examFocus ? 'important' : 'all',
                  grade: activeChapter.grade ?? undefined,
                  include_explanations: true,
                  allow_images: true,
                },
                locator: activeChapter.document_id
                  ? { mode: 'FETCH', document_id: activeChapter.document_id }
                  : {},
              },
              activeChapter,
            );
          }}
        >
          Build deck
        </Button>
      </CardActions>
    </>
  );
}
