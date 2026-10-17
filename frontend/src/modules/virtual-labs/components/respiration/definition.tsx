'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Eraser, HandMetal, Timer, Wind } from 'lucide-react';

import { TextbookPassage } from '@/components/textbook/textbook-passage';
import { EmergeChip, RichText, Segmented } from '@/components/ui';
import {
  DIP_ML,
  GRAM,
  POUR,
  SEED,
  SETUPS,
  SETUP_A,
  SETUP_B,
  SETUP_KOH,
  flaskReady,
  milkiness,
  type Appearance,
} from '@labs/lib/respiration/biology';
import { respirationEngine } from '@labs/lib/respiration/engine';
import {
  APP_OPTS,
  CONCL,
  DET_OPTS,
  EARLY_MIN,
  ROW_MARKS,
  STEP,
  appearanceLabel,
} from '@labs/lib/respiration/marking';
import type { RespirationAction } from '@labs/lib/respiration/reducer';
import { methodTwoLine } from '@labs/lib/respiration/score';
import {
  bubbleRate,
  entryAt,
  markedFlasks,
  missingFrom,
  nameOf,
  recordedCount,
  warmed,
  type ClockMode,
  type RespirationState,
} from '@labs/lib/respiration/state';
import { respirationTeach, type TeachSection } from '@labs/lib/respiration/teach';
import type { BenchDefinition, BenchStageProps, BenchTeachProps, BenchViewProps } from '@labs/types/lab-bench';

import { apparatus } from '../apparatus-palette';
import { TeachSections } from '../teach-sections';
import { ObservationTable } from '../observation-table';

import { RespirationBench } from './bench';
import { SetupCloseUp } from './close-up';
import { limeSwatch } from './lime-tube';
import { createRespirationTours } from './tours';
import { useRespirationTrainer } from './trainer';

type View = BenchViewProps<RespirationState, RespirationAction>;

/**
 * The respiration bench: everything about this practical that is drawn.
 *
 * The engine decides what happens; the shared workspace draws the frame, the
 * step strip, the assistant, the notebook, the viva and the marks. What is
 * genuinely this practical's own is here: the apparatus, what is in the
 * student's hand, the lab clock, the one input the current step asks for, the
 * magnified tube docked beside that input, and the two notebook panels.
 */

// ---------------------------------------------------------------------------
// The apparatus
// ---------------------------------------------------------------------------

function Stage({
  state,
  dispatch,
  now,
  onStageElement,
  compact,
  highlights,
}: BenchStageProps<RespirationState, RespirationAction>): React.ReactElement {
  return (
    <Box sx={{ flex: 1, minHeight: 240, display: 'flex', p: { xs: 0.5, sm: 1 }, backgroundColor: apparatus.bench }}>
      <RespirationBench
        flasks={state.flasks}
        held={state.held}
        sel={state.sel}
        min={state.min}
        tempC={state.tempC}
        warm={warmed(state)}
        bubbleRate={(index) => bubbleRate(state, index)}
        compact={compact}
        pulse={highlights}
        onSvg={onStageElement}
        onPickUp={(held) => dispatch({ type: 'pickUp', held })}
        onTapFlask={(index) => dispatch({ type: 'tapFlask', index, now: now() })}
        onTapTube={(index) => dispatch({ type: 'tapTube', index, now: now() })}
        onToggleBath={() => dispatch({ type: 'toggleBath' })}
        onPutDown={() => dispatch({ type: 'putDown' })}
      />
    </Box>
  );
}

const BENCH_BUTTON = {
  flex: 'none',
  color: apparatus.benchInk,
  borderColor: 'rgba(255,255,255,.16)',
  '&:hover': { backgroundColor: 'rgba(255,255,255,.07)', borderColor: 'rgba(255,255,255,.28)' },
  '&.Mui-disabled': { color: apparatus.benchInkMuted, borderColor: 'rgba(255,255,255,.08)' },
} as const;

/** What is in the student's hand, the lab clock, and the two whole-set-up tools. */
function Controls({ state, dispatch }: View): React.ReactElement {
  const theme = useTheme();
  const held = state.held;
  const flask = state.flasks[state.sel];
  const hands = !held
    ? 'Hands free — tap a seed jar, the lime water, a cork or the vaseline to pick it up'
    : held.kind === 'seed'
      ? `Holding ${SEED[held.seed].name} — tap a flask to tip in ${GRAM} g`
      : held.kind === 'lime'
        ? `Holding lime water — tap a test tube to add ${POUR} mL`
        : held.kind === 'cork'
          ? 'Holding a cork with a bent delivery tube — tap a flask to fit it'
          : held.kind === 'vas'
            ? 'Holding vaseline — tap a corked flask to make the joint airtight'
            : 'Holding a KOH tube — tap a flask to hang it inside';

  return (
    <Box
      data-tour="respiration-hands"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 1,
        backgroundColor: apparatus.benchEdge,
        color: apparatus.benchInk,
        fontSize: theme.band.type.base - 1,
      }}
    >
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
        <HandMetal size={14} aria-hidden="true" />
        <Box component="span" role="status" sx={{ fontWeight: held ? 700 : 400 }}>
          {hands}
        </Box>
      </Box>
      <Box sx={{ flex: 1 }} />
      <Box
        component="span"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontVariantNumeric: 'tabular-nums' }}
      >
        <Timer size={14} aria-hidden="true" />
        Lab clock {Math.round(state.min)} min · {state.tempC} °C
      </Box>
      <Button
        size="small"
        variant="outlined"
        startIcon={<Wind size={14} />}
        disabled={!flask || !flask.cork}
        onClick={() => dispatch({ type: 'testSeal', index: state.sel })}
        sx={BENCH_BUTTON}
      >
        Test the seal
      </Button>
      <Button
        size="small"
        variant="outlined"
        startIcon={<Eraser size={14} />}
        disabled={!flask || state.graded !== null}
        onClick={() => dispatch({ type: 'takeApart', index: state.sel })}
        sx={BENCH_BUTTON}
      >
        Take apart
      </Button>
      <Button size="small" variant="outlined" disabled={!held} onClick={() => dispatch({ type: 'putDown' })} sx={BENCH_BUTTON}>
        Put down
      </Button>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The close-up, docked beside the task
// ---------------------------------------------------------------------------

function Aside({ state, dispatch, maxWidth }: View & { maxWidth: number }): React.ReactElement {
  // While a row is being written, the close-up shows the set-up the task is
  // asking about: the method 2 flask has no row and would leave the two halves
  // describing different apparatus.
  const index = state.step === STEP.record ? Math.min(state.sel, SETUPS.length - 1) : state.sel;
  const flask = state.flasks[index];
  const recording = state.step === STEP.record && state.graded === null;
  if (!flask) return <Box />;

  return (
    <SetupCloseUp
      flask={flask}
      index={index}
      labMinutes={state.min}
      tempC={state.tempC}
      picked={entryAt(state, index).app}
      maxWidth={maxWidth}
      // Only once the row has been marked may the close-up put the appearance
      // into words. Until then it reports that something changed, never what to.
      revealed={state.graded !== null}
      onPick={recording ? (app: Appearance) => dispatch({ type: 'setEntry', index, field: 'app', value: app }) : undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// The current step, and its one input
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }): React.ReactElement {
  const theme = useTheme();
  return (
    <Typography component="h3" sx={{ fontWeight: 800, fontSize: theme.band.type.h4, color: theme.brand.ink, lineHeight: 1.25 }}>
      {children}
    </Typography>
  );
}

function Hint({ children }: { children: React.ReactNode }): React.ReactElement {
  const theme = useTheme();
  return (
    <Typography
      component="p"
      sx={{ m: 0, mt: 0.5, color: theme.brand.sub, fontSize: theme.band.type.base - 1, textWrap: 'pretty' }}
    >
      {children}
    </Typography>
  );
}

function Fields({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1.5 }}>{children}</Box>
  );
}

/** A chip per set-up saying what it still needs. */
function ReadyChip({ state, index }: { state: RespirationState; index: number }): React.ReactElement {
  const flask = state.flasks[index];
  const missing = missingFrom(state, index);
  const ready = flask ? flaskReady(flask) && missing.length === 0 : false;
  return (
    <EmergeChip
      tone={ready ? 'green' : missing.length ? 'amber' : 'grey'}
      label={`${nameOf(index)}: ${
        missing.length ? `needs ${missing.join(', ')}` : flask?.sealed ? 'ready and sealed' : 'ready, not sealed'
      }`}
    />
  );
}

function BuildTask({ state, dispatch, now }: View): React.ReactElement {
  const a = state.flasks[SETUP_A];
  return (
    <>
      <SectionTitle>Set up the flasks</SectionTitle>
      <Hint>
        <RichText
          text={
            'Two conical flasks side by side. **Set-up A** takes germinating seeds. **Set-up B** takes an equal quantity of ' +
            '**boiled** seeds — dead, so they cannot respire. That second flask is the **control**, and without it a milky ' +
            `test tube proves nothing. Each flask needs seeds, ${DIP_ML} mL of lime water so the bent tube dips **under the ` +
            'surface**, and the cork with its delivery tube.'
          }
        />
      </Hint>
      <Fields>
        <ReadyChip state={state} index={SETUP_A} />
        <ReadyChip state={state} index={SETUP_B} />
      </Fields>
      <Fields>
        <Button variant="contained" disabled={!a || !flaskReady(a)} onClick={() => dispatch({ type: 'doneBuilding', now: now() })}>
          Set up — check the seals
        </Button>
      </Fields>
    </>
  );
}

function SealTask({ state, dispatch, now }: View): React.ReactElement {
  return (
    <>
      <SectionTitle>Check the seals</SectionTitle>
      <Hint>
        <RichText
          text={
            'Squeeze each flask gently. If the joint is airtight the gas has nowhere to go but down the delivery tube and you ' +
            'see a string of bubbles. If the cork only rests in the neck, the gas escapes there instead and the lime water ' +
            'will never change.'
          }
        />
      </Hint>
      <Fields>
        {markedFlasks(state).map((f, i) =>
          f.cork ? (
            <Button key={i} size="small" variant="outlined" color="inherit" onClick={() => dispatch({ type: 'testSeal', index: i })}>
              Test {nameOf(i)}
            </Button>
          ) : null,
        )}
        {markedFlasks(state).map((f, i) =>
          f.cork ? <EmergeChip key={`c${i}`} tone={f.sealed ? 'green' : 'red'} label={`${nameOf(i)}: ${f.sealed ? 'airtight' : 'leaking'}`} /> : null,
        )}
      </Fields>
      <Fields>
        <Button variant="contained" onClick={() => dispatch({ type: 'startClock', now: now() })}>
          Start the clock
        </Button>
      </Fields>
    </>
  );
}

const CLOCK_OPTIONS: readonly { value: ClockMode; label: string }[] = [
  { value: 'paused', label: 'Paused' },
  { value: 'run', label: 'Running' },
  { value: 'fast', label: 'Fast' },
];

function WatchTask({ state, dispatch }: View): React.ReactElement {
  return (
    <>
      <SectionTitle>Let the clock run</SectionTitle>
      <Hint>
        <RichText
          text={
            'Respiration is slow. Leave the flasks, come back every few minutes and look at both test tubes — the answer is ' +
            'whatever the lime water has actually done, not what it is supposed to do. **Pause** and the bench says what ' +
            'changed while you were away.'
          }
        />
      </Hint>
      <Fields>
        <Segmented
          ariaLabel="Lab clock"
          value={state.clock}
          onChange={(mode) => dispatch({ type: 'setClock', mode })}
          options={CLOCK_OPTIONS}
        />
        <Button variant="outlined" color="inherit" onClick={() => dispatch({ type: 'skip', minutes: 5 })}>
          Wait 5 min
        </Button>
        <Button variant="contained" onClick={() => dispatch({ type: 'goRecord' })}>
          Record observations
        </Button>
      </Fields>
      <Fields>
        <EmergeChip tone={state.min >= EARLY_MIN ? 'green' : 'grey'} label={`${Math.round(state.min)} min on the clock`} />
        <EmergeChip tone={warmed(state) ? 'amber' : 'grey'} label={`${state.tempC} °C`} />
        {/* No chip for what set-up A's lime water looks like. That is the
            8-mark observation, and the 4-mark "CO₂ given out?" follows from it:
            printing the option text here would hand over both. The tube is
            drawn on the bench and magnified in the close-up beside the
            reference strip — looking at it is the practical. */}
      </Fields>
    </>
  );
}

function RecordTask({ state, dispatch, now }: View): React.ReactElement {
  const index = Math.min(state.sel, SETUPS.length - 1);
  const flask = state.flasks[index];
  const entry = entryAt(state, index);
  const filled = recordedCount(state);
  const all = SETUPS.length;

  const nextBlank = (): void => {
    for (let k = 1; k <= all; k += 1) {
      const i = (index + k) % all;
      const r = state.rec[i];
      if (!r || r.app === '' || r.det === '') {
        dispatch({ type: 'selectSetup', index: i });
        return;
      }
    }
  };

  return (
    <>
      <SectionTitle>
        {nameOf(index)} · {SETUPS[index]?.sub}
      </SectionTitle>
      <Hint>
        {flask && !flask.cork ? (
          <RichText text="This flask was never closed, so nothing could be collected from it. Its row scores nothing — but write down what the tube shows all the same." />
        ) : (
          <RichText text="Hold this tube against the three beside you and say what it looks like **now**, then whether carbon dioxide was given out. Both rows are marked against what that lime water really did." />
        )}
      </Hint>
      <Fields>
        <Segmented
          ariaLabel="What the lime water looks like"
          value={entry.app}
          onChange={(value) => dispatch({ type: 'setEntry', index, field: 'app', value })}
          options={APP_OPTS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </Fields>
      <Fields>
        <Typography component="span" sx={{ fontSize: (t) => t.band.type.base - 1 }}>
          CO₂ given out?
        </Typography>
        <Segmented
          ariaLabel="Was carbon dioxide given out"
          value={entry.det}
          onChange={(value) => dispatch({ type: 'setEntry', index, field: 'det', value })}
          options={DET_OPTS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </Fields>
      <Fields>
        {filled < all ? (
          <Button variant="outlined" color="inherit" onClick={nextBlank}>
            Next flask
          </Button>
        ) : null}
        <Button variant="contained" disabled={filled < all} onClick={() => dispatch({ type: 'submitObservations', now: now() })}>
          Submit observations
        </Button>
        <EmergeChip tone={filled === all ? 'green' : 'grey'} label={`${filled}/${all} rows filled in`} />
        <EmergeChip tone="grey" label={`${Math.round(state.min)} min on the clock`} />
      </Fields>
      {/* THE CLOCK STAYS WITH THE STUDENT. Coming here pauses it so a row is
          written about a tube that is standing still — but a student who looks
          at set-up A, thinks "that is too early to say", and wants another five
          minutes must be able to take them. Without this the step is a dead
          end: the only way on is to record an observation they already believe
          is premature. Nothing is frozen until Submit, and both rows are marked
          against the tubes as they stand at that moment. */}
      <Fields>
        <Segmented
          ariaLabel="Lab clock"
          value={state.clock}
          onChange={(mode) => dispatch({ type: 'setClock', mode })}
          options={CLOCK_OPTIONS}
        />
        <Button variant="outlined" color="inherit" onClick={() => dispatch({ type: 'skip', minutes: 5 })}>
          Wait 5 min
        </Button>
        <Typography component="span" sx={{ fontSize: (t) => t.band.type.min, color: (t) => t.brand.tert }}>
          The clock keeps running while you write. Your rows are marked against the tubes as you submit them.
        </Typography>
      </Fields>
    </>
  );
}

function ConclusionTask({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  return (
    <>
      <SectionTitle>Conclusion</SectionTitle>
      <Hint>
        <RichText text="Which of these does **your** table support?" />
      </Hint>
      <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {CONCL.map((text, k) => {
          const picked = state.pick === k;
          return (
            <Box
              key={k}
              component="button"
              type="button"
              onClick={() => dispatch({ type: 'pickConclusion', index: k })}
              aria-pressed={picked}
              sx={{
                textAlign: 'left',
                cursor: 'pointer',
                p: 1,
                borderRadius: `${theme.band.radius.sm}px`,
                border: `1.5px solid ${picked ? theme.brand.ink : theme.brand.line2}`,
                backgroundColor: picked ? theme.brand.sunken : 'transparent',
                color: theme.brand.text,
                fontSize: theme.band.type.base - 1,
                '&:focus-visible': { outline: `2px solid ${theme.brand.orange}`, outlineOffset: 2 },
              }}
            >
              {text}
            </Box>
          );
        })}
      </Box>
      <Fields>
        <Button variant="contained" disabled={state.pick === null} onClick={() => dispatch({ type: 'submitConclusion', now: now() })}>
          Submit conclusion
        </Button>
      </Fields>
    </>
  );
}

function Task(view: View): React.ReactElement {
  switch (view.state.step) {
    case STEP.build:
      return <BuildTask {...view} />;
    case STEP.seal:
      return <SealTask {...view} />;
    case STEP.watch:
      return <WatchTask {...view} />;
    case STEP.record:
      return <RecordTask {...view} />;
    default:
      return <ConclusionTask {...view} />;
  }
}

// ---------------------------------------------------------------------------
// The notebook
// ---------------------------------------------------------------------------

function Swatch({ m }: { m: number }): React.ReactElement {
  const theme = useTheme();
  return (
    <Box
      aria-hidden="true"
      sx={{
        display: 'inline-block',
        width: 20,
        height: 20,
        verticalAlign: 'middle',
        borderRadius: `${Math.min(theme.band.radius.sm, 6)}px`,
        border: `1px solid ${theme.brand.line2}`,
        backgroundColor: limeSwatch(m),
      }}
    />
  );
}

function ObservationsPanel({ state }: { state: RespirationState }): React.ReactElement {
  const theme = useTheme();
  const graded = state.graded;

  return (
    <>
      <ObservationTable
        caption={
          graded
            ? `Marked against what each test tube showed at ${Math.round(graded.min)} min`
            : state.step === STEP.record
              ? 'Both flasks, as they look right now'
              : 'You fill this in at the Record step'
        }
        columns={[
          { label: 'Set-up' },
          { label: 'Tube', align: 'left' },
          { label: 'Lime water', align: 'left' },
          { label: 'CO₂ given out' },
          ...(graded ? [{ label: 'Marks' }] : []),
        ]}
        rows={markedFlasks(state).map((f, i) => {
          const entry = state.rec[i];
          const cell = graded?.cells[i];
          const built = Boolean(f.seeds && f.cork);
          return [
            <Box key="s">
              {nameOf(i)}
              <Box component="span" sx={{ display: 'block', color: theme.brand.tert, fontSize: theme.band.type.min }}>
                {SETUPS[i]?.sub}
              </Box>
            </Box>,
            built && f.lime.ml ? (
              <Swatch key="t" m={milkiness(f)} />
            ) : (
              <Box key="t" component="span" sx={{ color: theme.brand.tert }}>
                —
              </Box>
            ),
            <React.Fragment key="a">
              {entry?.app ? appearanceLabel(entry.app) : '—'}
              {cell?.ready ? (
                <Box component="span" sx={{ display: 'block', color: theme.brand.tert, fontSize: theme.band.type.min }}>
                  tube showed: {appearanceLabel(cell.trueApp)}
                </Box>
              ) : null}
            </React.Fragment>,
            <React.Fragment key="d">
              {entry?.det || '—'}
              {cell?.ready ? (
                <Box component="span" sx={{ display: 'block', color: theme.brand.tert, fontSize: theme.band.type.min }}>
                  ({cell.trueDet})
                </Box>
              ) : null}
            </React.Fragment>,
            ...(graded
              ? [
                  <EmergeChip
                    key="m"
                    tone={cell && cell.pts === ROW_MARKS ? 'green' : cell && cell.pts >= ROW_MARKS / 2 ? 'amber' : 'red'}
                    label={`${cell?.pts ?? 0}/${ROW_MARKS}`}
                  />,
                ]
              : []),
          ];
        })}
        summary={[
          <Box key="k" component="span" sx={{ color: theme.brand.sub }}>
            Method 2 (not marked)
          </Box>,
          <Box key="v" component="span" sx={{ color: theme.brand.sub }}>
            {methodTwoLine(state)}
          </Box>,
          '',
          '',
          ...(graded ? [''] : []),
        ]}
      />
      <Typography sx={{ mt: 1.5, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert, textWrap: 'pretty' }}>
        Judging milkiness is never exact: one shade out still earns half the appearance marks. A flask that was never closed
        scores nothing, however carefully its row is written.
      </Typography>
    </>
  );
}

// ---------------------------------------------------------------------------
// "What's happening"
// ---------------------------------------------------------------------------

function Teach({ revealed }: BenchTeachProps<RespirationState, RespirationAction>): React.ReactElement {
  return <TeachSections sections={respirationTeach(revealed)} />;
}

function TheoryPanel(): React.ReactElement {
  const theme = useTheme();
  const { meta } = respirationEngine;
  return (
    <Box sx={{ fontSize: theme.band.type.base - 1, color: theme.brand.sub }}>
      <Typography component="p" sx={{ m: 0, fontSize: 'inherit' }}>
        <b>Aim.</b> {meta.aim}
      </Typography>
      <Typography component="p" sx={{ mt: 1, mb: 0, fontSize: 'inherit' }}>
        <b>Theory.</b> {meta.theory}
      </Typography>
      <TextbookPassage scope={meta.textbook} query={meta.theoryQuery} topK={3} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The bench
// ---------------------------------------------------------------------------

export const respirationBench: BenchDefinition<RespirationState, RespirationAction> = {
  engine: respirationEngine,
  ui: {
    Stage,
    Controls,
    Task,
    Aside,
    // The close-up earns its space from the moment there is apparatus to look
    // at until the conclusion is in; the viva and the marks take the console.
    showAside: (state) => state.step <= STEP.concl,
    // The biology in the flask and the chemistry in the test tube, neither of
    // which waits for a flask to be built. The one number that WOULD wait — the
    // rate — is left out entirely: rate times minutes is the observation.
    Teach,
    tabs: [
      { id: 'observations', label: 'Observations', Panel: ObservationsPanel },
      { id: 'theory', label: 'Theory', Panel: TheoryPanel },
    ],
    // Theory while the apparatus is being built; from the moment the clock
    // starts, the table — its two swatches are the comparison being waited on.
    tabForStep: (state) => (state.step >= STEP.watch ? 'observations' : 'theory'),
    tours: (ctx) => createRespirationTours(ctx),
    // "Show me this step", per step of the procedure. It builds and waits on the
    // student's own bench and stops short of all four marked presses — and never
    // says what a tube shows. See `trainer.tsx`.
    useTrainer: useRespirationTrainer,
    highlightsFor: (step) => step?.highlight ?? [],
    // One line the whole tour long: a KOH tube inside a lime-water flask is the
    // one mistake that makes the apparatus look right and answer wrong.
    tourNotice: (state) =>
      state.flasks.slice(0, SETUP_KOH).some((f) => f.koh)
        ? 'A KOH tube is inside one of the marked flasks — it will absorb the CO₂ before the lime water ever sees it.'
        : null,
  },
};
