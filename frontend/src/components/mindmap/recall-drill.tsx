'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui';
import { WidgetLoading } from '@/components/widgets/widget-states';
import { useMindMapDrill } from '@/hooks/query/use-mindmap-drill';
import { useGradeDrill } from '@/hooks/mutation/use-grade-drill';
import type {
  DrillGrade,
  DrillItem,
  DrillKind,
  DrillVerdict,
  RelationGrammar,
} from '@/types/mindmap';

import { MindmapError } from './mindmap-error';

/** The reading column. A question is prose; prose does not want 1500px. */
const COLUMN = 640;

const KINDS: { value: DrillKind; label: string }[] = [
  { value: 'label', label: 'Name it' },
  { value: 'placement', label: 'Choose it' },
  { value: 'relation', label: 'Connections' },
];

const RELATION_KIND: DrillKind = 'relation';
const GAP = '____';

const EMPTY_DRILL: Record<DrillKind, string> = {
  label: 'This chapter does not have enough extracted concepts to build a drill yet.',
  placement: 'This chapter does not have enough extracted concepts to build a drill yet.',
  relation:
    'The book states no typed connection between the concepts of this chapter, so there is nothing to drill here. That is common, and it is not a gap in the map.',
};

function verbOf(grammar: RelationGrammar, relationType: string): string {
  return grammar[relationType]?.verb ?? relationType.replace(/_/g, ' ');
}

function answeredOnly(answers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(answers).filter(([, text]) => text.trim() !== ''));
}

type Tone = 'green' | 'amber' | 'red' | 'grey';

const VERDICT: Record<DrillVerdict, { tone: Tone; label: string }> = {
  correct: { tone: 'green', label: 'Right' },
  partial: { tone: 'amber', label: 'Nearly' },
  incorrect: { tone: 'red', label: 'Not this time' },
};

/**
 * Recall mode: rebuild the chapter from memory.
 *
 * ## One question at a time
 *
 * The first version put all eight on one scroll, with every answer box and every
 * verdict open at once. That is a form, not a test: you can see the next
 * question while answering this one, nothing marks where you are, and the score
 * arrives somewhere above the fold. Recall is the one exercise where seeing
 * ahead defeats the point.
 *
 * ## The seed is the drill, and it must not move
 *
 * Questions are fetched WITHOUT their answers, so the browser cannot be read for
 * the key to the drill it is sitting. Grading posts the same `(kind, n, seed)`
 * back and the engine rebuilds the identical questions to mark against, because
 * selection is seeded and deterministic. Nothing is stored between the calls.
 *
 * So the seed lives in state and moves only in `startAttempt`. Deriving it from
 * anything per-render would swap the questions under the student and mark them
 * against a drill they never saw, with no error anywhere.
 *
 * ## The result IS persisted, by the server
 *
 * `node_scores` is what the engine hands an LMS and then deliberately forgets.
 * Emerge is the LMS, so emerge-core records the scores while it relays the
 * grade, for a tracked learner who may write mastery, and the map reads them
 * back: answer well and the concept ticks on the map. Nothing here writes a
 * state. The review claims the tick only when the server says it saved; when
 * the server attempted no write, it says nothing was recorded.
 */
export function RecallDrill({
  itemId,
  sectionId,
  grammar,
  topic,
  onWholeChapter,
}: {
  itemId: string;
  sectionId: string;
  grammar: RelationGrammar;
  topic: { id: string; label: string } | null;
  onWholeChapter: () => void;
}): React.ReactElement {
  const [kind, setKind] = React.useState<DrillKind>('label');
  const [count] = React.useState(8);
  const [seed, setSeed] = React.useState(() => Math.floor(Math.random() * 100_000));
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [at, setAt] = React.useState(0);

  const { data: drill, isPending, error, refetch } = useMindMapDrill(
    itemId,
    sectionId,
    kind,
    count,
    seed,
    topic?.id ?? null,
  );
  const grade = useGradeDrill(itemId, sectionId);

  const startAttempt = (nextKind: DrillKind = kind): void => {
    setKind(nextKind);
    setSeed(Math.floor(Math.random() * 100_000));
    setAnswers({});
    setAt(0);
    grade.reset();
  };

  const graded = grade.data;

  const submit = (): void => {
    if (!drill) return;
    grade.mutate({
      kind: drill.kind,
      n: count,
      seed: drill.seed,
      ...(topic ? { topic_id: topic.id } : {}),
      answers: answeredOnly(answers),
    });
  };

  if (drill && graded) {
    return (
      <Box sx={{ width: '100%', maxWidth: COLUMN, alignSelf: 'center', mx: 'auto', pb: 4 }}>
        <Review
          drill={drill}
          result={graded.result}
          saved={savedOf(graded)}
          grammar={grammar}
          onAgain={() => startAttempt()}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: COLUMN, alignSelf: 'center', mx: 'auto', pb: 4 }}>
      <Stack spacing={3}>
        {topic ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="body2">
              Testing one topic: <strong>{topic.label}</strong>
            </Typography>
            <Button size="small" onClick={onWholeChapter} sx={{ textTransform: 'none' }}>
              Whole chapter instead
            </Button>
          </Stack>
        ) : null}
        <ToggleButtonGroup
          exclusive
          size="small"
          value={kind}
          aria-label="Kind of drill"
          onChange={(_, v: DrillKind | null) => v && startAttempt(v)}
        >
          {KINDS.map((k) => (
            <ToggleButton key={k.value} value={k.value} sx={{ px: 1.75, textTransform: 'none' }}>
              {k.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {isPending ? <WidgetLoading rows={4} /> : null}
        {error ? <MindmapError error={error} onRetry={() => void refetch()} /> : null}

        {drill && drill.items.length === 0 ? (
          <Alert severity="info" variant="outlined">
            {EMPTY_DRILL[kind]}
          </Alert>
        ) : null}

        {drill && drill.items.length > 0 ? (
          <Question
            drill={drill}
            at={at}
            answers={answers}
            grammar={grammar}
            busy={grade.isPending}
            onAnswer={(id, value) => setAnswers((a) => ({ ...a, [id]: value }))}
            onBack={() => setAt((i) => Math.max(0, i - 1))}
            onNext={() => setAt((i) => i + 1)}
            onSubmit={submit}
          />
        ) : null}

        {grade.error ? <MindmapError error={grade.error} onRetry={submit} /> : null}
      </Stack>
    </Box>
  );
}

function Question({
  drill,
  at,
  answers,
  grammar,
  busy,
  onAnswer,
  onBack,
  onNext,
  onSubmit,
}: {
  drill: { items: DrillItem[] };
  at: number;
  answers: Record<string, string>;
  grammar: RelationGrammar;
  busy: boolean;
  onAnswer: (id: string, value: string) => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}): React.ReactElement {
  const item = drill.items[at]!;
  const last = at === drill.items.length - 1;
  const answered = Object.values(answers).filter((v) => v.trim()).length;
  const isRelation = item.kind === RELATION_KIND;
  const sentence = item.masked_prompt || item.prompt;

  return (
    <Stack spacing={3}>
      <Typography variant="caption" color="text.secondary">
        {answered} of {drill.items.length} answered
      </Typography>

      {/* Where you are, as a bar rather than a number to hunt for. */}
      <LinearProgress
        variant="determinate"
        value={((at + 1) / drill.items.length) * 100}
        sx={{ height: 4, borderRadius: 99 }}
      />

      <div>
        <Typography variant="caption" color="text.secondary">
          Topic: {item.topic_label}
        </Typography>
        {/*
          The prompt is the book's sentence with the answer masked out. Given
          room, in the size it deserves: it is the only thing on screen that
          matters.
        */}
        {isRelation ? (
          <>
            <Typography variant="h4" sx={{ mt: 0.5, lineHeight: 1.45, fontWeight: 500 }}>
              “{item.prompt}”
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              How does the book connect these two?
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 600 }}>
              {item.masked_prompt}
            </Typography>
          </>
        ) : (
          <>
            <Typography variant="h4" sx={{ mt: 0.5, lineHeight: 1.45, fontWeight: 500 }}>
              {sentence}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {sentence.includes(GAP)
                ? 'Name the concept that fills the gap.'
                : 'Name the concept this sentence describes.'}
            </Typography>
          </>
        )}
      </div>

      {item.options.length > 0 ? (
        <Stack spacing={1}>
          {/*
            Options as a list of real targets rather than a dropdown. Every
            distractor is a genuine label from this chapter, so reading them is
            part of the exercise and hiding them behind a select wastes it.
          */}
          {item.options.map((o) => {
            const chosen = answers[item.id] === o;
            return (
              <Button
                key={o}
                variant={chosen ? 'contained' : 'outlined'}
                color={chosen ? 'primary' : 'inherit'}
                onClick={() => onAnswer(item.id, o)}
                sx={{ justifyContent: 'flex-start', textTransform: 'none', py: 1.25, px: 2 }}
              >
                {isRelation ? verbOf(grammar, o) : o}
              </Button>
            );
          })}
        </Stack>
      ) : (
        <TextField
          autoFocus
          fullWidth
          placeholder="Type what you remember"
          value={answers[item.id] ?? ''}
          onChange={(e) => onAnswer(item.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !last) onNext();
          }}
        />
      )}

      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Button disabled={at === 0} onClick={onBack} color="inherit">
          Back
        </Button>
        <Box sx={{ flex: 1 }} />
        {last ? (
          <Button variant="contained" onClick={onSubmit} disabled={busy}>
            {busy ? 'Marking…' : 'Mark my answers'}
          </Button>
        ) : (
          <Button variant="contained" onClick={onNext}>
            Next
          </Button>
        )}
      </Stack>

      {/* Skipping is allowed and is not a wrong answer, so it is said plainly. */}
      {!answers[item.id]?.trim() ? (
        <Typography variant="caption" color="text.secondary">
          You can skip this one. It is reported as skipped rather than as a mistake.
        </Typography>
      ) : null}
    </Stack>
  );
}

type Saved = 'recorded' | 'not_saved' | 'not_recorded' | 'nothing_answered';

const SAVED_SENTENCE: Record<Saved, string> = {
  recorded: 'What you got right is now ticked on the map.',
  not_saved:
    'This attempt was marked, but saving it failed, so the map does not show it. The marks below still stand.',
  not_recorded:
    'This attempt was marked, but nothing was recorded for it, so the map does not change.',
  nothing_answered:
    'Every question was skipped, so there was nothing to record and the map does not change.',
};

function savedOf(graded: DrillGrade): Saved {
  if (graded.recorded === true) return 'recorded';
  if (graded.recorded === false) return 'not_saved';
  const answered = graded.result.results.some((marked) => marked.given.trim() !== '');
  return answered ? 'not_recorded' : 'nothing_answered';
}

function Review({
  drill,
  result,
  saved,
  grammar,
  onAgain,
}: {
  drill: { items: DrillItem[] };
  result: import('@/types/mindmap').DrillResult;
  saved: Saved;
  grammar: RelationGrammar;
  onAgain: () => void;
}): React.ReactElement {
  const [showBasis, setShowBasis] = React.useState(false);

  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="overline" color="text.secondary">
          Recall
        </Typography>
        {/*
          Evidence, not a percentage: "5 of 8" and "50 of 80" are the same
          fraction and not the same evidence.
        */}
        <Typography variant="h2" sx={{ mt: 0.5 }}>
          {result.correct} of {result.scored} right
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <EmergeChip tone="green" label={`${result.correct} right`} />
          {result.partial > 0 ? <EmergeChip tone="amber" label={`${result.partial} nearly`} /> : null}
          {(() => {
            // Skips are reported apart from mistakes, for the same reason.
            const skips = result.results.filter((r) => !r.given.trim()).length;
            const wrong = result.incorrect - skips;
            return (
              <>
                {wrong > 0 ? <EmergeChip tone="red" label={`${wrong} to revisit`} /> : null}
                {skips > 0 ? <EmergeChip tone="grey" label={`${skips} skipped`} /> : null}
              </>
            );
          })()}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          {SAVED_SENTENCE[saved]}
        </Typography>
      </div>

      <Stack spacing={2.5}>
        {drill.items.map((item, i) => {
          const marked = result.results.find((r) => r.item_id === item.id);
          if (!marked) return null;
          /*
            A blank gets its own neutral treatment. The engine scores it
            `incorrect`, which is right for the score, but calling it "Not this
            time" in red says the student answered and got it wrong. They did
            not answer. Being honest about that is the whole difference between
            a skip and a mistake.
          */
          const skipped = !marked.given.trim();
          const said = (answer: string): string =>
            item.kind === RELATION_KIND ? verbOf(grammar, answer) : answer;
          const v = skipped
            ? { tone: 'grey' as const, label: 'Skipped' }
            : VERDICT[marked.verdict];
          return (
            <Box
              key={item.id}
              sx={{
                borderLeft: 3,
                borderColor: skipped
                  ? 'divider'
                  : marked.verdict === 'correct'
                    ? 'success.main'
                    : marked.verdict === 'partial'
                      ? 'warning.main'
                      : 'error.main',
                pl: 2,
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  Question {i + 1} · topic: {item.topic_label}
                </Typography>
                <EmergeChip tone={v.tone} label={v.label} />
              </Stack>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                {item.masked_prompt || item.prompt}
              </Typography>

              <Typography variant="body2" sx={{ mt: 0.75 }}>
                {marked.given.trim() ? (
                  <>
                    You said <strong>{said(marked.given)}</strong>
                  </>
                ) : (
                  <em>Skipped</em>
                )}
              </Typography>

              {marked.verdict !== 'correct' || skipped ? (
                <Typography variant="body2" sx={{ mt: 0.25 }}>
                  The answer is <strong>{said(marked.expected)}</strong>
                </Typography>
              ) : null}

              {/*
                Being told you are wrong and being shown where the answer lives
                are one interaction, not two. The engine returns the citation
                WITH the verdict for exactly this, so the page is never shown
                without the sentence it came from.
              */}
              {marked.evidence ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.75, fontStyle: 'italic' }}
                >
                  “{marked.evidence}”
                  {marked.citation?.page != null ? (
                    <Box component="span" sx={{ fontStyle: 'normal' }}>
                      {' '}
                      · page {marked.citation.page}
                    </Box>
                  ) : null}
                </Typography>
              ) : null}
            </Box>
          );
        })}
      </Stack>

      <Stack direction="row" spacing={1.5}>
        <Button variant="contained" onClick={onAgain}>
          Try another set
        </Button>
      </Stack>

      {/*
        `grading_basis` is a paragraph of engine internals: difflib ratios,
        token-set containment thresholds, what counts as PARTIAL. It was printed
        in full under the score, where it read as an error message. It is an
        auditor's string, not a learner's, and it is genuinely worth keeping,
        so it lives behind a disclosure that says what it is.
      */}
      <div>
        <Button
          size="small"
          color="inherit"
          onClick={() => setShowBasis((v) => !v)}
          sx={{ textTransform: 'none', px: 0 }}
        >
          {showBasis ? 'Hide' : 'How was this marked?'}
        </Button>
        <Collapse in={showBasis}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {result.grading_basis}
          </Typography>
        </Collapse>
      </div>
    </Stack>
  );
}
