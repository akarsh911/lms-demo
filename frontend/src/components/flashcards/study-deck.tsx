'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ButtonBase from '@mui/material/ButtonBase';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { BookOpenText, Flame } from 'lucide-react';

import { EmergeChip, type ChipTone } from '@/components/ui';
import { useEvaluateAnswer } from '@/hooks/mutation/use-flashcards';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type {
  AnswerEvaluation,
  AnswerVerdict,
  DeckAttempt,
  Flashcard,
  FlashcardCitation,
  FlashcardDeck,
} from '@/types/flashcards';

import { DeckIllustration } from './deck-illustration';
import { Hint } from './hint';
import { STYLE_ACCENT } from './palette';
import { ProgressRail } from './progress-rail';
import { SourceDrawer } from './source-drawer';

/** The reading column. A card is a question, not a dashboard. */
const COLUMN = 720;

const CARD_MIN_HEIGHT = { xs: 220, md: 260 };

/**
 * `needs_review` is NOT a fourth grade on the scale. It is what the engine
 * returns when it could not decide: an inconclusive word count with no judge
 * available, or nothing submitted. Rendering it as "wrong" tells a student they
 * failed a coin-flip, so it gets a neutral tone and its own words.
 */
const VERDICT: Record<AnswerVerdict, { tone: ChipTone; label: string }> = {
  correct: { tone: 'green', label: 'Right' },
  almost: { tone: 'amber', label: 'Nearly' },
  incorrect: { tone: 'red', label: 'Not quite' },
  needs_review: { tone: 'grey', label: 'Not judged' },
};

/**
 * Study one deck, one card at a time.
 *
 * ## Two honesty flags this screen is required to render
 *
 * `grounding.no_good_match` arrives WITH a populated deck: the library found
 * nothing that grounds this selection, so the cards came from material that does
 * not match what was asked for. Rendering the deck and swallowing the flag is
 * the failure the engine's own docs call out.
 *
 * `judged_by: "lexical"` means no marker was available and the verdict is word
 * overlap. It may say correct; it never says incorrect. It is labelled with the
 * instrument rather than presented with a model's confidence.
 *
 * ## The answer stays hidden until it has been earned
 *
 * Flipping the card exists, because a student who is stuck should not be
 * trapped, but it is a quiet gesture next to a loud button. Revealing on
 * arrival, which the first version effectively did by expanding the back under
 * the front, turns a recall exercise into reading.
 */
export function StudyDeck({
  deck,
  onFinish,
  finishing = false,
}: {
  deck: FlashcardDeck;
  onFinish: (attempts: DeckAttempt[]) => void;
  finishing?: boolean;
}): React.ReactElement {
  const [index, setIndex] = React.useState(0);
  const [answer, setAnswer] = React.useState('');
  const [flipped, setFlipped] = React.useState(false);
  const [attempts, setAttempts] = React.useState<DeckAttempt[]>([]);
  const [evaluation, setEvaluation] = React.useState<AnswerEvaluation | null>(null);
  const [sourceOf, setSourceOf] = React.useState<Flashcard | null>(null);

  const evaluate = useEvaluateAnswer(deck.id);
  const card = deck.cards[index];
  const last = index >= deck.cards.length - 1;

  if (!card) {
    return (
      <>
        <CardHeader title={deck.title} />
        <CardContent>
          <DeckIllustration title="This deck has no cards" caption="Try another chapter or topic." />
        </CardContent>
      </>
    );
  }

  const advance = (next: DeckAttempt[]): void => {
    if (last) {
      onFinish(next);
      return;
    }
    setIndex((i) => i + 1);
    setAnswer('');
    setFlipped(false);
    setEvaluation(null);
    evaluate.reset();
  };

  const check = (): void =>
    evaluate.mutate(
      { cardId: card.id, answer },
      {
        onSuccess: (marked) => {
          setEvaluation(marked);
          setFlipped(true);
        },
      },
    );

  const record = (): void => {
    if (!evaluation) return;
    const next = [
      ...attempts,
      { card_id: card.id, answer, verdict: evaluation.verdict, score: evaluation.score },
    ];
    setAttempts(next);
    advance(next);
  };

  const shortfall = deck.total_cards < deck.requested_cards;

  return (
    <>
      <CardHeader
        title={deck.title}
        subheader={`Card ${index + 1} of ${deck.cards.length}`}
        action={
          shortfall ? (
            <Hint
              label="Fewer cards than asked"
              title={`${deck.total_cards} of ${deck.requested_cards} cards could be grounded in the book.`}
            />
          ) : undefined
        }
      />
      <CardContent>
        <Stack spacing={2.5} sx={{ width: '100%', maxWidth: COLUMN, mx: 'auto' }}>
          <ProgressRail cardIds={deck.cards.map((c) => c.id)} current={index} attempts={attempts} />

          {deck.grounding.no_good_match ? (
            <Alert severity="warning" variant="outlined">
              Loose match: these cards come from related material.
            </Alert>
          ) : null}

          <FlipCard
            key={card.id}
            card={card}
            flipped={flipped}
            feedback={evaluation ? feedbackOf(evaluation.verdict) : null}
            onFlip={() => setFlipped((f) => !f)}
            onSource={() => setSourceOf(card)}
          />

          <TextField
            multiline
            minRows={2}
            placeholder="Your answer"
            slotProps={{ htmlInput: { 'aria-label': 'Your answer' } }}
            value={answer}
            disabled={Boolean(evaluation)}
            onChange={(e) => setAnswer(e.target.value)}
          />

          {evaluation ? <VerdictLine evaluation={evaluation} /> : null}
        </Stack>
      </CardContent>

      <CardActions
        sx={{
          justifyContent: 'flex-end',
          gap: 1,
          position: 'sticky',
          bottom: 0,
          zIndex: 1,
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        {/* Skipping is not a wrong answer: the report counts it separately. */}
        {!evaluation ? (
          <Button variant="outlined" disabled={finishing} onClick={() => advance(attempts)}>
            Skip
          </Button>
        ) : null}
        {evaluation ? (
          <Button variant="contained" loading={finishing} onClick={record}>
            {last ? 'Finish' : 'Next'}
          </Button>
        ) : (
          <Button variant="contained" disabled={!answer.trim()} loading={evaluate.isPending} onClick={check}>
            Check
          </Button>
        )}
      </CardActions>

      <SourceDrawer card={sourceOf} chapterTitle={deck.title} onClose={() => setSourceOf(null)} />
    </>
  );
}

type Feedback = 'success' | 'miss' | null;

function feedbackOf(verdict: AnswerVerdict): Feedback {
  if (verdict === 'correct') return 'success';
  if (verdict === 'needs_review') return null;
  return 'miss';
}

function FlipCard({
  card,
  flipped,
  feedback,
  onFlip,
  onSource,
}: {
  card: Flashcard;
  flipped: boolean;
  feedback: Feedback;
  onFlip: () => void;
  onSource: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const accent = STYLE_ACCENT[card.style] ?? STYLE_ACCENT.recall;
  const stripe = theme.onTint[accent.tone];
  const examined = card.importance === 'high' || card.pyq_backed;
  const ring = feedback === 'success' ? theme.onTint.green : theme.onTint.amber;

  const face = {
    gridArea: '1 / 1',
    display: 'flex',
    flexDirection: 'column',
    gap: 1.5,
    p: { xs: 2.5, md: 4 },
    minHeight: CARD_MIN_HEIGHT,
    borderRadius: `${theme.band.radius.lg}px`,
    border: 1,
    borderColor: 'divider',
    borderTop: `6px solid ${stripe}`,
    bgcolor: 'background.paper',
    boxShadow: 1,
    backfaceVisibility: 'hidden',
    textAlign: 'left',
  } as const;

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: `${theme.band.radius.lg}px`,
        '@keyframes card-pop': {
          '0%': { transform: 'scale(1)', boxShadow: `0 0 0 0 ${alpha(ring, 0.45)}` },
          '40%': { transform: 'scale(1.015)' },
          '100%': { transform: 'scale(1)', boxShadow: `0 0 0 14px ${alpha(ring, 0)}` },
        },
        '@keyframes card-nudge': {
          '0%, 100%': { transform: 'translateX(0)', boxShadow: `0 0 0 0 ${alpha(ring, 0.4)}` },
          '25%': { transform: 'translateX(-6px)' },
          '50%': { transform: 'translateX(5px)' },
          '75%': { transform: 'translateX(-3px)', boxShadow: `0 0 0 10px ${alpha(ring, 0)}` },
        },
        animation:
          reduced || !feedback
            ? 'none'
            : feedback === 'success'
              ? 'card-pop .6s cubic-bezier(.2,.8,.2,1)'
              : 'card-nudge .45s ease-in-out',
      }}
    >
      <Tooltip title={flipped ? 'Show question' : 'Show answer'} placement="top" enterDelay={600}>
        <ButtonBase
          component="div"
          role="button"
          onClick={onFlip}
          aria-pressed={flipped}
          aria-label={flipped ? `Answer: ${card.back}` : `Question: ${card.front}. Flip to show the answer.`}
          sx={{ display: 'block', width: '100%', borderRadius: `${theme.band.radius.lg}px`, perspective: 1200 }}
        >
          <Box
            sx={{
              display: 'grid',
              transformStyle: 'preserve-3d',
              transition: reduced ? 'none' : 'transform .5s cubic-bezier(.2,.8,.2,1)',
              transform: flipped ? 'rotateY(180deg)' : 'none',
            }}
          >
            <Box sx={{ ...face, visibility: reduced && flipped ? 'hidden' : 'visible' }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', minHeight: 24 }}>
                <EmergeChip tone={accent.tone} label={accent.label} />
                {/* `high` means a past paper examined this. Evidence, not a label a model chose. */}
                {examined ? (
                  <EmergeChip tone="orange" label="Past paper" icon={<Flame size={12} aria-hidden />} />
                ) : null}
              </Stack>
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                <Typography variant="h3" component="p" sx={{ lineHeight: 1.3 }}>
                  {card.front}
                </Typography>
              </Box>
              {card.visual ? (
                // Loaded by the browser straight from the retrieval engine; the image
                // never passes through the flashcard service, and `visual` is populated
                // only after a blob-existence check, so it will resolve.
                <Box
                  component="img"
                  src={card.visual.reference}
                  alt={card.visual.alt_text}
                  sx={{ maxWidth: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 1 }}
                />
              ) : null}
            </Box>

            <Box
              sx={{
                ...face,
                transform: 'rotateY(180deg)',
                bgcolor: theme.brand.subtle,
                visibility: reduced && !flipped ? 'hidden' : 'visible',
              }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ pr: 5 }}>
                {card.front}
              </Typography>
              <Stack direction="row" sx={{ alignItems: 'center', minHeight: 24 }}>
                <Typography variant="eyebrow" color="text.secondary">
                  Answer
                </Typography>
              </Stack>
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                <Typography variant="h5" component="p" sx={{ fontWeight: 500, lineHeight: 1.45 }}>
                  {card.back}
                </Typography>
              </Box>
              {card.explanation ? (
                <Typography variant="body2" color="text.secondary">
                  {card.explanation}
                </Typography>
              ) : null}
              {card.citations[0] ? (
                <Typography variant="caption" color="text.secondary">
                  {citationLabel(card.citations[0])}
                </Typography>
              ) : null}
            </Box>
          </Box>
        </ButtonBase>
      </Tooltip>
      {flipped ? (
        <Tooltip title="Show source">
          <IconButton
            aria-label="Show source"
            onClick={onSource}
            size="small"
            sx={{
              position: 'absolute',
              top: { xs: 16, md: 24 },
              right: { xs: 12, md: 20 },
              color: theme.onTint[accent.tone],
              bgcolor: theme.tints[accent.tone],
              '&:hover': { bgcolor: theme.tints[accent.tone] },
            }}
          >
            <BookOpenText size={18} />
          </IconButton>
        </Tooltip>
      ) : null}
    </Box>
  );
}

const ACTION_ROW_ROOM = 88;

function VerdictLine({ evaluation }: { evaluation: AnswerEvaluation }): React.ReactElement {
  const verdict = VERDICT[evaluation.verdict];
  const lexical = evaluation.judged_by === 'lexical';
  const reduced = useReducedMotion();
  const line = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    line.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [evaluation, reduced]);

  return (
    <Stack ref={line} spacing={0.75} role="status" sx={{ scrollMarginBottom: `${ACTION_ROW_ROOM}px` }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <EmergeChip tone={verdict.tone} label={verdict.label} />
        {lexical ? (
          <Tooltip
            title="No marker was available, so this compared your words with the book's. It can confirm a right answer but never call one wrong."
            enterTouchDelay={0}
          >
            <span tabIndex={0}>
              <EmergeChip tone="grey" label="Word match only" />
            </span>
          </Tooltip>
        ) : null}
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>
          {evaluation.feedback}
        </Typography>
      </Stack>
      {evaluation.incorrect_claims.length > 0 ? (
        <Typography variant="caption" color="text.secondary">
          Not right: {evaluation.incorrect_claims.join(', ')}
        </Typography>
      ) : null}
    </Stack>
  );
}

function citationLabel(citation: FlashcardCitation): string {
  const range = citation.page_range;
  if (!range) return citation.document_title;
  const pages = range[0] === range[1] ? `p. ${range[0]}` : `pp. ${range[0]}–${range[1]}`;
  return citation.document_title ? `${citation.document_title} · ${pages}` : pages;
}
