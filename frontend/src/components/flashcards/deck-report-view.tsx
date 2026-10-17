'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { BookOpenText, Plus, RotateCcw } from 'lucide-react';

import { EmergeChip } from '@/components/ui';
import { SettingsSection } from '@/components/ui/settings-section';
import type { AnswerVerdict, DeckReport, Flashcard, FlashcardDeck, ReportTopic } from '@/types/flashcards';

import { Hint } from './hint';
import { pagesLabel, performanceTone } from './palette';
import { SourceDrawer } from './source-drawer';

type Tone = 'green' | 'amber' | 'red' | 'grey';

type Segment = { key: AnswerVerdict | 'skipped'; label: string; tone: Tone; count: number };

/**
 * The end-of-deck report.
 *
 * Three rules carried over from the engine, because they are what make the
 * report honest rather than encouraging:
 *
 * 1. **Evidence travels with every claim.** `3 of 4`, never 75%: "1 of 1" and
 *    "7 of 7" are the same percentage and not the same evidence.
 * 2. **One card never characterises a topic.** The engine already withholds a
 *    topic below its minimum, so a list arriving short is correct, not missing
 *    data, and this screen does not pad it.
 * 3. **`accuracy` is over what was ATTEMPTED**, not over the deck. Skipping is
 *    not a wrong answer, so unanswered cards are reported separately rather than
 *    folded into the score.
 */
export function DeckReportView({
  report,
  deck,
  onRestart,
  onRetry,
}: {
  report: DeckReport;
  deck: FlashcardDeck;
  onRestart: () => void;
  onRetry?: (cardIds: string[]) => void;
}): React.ReactElement {
  const missed = report.retry_card_ids;
  const [sourceOf, setSourceOf] = React.useState<Flashcard | null>(null);
  const cardOf = (cardId: string): Flashcard | undefined => deck.cards.find((c) => c.id === cardId);
  const segments: Segment[] = [
    { key: 'correct', label: 'Right', tone: 'green', count: report.correct },
    { key: 'almost', label: 'Nearly', tone: 'amber', count: report.almost },
    { key: 'incorrect', label: 'Wrong', tone: 'red', count: report.incorrect },
    { key: 'needs_review', label: 'Not judged', tone: 'grey', count: report.needs_review },
    { key: 'skipped', label: 'Skipped', tone: 'grey', count: report.unanswered },
  ];
  const segmentOf = (verdict: AnswerVerdict | null): Segment =>
    segments.find((s) => s.key === (verdict ?? 'skipped')) ?? segments[segments.length - 1]!;

  return (
    <>
      <CardHeader
        title={report.title}
        subheader={`${report.attempted} answered · ${report.unanswered} skipped`}
        action={
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1 }}>
            {onRetry && missed.length > 0 ? (
              <Button variant="contained" startIcon={<RotateCcw size={16} />} onClick={() => onRetry(missed)}>
                Retry {missed.length} missed {missed.length === 1 ? 'card' : 'cards'}
              </Button>
            ) : null}
            <Button
              variant={onRetry && missed.length > 0 ? 'outlined' : 'contained'}
              startIcon={<Plus size={16} />}
              onClick={onRestart}
            >
              New deck
            </Button>
          </Stack>
        }
      />

      <SettingsSection title="Score" hint="Over the cards you answered.">
        <Stack spacing={2}>
          <Score report={report} />
          <Composition segments={segments} />
        </Stack>
      </SettingsSection>

      <SettingsSection title="Next step" hint="What to revise.">
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Typography variant="body1">{report.recommendation}</Typography>
            {report.biggest_mistake ? (
              <Hint label="Pattern in your answers" title={report.biggest_mistake} />
            ) : null}
          </Stack>
          {report.needs_practice.length > 0 || report.strong.length > 0 ? (
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
              <TopicChips topics={report.needs_practice} />
              <TopicChips topics={report.strong} />
            </Stack>
          ) : null}
        </Stack>
      </SettingsSection>

      <SettingsSection title="Card by card" hint="In deck order.">
        <List disablePadding>
          {report.answers.map((a, index) => (
            <ListItem
              key={a.card_id}
              disableGutters
              divider={index < report.answers.length - 1}
              sx={{ gap: 1.5, alignItems: 'flex-start' }}
            >
              <ListItemText
                primary={a.question}
                secondary={
                  <>
                    {a.attempted ? (
                      <Box component="span" sx={{ display: 'block' }}>
                        You: {a.your_answer || '(blank)'}
                      </Box>
                    ) : null}
                    <Box component="span" sx={{ display: 'block' }}>
                      Book: {a.correct_answer}
                    </Box>
                  </>
                }
                slotProps={{ primary: { variant: 'subtitle2' }, secondary: { variant: 'body2' } }}
                sx={{ my: 0 }}
              />
              <Stack direction="row" spacing={1} sx={{ flex: 'none', alignItems: 'center' }}>
                <PageChip card={cardOf(a.card_id)} onOpen={setSourceOf} />
                <EmergeChip tone={segmentOf(a.verdict).tone} label={segmentOf(a.verdict).label} />
              </Stack>
            </ListItem>
          ))}
        </List>
      </SettingsSection>

      <SourceDrawer card={sourceOf} chapterTitle={report.title} onClose={() => setSourceOf(null)} />
    </>
  );
}

function Score({ report }: { report: DeckReport }): React.ReactElement {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
      <Typography
        variant="h1"
        component="p"
        aria-label={`${report.correct} of ${report.attempted} attempted cards right`}
        sx={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}
      >
        {report.correct}
        <Box component="span" sx={{ color: 'text.secondary' }}>
          /{report.attempted}
        </Box>
      </Typography>
      <Typography variant="body1" color="text.secondary">
        right
      </Typography>
    </Stack>
  );
}

function Composition({ segments }: { segments: Segment[] }): React.ReactElement {
  const theme = useTheme();
  const total = segments.reduce((t, s) => t + s.count, 0);
  const shown = segments.filter((s) => s.count > 0);
  const skipped = (s: Segment): boolean => s.key === 'skipped';

  return (
    <Box>
      <Box
        role="img"
        aria-label={segments.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(', ')}
        sx={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', bgcolor: theme.brand.sunken }}
      >
        {shown.map((s) => (
          <Box
            key={s.key}
            title={`${s.label}: ${s.count}`}
            sx={{
              width: `${(s.count / Math.max(total, 1)) * 100}%`,
              bgcolor: skipped(s) ? 'transparent' : theme.onTint[s.tone],
              opacity: 0.85,
            }}
          />
        ))}
      </Box>
      <Box
        component="dl"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' },
          columnGap: 2,
          rowGap: 1,
          m: 0,
          mt: 2,
        }}
      >
        {shown.map((s) => (
          <Stack key={s.key} direction="row" spacing={1} sx={{ alignItems: 'baseline', minWidth: 0 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                flex: 'none',
                alignSelf: 'center',
                bgcolor: skipped(s) ? theme.brand.sunken : theme.onTint[s.tone],
                border: skipped(s) ? `1px solid ${theme.brand.line2}` : 'none',
              }}
            />
            <Typography component="dd" variant="subtitle1" sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}>
              {s.count}
            </Typography>
            <Typography component="dt" variant="body2" color="text.secondary" noWrap>
              {s.label}
            </Typography>
          </Stack>
        ))}
      </Box>
    </Box>
  );
}

function TopicChips({ topics }: { topics: ReportTopic[] }): React.ReactElement {
  return (
    <>
      {topics.map((t) => (
        <EmergeChip
          key={t.label}
          tone={performanceTone(t.correct, t.cards)}
          label={`${t.label} · ${t.correct} of ${t.cards}`}
        />
      ))}
    </>
  );
}

function PageChip({
  card,
  onOpen,
}: {
  card: Flashcard | undefined;
  onOpen: (card: Flashcard) => void;
}): React.ReactElement | null {
  const label = pagesLabel(card?.citations[0]?.page_range ?? null);
  if (!card || !label) return null;
  return (
    <Chip
      size="small"
      variant="outlined"
      clickable
      icon={<BookOpenText size={14} />}
      label={label}
      aria-label={`Show source, ${label}`}
      onClick={() => onOpen(card)}
    />
  );
}
