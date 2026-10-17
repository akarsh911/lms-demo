'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Eye, Maximize2 } from 'lucide-react';

import { TextbookPassage } from '@/components/textbook/textbook-passage';
import { ChoiceQuiz, EmergeChip, ScoreCard, Segmented } from '@/components/ui';
import { scaledForNoViva, starsForShare } from '@labs/lib/marking';
import type { BenchDefinition } from '@labs/types/lab-bench';

import { useLabFeature } from './lab-features';
import { ReadingSheet } from './reading-sheet';

/**
 * The console beside the apparatus: what to do now, and the notebook.
 *
 * Shared by every practical. The bench supplies the task and the notebook
 * tabs; the viva, the marking card and the attempt record are the same
 * everywhere and are built from the engine's own description of itself.
 *
 * The top half is the CURRENT STEP and its one input, so what a student must
 * type is always beside what they just read off the apparatus. The bottom half
 * is the notebook as tabs rather than a column of stacked cards — that column
 * is what produced a scrollbar per card.
 *
 * The viva and the result take the whole console: both are reading rather than
 * doing, and neither wants a table underneath it.
 */
export interface SaveStatus {
  state: 'idle' | 'saving' | 'saved' | 'error';
  retry?: () => void;
}

export function BenchConsole<S, A>({
  definition,
  state,
  dispatch,
  now,
  scroll,
  aside,
  teach,
  save,
  container,
  onNewBench,
  onRepeatBench,
  onTrainer,
}: {
  definition: BenchDefinition<S, A>;
  state: S;
  dispatch: (action: A) => S;
  now: () => number;
  /** Whether the console scrolls internally (split) or grows (stacked). */
  scroll: boolean;
  aside?: React.ReactNode;
  /** The teaching panel, when the student has opened it. */
  teach?: React.ReactNode;
  save: SaveStatus;
  /** The widget's own frame, so the reading sheet opens inside the practical. */
  container?: HTMLElement;
  onNewBench: () => void;
  onRepeatBench: () => void;
  /** Offered only when this step HAS a demonstration and the flag allows one. */
  onTrainer?: (() => void) | undefined;
}): React.ReactElement {
  const theme = useTheme();
  const { engine, ui } = definition;
  const step = engine.step(state);
  const done = engine.done(state);
  // Convention: the last step is the viva, on every bench in the syllabus.
  // With the viva removed, reaching what would have been the viva step IS the
  // end of the practical: there is nothing left to ask.
  const vivaStage = step >= engine.steps.length - 1;
  const hasViva = useLabFeature('viva');
  const finished = done || (!hasViva && vivaStage);
  const inViva = hasViva && !done && vivaStage;
  // The paper this attempt is sitting — never the bank. It is drawn from the
  // bench seed with its options shuffled, and it is what the reducer marks
  // against, so rendering anything else would mark right answers wrong.
  const paper = engine.vivaFor(state);

  // The tab follows the step until the student chooses; choosing holds until
  // the step changes. Adjusted during render, so no effect and no extra pass.
  const suggested = ui.tabForStep?.(state) ?? ui.tabs[0]?.id ?? '';
  const [picked, setPicked] = React.useState<{ step: number; tab: string } | null>(null);
  /** The notebook, opened in the reading sheet. */
  const [wide, setWide] = React.useState(false);
  const tab = picked && picked.step === step ? picked.tab : suggested;
  const Panel = ui.tabs.find((t) => t.id === tab)?.Panel ?? ui.tabs[0]?.Panel;

  const body = {
    flex: scroll ? 1 : 'none',
    // A floor: squeezed below this the notebook shows a row and a half of a
    // table, which is worse than nothing.
    minHeight: scroll ? 132 : 0,
    overflowY: scroll ? 'auto' : 'visible',
    overscrollBehavior: 'contain',
    p: 2,
  } as const;

  const card = {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    // If even the task and tabs cannot fit, the console scrolls as a whole
    // rather than clipping them.
    overflowY: scroll ? 'auto' : 'visible',
  } as const;

  if (finished) {
    return (
      <Card sx={card}>
        <Box sx={body}>
          <BenchResult
            definition={definition}
            state={state}
            save={save}
            onNewBench={onNewBench}
            onRepeatBench={onRepeatBench}
          />
        </Box>
      </Card>
    );
  }

  if (inViva) {
    return (
      <Card sx={card}>
        <Box sx={body}>
          <Typography
            component="h3"
            sx={{ fontWeight: 800, fontSize: theme.band.type.h4, color: theme.brand.ink }}
          >
            Viva voce
          </Typography>
          <Typography sx={{ mt: 0.5, color: theme.brand.sub, fontSize: theme.band.type.base - 1 }}>
            {paper.length} questions from the examiner, drawn for this bench. Your first answer
            counts.
          </Typography>
          <Box sx={{ mt: 1.5 }}>
            <ChoiceQuiz
              idPrefix={`viva-${engine.meta.id}`}
              questions={paper.map((v) => ({ q: v.q, options: v.o, answer: v.a, why: v.why }))}
              picks={engine.vivaPicks(state)}
              onPick={(question, option) => dispatch(engine.answerViva(question, option, now()))}
              explain={(i) => (
                <TextbookPassage
                  scope={engine.meta.textbook}
                  // A bank question that names nothing the chapter covers falls
                  // back to the practical's own query rather than searching for
                  // words the book does not use and quoting whatever comes back.
                  query={paper[i]?.textbookQuery ?? engine.meta.theoryQuery}
                />
              )}
            />
          </Box>
        </Box>
      </Card>
    );
  }

  return (
    <Card sx={card}>
      {teach}
      {aside ? <Box sx={{ px: 2, pt: 2 }}>{aside}</Box> : null}
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.brand.line}` }}>
        <ui.Task state={state} dispatch={dispatch} now={now} />
        {onTrainer ? (
          <Button
            size="small"
            variant="outlined"
            data-tour="trainer"
            startIcon={<Eye size={14} />}
            onClick={onTrainer}
            sx={{ mt: 1.5 }}
          >
            Show me this step
          </Button>
        ) : null}
      </Box>

      {ui.tabs.length > 1 ? (
        <Box sx={{ px: 2, pt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Segmented
            ariaLabel="Notebook"
            value={tab}
            onChange={(value) => setPicked({ step, tab: value })}
            options={ui.tabs.map((t) => ({ value: t.id, label: t.label }))}
          />
          {/*
            The notebook has the same problem the teaching panel had: a theory
            page or a twelve-row table set in a 380px column is read through a
            slot. This opens whichever tab is showing at a width it was written
            for, with the apparatus still visible beside it.
          */}
          <Box
            component="button"
            type="button"
            aria-label={`Open the ${ui.tabs.find((t) => t.id === tab)?.label ?? 'notebook'} at full width`}
            onClick={() => setWide(true)}
            sx={{
              ml: 'auto',
              flex: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              border: 0,
              p: 0.4,
              borderRadius: `${theme.band.radius.sm}px`,
              background: 'none',
              cursor: 'pointer',
              color: theme.brand.tert,
              '&:hover': { color: theme.brand.ink, backgroundColor: theme.brand.sunken },
            }}
          >
            <Maximize2 size={14} aria-hidden />
          </Box>
        </Box>
      ) : null}

      <Box sx={body}>{Panel ? <Panel state={state} /> : null}</Box>

      <ReadingSheet
        open={wide}
        title={ui.tabs.find((t) => t.id === tab)?.label ?? 'Notebook'}
        subtitle={engine.meta.title}
        container={container}
        onClose={() => setWide(false)}
      >
        {Panel ? <Panel state={state} /> : null}
      </ReadingSheet>
    </Card>
  );
}

/** The marking card: every part with the rule it was marked by. */
function BenchResult<S, A>({
  definition,
  state,
  save,
  onNewBench,
  onRepeatBench,
}: {
  definition: BenchDefinition<S, A>;
  state: S;
  save: SaveStatus;
  onNewBench: () => void;
  onRepeatBench: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const { engine } = definition;
  const score = engine.score(state);
  const log = engine.log?.(state) ?? [];

  // THE SCHEME AS REPORTED. The practical's own scheme is untouched inside the
  // engine — every mark was computed against it — and this rescales only what
  // is shown, once, at the end, when an administrator has removed the viva.
  const vivaOn = useLabFeature('viva');
  const { parts: reportedParts, scale } = scaledForNoViva(
    engine.marks.map((m) => ({ key: m.key, max: m.max, basis: m.basis })),
    vivaOn,
  );
  const labelOf = new Map(engine.marks.map((m) => [m.key, m.label]));
  const total = reportedParts.reduce((a, m) => a + m.max, 0);
  const earnedTotal = reportedParts.reduce((a, m) => a + (score[m.key] ?? 0) * scale, 0);
  const disclosure = {
    '& summary': { cursor: 'pointer', color: theme.brand.sub, fontSize: theme.band.type.base - 1.5, mt: 1.5 },
  } as const;

  return (
    <ScoreCard
      title="Practical complete"
      score={+earnedTotal.toFixed(2)}
      max={+total.toFixed(2)}
      stars={starsForShare(total > 0 ? earnedTotal / total : 0)}
      summary={engine.summary(state)}
      parts={reportedParts.map((m) => ({
        label: labelOf.get(m.key) ?? m.key,
        earned: +((score[m.key] ?? 0) * scale).toFixed(2),
        max: +m.max.toFixed(2),
        basis: m.basis,
      }))}
      details={
        <>
          <SaveLine save={save} />
          {log.length ? (
            <Box component="details" sx={disclosure}>
              <summary>
                {log.length} thing{log.length === 1 ? '' : 's'} to work on
              </summary>
              <Box
                component="ol"
                sx={{ m: 0, mt: 1, pl: 2.25, fontSize: theme.band.type.base - 1.5, color: theme.brand.sub }}
              >
                {log.map((l, i) => (
                  <li key={i}>
                    <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {l.t}
                    </Box>{' '}
                    — {l.what}
                    {l.pts ? ` (−${l.pts})` : ''}
                  </li>
                ))}
              </Box>
            </Box>
          ) : null}
          <Box component="details" sx={disclosure}>
            <summary>Attempt record</summary>
            <Box
              component="pre"
              sx={{
                fontSize: 11,
                backgroundColor: theme.brand.sunken,
                borderRadius: `${theme.band.radius.sm}px`,
                p: 1.25,
                overflowX: 'auto',
                maxHeight: 240,
                m: 0,
                mt: 1,
              }}
            >
              {JSON.stringify(engine.attempt(state), null, 2)}
            </Box>
          </Box>
        </>
      }
      actions={
        <>
          <Button variant="contained" onClick={onNewBench}>
            Try a new bench
          </Button>
          <Button variant="outlined" color="inherit" onClick={onRepeatBench}>
            Repeat this bench
          </Button>
        </>
      }
    />
  );
}

function SaveLine({ save }: { save: SaveStatus }): React.ReactElement | null {
  if (save.state === 'idle') return null;
  if (save.state === 'error') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
        <EmergeChip tone="red" label="Attempt not saved" />
        {save.retry ? (
          <Button size="small" onClick={save.retry}>
            Retry
          </Button>
        ) : null}
      </Box>
    );
  }
  return (
    <Box sx={{ mt: 1.5 }}>
      <EmergeChip
        tone={save.state === 'saved' ? 'green' : 'grey'}
        dot
        label={save.state === 'saved' ? 'Attempt saved' : 'Saving attempt…'}
      />
    </Box>
  );
}
