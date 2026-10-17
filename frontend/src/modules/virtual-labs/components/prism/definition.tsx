'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { Eye, Lightbulb, MapPin, Minus, Play, Plus, Square, Target, Undo2 } from 'lucide-react';

import { TextbookPassage } from '@/components/textbook/textbook-passage';
import { ChoiceQuiz, EmergeChip, Metric, NumberField, RichText } from '@/components/ui';
import { parseDecimal } from '@labs/lib/numbers';
import {
  IMAX,
  IMIN,
  atMinimum,
  demoMinimum,
  demoRay,
  type DemoRay,
} from '@labs/lib/prism/demo';
import { prismEngine } from '@labs/lib/prism/engine';
import {
  ANGLE_NAMES,
  CONCLUSIONS,
  RAYS,
  READINGS,
  STEP,
  conclusionKey,
  sumRule,
} from '@labs/lib/prism/marking';
import {
  APEX,
  criticalAngle,
  fitParabola,
  minimumDeviation,
  nFromMinDeviation,
  smallestUsefulIncidence,
} from '@labs/lib/prism/optics';
import type { PrismAction } from '@labs/lib/prism/reducer';
import {
  currentTrial,
  measureGeometry,
  measuredRays,
  readingsTaken,
  type PrismState,
} from '@labs/lib/prism/state';
import { prismTeach } from '@labs/lib/prism/teach';
import type { BenchDefinition, BenchStageProps, BenchViewProps } from '@labs/types/lab-bench';

import { apparatus } from '../apparatus-palette';
import { useLabFeature } from '../lab-features';
import { ObservationTable } from '../observation-table';
import { TeachSections } from '../teach-sections';
import { XYGraph } from '../xy-graph';

import { DemoPlot } from './demo-plot';
import { ProtractorReader } from './protractor';
import { PrismSheet } from './sheet';
import { createPrismTours } from './tours';
import { usePrismTrainer } from './trainer';

type View = BenchViewProps<PrismState, PrismAction>;

/**
 * Tracing a ray through a glass prism: everything about this practical that is
 * drawn.
 *
 * The engine beside it decides what happens; the shared workspace draws the
 * frame, the strip, the assistant, the notebook, the viva and the marks. What
 * is left here is the sheet of paper, the hands working on it, the one input
 * the current step asks for, and the three notebook panels.
 */

// ---------------------------------------------------------------------------
// The apparatus
// ---------------------------------------------------------------------------

function Stage({
  state,
  dispatch,
  now,
  onStageElement,
  highlights,
}: BenchStageProps<PrismState, PrismAction>): React.ReactElement {
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 240,
        display: 'flex',
        p: { xs: 0.5, sm: 1 },
        backgroundColor: apparatus.bench,
      }}
    >
      <PrismSheet
        fill
        state={state}
        pulse={highlights}
        onSvg={onStageElement}
        onTraceOutline={() => dispatch({ type: 'traceOutline', now: now() })}
        onCross={(x, y) => dispatch({ type: 'moveCross', x, y })}
        onPlacePin={(x, y) => dispatch({ type: 'placePin', x, y, now: now() })}
        onMovePin={(index, x, y) => dispatch({ type: 'dragPin', index, x, y, now: now() })}
        onPullPin={(index) => dispatch({ type: 'pullPin', index, now: now() })}
        onProtractor={(deg) => dispatch({ type: 'setProtractor', deg })}
        onCommit={() => dispatch({ type: 'commitRead', deg: state.prov, now: now() })}
        onAim={(i, quiet) => dispatch({ type: 'setAim', i, quiet })}
      />
    </Box>
  );
}

const BENCH_BUTTON = {
  flex: 'none',
  minWidth: 0,
  color: apparatus.benchInk,
  borderColor: 'rgba(255,255,255,.16)',
  '&:hover': { backgroundColor: 'rgba(255,255,255,.07)', borderColor: 'rgba(255,255,255,.28)' },
  '&.Mui-disabled': { color: apparatus.benchInkMuted, borderColor: 'rgba(255,255,255,.08)' },
} as const;

/** What is in your hand, and the things that act on the whole sheet. */
function Controls({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const t = currentTrial(state);
  const geom = measureGeometry(state);
  const holding = state.tool === 'pin';
  const { demo } = state;
  /**
   * The one thing the sweep cannot decide for itself. The reducer is pure and
   * has no window to ask, so the preference is read here and carried into the
   * action: `instant` fills the curve in one step instead of animating it.
   * (The CSS side of reduced motion is handled once, in `bench-motion.ts`.)
   */
  const still = useMediaQuery('(prefers-reduced-motion: reduce)');

  const held =
    state.done || state.graded
      ? 'The prism and the paper stay as they are — your trace is marked.'
      : state.step === STEP.fix
        ? 'Tap the **glass prism** to pin it down and trace round it with the pencil.'
        : state.step === STEP.trace
          ? holding
            ? t.pins.length < 2
              ? `Holding **a pin** — fix **P${t.pins.length + 1}** on the paper to the **left** of the prism`
              : t.pins.length < 4
                ? `Holding **a pin** — look through face AC and fix **P${t.pins.length + 1}** in line with the two images`
                : 'Holding **a pin** — all four are in; now join them up'
            : 'Pick up a pin, then tap the paper where you want it'
          : geom
            ? `Protractor down on ray ${geom.k + 1}, reading ${geom.what}`
            : 'Bench work finished — carry on in the notebook';

  return (
    <Box
      data-tour="prism-controls"
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
      <Box component="span" role="status" sx={{ minWidth: 0 }}>
        <RichText text={held} />
      </Box>
      <Box sx={{ flex: 1 }} />
      {state.step === STEP.trace && !t.traced ? (
        <>
          <Button
            size="small"
            variant={holding ? 'contained' : 'outlined'}
            startIcon={<MapPin size={14} />}
            onClick={() => dispatch({ type: 'setTool', tool: holding ? null : 'pin' })}
            sx={holding ? { flex: 'none', minWidth: 0 } : BENCH_BUTTON}
          >
            {holding ? 'Put the pin down' : 'Pick up a pin'}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Undo2 size={14} />}
            disabled={!t.pins.length}
            onClick={() => dispatch({ type: 'pullPin', index: null, now: now() })}
            sx={BENCH_BUTTON}
          >
            Pull the last pin
          </Button>
        </>
      ) : null}
      <Button
        size="small"
        variant="outlined"
        startIcon={<Lightbulb size={14} />}
        disabled={!currentTrial(state).P && !state.trials[state.sel]?.P}
        onClick={() => dispatch({ type: 'toggleWhite' })}
        sx={BENCH_BUTTON}
      >
        {state.white ? 'Single ray' : 'White light'}
      </Button>
      {/* The ray box itself is NOT switched from here. It is the teaching layer
          on this bench, so its one switch is the shared one on the bench bar
          below — an administrator who turns `teach` off has to take it away,
          and a control this bar drew would survive that.

          What stays here are the demonstration's OWN controls, on their own
          line: they belong to the ray box rather than to the practical, the
          rule above them says so, and they exist only while it is lit. */}
      {demo.on ? (
        <Box
          data-tour="prism-raybox-controls"
          sx={{
            flexBasis: '100%',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1,
            mt: 0.75,
            pt: 0.75,
            borderTop: '1px solid rgba(255,255,255,.1)',
          }}
        >
          <EmergeChip tone="amber" label="demonstration · never marked" />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Button
              size="small"
              variant="outlined"
              aria-label="Turn the ray box one degree towards the normal"
              onClick={() => dispatch({ type: 'setAim', i: demo.i - 1 })}
              sx={{ ...BENCH_BUTTON, px: 1 }}
            >
              <Minus size={14} />
            </Button>
            <Box
              component="span"
              sx={{ minWidth: 56, textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
            >
              i = {demo.i.toFixed(1)}°
            </Box>
            <Button
              size="small"
              variant="outlined"
              aria-label="Turn the ray box one degree away from the normal"
              onClick={() => dispatch({ type: 'setAim', i: demo.i + 1 })}
              sx={{ ...BENCH_BUTTON, px: 1 }}
            >
              <Plus size={14} />
            </Button>
          </Box>
          <Button
            size="small"
            variant={demo.sweep ? 'contained' : 'outlined'}
            startIcon={demo.sweep ? <Square size={13} /> : <Play size={13} />}
            onClick={() => dispatch({ type: 'sweep', instant: still })}
            sx={demo.sweep ? { flex: 'none', minWidth: 0 } : BENCH_BUTTON}
          >
            {demo.sweep ? 'Stop the sweep' : 'Sweep i and plot D'}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Target size={13} />}
            onClick={() => dispatch({ type: 'setAim', i: demoMinimum(state.n).i })}
            sx={BENCH_BUTTON}
          >
            Minimum deviation
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Eye size={13} />}
            onClick={() => dispatch({ type: 'setAim', i: smallestUsefulIncidence(state.n) - 4 })}
            sx={BENCH_BUTTON}
          >
            Trap the light
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The teaching layer
// ---------------------------------------------------------------------------

/**
 * WHAT THE RAY BOX IS SHOWING, beside the beam it puts on the paper.
 *
 * The words are DATA now, in `@labs/lib/prism/teach.ts`, and that module's own
 * doc comment carries the reason: this practical marks nine protractor readings
 * taken off the student's own trace, so a panel that read the state could quote
 * one back, or the true minimum for this bench's glass. This wrapper is handed
 * nothing and has nothing to hand on — the sections are the same at every aim
 * of the box, on every bench seed, before and after the marks are in.
 *
 * The numbers live where they belong: on the **Ray box** page of the notebook,
 * which is about the demonstration's own beam and never about the student's
 * trace, and on the plot, which is drawn from the box's aim rather than from
 * any reading.
 */
function Teach(): React.ReactElement {
  return <TeachSections sections={prismTeach()} />;
}

// ---------------------------------------------------------------------------
// The magnified protractor, docked beside the reading
// ---------------------------------------------------------------------------

function Aside({ state, dispatch, now, maxWidth }: View & { maxWidth: number }): React.ReactElement | null {
  const geom = measureGeometry(state);
  if (!geom) return null;
  return (
    <ProtractorReader
      geom={geom}
      value={state.prov}
      maxWidth={maxWidth}
      onChange={(deg) => dispatch({ type: 'setProtractor', deg })}
      onCommit={() => dispatch({ type: 'commitRead', deg: state.prov, now: now() })}
    />
  );
}

// ---------------------------------------------------------------------------
// The current step
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }): React.ReactElement {
  const theme = useTheme();
  return (
    <Typography
      component="h3"
      sx={{ fontWeight: 800, fontSize: theme.band.type.h4, color: theme.brand.ink, lineHeight: 1.25 }}
    >
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
        '& > .MuiFormControl-root': { flex: '1 1 120px', minWidth: 110 },
      }}
    >
      {children}
    </Box>
  );
}

function Task({ state, dispatch, now }: View): React.ReactElement {
  const t = currentTrial(state);
  const geom = measureGeometry(state);
  const traced = state.trials.filter((x) => x.traced).length;
  const rays = measuredRays(state);
  /**
   * "Show what happened inside" draws the true path of a ray that never got out
   * of face AC — the invisible light again, so it belongs to the teaching layer
   * and goes when an administrator turns `teach` off. Nothing is lost that the
   * student needs: the assistant and the tour notice both already say the ray
   * was totally internally reflected and to come in at a larger angle.
   */
  const teach = useLabFeature('teach');

  if (state.step === STEP.fix) {
    return (
      <Box data-tour="prism-task">
        <SectionTitle>Fix the paper and the prism</SectionTitle>
        <Hint>
          The sheet is already pinned to the drawing board. Put the <b>glass prism</b> near the middle with its base
          towards you and <b>trace its outline</b> in pencil — every angle you measure later is measured from that
          outline, not from the glass. Mark the corners <b>A</b> (apex), <b>B</b> and <b>C</b>.
        </Hint>
        <Fields>
          <Button variant="contained" onClick={() => dispatch({ type: 'traceOutline', now: now() })}>
            Trace round the prism
          </Button>
          <EmergeChip
            tone={state.outline ? 'green' : 'grey'}
            label={state.outline ? 'outline traced' : 'outline not traced'}
          />
        </Fields>
      </Box>
    );
  }

  if (state.step === STEP.trace) {
    return (
      <Box data-tour="prism-task">
        <SectionTitle>
          Ray {t.k + 1} of {RAYS} — the pin method
        </SectionTitle>
        <Hint>
          <b>1.</b> Fix <b>P1</b> and <b>P2</b> in front of face AB, at least <b>3 cm</b> apart: the line through them
          is your incident ray. <b>2.</b> Move your eye to the other side and look through face <b>AC</b> — you will see
          the <i>images</i> of P1 and P2. <b>3.</b> Fix <b>P3</b> and <b>P4</b> so all four appear in one straight line.
          <b> 4.</b> Lift the prism and join the pins. Sight a little off and your trace is a little off — and so is
          every angle you get from it.
        </Hint>
        <Fields>
          {t.pins.length === 4 && !t.traced ? (
            <Button variant="contained" onClick={() => dispatch({ type: 'joinPins', now: now() })}>
              Lift the prism and join the pins
            </Button>
          ) : null}
          {t.traced && state.trial < RAYS - 1 ? (
            <Button variant="contained" onClick={() => dispatch({ type: 'nextRay', now: now() })}>
              Next ray
            </Button>
          ) : null}
          {teach && t.tir && !t.reveal ? (
            <Button variant="outlined" color="inherit" startIcon={<Eye size={15} />} onClick={() => dispatch({ type: 'reveal' })}>
              Show what happened inside
            </Button>
          ) : null}
          <EmergeChip tone={t.pins.length === 4 ? 'green' : 'grey'} label={`${t.pins.length}/4 pins in`} />
          <EmergeChip tone={traced === RAYS ? 'green' : 'grey'} label={`${traced}/${RAYS} rays traced`} />
          {t.i !== null ? <EmergeChip tone="amber" label="this ray strikes AB at P" /> : null}
        </Fields>
      </Box>
    );
  }

  if (state.step === STEP.measure) {
    if (!geom) {
      return (
        <Box data-tour="prism-task">
          <SectionTitle>Measure with the protractor</SectionTitle>
          <Hint>
            Nine readings: on each ray, <b>i</b> between the incident ray and the normal at P, <b>e</b> between the
            emergent ray and the normal at M, and <b>D</b> between the incident ray <i>produced</i> and the emergent
            ray.
          </Hint>
        </Box>
      );
    }
    return (
      <Box data-tour="prism-task">
        <SectionTitle>
          Reading {readingsTaken(state) + 1} of {READINGS} — {ANGLE_NAMES[geom.which]}, ray {geom.k + 1}
        </SectionTitle>
        <Hint>
          The protractor is centred on {geom.at}, with its baseline along <b>{geom.baseline}</b>. Drag its pointer round
          to where the <b>{geom.rayName}</b> crosses the scale — or type the reading. <b>Your first reading of each
          angle counts</b>, and more than 2° out earns nothing.
        </Hint>
        <Fields>
          <NumberField
            id="prism-angle"
            label={`Angle ${geom.which === 'D' ? 'D' : `∠${geom.which}`}`}
            unit="°"
            placeholder="0"
            value={String(state.prov)}
            onChange={(next) => {
              const v = parseDecimal(next);
              dispatch({ type: 'setProtractor', deg: Number.isNaN(v) ? 0 : v });
            }}
            onEnter={() => dispatch({ type: 'commitRead', deg: state.prov, now: now() })}
          />
          <Button variant="contained" onClick={() => dispatch({ type: 'commitRead', deg: state.prov, now: now() })}>
            Record
          </Button>
        </Fields>
      </Box>
    );
  }

  if (state.step === STEP.concl && !state.graded) {
    return (
      <Box data-tour="prism-task">
        <SectionTitle>What the curve shows</SectionTitle>
        <Hint>
          Which of <b>your</b> three rays came out with the <b>least deviation</b>? Take it from your own table, not
          from what it ought to have been.
        </Hint>
        <Fields>
          {state.trials.map((x) => (
            <Button
              key={x.k}
              size="small"
              variant={state.minPick === x.k ? 'contained' : 'outlined'}
              color={state.minPick === x.k ? 'primary' : 'inherit'}
              onClick={() => dispatch({ type: 'pickLeast', k: x.k })}
            >
              Ray {x.k + 1}
              {x.meas.D !== null ? ` · D = ${x.meas.D}°` : ''}
            </Button>
          ))}
          <Button
            variant="contained"
            disabled={state.minPick === null}
            onClick={() => dispatch({ type: 'submitLeast', now: now() })}
          >
            Submit
          </Button>
        </Fields>
      </Box>
    );
  }

  if (state.step === STEP.concl) {
    return (
      <Box data-tour="prism-task">
        <SectionTitle>Read your own curve</SectionTitle>
        <Hint>
          Three questions about the table and the graph you just made. Marked against <b>your</b> readings, so answer
          what you actually found. Your first answer counts.
        </Hint>
        <Box sx={{ mt: 1.5 }}>
          <ChoiceQuiz
            idPrefix="prism-concl"
            questions={CONCLUSIONS.map((c, i) => ({
              q: c.q,
              options: c.o,
              answer: conclusionKey(i, rays),
              why: c.why,
            }))}
            picks={state.concl.map((c) => (c ? c.pick : null))}
            onPick={(question, option) => dispatch({ type: 'answerConclusion', question, option, now: now() })}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box data-tour="prism-task">
      <SectionTitle>Viva voce</SectionTitle>
      <Hint>Five questions from the examiner.</Hint>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The notebook
// ---------------------------------------------------------------------------

function ObservationsPanel({ state }: { state: PrismState }): React.ReactElement {
  const theme = useTheme();
  const reveal = state.graded;

  return (
    <>
      <ObservationTable
        caption={
          reveal
            ? 'Readings marked against the angles on your own trace — the grey figure is what the trace really showed'
            : 'Nine readings: i, e and D on each of your three rays'
        }
        columns={[
          { label: 'Ray' },
          { label: '∠i' },
          { label: '∠e' },
          { label: '∠D' },
          { label: `i + e − ${APEX}` },
          { label: 'Marks' },
        ]}
        rows={state.trials.map((t) => [
          t.k + 1,
          <Reading key="i" written={t.meas.i} truth={t.i} reveal={reveal} />,
          <Reading key="e" written={t.meas.e} truth={t.e} reveal={reveal} />,
          <Reading key="D" written={t.meas.D} truth={t.D} reveal={reveal} />,
          t.meas.i !== null && t.meas.e !== null ? `${sumRule(t.meas.i, t.meas.e)}°` : '—',
          <EmergeChip
            key="pts"
            tone={t.consist === 3 ? 'green' : t.meas.D !== null ? 'red' : 'grey'}
            label={`${t.mp.i + t.mp.e + t.mp.D + t.consist}/12`}
          />,
        ])}
      />
      <Typography sx={{ mt: 1.5, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert }}>
        A row is green when your own three readings satisfy <b>D = i + e − {APEX}°</b> to within 2° — which they cannot
        do unless all three were read honestly.
      </Typography>
    </>
  );
}

function Reading({
  written,
  truth,
  reveal,
}: {
  written: number | null;
  truth: number | null;
  reveal: boolean;
}): React.ReactElement {
  const theme = useTheme();
  if (written === null) return <>—</>;
  return (
    <>
      {written}°
      {reveal && truth !== null && Math.abs(written - truth) > 1 ? (
        <Box component="span" sx={{ color: theme.brand.tert }}> ({truth.toFixed(1)})</Box>
      ) : null}
    </>
  );
}

function GraphPanel({ state }: { state: PrismState }): React.ReactElement {
  const theme = useTheme();
  const points = state.trials
    .filter((t) => t.meas.i !== null && t.meas.D !== null)
    .map((t) => ({ x: t.meas.i!, y: t.meas.D! }))
    .sort((a, b) => a.x - b.x);
  const fit = fitParabola(points);
  const dip = fit && fit.A > 0 && fit.vx !== null && fit.vy !== null && fit.vx > points[0]!.x && fit.vx < points[points.length - 1]!.x
    ? fit
    : null;
  const truth = minimumDeviation(state.n);

  return (
    <>
      <XYGraph
        ariaLabel="Graph of the angle of deviation against the angle of incidence"
        points={points}
        xMax={90}
        yMax={70}
        xLabel="Angle of incidence i (°)"
        yLabel="D (°)"
        xSymbol="i"
        ySymbol="D"
        fit={null}
        emptyText="Your measured points appear here"
      />
      <Typography sx={{ mt: 1, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert }}>
        {points.length < 3
          ? 'Each ray puts one point on this graph. Three well-spread angles show the curve falling and then rising.'
          : dip
            ? `The curve through your three points bottoms out at D ≈ ${dip.vy!.toFixed(1)}° near i ≈ ${dip.vx!.toFixed(
                0,
              )}°.${
                state.graded
                  ? ` For this bench’s glass (n = ${state.n}) the true minimum is ${truth.D.toFixed(
                      1,
                    )}° at i = ${truth.i.toFixed(1)}°.`
                  : ''
              }`
            : `Your three points do not dip: a curve needs angles on both sides of the minimum. ${
                state.graded ? `For this glass it sits near i = ${truth.i.toFixed(0)}°.` : ''
              }`}
      </Typography>
    </>
  );
}

/**
 * The ray box's own page of the notebook: what the beam on the paper is doing,
 * in numbers, and the curve the sweep has filled in so far.
 *
 * Read-only by design. Every control that moves the box lives in the bar under
 * the apparatus, where the box itself is — hands on the bench, numbers in the
 * notebook — and a notebook panel is handed nothing but state, so there is no
 * way for this page to alter anything even by accident.
 */
function RayBoxPanel({ state }: { state: PrismState }): React.ReactElement {
  const theme = useTheme();
  const { demo, n } = state;
  const note = { mt: 1.5, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert } as const;

  if (!demo.on) {
    return (
      <Box sx={{ fontSize: theme.band.type.base - 1, color: theme.brand.sub }}>
        <Typography component="p" sx={{ m: 0, fontSize: 'inherit' }}>
          A real bench shows you none of the light path: the glass is clear and the ray inside it leaves no track,
          which is exactly why the <b>pin method</b> exists. Press <b>Ray box</b> under the apparatus and a lamp is put
          on the paper instead, with the beam drawn from the same tracer your own trace is marked against.
        </Typography>
        <Typography component="p" sx={{ mt: 1, mb: 0, fontSize: 'inherit' }}>
          Turn it through the range and the deviation curve fills in as you watch. It is a <b>demonstration</b>: it
          takes no reading, adds no step, and changes no mark, either way.
        </Typography>
      </Box>
    );
  }

  const r = demoRay(demo.i, n);
  const deg = (v: number | null): string => (v === null ? '—' : `${v.toFixed(1)}°`);

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        <Metric label="i" value={deg(r.i)} />
        <Metric label="r₁" value={deg(r.r1)} />
        <Metric label="r₂" value={deg(r.r2)} />
        <Metric label="e" value={deg(r.e)} />
        <Metric label="D" value={deg(r.D)} />
        <Metric label={`i + e − ${APEX}`} value={r.clean ? `${(r.i + r.e! - APEX).toFixed(1)}°` : '—'} />
      </Box>
      <Box sx={{ mt: 1.25, fontSize: theme.band.type.base - 1, color: theme.brand.sub }}>
        <RichText text={rayBoxVerdict(r, n)} />
      </Box>
      <Box sx={{ mt: 1.5 }}>
        <DemoPlot state={state} />
      </Box>
      <Typography sx={note}>
        Only the part of the curve the ray box has actually been turned through is drawn, so it fills in as the box
        swings. Nothing on this page is a reading and nothing on it is marked — your own points and the graph they are
        marked on are under <b>Deviation curve</b>.
      </Typography>
    </>
  );
}

/** What the numbers above add up to, for whatever the box is pointing at now. */
function rayBoxVerdict(r: DemoRay, n: number): string {
  if (r.tir) {
    return (
      `Nothing emerges through face AC. Inside the glass the ray meets it at **r₂ = ${(r.tirAt?.ang ?? 0).toFixed(1)}°**, ` +
      `past the **critical angle ${criticalAngle(n).toFixed(1)}°**, so sin(refraction) would have to exceed 1 — the ` +
      'equation has no solution and all of the light is turned back, leaving through the base.'
    );
  }
  if (!r.clean) return 'The beam is not going through both faces from here.';
  if (atMinimum(r)) {
    return (
      `**Minimum deviation.** i = e = **${r.i.toFixed(1)}°**, r₁ = r₂ = **${(r.r1 ?? 0).toFixed(1)}° = A/2**, and the ray ` +
      `inside runs parallel to the base. D has bottomed out at **${(r.D ?? 0).toFixed(1)}°**, which gives ` +
      `n = sin((${APEX} + ${(r.D ?? 0).toFixed(1)})/2) ÷ sin 30° = **${nFromMinDeviation(r.D!).toFixed(3)}** ` +
      `against this glass’s ${n}.`
    );
  }
  return (
    `The two bendings add: **${r.i.toFixed(1)}° → r₁ ${(r.r1 ?? 0).toFixed(1)}°** at the first face, ` +
    `**r₂ ${(r.r2 ?? 0).toFixed(1)}° → e ${(r.e ?? 0).toFixed(1)}°** at the second, so D = i + e − A = ` +
    `**${(r.D ?? 0).toFixed(1)}°**. ${
      r.i < demoMinimum(n).i
        ? 'Turn the box further round and watch D fall towards the minimum.'
        : 'Turn the box back and watch D fall towards the minimum.'
    }`
  );
}

function TheoryPanel(): React.ReactElement {
  const theme = useTheme();
  const { meta } = prismEngine;
  return (
    <Box sx={{ fontSize: theme.band.type.base - 1, color: theme.brand.sub }}>
      <Typography component="p" sx={{ m: 0, fontSize: 'inherit' }}>
        <b>Aim.</b> {meta.aim}
      </Typography>
      <Typography component="p" sx={{ mt: 1, mb: 0, fontSize: 'inherit' }}>
        <b>Theory.</b> {meta.theory}
      </Typography>
      <Typography component="p" sx={{ mt: 1, mb: 0, fontSize: 'inherit' }}>
        <b>Watch for.</b> Come in too squarely at the first face and nothing emerges through the second at all: inside
        the glass the ray meets AC beyond the critical angle and is totally internally reflected out of the base.
      </Typography>
      <TextbookPassage scope={meta.textbook} query={meta.theoryQuery} topK={3} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The bench
// ---------------------------------------------------------------------------

/** A tour step names parts of the drawing; the sheet pulses whatever it is handed. */
const PARTS = new Set(['prism', 'pins', 'protractor', 'raybox']);

export const prismBench: BenchDefinition<PrismState, PrismAction> = {
  engine: prismEngine,
  ui: {
    Stage,
    Controls,
    Task,
    Aside,
    showAside: (state) => state.arm !== null,
    // THE TEACHING LAYER. On this bench it is the ray box: the light path
    // itself, put on the paper where a real bench shows nothing at all. The
    // demonstration's own state is the switch and the workspace drives it, so
    // there is one control and the lamp on the paper cannot disagree with it —
    // and with `teach` off the box is never lit, because nothing else can
    // switch it on.
    Teach,
    teachLabel: 'The ray box',
    teachOpen: (state) => state.demo.on,
    teachToggle: (on) => ({ type: 'demoOn', on }),
    tabs: [
      { id: 'observations', label: 'Observations', Panel: ObservationsPanel },
      { id: 'graph', label: 'Deviation curve', Panel: GraphPanel },
      { id: 'raybox', label: 'Ray box', Panel: RayBoxPanel },
      { id: 'theory', label: 'Theory', Panel: TheoryPanel },
    ],
    // Switching the ray box on is a request to look at it, so the notebook
    // follows — until the student picks a tab themselves, as on every bench.
    tabForStep: (state) =>
      state.demo.on
        ? 'raybox'
        : state.step >= STEP.concl
          ? 'graph'
          : state.step === STEP.measure
            ? 'observations'
            : 'theory',
    tours: (ctx) => createPrismTours(ctx),
    // Passed by reference: it reads the `teach` flag as it builds the set, so
    // it is a hook and the workspace calls it as one, in its own render.
    useTrainer: usePrismTrainer,
    tourNotice: (state) =>
      currentTrial(state).tir && !currentTrial(state).traced
        ? 'That ray is **totally internally reflected** at face AC — pull the pins and come in at a larger angle.'
        : null,
    highlightsFor: (step) => (step?.highlight ?? []).filter((h) => PARTS.has(h)),
  },
};
