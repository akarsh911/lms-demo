'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Trash2, Undo2 } from 'lucide-react';

import { TextbookPassage } from '@/components/textbook/textbook-passage';
import { EmergeChip, NumberField, RichText } from '@/components/ui';
import { oneDecimal } from '@labs/lib/numbers';
import {
  APPARATUS,
  GRAPH_MAX,
  P,
  TAP_LETTER,
  cellsUsed,
  type TerminalId,
} from '@labs/lib/ohms-law/apparatus';
import { strayWiresFor } from '@labs/lib/ohms-law/diagnose';
import { OHMS_LAW_METERS, ohmsLawEngine } from '@labs/lib/ohms-law/engine';
import { CIRCUIT, READINGS_REQUIRED, READING_POINTS, STEP } from '@labs/lib/ohms-law/marking';
import type { LabAction } from '@labs/lib/ohms-law/reducer';
import { driftSpeed, solveBench, type BenchReading } from '@labs/lib/ohms-law/solve';
import type { LabState, MeterId } from '@labs/lib/ohms-law/state';
import { ohmsLawTeach } from '@labs/lib/ohms-law/teach';
import type {
  BenchDefinition,
  BenchStageProps,
  BenchViewProps,
} from '@labs/types/lab-bench';

import { dialAngle } from '../analog-dial';
import { apparatus } from '../apparatus-palette';
import { useLabFeature } from '../lab-features';
import { MeterReader } from '../meter-reader';
import { ObservationTable } from '../observation-table';
import { PotentialLadder, type LadderStep } from '../potential-ladder';
import { TeachSections } from '../teach-sections';
import { useSpringNeedles, type NeedleRef } from '../use-spring-needles';
import { XYGraph } from '../xy-graph';

import { Bench } from './bench';
import { createOhmsLawTours, STRAY_NOTICE, TEXTBOOK_NET_MARK } from './tours';
import { useOhmsLawTrainer } from './trainer';

type View = BenchViewProps<LabState, LabAction>;

/**
 * The Ohm's law bench: everything about this practical that is drawn.
 *
 * The engine beside it decides what happens; the shared workspace draws the
 * frame, the strip, the assistant, the notebook, the viva and the marks. What
 * is left here is genuinely this practical's own: the apparatus, the controls
 * on it, the step's input, and the three notebook panels.
 */

// ---------------------------------------------------------------------------
// Live values shared by the apparatus and the console
// ---------------------------------------------------------------------------

interface OhmsContext {
  reading: BenchReading;
  /** The needles ON THE BENCH. */
  needles: Readonly<Record<MeterId, NeedleRef>>;
  /** The needle in the console's magnified copy. */
}

const Ctx = React.createContext<OhmsContext | null>(null);

function useOhms(): OhmsContext {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('Ohm’s law bench components must be inside its provider.');
  return ctx;
}

/**
 * ONE SOLVER RESULT, and one needle animator per PLACE a needle is drawn.
 *
 * Both animators are driven by the same targets, computed once here, so the
 * dial on the bench and its magnified copy in the console read the same thing
 * at the same moment — which is the point, since a student reads the close-up
 * and checks it against the bench.
 *
 * ONE animator, shared. `useSpringNeedles` keeps a set of elements per meter
 * and each ref returns React 19's detach cleanup, so the same ref may be given
 * to the bench's ammeter and to the console's magnified copy of it and both
 * move together off one set of physics.
 */
function OhmsProvider({ state, children }: View & { children: React.ReactNode }): React.ReactElement {
  const reading = React.useMemo(() => solveBench(state), [state]);
  const targets = React.useMemo(
    () => ({ am: dialAngle(reading.Iam / P.amFS), vm: dialAngle(reading.Vvm / P.vmFS) }),
    [reading],
  );
  const needles = useSpringNeedles(targets);
  const value = React.useMemo(
    () => ({ reading, needles }),
    [reading, needles],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ---------------------------------------------------------------------------
// The apparatus
// ---------------------------------------------------------------------------

function Stage({
  state,
  dispatch,
  now,
  onStageElement,
  highlights,
}: BenchStageProps<LabState, LabAction>): React.ReactElement {
  const { needles, reading } = useOhms();
  // A wire is "stray" only against the TEXTBOOK layout, and the practical
  // accepts any topology that behaves correctly — so nothing is flashed red
  // unless a guided-build step has asked for it, which it does by carrying the
  // `net:textbook` marker in its highlights.
  const stray = highlights.includes(TEXTBOOK_NET_MARK)
    ? strayWiresFor(state.wires, state.method)
    : [];
  const pulse = highlights.filter((h) => !h.includes(':')) as readonly TerminalId[];

  return (
    <Box sx={{ flex: 1, minHeight: 240, display: 'flex', p: { xs: 0.5, sm: 1 }, backgroundColor: apparatus.bench }}>
      <Bench
        // A NEW APPARATUS IS A NEW DRAWING. Keying the bench on the method
        // remounts its `<svg>`, which hands the workspace a fresh stage element
        // — and the tours are rebuilt from that, so switching to the rheostat
        // can never leave a tour walking a student through cell taps that are
        // no longer on the bench. It also clears the half-armed terminal a
        // student may have left behind, which no longer exists either.
        key={state.method}
        fill
        method={state.method}
        wires={state.wires}
        keyIn={state.key}
        sanded={state.sanded}
        slider={state.s}
        heat={state.T}
        drift={driftSpeed(reading.Ir)}
        pulse={pulse}
        stray={stray}
        flashes={state.flashes}
        needles={needles}
        onSvg={onStageElement}
        onConnect={(a, b) => dispatch({ type: 'connect', a, b, now: now() })}
        onRemoveWire={(index) => dispatch({ type: 'removeWire', index, now: now() })}
        onToggleKey={() => dispatch({ type: 'toggleKey', now: now() })}
        onSand={() => dispatch({ type: 'sand' })}
        onSlider={(s) => dispatch({ type: 'setSlider', s, now: now() })}
        onOpenLens={(meter) => dispatch({ type: 'openLens', meter })}
      />
    </Box>
  );
}

/**
 * THE BENCH BAR: what the circuit is doing, which control is varying the
 * current and what it is set to, the choice between the two methods, and
 * undoing wiring.
 *
 * The read-out is the one place the cells method's answer is stated in words —
 * "2 cells in circuit · tap C · 3.0 V" — and it is read off the WIRING, not off
 * a meter, so it says the same thing with the key in and with it out.
 */
function Controls({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const { reading } = useOhms();
  const live = state.key && Math.abs(reading.Ibat) > 1e-3;
  const status = !state.key
    ? 'Key out — no current'
    : live
      ? 'Key in — current flowing'
      : 'Key in — circuit incomplete';
  const cells = state.method === 'cells';
  const used = cellsUsed(state.wires, state.method);
  const control = !cells
    ? `Slider ${Math.round(state.s * 100)}% from A`
    : used
      ? `${used} cell${used > 1 ? 's' : ''} in circuit · tap ${TAP_LETTER[used]} · ${(used * P.cellEmf).toFixed(1)} V`
      : 'No cell tap wired';

  return (
    <Box
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
      <Box
        component="span"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontWeight: 600 }}
      >
        <Box
          component="i"
          aria-hidden="true"
          sx={{
            width: 8,
            height: 8,
            flex: 'none',
            borderRadius: '999px',
            backgroundColor: live ? apparatus.live : '#55605d',
            boxShadow: live ? `0 0 8px ${apparatus.live}` : 'none',
          }}
        />
        <Box component="span" role="status">
          {status}
        </Box>
      </Box>
      {/* Tagged because a trainer card points at it: it is the one place the
          control that varies the current is stated in words, and it is read off
          the WIRING, so it says the same thing with the plug in and with it out. */}
      <Box
        component="span"
        data-tour="bench-readout"
        sx={{ opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}
      >
        {control}
      </Box>
      <MethodSwitch method={state.method} onMethod={(m) => dispatch({ type: 'setMethod', method: m, now: now() })} />
      <Box sx={{ flex: 1 }} />
      <Button
        size="small"
        variant="outlined"
        startIcon={<Undo2 size={14} />}
        disabled={!state.wires.length}
        onClick={() => dispatch({ type: 'undoWire', now: now() })}
        sx={BENCH_BUTTON}
      >
        Undo wire
      </Button>
      <Button
        size="small"
        variant="outlined"
        startIcon={<Trash2 size={14} />}
        disabled={!state.wires.length}
        onClick={() => dispatch({ type: 'clearWires', now: now() })}
        sx={BENCH_BUTTON}
      >
        Clear
      </Button>
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

/**
 * HOW THE CURRENT IS VARIED. The manual's own method is the cells; the rheostat
 * is the alternative it offers in its Note for the Teacher. Choosing changes
 * the apparatus on the bench, so it starts the practical again on the same
 * bench rather than leaving half a circuit wired to terminals that have gone.
 */
function MethodSwitch({
  method,
  onMethod,
}: {
  method: LabState['method'];
  onMethod: (method: LabState['method']) => void;
}): React.ReactElement {
  const pressed = {
    ...BENCH_BUTTON,
    minWidth: 0,
    px: 1,
    '&[aria-pressed="true"]': {
      backgroundColor: 'rgba(255,255,255,.16)',
      borderColor: 'rgba(255,255,255,.4)',
      color: '#fff',
    },
  } as const;
  return (
    <Box
      role="group"
      aria-label="How the current is varied"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}
    >
      <Box component="span" sx={{ opacity: 0.7 }}>
        Current varied by
      </Box>
      <Button size="small" variant="outlined" aria-pressed={method === 'cells'} onClick={() => onMethod('cells')} sx={pressed}>
        Cells
      </Button>
      <Button
        size="small"
        variant="outlined"
        aria-pressed={method === 'rheostat'}
        onClick={() => onMethod('rheostat')}
        sx={pressed}
      >
        Rheostat
      </Button>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The magnified meter, docked beside the readings
// ---------------------------------------------------------------------------

function Aside({ state, dispatch, maxWidth }: View & { maxWidth: number }): React.ReactElement | null {
  const { needles } = useOhms();
  const meter = state.lens ?? (state.step === STEP.leastCounts || state.step === STEP.readings ? 'am' : null);
  if (!meter) return null;
  return (
    // Tagged because two trainer cards point at the magnified dial itself —
    // "count the small divisions", "count on from the labelled number" — and the
    // console as a whole is far too big a spotlight for either.
    <Box data-tour="meter-closeup">
      <MeterReader
        meter={meter}
        onMeter={(next) => dispatch({ type: 'openLens', meter: next })}
        meters={OHMS_LAW_METERS}
        needleRef={needles[meter]}
        maxWidth={maxWidth}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The current step
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
    <Typography component="p" sx={{ m: 0, mt: 0.5, color: theme.brand.sub, fontSize: theme.band.type.base - 1, textWrap: 'pretty' }}>
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
  const [lc, setLc] = React.useState({ A: '', V: '' });
  const [entry, setEntry] = React.useState({ I: '', V: '' });
  const [result, setResult] = React.useState('');
  // GUARDED AT THE RENDER, not the handler: with the flag off the control is
  // never drawn, so a student cannot tell buyable hints exist.
  const hintsOn = useLabFeature('hints');
  const cells = state.method === 'cells';
  const status = (flag: 'ok' | 'no' | null): 'ok' | 'error' | null =>
    flag === 'ok' ? 'ok' : flag === 'no' ? 'error' : null;

  const record = (): void => {
    const before = state.readings.length;
    const next = dispatch({ type: 'record', I: entry.I, V: entry.V, now: now() });
    if (next.readings.length > before) setEntry({ I: '', V: '' });
  };

  switch (state.step) {
    case STEP.leastCounts:
      return (
        <>
          <SectionTitle>Know your meters</SectionTitle>
          <Hint>
            Tap a dial for the close-up. Least count = <RichText text="_range ÷ number of divisions_" />.
          </Hint>
          {/* The apparatus the Laboratory Manual lays out for this experiment. */}
          <Hint>This practical is set up with {APPARATUS}.</Hint>
          <Fields>
            <NumberField
              id="lc-ammeter"
              label="Ammeter"
              unit="A"
              placeholder="range ÷ divisions"
              value={state.lc.A.ok ? String(P.lcA) : lc.A}
              onChange={(A) => setLc((v) => ({ ...v, A }))}
              onEnter={() => dispatch({ type: 'checkLeastCounts', A: lc.A, V: lc.V, now: now() })}
              disabled={state.lc.A.ok}
              status={status(state.lc.A.flag)}
            />
            <NumberField
              id="lc-voltmeter"
              label="Voltmeter"
              unit="V"
              placeholder="range ÷ divisions"
              value={state.lc.V.ok ? String(P.lcV) : lc.V}
              onChange={(V) => setLc((v) => ({ ...v, V }))}
              onEnter={() => dispatch({ type: 'checkLeastCounts', A: lc.A, V: lc.V, now: now() })}
              disabled={state.lc.V.ok}
              status={status(state.lc.V.flag)}
            />
            <Button
              variant="contained"
              onClick={() => dispatch({ type: 'checkLeastCounts', A: lc.A, V: lc.V, now: now() })}
            >
              Check
            </Button>
          </Fields>
        </>
      );

    case STEP.sand:
      return (
        <>
          <SectionTitle>Clean the ends of the connecting wires</SectionTitle>
          <Hint>
            Fresh connecting wire carries a thin insulating enamel, and wire that has lain unused grows an oxide layer
            of its own. A dull end makes a poor joint, and a poor joint is <b>extra resistance in your circuit that you
            never account for</b>.
          </Hint>
          <Hint>
            The sand paper is on the bench, on the left, with the wire ends lying on it. Rub them bright before you join
            anything — the bench will not let you lay a wire until you have.
          </Hint>
          <Fields>
            <EmergeChip
              tone={state.sanded ? 'green' : 'grey'}
              dot
              label={state.sanded ? 'Ends cleaned' : 'Not cleaned yet'}
            />
          </Fields>
        </>
      );

    case STEP.circuit:
      return (
        <>
          <SectionTitle>Set up the circuit</SectionTitle>
          <Hint>
            Tap two terminals to lay a wire, tap a wire to remove it. Ammeter <b>in series</b>, voltmeter{' '}
            <b>across the resistor</b>, key in the main loop, and{' '}
            {cells ? (
              <>
                the loop taken off the cell holder at <b>tap B</b>, so it starts with <b>one cell</b>
              </>
            ) : (
              <>
                the rheostat in series using its <b>slider terminal C</b>
              </>
            )}
            .
          </Hint>
          <Fields>
            <Button variant="contained" onClick={() => dispatch({ type: 'checkCircuit', now: now() })}>
              Check my circuit
            </Button>
            {hintsOn ? (
              <Button variant="outlined" color="inherit" onClick={() => dispatch({ type: 'buyHint', now: now() })}>
                Show next wire (−{CIRCUIT.perHint})
              </Button>
            ) : null}
            {state.circuit.fails ? (
              <EmergeChip tone="red" label={`${state.circuit.fails} failed check${state.circuit.fails === 1 ? '' : 's'}`} />
            ) : null}
          </Fields>
        </>
      );

    case STEP.closeSafely:
      return (
        <>
          <SectionTitle>Close the circuit safely</SectionTitle>
          <Hint>
            {cells ? (
              <>
                Before current flows, make sure the loop leaves the holder at <b>tap B</b> — <b>one cell</b>, the
                smallest current this circuit can be given.
              </>
            ) : (
              <>
                Before current flows, drag the rheostat slider so the circuit has its <b>maximum resistance</b> — the
                smallest current.
              </>
            )}{' '}
            Then tap the plug key to insert it and watch both needles.
          </Hint>
          <Fields>
            <EmergeChip
              tone={state.key ? 'amber' : 'grey'}
              dot
              label={
                state.key
                  ? `Key is in — take it out, ${cells ? 'move the lead to tap B' : 'set the slider'}, insert again`
                  : 'Key is out'
              }
            />
          </Fields>
        </>
      );

    case STEP.readings:
      return (
        <>
          <SectionTitle>
            Reading {Math.min(state.readings.length + 1, READINGS_REQUIRED)} of {READINGS_REQUIRED}
          </SectionTitle>
          <Hint>
            {cells
              ? 'Move the lead on the cell holder to the next tap — one cell, then two, then three, then four — insert the key, read both meters, then record. Take the key out in between.'
              : 'Move the slider, insert the key, read both meters, then record. Take the key out in between.'}
          </Hint>
          <Fields>
            <NumberField
              id="obs-i"
              label="Ammeter"
              unit="A"
              placeholder="0.00"
              value={entry.I}
              onChange={(I) => setEntry((e) => ({ ...e, I }))}
              onEnter={record}
            />
            <NumberField
              id="obs-v"
              label="Voltmeter"
              unit="V"
              placeholder="0.0"
              value={entry.V}
              onChange={(V) => setEntry((e) => ({ ...e, V }))}
              onEnter={record}
            />
            <Button variant="contained" onClick={record}>
              Record
            </Button>
          </Fields>
        </>
      );

    default:
      return (
        <>
          <SectionTitle>Find R from the graph</SectionTitle>
          <Hint>Your points should lie on one straight line through the origin. Its slope, ΔV ÷ ΔI, is the resistance.</Hint>
          <Fields>
            <NumberField
              id="lab-result"
              label="Resistance"
              unit="Ω"
              placeholder="4.8"
              value={result}
              onChange={setResult}
              onEnter={() => dispatch({ type: 'submitResult', r: result, now: now() })}
            />
            <Button variant="contained" onClick={() => dispatch({ type: 'submitResult', r: result, now: now() })}>
              Submit result
            </Button>
          </Fields>
        </>
      );
  }
}

// ---------------------------------------------------------------------------
// The notebook
// ---------------------------------------------------------------------------

function ReadingsPanel({ state }: { state: LabState }): React.ReactElement {
  const theme = useTheme();
  const lcKnown = state.lc.A.ok && state.lc.V.ok;
  const cells = state.method === 'cells';
  const mean =
    state.readings.length >= READINGS_REQUIRED
      ? state.readings.reduce((a, r) => a + r.V / r.I, 0) / state.readings.length
      : null;

  // Under the manual's own method the table gains a CELLS column: it is the
  // independent variable of this experiment, and one reading per cell count is
  // the whole table.
  const columns = [
    { label: '#' },
    ...(cells ? [{ label: 'Cells' }] : []),
    { label: 'I (A)' },
    { label: 'V (V)' },
    { label: 'V/I (Ω)' },
    { label: 'Marks' },
  ];

  return (
    <>
      <ObservationTable
        caption={
          <>
            Least counts — ammeter {lcKnown ? `${P.lcA} A` : '?'}, voltmeter {lcKnown ? `${P.lcV} V` : '?'}
          </>
        }
        columns={columns}
        rows={state.readings.map((r, i) => [
          i + 1,
          ...(cells ? [r.cells ?? '—'] : []),
          r.I.toFixed(2),
          r.V.toFixed(1),
          r.I > 0 ? (r.V / r.I).toFixed(2) : '—',
          <EmergeChip
            key="pts"
            tone={r.pts >= READING_POINTS * 0.8 ? 'green' : r.pts >= READING_POINTS * 0.4 ? 'amber' : 'red'}
            label={`${oneDecimal(r.pts)}/${READING_POINTS}`}
          />,
        ])}
        expectedRows={READINGS_REQUIRED}
        summary={
          mean !== null
            ? ['Mean V/I', ...(cells ? [''] : []), '', '', <strong key="m">{mean.toFixed(2)}</strong>, '']
            : undefined
        }
      />
      {state.readings.some((r) => r.pts < READING_POINTS) ? (
        <Typography sx={{ mt: 1.5, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert }}>
          A reading scores full marks when both meters are read within one least count.
        </Typography>
      ) : null}
    </>
  );
}

function GraphPanel({ state }: { state: LabState }): React.ReactElement {
  const theme = useTheme();
  return (
    <>
      <XYGraph
        ariaLabel="Graph of potential difference against current"
        points={state.readings.map((r) => ({ x: r.I, y: r.V }))}
        // A little past what the prescribed apparatus can reach, not the meters'
        // full scale: four honest points should fill the sheet, not huddle in a
        // corner of a 3 A by 10 V grid they can never get near.
        xMax={GRAPH_MAX.I}
        yMax={GRAPH_MAX.V}
        xLabel="Current I (A)"
        yLabel="V (V)"
        xSymbol="I"
        ySymbol="V"
        fit={state.result?.fit ?? null}
        slopeLabel={(m) => `slope = ${m.toFixed(2)} Ω`}
        emptyText="Your readings plot themselves here"
      />
      <Typography sx={{ mt: 1, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert }}>
        {state.result
          ? 'The dashed triangle is the slope you were asked to estimate.'
          : 'A straight line through the origin means V ∝ I.'}
      </Typography>
    </>
  );
}

function TheoryPanel(): React.ReactElement {
  const theme = useTheme();
  const { meta } = ohmsLawEngine;
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
// "What's happening"
// ---------------------------------------------------------------------------

/**
 * The staircase, as SHARES of the emf rather than volts.
 *
 * These are shapes, not measurements. They are set so the picture tells the
 * truth about which drop dominates and which is negligible — the resistor takes
 * nearly all of it, the ammeter almost none — while carrying no number a student
 * could copy into the observation table instead of reading their own meter. The
 * last run is deliberately called "the control", because this panel cannot see
 * which of the two methods is on the bench and does not need to: the cells and
 * the rheostat occupy the same place in the walk.
 *
 * It lives here rather than beside the prose because it is presentation. The
 * panel itself is a pure data module with no React in scope, so the section that
 * wants this drawing names it — `figure: 'ladder'` — and the wrapper below is
 * where the name is answered.
 */
const LADDER: readonly LadderStep[] = [
  { label: 'cells', share: -1 },
  { label: 'inside|the cells', share: 0.04 },
  { label: 'ammeter', share: 0.02 },
  { label: 'resistor|under test', share: 0.7 },
  { label: 'the control', share: 0.2 },
  { label: 'leads|and key', share: 0.04 },
];

/**
 * The panel is pure data and takes nothing at all — not even `revealed`, which
 * is why this wrapper ignores the props it is handed. There is no bench state
 * reaching `ohmsLawTeach()`, so there is none it could print: it cannot read a
 * needle, work out a resistance or pass judgement on the wiring. The one drawing
 * is joined to it here, by the key the section names.
 */
function Teach(): React.ReactElement {
  return (
    <TeachSections
      sections={ohmsLawTeach()}
      figures={{
        ladder: (
          <PotentialLadder
            paths={[{ steps: LADDER }]}
            caption="Height is potential, left to right is the walk round the loop."
            desc={
              'A staircase of potential taken once round the circuit. The cells lift the charge from zero to the ' +
              'full emf; it then steps down a little inside the cells themselves, a little again across the ' +
              'ammeter, by far the largest step across the resistor under test, a smaller one across whatever is ' +
              'controlling the current, and a last small one in the leads and the key — arriving back at zero, ' +
              'where it started.'
            }
          />
        ),
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// The bench
// ---------------------------------------------------------------------------

export const ohmsLawBench: BenchDefinition<LabState, LabAction> = {
  engine: ohmsLawEngine,
  ui: {
    Provider: OhmsProvider,
    Stage,
    Controls,
    Task,
    Aside,
    showAside: (state) => state.lens !== null || state.step === STEP.leastCounts || state.step === STEP.readings,
    // THE TEACHING LAYER. It explains the circuit: why each instrument goes
    // where it goes, what the rheostat is for, where the potential drops, and
    // why a warm wire is a different wire. It is given no props at all, so it
    // cannot read a needle, work out a resistance or pass judgement on the
    // wiring — see `@labs/lib/ohms-law/teach.ts`. There is no `showTeach`: the
    // apparatus is on the bench from the first step, and the panel is at its
    // most useful before the first wire is laid.
    Teach,
    tabs: [
      { id: 'readings', label: 'Readings', Panel: ReadingsPanel },
      { id: 'graph', label: 'Graph', Panel: GraphPanel },
      { id: 'theory', label: 'Theory', Panel: TheoryPanel },
    ],
    tabForStep: (state) =>
      state.step >= STEP.result ? 'graph' : state.step >= STEP.readings ? 'readings' : 'theory',
    tours: (ctx) => createOhmsLawTours(ctx),
    // THE VISUAL TRAINER, per step of the procedure. A hook, passed by
    // reference so the workspace calls it as one: it reads the `teach` and
    // `hints` flags inside, and leaves the cards that name either layer OUT of
    // the script rather than skipping them when it runs.
    useTrainer: useOhmsLawTrainer,
    tourNotice: (state) => (strayWiresFor(state.wires, state.method).length ? STRAY_NOTICE : null),
    // The `net:` marker is the guided build's own, and never a terminal id.
    highlightsFor: (step, state) => [
      ...((step?.highlight ?? []) as readonly string[]),
      ...(state.hint?.pair ?? []),
    ],
  },
};
