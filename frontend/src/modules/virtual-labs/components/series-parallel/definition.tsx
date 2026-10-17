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
  CONFIGS,
  CONFIG_IDS,
  GRAPH_MAX,
  P,
  TAP_LETTER,
  buildNetFor,
  byMethod,
  cellsUsed,
  type BuildNetId,
  type ConfigId,
  type TerminalId,
} from '@labs/lib/series-parallel/apparatus';
import { strayWires } from '@labs/lib/series-parallel/diagnose';
import { SERIES_PARALLEL_METERS, seriesParallelEngine } from '@labs/lib/series-parallel/engine';
import { CIRCUIT, READING_POINTS } from '@labs/lib/series-parallel/marking';
import { configOf, stageOf, tableConfigId, type LabAction } from '@labs/lib/series-parallel/reducer';
import { driftOf, solveBench, type BenchReading } from '@labs/lib/series-parallel/solve';
import { meanResistance, type LabState, type MeterId } from '@labs/lib/series-parallel/state';
import { seriesParallelTeach } from '@labs/lib/series-parallel/teach';
import type { BenchDefinition, BenchStageProps, BenchViewProps } from '@labs/types/lab-bench';

import { dialAngle } from '../analog-dial';
import { apparatus } from '../apparatus-palette';
import { useLabFeature } from '../lab-features';
import { MeterReader } from '../meter-reader';
import { ObservationTable } from '../observation-table';
import { PotentialLadder, type LadderStep } from '../potential-ladder';
import { TeachSections } from '../teach-sections';
import { useSpringNeedles, type NeedleRef } from '../use-spring-needles';

import { Bench } from './bench';
import { CombinationGraph } from './combination-graph';
import { useSeriesParallelTrainer } from './trainer';
import { createSeriesParallelTours } from './tours';

type View = BenchViewProps<LabState, LabAction>;

/**
 * The series/parallel bench: everything about this practical that is drawn.
 *
 * The engine beside it decides what happens; the shared workspace draws the
 * frame, the strip, the assistant, the notebook, the viva and the marks. What
 * is left here is genuinely this practical's own: two resistor boards and the
 * wires between them, the current step's ONE input, and four notebook panels —
 * the table for the circuit in hand, all four results side by side, the four
 * V–I lines on one pair of axes, and the theory.
 */

// ---------------------------------------------------------------------------
// Live values shared by the apparatus and the console
// ---------------------------------------------------------------------------

interface BenchContext {
  reading: BenchReading;
  /** The needles ON THE BENCH. */
  needles: Readonly<Record<MeterId, NeedleRef>>;
  /** The needle in the console's magnified copy. */
}

const Ctx = React.createContext<BenchContext | null>(null);

function useBenchContext(): BenchContext {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('Series/parallel bench components must be inside its provider.');
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
function BenchProvider({ state, children }: View & { children: React.ReactNode }): React.ReactElement {
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

/** A tour step names the layout it judges stray wires against; see `tours.tsx`. */
function netFromHighlights(highlights: readonly string[]): BuildNetId | null {
  const marker = highlights.find((h) => h.startsWith('net:'));
  const id = marker?.slice(4);
  return id === 'series' || id === 'parallel' ? id : null;
}

function Stage({
  state,
  dispatch,
  now,
  onStageElement,
  highlights,
}: BenchStageProps<LabState, LabAction>): React.ReactElement {
  const { needles, reading } = useBenchContext();
  const net = netFromHighlights(highlights);
  const stray = net ? strayWires(state.wires, buildNetFor(net, state.method), state.method) : [];
  const pulse = highlights.filter((h) => !h.includes(':')) as TerminalId[];

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
        drift={driftOf(reading)}
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
  const { reading } = useBenchContext();
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
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontWeight: 600 }}>
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
 * bench rather than leaving four circuits' wiring on terminals that have gone.
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

function asideMeter(state: LabState): MeterId | null {
  if (state.lens) return state.lens;
  const type = stageOf(state)?.type;
  return type === 'lc' || type === 'read' ? 'am' : null;
}

function Aside({ state, dispatch, maxWidth }: View & { maxWidth: number }): React.ReactElement | null {
  const { needles } = useBenchContext();
  const meter = asideMeter(state);
  if (!meter) return null;
  return (
    // Tagged because two trainer cards point at the magnified dial itself —
    // "count the small divisions", "count on from the labelled number" — and the
    // console as a whole is far too big a spotlight for either.
    <Box data-tour="meter-closeup">
      <MeterReader
        meter={meter}
        onMeter={(next) => dispatch({ type: 'openLens', meter: next })}
        meters={SERIES_PARALLEL_METERS}
        needleRef={needles[meter]}
        maxWidth={maxWidth}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The current step: one instruction, one input
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
  const [lc, setLc] = React.useState({ A: '', V: '' });
  const [entry, setEntry] = React.useState({ I: '', V: '' });
  const [calc, setCalc] = React.useState({ rs: '', rp: '' });
  // GUARDED AT THE RENDER, not the handler: with the flag off the control is
  // never drawn, so a student cannot tell buyable hints exist.
  const hintsOn = useLabFeature('hints');
  const cells = state.method === 'cells';
  const status = (flag: 'ok' | 'no' | null): 'ok' | 'error' | null =>
    flag === 'ok' ? 'ok' : flag === 'no' ? 'error' : null;

  const stage = stageOf(state);
  const config = configOf(state);

  const record = (): void => {
    if (!config) return;
    const before = state.cfg[config.id].readings.length;
    const next = dispatch({ type: 'record', I: entry.I, V: entry.V, now: now() });
    if (next.cfg[config.id].readings.length > before) setEntry({ I: '', V: '' });
  };

  const checkLeastCounts = (): void => {
    dispatch({ type: 'checkLeastCounts', A: lc.A, V: lc.V, now: now() });
  };

  const submitCalc = (): void => {
    dispatch({ type: 'submitCalc', rs: calc.rs, rp: calc.rp, now: now() });
  };

  switch (stage?.type) {
    case 'lc':
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
              id="sp-lc-ammeter"
              label="Ammeter"
              unit="A"
              placeholder="range ÷ divisions"
              value={state.lc.A.ok ? String(P.lcA) : lc.A}
              onChange={(A) => setLc((v) => ({ ...v, A }))}
              onEnter={checkLeastCounts}
              disabled={state.lc.A.ok}
              status={status(state.lc.A.flag)}
            />
            <NumberField
              id="sp-lc-voltmeter"
              label="Voltmeter"
              unit="V"
              placeholder="range ÷ divisions"
              value={state.lc.V.ok ? String(P.lcV) : lc.V}
              onChange={(V) => setLc((v) => ({ ...v, V }))}
              onEnter={checkLeastCounts}
              disabled={state.lc.V.ok}
              status={status(state.lc.V.flag)}
            />
            <Button variant="contained" onClick={checkLeastCounts}>
              Check
            </Button>
          </Fields>
        </>
      );

    case 'sand':
      return (
        <>
          <SectionTitle>Clean the ends of the connecting wires</SectionTitle>
          <Hint>
            Fresh connecting wire carries a thin insulating enamel, and wire that has lain unused grows an oxide layer
            of its own. A dull end makes a poor joint, and a poor joint is <b>extra resistance in your circuit that you
            never account for</b> — which matters most here, because you will wire four circuits and a bad joint falls
            inside whichever combination is under test.
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

    case 'wire': {
      const progress = state.cfg[stage.cfg];
      return (
        <>
          <SectionTitle>{CONFIGS[stage.cfg].title}</SectionTitle>
          <Hint>
            <RichText text={byMethod(CONFIGS[stage.cfg].instruction, state.method)} />
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
            {progress.fails ? (
              <EmergeChip
                tone="red"
                label={`${progress.fails} failed check${progress.fails === 1 ? '' : 's'}`}
              />
            ) : null}
          </Fields>
        </>
      );
    }

    case 'start':
      return (
        <>
          <SectionTitle>Switch on safely — {CONFIGS[stage.cfg].label}</SectionTitle>
          <Hint>
            {cells ? (
              <>
                Before current flows, make sure the loop leaves the holder at <b>tap B</b> — <b>one cell</b>, the
                smallest current this circuit can be given.
              </>
            ) : (
              <>
                Slide the rheostat to <b>maximum resistance</b> first — the smallest current.
              </>
            )}{' '}
            Then insert the plug key and watch both needles.
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

    case 'read': {
      const spec = CONFIGS[stage.cfg];
      const progress = state.cfg[stage.cfg];
      return (
        <>
          <SectionTitle>
            {spec.label} · reading {Math.min(progress.readings.length + 1, spec.readings)} of {spec.readings}
          </SectionTitle>
          <Hint>
            {cells
              ? 'Move the lead on the cell holder to the next tap — one cell, then two, then three — insert the key, read both meters, then record. Take the key out in between.'
              : 'Move the slider, insert the key, read both meters, then record. Take the key out in between.'}
          </Hint>
          <Fields>
            <NumberField
              id="sp-obs-i"
              label="Ammeter"
              unit="A"
              placeholder="0.00"
              value={entry.I}
              onChange={(I) => setEntry((e) => ({ ...e, I }))}
              onEnter={record}
            />
            <NumberField
              id="sp-obs-v"
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
    }

    default:
      return (
        <>
          <SectionTitle>Calculate and compare</SectionTitle>
          <Hint>
            Use <b>your own</b> mean values of R₁ and R₂ from the Compare tab. Work out what theory says each combination
            should be.
          </Hint>
          <Fields>
            <NumberField
              id="sp-calc-rs"
              label="R₁ + R₂"
              unit="Ω"
              placeholder="series, in theory"
              value={calc.rs}
              onChange={(rs) => setCalc((c) => ({ ...c, rs }))}
              onEnter={submitCalc}
            />
            <NumberField
              id="sp-calc-rp"
              label="R₁R₂ ÷ (R₁ + R₂)"
              unit="Ω"
              placeholder="parallel, in theory"
              value={calc.rp}
              onChange={(rp) => setCalc((c) => ({ ...c, rp }))}
              onEnter={submitCalc}
            />
            <Button variant="contained" onClick={submitCalc}>
              Submit
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
  const id = tableConfigId(state);
  const spec = CONFIGS[id];
  const progress = state.cfg[id];
  const lcKnown = state.lc.A.ok && state.lc.V.ok;
  const cells = state.method === 'cells';
  const mean = progress.readings.length >= spec.readings ? meanResistance(progress) : null;

  // Under the manual's own method the table gains a CELLS column: it is the
  // independent variable, and one reading per cell count is the whole table.
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <EmergeChip tone={spec.hue} dot label={spec.label} />
        <Typography sx={{ fontSize: theme.band.type.min + 0.5, color: theme.brand.tert }}>
          {progress.readings.length}/{spec.readings} readings
        </Typography>
      </Box>
      <ObservationTable
        caption={
          <>
            Least counts — ammeter {lcKnown ? `${P.lcA} A` : '?'}, voltmeter {lcKnown ? `${P.lcV} V` : '?'}
          </>
        }
        columns={columns}
        rows={progress.readings.map((r, i) => [
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
        expectedRows={spec.readings}
        summary={
          mean !== null
            ? [`Mean V/I = ${spec.short}`, ...(cells ? [''] : []), '', '', <strong key="m">{mean.toFixed(2)}</strong>, '']
            : undefined
        }
      />
      <Typography sx={{ mt: 1.5, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert }}>
        A reading scores full marks when both meters are read within one least count.{' '}
        {cells
          ? 'One reading per cell count: one cell, then two, then three.'
          : 'Spread your three readings out — bigger deflections are easier to read accurately.'}
      </Typography>
    </>
  );
}

/** All four circuits side by side: the point of the practical, in one table. */
function ComparePanel({ state }: { state: LabState }): React.ReactElement {
  const theme = useTheme();
  const rows = CONFIG_IDS.map((id) => {
    const spec = CONFIGS[id];
    const progress = state.cfg[id];
    const done = progress.readings.length >= spec.readings;
    return { spec, progress, done, mean: done ? meanResistance(progress) : null };
  });

  return (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '7px 12px', alignItems: 'center' }}>
        {rows.map(({ spec, progress, mean }) => (
          <React.Fragment key={spec.id}>
            <Box
              aria-hidden="true"
              sx={{ width: 10, height: 10, borderRadius: '3px', backgroundColor: theme.hues[spec.hue] }}
            />
            <Typography sx={{ fontSize: theme.band.type.base - 1, color: theme.brand.text }}>
              {spec.label}
              <Box component="span" sx={{ color: theme.brand.tert }}>
                {' · '}
                {progress.readings.length}/{spec.readings} readings
              </Box>
            </Typography>
            <Typography
              sx={{
                fontSize: theme.band.type.base - 1,
                fontVariantNumeric: 'tabular-nums',
                fontWeight: mean === null ? 400 : 700,
                color: mean === null ? theme.brand.tert : theme.brand.ink,
                textAlign: 'right',
              }}
            >
              {mean === null ? '—' : `${spec.short} = ${mean.toFixed(2)} Ω`}
            </Typography>
          </React.Fragment>
        ))}
      </Box>

      {state.result ? (
        <Box sx={{ mt: 1.5, pt: 1.25, borderTop: `1px solid ${theme.brand.line}` }}>
          <Typography sx={{ fontSize: theme.band.type.base - 1, color: theme.brand.sub }}>
            <RichText
              text={
                `From your own R₁ and R₂: R₁ + R₂ = **${state.result.ts.toFixed(2)} Ω** · ` +
                `R₁R₂/(R₁ + R₂) = **${state.result.tp.toFixed(2)} Ω**\n` +
                `You measured Rs = **${state.result.ms.toFixed(2)} Ω** and Rp = **${state.result.mp.toFixed(2)} Ω**.\n` +
                `This bench’s resistors were ${state.R.r1} Ω and ${state.R.r2} Ω.`
              }
            />
          </Typography>
        </Box>
      ) : (
        <Typography sx={{ mt: 1.5, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert }}>
          Rs should come out larger than either resistor, and Rp smaller than both. Finish all four circuits and see.
        </Typography>
      )}
    </>
  );
}

function GraphPanel({ state }: { state: LabState }): React.ReactElement {
  const theme = useTheme();
  const series = CONFIG_IDS.map((id) => {
    const spec = CONFIGS[id];
    const progress = state.cfg[id];
    const done = progress.readings.length >= spec.readings;
    return {
      id,
      short: spec.short,
      colour: theme.hues[spec.hue],
      points: progress.readings.map((r) => ({ x: r.I, y: r.V })),
      meanR: done ? meanResistance(progress) : null,
    };
  });

  return (
    <>
      <CombinationGraph
        series={series}
        // A little past what the prescribed apparatus can reach, not the meters'
        // full scale: four honest lines should fill the sheet.
        xMax={GRAPH_MAX.I}
        yMax={GRAPH_MAX.V}
        ariaLabel="Graph of potential difference against current for all four circuits"
      />
      <Typography sx={{ mt: 1, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert }}>
        Steeper line, larger resistance. The series line is the steepest of the four and the parallel line the
        shallowest — before you calculate anything.
      </Typography>
    </>
  );
}

function TheoryPanel(): React.ReactElement {
  const theme = useTheme();
  const { meta } = seriesParallelEngine;
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
 * The two staircases, as SHARES of the emf rather than volts.
 *
 * Shapes, not measurements: they are set so the picture is true about which
 * drop dominates, while carrying no number a student could copy into the
 * observation table instead of reading their own meter. R₁ and R₂ are drawn
 * UNEQUAL on purpose — a student who saw them equal would take that for a fact
 * about the bench, and on this bench the two resistors are exactly what has to
 * be measured rather than assumed.
 *
 * The parallel pair is two paths over one set of steps because that is the
 * point of the drawing: both branches leave the same junction and arrive at the
 * same junction, so they fall through the same potentials however different
 * their currents are. Anything else would be drawing a lie for the sake of
 * having two visible lines.
 *
 * They live here rather than beside the prose because they are presentation.
 * The panel itself is a pure data module with no React in scope, so the two
 * sections that want a drawing name it — `figure: 'seriesLadder'` and
 * `figure: 'parallelLadder'` — and the wrapper below is where the names are
 * answered.
 */
const SERIES_LADDER: readonly LadderStep[] = [
  { label: 'cells', share: -1 },
  { label: 'inside|the cells', share: 0.04 },
  { label: 'ammeter', share: 0.02 },
  { label: 'R₁', share: 0.42 },
  { label: 'R₂', share: 0.3 },
  { label: 'control|and leads', share: 0.22 },
];

const PARALLEL_BRANCH: readonly LadderStep[] = [
  { label: 'cells', share: -1 },
  { label: 'inside|the cells', share: 0.04 },
  { label: 'ammeter', share: 0.02 },
  { label: 'the pair|either branch', share: 0.52 },
  { label: 'control|and leads', share: 0.42 },
];

/**
 * The panel is pure data and takes nothing at all — not even `revealed`, which
 * is why this wrapper ignores the props it is handed. There is no bench state
 * reaching `seriesParallelTeach()`, so there is none it could print: it cannot
 * read a needle, quote a mean or pass judgement on the wiring. The two drawings
 * are joined to it here, by the keys the sections name.
 */
function Teach(): React.ReactElement {
  return (
    <TeachSections
      sections={seriesParallelTeach()}
      figures={{
        seriesLadder: (
          <PotentialLadder
            paths={[{ steps: SERIES_LADDER }]}
            caption="Series: one road, so every step is in the same line."
            desc={
              'A staircase of potential taken once round the series circuit. The cells lift the charge from zero ' +
              'to the full emf; it steps down a little inside the cells, a little again across the ammeter, then ' +
              'across the first resistor and across the second — two separate steps, one after the other, the ' +
              'larger resistor taking the larger step — and a last step across the control and the leads, ' +
              'arriving back at zero.'
            }
          />
        ),
        parallelLadder: (
          <PotentialLadder
            paths={[
              { name: 'through R₁', steps: PARALLEL_BRANCH },
              { name: 'through R₂', steps: PARALLEL_BRANCH, dash: true },
            ]}
            caption="Parallel: two roads, one step — the branches lie on top of each other."
            desc={
              'The same staircase drawn for both parallel branches. The two lines coincide: each branch leaves ' +
              'the same junction and arrives at the same junction, so both fall through exactly the same ' +
              'potential, and the pair takes a single step between them rather than two steps one after the ' +
              'other. What differs between the branches is not drawn here at all, because it is not potential — ' +
              'it is how much of the current each one carries.'
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

function tabForStage(state: LabState): string {
  const type = stageOf(state)?.type;
  if (type === 'lc' || type === 'sand') return 'theory';
  if (type === 'calc' || type === undefined) return 'compare';
  return 'readings';
}

export const seriesParallelBench: BenchDefinition<LabState, LabAction> = {
  engine: seriesParallelEngine,
  ui: {
    Provider: BenchProvider,
    Stage,
    Controls,
    Task,
    Aside,
    showAside: (state) => asideMeter(state) !== null,
    // THE TEACHING LAYER. It explains the circuit: why each instrument goes
    // where it goes, why the current divides at a junction, and how each
    // equivalent resistance follows from that. It is given no props at all, so
    // it cannot read a needle, quote a mean or pass judgement on the wiring —
    // see `@labs/lib/series-parallel/teach.ts`. There is no `showTeach`: both
    // resistor boards are on the bench from the first step, and the panel is at
    // its most useful before the first wire is laid.
    Teach,
    tabs: [
      { id: 'readings', label: 'Readings', Panel: ReadingsPanel },
      { id: 'compare', label: 'Compare', Panel: ComparePanel },
      { id: 'graph', label: 'Graph', Panel: GraphPanel },
      { id: 'theory', label: 'Theory', Panel: TheoryPanel },
    ],
    tabForStep: tabForStage,
    tours: (ctx) => createSeriesParallelTours(ctx),
    // THE VISUAL TRAINER, per step of the procedure. A hook, passed by
    // reference so the workspace calls it as one: it reads the `teach` and
    // `hints` flags inside, and leaves the cards that name either layer OUT of
    // the script rather than skipping them when it runs.
    useTrainer: useSeriesParallelTrainer,
    highlightsFor: (step, state) => [...((step?.highlight ?? []) as readonly string[]), ...(state.hint?.pair ?? [])],
  },
};

/** Exported for the catalogue and for anything that needs the four circuits' order. */
export const SERIES_PARALLEL_CONFIG_IDS: readonly ConfigId[] = CONFIG_IDS;
