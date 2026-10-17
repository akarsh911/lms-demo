'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Droplets, Eraser, HandMetal, TestTube2 } from 'lucide-react';

import { TextbookPassage } from '@/components/textbook/textbook-passage';
import { EmergeChip, NumberField, RichText, Segmented } from '@/components/ui';
import {
  POUR,
  SAMPLES,
  SAMPLE_BY_ID,
  liquidColour,
  pHof,
  uiColour,
  volume,
  type Nature,
  type SampleId,
} from '@labs/lib/ph-samples/chemistry';
import { phSamplesEngine } from '@labs/lib/ph-samples/engine';
import { STEP } from '@labs/lib/ph-samples/marking';
import type { PhAction } from '@labs/lib/ph-samples/reducer';
import { recordedCount, type PhState, type Tube } from '@labs/lib/ph-samples/state';
import { phTeach, type TeachSection } from '@labs/lib/ph-samples/teach';
import type { BenchDefinition, BenchStageProps, BenchTeachProps, BenchViewProps } from '@labs/types/lab-bench';

import { apparatus } from '../apparatus-palette';
import { TeachSections } from '../teach-sections';
import { ObservationTable } from '../observation-table';

import { PhBench } from './bench';
import { TubeCloseUp } from './close-up';
import { ColourMatcher } from './colour-chart';
import { createPhTours } from './tours';
import { usePhTrainer } from './trainer';

type View = BenchViewProps<PhState, PhAction>;

/**
 * The pH bench: everything about this practical that is drawn.
 *
 * The engine decides what happens; the shared workspace draws the frame, the
 * step strip, the assistant, the notebook, the viva and the marks. What is
 * genuinely this practical's own is here: the apparatus, what is in the
 * student's hand, the one input the current step asks for, the colour chart
 * docked beside that input, and the three notebook panels.
 */

// ---------------------------------------------------------------------------
// What a tube is showing right now
// ---------------------------------------------------------------------------

/** The colour to match against the chart: the strip, or the solution itself. */
function shownColour(t: Tube | undefined): string | null {
  if (!t) return null;
  if (t.strip !== null) return uiColour(t.strip);
  if (t.indicator) return liquidColour(t);
  return null;
}

function tubeLine(t: Tube | undefined, index: number): React.ReactNode {
  if (!t) return null;
  const name = SAMPLE_BY_ID[t.sample].name;
  if (!volume(t)) return `Tube ${index + 1} · ${name} — empty, pour the sample first.`;
  if (!t.tested) return `Tube ${index + 1} · ${name} — poured, not tested yet.`;
  return t.strip !== null
    ? `Tube ${index + 1} · ${name} — the strip from this tube, on the tile.`
    : `Tube ${index + 1} · ${name} — the solution with universal indicator in it.`;
}

// ---------------------------------------------------------------------------
// The apparatus
// ---------------------------------------------------------------------------

function Stage({ state, dispatch, now, onStageElement, highlights }: BenchStageProps<PhState, PhAction>): React.ReactElement {
  return (
    <Box sx={{ flex: 1, minHeight: 240, display: 'flex', p: { xs: 0.5, sm: 1 }, backgroundColor: apparatus.bench }}>
      <PhBench
        layout={state.layout}
        tubes={state.tubes}
        held={state.held}
        sel={state.sel}
        pulse={highlights}
        onSvg={onStageElement}
        onPickUp={(held) => dispatch({ type: 'pickUp', held })}
        onTapTube={(index) => dispatch({ type: 'tapTube', index, now: now() })}
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

/** What is in the student's hand, and the two things that act on a whole tube. */
function Controls({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const held = state.held;
  const selected = state.tubes[state.sel];
  const hands = !held
    ? 'Hands free — tap a bottle, the pH paper or the indicator to pick it up'
    : held.kind === 'bottle'
      ? `Holding ${SAMPLE_BY_ID[held.id].label} — tap its tube to add ${POUR} mL`
      : held.kind === 'paper'
        ? 'Holding pH paper — tap a tube to dip a fresh strip'
        : 'Holding universal indicator — tap a tube to add two drops';

  return (
    <Box
      data-tour="ph-hands"
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
      <Button
        size="small"
        variant="outlined"
        startIcon={<Eraser size={14} />}
        disabled={!selected || !volume(selected) || state.graded !== null}
        onClick={() => dispatch({ type: 'rinseTube', index: state.sel, now: now() })}
        sx={BENCH_BUTTON}
      >
        Empty and rinse
      </Button>
      <Button size="small" variant="outlined" disabled={!held} onClick={() => dispatch({ type: 'putDown' })} sx={BENCH_BUTTON}>
        Put down
      </Button>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The colour chart, docked beside the pH field
// ---------------------------------------------------------------------------

/**
 * What the student is looking at, docked beside what they type.
 *
 * Two things, and each earns its place at a different moment. THE CLOSE-UP is
 * always here: a tube is worth inspecting while it is being poured and while
 * the six are being put in order, not only while a colour is being read, and it
 * is the only thing on the bench that goes on saying a tube was spoiled. THE
 * CHART joins it while there is a colour to read against it, and carries the
 * tapping that writes a pH — reading a colour against a chart is the same
 * problem as reading a needle against a scale, and the answer is only as good
 * as how close the two are.
 */
function Aside({ state, dispatch, maxWidth }: View & { maxWidth: number }): React.ReactElement {
  const tube = state.tubes[state.sel];
  const entry = state.rec[state.sel];
  const typed = entry ? Number.parseFloat(entry.ph) : Number.NaN;
  const recording = state.step === STEP.record && state.graded === null;
  const reading = state.step === STEP.test || state.step === STEP.record;

  return (
    <Box sx={{ maxWidth, mx: 'auto', width: '100%' }}>
      <TubeCloseUp state={state} />
      {reading ? (
        <Box sx={{ mt: 1.5 }}>
          <ColourMatcher
            colour={shownColour(tube)}
            caption={tubeLine(tube, state.sel)}
            picked={Number.isNaN(typed) ? null : typed}
            onPick={
              recording
                ? (ph: number) => dispatch({ type: 'setEntry', index: state.sel, field: 'ph', value: String(ph) })
                : undefined
            }
          />
        </Box>
      ) : null}
    </Box>
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
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1,
        mt: 1.5,
        '& > .MuiFormControl-root': { flex: '0 1 120px', minWidth: 100 },
      }}
    >
      {children}
    </Box>
  );
}

const NATURES: readonly { value: Nature | ''; label: string }[] = [
  { value: 'acidic', label: 'Acidic' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'basic', label: 'Basic' },
];

function RecordTask({ state, dispatch, now }: View): React.ReactElement {
  const index = state.sel;
  const tube = state.tubes[index];
  const entry = state.rec[index] ?? { ph: '', nature: '' as const };
  const filled = recordedCount(state);
  const all = state.tubes.length;
  const untestedHere = tube && !tube.tested;

  const nextBlank = (): void => {
    for (let k = 1; k <= all; k += 1) {
      const i = (index + k) % all;
      const r = state.rec[i];
      if (!r || r.ph.trim() === '' || r.nature === '') {
        dispatch({ type: 'selectTube', index: i });
        return;
      }
    }
  };

  return (
    <>
      <SectionTitle>
        Tube {index + 1} of {all} · {tube ? SAMPLE_BY_ID[tube.sample].name : ''}
      </SectionTitle>
      <Hint>
        {untestedHere ? (
          <RichText text="This tube was never tested, so there is no colour to match. **A pH has to be measured, not guessed** — go back and test it." />
        ) : (
          <RichText text="Hold the colour against the chart beside you and read off its pH, then say what the sample is. Tapping a square fills the box." />
        )}
      </Hint>
      <Fields>
        <NumberField
          id="ph-entry"
          label="pH"
          value={entry.ph}
          placeholder="0–14"
          onChange={(value) => dispatch({ type: 'setEntry', index, field: 'ph', value })}
          onEnter={nextBlank}
        />
        <Segmented
          ariaLabel="Nature of this sample"
          value={entry.nature}
          onChange={(value) => dispatch({ type: 'setEntry', index, field: 'nature', value })}
          options={NATURES}
        />
        {filled < all ? (
          <Button variant="outlined" color="inherit" onClick={nextBlank}>
            Next tube
          </Button>
        ) : null}
        <Button variant="contained" disabled={filled < all} onClick={() => dispatch({ type: 'submitReadings', now: now() })}>
          Submit readings
        </Button>
        <EmergeChip tone={filled === all ? 'green' : 'grey'} label={`${filled}/${all} filled in`} />
      </Fields>
    </>
  );
}

function OrderTask({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const slots = ['most acidic', '2nd', '3rd', '4th', '5th', 'most basic'];

  return (
    <>
      <SectionTitle>Order by pH</SectionTitle>
      <Hint>
        <RichText text="Using **your** readings, put the six samples in order from the **most acidic** (lowest pH) to the **most basic** (highest pH)." />
      </Hint>
      <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.75 }}>
        {slots.map((slot, k) => {
          const id = state.order[k];
          return (
            <Box
              key={slot}
              sx={{
                minHeight: 50,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                p: 0.5,
                borderRadius: `${theme.band.radius.sm}px`,
                border: `1.5px ${id ? 'solid' : 'dashed'} ${theme.brand.line2}`,
                backgroundColor: id ? theme.brand.sunken : 'transparent',
                fontSize: theme.band.type.min,
                color: theme.brand.tert,
              }}
            >
              {id ? (
                <Box component="b" sx={{ fontSize: theme.band.type.base - 1, color: theme.brand.ink }}>
                  {SAMPLE_BY_ID[id].short}
                </Box>
              ) : null}
              {slot}
            </Box>
          );
        })}
      </Box>
      <Fields>
        {SAMPLES.map((s) => (
          <Button
            key={s.id}
            size="small"
            variant="outlined"
            color="inherit"
            disabled={state.order.includes(s.id)}
            onClick={() => dispatch({ type: 'pushOrder', sample: s.id })}
          >
            {s.short}
          </Button>
        ))}
      </Fields>
      <Fields>
        <Button variant="text" color="inherit" disabled={!state.order.length} onClick={() => dispatch({ type: 'clearOrder' })}>
          Clear
        </Button>
        <Button
          variant="contained"
          disabled={state.order.length !== SAMPLES.length}
          onClick={() => dispatch({ type: 'submitOrder', now: now() })}
        >
          Submit order
        </Button>
      </Fields>
    </>
  );
}

function Task(view: View): React.ReactElement {
  const { state, dispatch } = view;
  const all = state.tubes.length;

  switch (state.step) {
    case STEP.pour: {
      const filled = state.tubes.filter((t) => t.added.length > 0 && t.added.every((a) => a === t.sample)).length;
      return (
        <>
          <SectionTitle>Pour the samples</SectionTitle>
          <Hint>
            Six samples, six tubes — each tube is labelled underneath with the sample that belongs in it. Pick up a bottle
            and tap its tube to add {POUR} mL.
          </Hint>
          <Fields>
            <EmergeChip tone={filled === all ? 'green' : 'grey'} label={`${filled}/${all} tubes filled`} />
          </Fields>
        </>
      );
    }

    case STEP.test: {
      const tested = state.tubes.filter((t) => t.tested).length;
      return (
        <>
          <SectionTitle>Test every sample</SectionTitle>
          <Hint>
            <RichText text="Two ways, both accepted by the syllabus: dip a strip of **pH paper** and lay it on the tile, or drop **universal indicator** straight into the tube. A fresh strip comes off the pad every time." />
          </Hint>
          <Fields>
            <Button
              variant={state.held?.kind === 'paper' ? 'contained' : 'outlined'}
              color="inherit"
              startIcon={<TestTube2 size={14} />}
              onClick={() => dispatch({ type: 'pickUp', held: { kind: 'paper' } })}
            >
              Take pH paper
            </Button>
            <Button
              variant={state.held?.kind === 'ui' ? 'contained' : 'outlined'}
              color="inherit"
              startIcon={<Droplets size={14} />}
              onClick={() => dispatch({ type: 'pickUp', held: { kind: 'ui' } })}
            >
              Take the indicator
            </Button>
            <EmergeChip tone={tested === all ? 'green' : 'grey'} label={`${tested}/${all} tested`} />
          </Fields>
        </>
      );
    }

    case STEP.record:
      return <RecordTask {...view} />;

    default:
      return <OrderTask {...view} />;
  }
}

// ---------------------------------------------------------------------------
// The notebook
// ---------------------------------------------------------------------------

function Swatch({ colour }: { colour: string }): React.ReactElement {
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
        backgroundColor: colour,
      }}
    />
  );
}

function ObservationsPanel({ state }: { state: PhState }): React.ReactElement {
  const theme = useTheme();
  const graded = state.graded;

  return (
    <>
      <ObservationTable
        caption={
          graded
            ? 'Marked against the pH of what was actually in each tube'
            : state.step === STEP.record
              ? 'Read each colour off the chart'
              : 'You fill this in at the Record step'
        }
        columns={[
          { label: 'Sample' },
          { label: 'Colour', align: 'left' },
          { label: 'pH' },
          { label: 'Nature', align: 'left' },
          ...(graded ? [{ label: 'Marks' }] : []),
        ]}
        rows={state.tubes.map((t, i) => {
          const entry = state.rec[i];
          const cell = graded?.cells[i];
          const truePh = t.tested ? pHof(t) : null;
          return [
            SAMPLE_BY_ID[t.sample].short,
            truePh === null ? (
              <Box key="c" component="span" sx={{ color: theme.brand.tert }}>
                not tested
              </Box>
            ) : (
              <Swatch key="c" colour={uiColour(truePh)} />
            ),
            <React.Fragment key="ph">
              {entry?.ph.trim() ? entry.ph : '—'}
              {cell ? (
                <Box component="span" sx={{ color: theme.brand.tert }}>
                  {' '}
                  ({cell.truePh === null ? '—' : cell.truePh.toFixed(1)})
                </Box>
              ) : null}
            </React.Fragment>,
            entry?.nature || '—',
            ...(graded
              ? [
                  <EmergeChip
                    key="m"
                    tone={cell && cell.pts === 8 ? 'green' : cell && cell.pts >= 4 ? 'amber' : 'red'}
                    label={`${cell?.pts ?? 0}/8`}
                  />,
                ]
              : []),
          ];
        })}
      />
      <Typography sx={{ mt: 1.5, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert, textWrap: 'pretty' }}>
        Colour matching is never exact: a reading within 0.5 pH earns all 6 marks, within 1 pH still earns 4.
      </Typography>
    </>
  );
}

/**
 * The chart as a reference, plus every tube's colour in one row.
 *
 * The docked matcher beside the field shows ONE tube against the chart, which
 * is the right thing while a single reading is being made. Six side by side
 * answer the other question — which sample is the most acidic — before a single
 * number is written down.
 */
function ChartPanel({ state }: { state: PhState }): React.ReactElement {
  const theme = useTheme();
  const tube = state.tubes[state.sel];

  return (
    <>
      <ColourMatcher colour={shownColour(tube)} caption={tubeLine(tube, state.sel)} picked={null} />
      <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: `repeat(${state.tubes.length}, 1fr)`, gap: 0.5 }}>
        {state.tubes.map((t, i) => {
          const colour = shownColour(t);
          return (
            <Box key={i} sx={{ textAlign: 'center' }}>
              <Box
                aria-hidden="true"
                sx={{
                  height: 34,
                  borderRadius: `${Math.min(theme.band.radius.sm, 8)}px`,
                  border: `1px solid ${theme.brand.line2}`,
                  backgroundColor: colour ?? theme.brand.sunken,
                  boxShadow: state.sel === i ? `0 0 0 2px ${theme.brand.ink}` : 'none',
                }}
              />
              <Box
                component="span"
                sx={{ display: 'block', mt: 0.25, fontSize: theme.band.type.min - 1, color: theme.brand.tert }}
              >
                {SAMPLE_BY_ID[t.sample].short}
              </Box>
            </Box>
          );
        })}
      </Box>
      <Typography sx={{ mt: 0.75, fontSize: theme.band.type.min, color: theme.brand.tert, textWrap: 'pretty' }}>
        Every tube that has been tested, in rack order. An untested tube stays blank — there is nothing to read.
      </Typography>
    </>
  );
}

// ---------------------------------------------------------------------------
// "What's happening"
// ---------------------------------------------------------------------------

function Teach({ revealed }: BenchTeachProps<PhState, PhAction>): React.ReactElement {
  return <TeachSections sections={phTeach(revealed)} />;
}

function TheoryPanel(): React.ReactElement {
  const theme = useTheme();
  const { meta } = phSamplesEngine;
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

export const phSamplesBench: BenchDefinition<PhState, PhAction> = {
  engine: phSamplesEngine,
  ui: {
    Stage,
    Controls,
    Task,
    Aside,
    // No `showAside`. The magnified tube is worth having at every step — a
    // student pouring wants to see what is in the tube they are pouring into,
    // and one ordering the six wants to see which tube they spoiled — so the
    // aside is never empty, and the chart inside it comes and goes instead.
    // The mechanism behind every tube, and never what is in one. Always worth
    // opening: the water, the dyes and the H⁺ are the same before the first
    // bottle is picked up as they are at the end, so there is no `showTeach`.
    Teach,
    tabs: [
      { id: 'observations', label: 'Observations', Panel: ObservationsPanel },
      { id: 'chart', label: 'Colour chart', Panel: ChartPanel },
      { id: 'theory', label: 'Theory', Panel: TheoryPanel },
    ],
    tabForStep: (state) =>
      state.step >= STEP.record ? 'observations' : state.step === STEP.test ? 'chart' : 'theory',
    tours: (ctx) => createPhTours(ctx),
    // "Show me this step", on the student's own rack. Passed by reference: it
    // reads the `teach` flag as a hook, which is what keeps the step that opens
    // the teaching panel out of the set when an administrator has removed it.
    useTrainer: usePhTrainer,
    // A tour step names the tube by its SAMPLE (`tube@HCl`), because which rack
    // position holds it is arranged from the bench seed.
    highlightsFor: (step, state) =>
      (step?.highlight ?? []).map((h) =>
        h.startsWith('tube@') ? `tube:${state.layout.indexOf(h.slice(5) as SampleId)}` : h,
      ),
  },
};
