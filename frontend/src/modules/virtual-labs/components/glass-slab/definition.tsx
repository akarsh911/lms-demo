'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { ArrowLeftRight, Layers, Undo2 } from 'lucide-react';

import { TextbookPassage } from '@/components/textbook/textbook-passage';
import { ChoiceQuiz, EmergeChip, Metric, RichText } from '@/components/ui';
import { glassSlabEngine } from '@labs/lib/glass-slab/engine';
import { CONCL, STEP } from '@labs/lib/glass-slab/marking';
import {
  NG,
  RAD,
  angleFromReading,
  indexFrom,
  slabThicknessCm,
  type Trace,
} from '@labs/lib/glass-slab/optics';
import { conclusionAnswer, type GlassSlabAction } from '@labs/lib/glass-slab/reducer';
import { meanIndex } from '@labs/lib/glass-slab/score';
import {
  RAY_LIMIT,
  SLAB_CHOICES,
  currentTrial,
  joinedTrials,
  nextTrialIndex,
  phase,
  rayCrossingReading,
  revealPath,
  revealShiftCm,
  slabLocked,
  traceOfCurrent,
  traceOfTrial,
  trialDone,
  type AngleKey,
  type GlassSlabState,
} from '@labs/lib/glass-slab/state';
import type {
  BenchDefinition,
  BenchStageProps,
  BenchTeachProps,
  BenchViewProps,
} from '@labs/types/lab-bench';

import { apparatus } from '../apparatus-palette';
import { useLabFeature } from '../lab-features';
import { ObservationTable } from '../observation-table';

import { GlassSlabBench } from './bench';
import { ProtractorReader, SightingView } from './close-up';
import { RayDiagram } from './ray-diagram';
import { createGlassSlabTours } from './tours';
import { useGlassSlabTrainer } from './trainer';

type View = BenchViewProps<GlassSlabState, GlassSlabAction>;

/**
 * The glass slab bench: everything about this practical that is drawn.
 *
 * The engine decides what happens; the shared workspace draws the frame, the
 * step strip, the assistant, the notebook, the viva and the marks. What is
 * genuinely this practical's own is here: the drawing sheet, what is in the
 * student's hand, the one thing the current step asks for, the magnified
 * protractor and sighting view docked beside it, and the three notebook panels.
 */

const ANGLE_KEYS: readonly AngleKey[] = ['i', 'r', 'e'];

// ---------------------------------------------------------------------------
// The apparatus
// ---------------------------------------------------------------------------

function Stage({
  state,
  dispatch,
  now,
  onStageElement,
  highlights,
}: BenchStageProps<GlassSlabState, GlassSlabAction>): React.ReactElement {
  // Read here, where the apparatus is built: with `teach` off the light path,
  // the ray box and the magnified inset are never drawn at all, whatever the
  // bench's own `reveal` happens to say.
  const teach = useLabFeature('teach');
  return (
    <Box sx={{ flex: 1, minHeight: 240, display: 'flex', p: { xs: 0.5, sm: 1 }, backgroundColor: apparatus.bench }}>
      <GlassSlabBench
        state={state}
        teach={teach}
        pulse={highlights}
        onSvg={onStageElement}
        onPickTool={(tool) => dispatch({ type: 'pickUp', tool })}
        onPutDown={() => dispatch({ type: 'putDown' })}
        onAim={(at) => dispatch({ type: 'aim', at })}
        onUse={(at) => dispatch({ type: 'useTool', at, now: now() })}
        onAimProtractor={(at) => dispatch({ type: 'aimProtractor', at })}
        onNudgeProtractor={(by) => dispatch({ type: 'nudgeProtractor', by })}
        onCommitProtractor={() => dispatch({ type: 'commitProtractor', now: now() })}
        onAimRay={(deg) => dispatch({ type: 'aimRay', deg })}
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

const HELD_LINE: Readonly<Record<string, string>> = {
  slab: 'Holding the **glass slab** — press on the paper to set it down square',
  pin: 'Holding a **pin** — drag the crosshair where you want it, let go to stick it in',
  pencil: 'Holding the **pencil** — press on the slab to trace its outline, then on the upper face to mark O',
  protractor: 'Holding the **protractor** — press on O or O′ to lay its centre there',
  ruler: 'Holding the **ruler** — press on the paper to measure the lateral shift',
};

/**
 * What is in the student's hands, and which trace is on the board.
 *
 * The light path is NOT switched from here. It is the teaching layer, so its
 * one switch is the shared one on the bench bar below — an administrator who
 * turns `teach` off has to take it away, and a control this bar drew would
 * survive that.
 */
function Controls({ state, dispatch }: View): React.ReactElement {
  const theme = useTheme();
  const tr = currentTrial(state);
  // Two traces is the least that can be compared, so the button appears with
  // the second one. It is the student's OWN work laid over itself, not a
  // teaching aid, so it does not go when `teach` does.
  const joined = joinedTrials(state).length;

  return (
    <Box
      data-tour="slab-hands"
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
        <RichText
          text={
            state.held
              ? (HELD_LINE[state.held] ?? '')
              : 'Hands free — tap the slab, the pins, the pencil, the protractor or the ruler in the tray'
          }
        />
      </Box>
      <Box sx={{ flex: 1 }} />

      {state.trials.map((t, k) => (
        <Button
          key={t.k}
          size="small"
          variant={k === state.trial ? 'contained' : 'outlined'}
          onClick={() => dispatch({ type: 'selectTrial', k })}
          sx={
            k === state.trial
              ? { flex: 'none', backgroundColor: 'rgba(255,255,255,.16)', color: '#f2f5f4' }
              : BENCH_BUTTON
          }
        >
          {trialDone(t) ? `✓ ${t.target}°` : `${t.target}°`}
        </Button>
      ))}

      {joined >= 2 ? (
        <Button
          size="small"
          variant={state.showAll ? 'contained' : 'outlined'}
          aria-pressed={state.showAll}
          startIcon={<Layers size={14} />}
          onClick={() => dispatch({ type: 'showAll' })}
          sx={
            state.showAll
              ? { flex: 'none', backgroundColor: 'rgba(255,255,255,.16)', color: '#f2f5f4' }
              : BENCH_BUTTON
          }
        >
          {state.showAll ? 'Hide the comparison' : `Compare all ${joined} traces`}
        </Button>
      ) : null}

      <Button
        size="small"
        variant="outlined"
        startIcon={<Undo2 size={14} />}
        disabled={!tr.pins.length || tr.joined}
        onClick={() => dispatch({ type: 'pullPin' })}
        sx={BENCH_BUTTON}
      >
        Pull out the last pin
      </Button>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The teaching layer
// ---------------------------------------------------------------------------

/**
 * THE LIGHT PATH, LIVE: the instrument that goes with the beam on the sheet.
 *
 * WHY THESE NUMBERS ARE SAFE. Everything here describes the RAY BOX — an
 * independent ray the student aims for themselves, which no pin was ever stuck
 * for and which no mark depends on. The marks come from measuring their own
 * four-pin trace, so quoting this ray's ∠i, ∠r, ∠e and shift back at them hands
 * over nothing at all: it is the textbook worked out in front of them, on a ray
 * they chose. Wire any of it to `currentTrial(state)` instead and it becomes
 * the answer to the practical — so do not.
 *
 * The teaching is in the DRAWING: the real path, in the order the light travels
 * it, with the entry magnified because at bench scale the bend is a few pixels.
 * This is what the drawing adds up to, in numbers, as the box is swung.
 */
function Teach({ state, dispatch }: BenchTeachProps<GlassSlabState, GlassSlabAction>): React.ReactElement {
  const theme = useTheme();
  const path = revealPath(state);
  const deg = Math.round(Math.abs(state.rayA));
  const locked = slabLocked(state);
  const thickness = slabThicknessCm(state.slab);
  const si = path ? Math.sin(path.i * RAD) : 0;
  const sr = path ? Math.sin(path.r * RAD) : 0;
  const note = { fontSize: theme.band.type.min + 0.5, color: theme.brand.tert } as const;

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        <Metric label="∠i" value={`${(path?.i ?? 0).toFixed(1)}°`} />
        <Metric label="∠r" value={`${(path?.r ?? 0).toFixed(1)}°`} />
        <Metric label="∠e" value={`${(path?.e ?? 0).toFixed(1)}°`} />
        <Metric label="shift d" value={revealShiftCm(state).toFixed(2)} suffix="cm" />
        <Metric
          label="sin i ⁄ sin r"
          value={
            sr < 1e-6 ? (
              <Box component="span" sx={{ fontSize: theme.band.type.base - 1 }}>
                0 ⁄ 0 — undefined at normal incidence
              </Box>
            ) : (
              `${si.toFixed(3)} ⁄ ${sr.toFixed(3)} = ${(si / sr).toFixed(2)}`
            )
          }
        />
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mt: 1.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: '1 1 240px', minWidth: 180 }}>
          <Typography component="span" sx={{ ...note, flex: 'none' }}>
            Angle of incidence
          </Typography>
          <Slider
            size="small"
            aria-label="Angle of incidence of the ray box, in degrees from the normal"
            value={deg}
            min={0}
            max={RAY_LIMIT}
            step={1}
            onChange={(_e, value) =>
              dispatch({ type: 'aimRay', deg: (state.rayA < 0 ? -1 : 1) * (value as number) })
            }
            sx={{ flex: 1, minWidth: 96 }}
          />
          <Typography
            component="b"
            sx={{ flex: 'none', fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: theme.brand.ink }}
          >
            {deg}°
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          color="inherit"
          startIcon={<ArrowLeftRight size={14} />}
          onClick={() => dispatch({ type: 'aimRay', deg: -state.rayA || 0 })}
        >
          Other side
        </Button>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1.25 }}>
        <Typography component="span" sx={{ ...note, flex: 'none' }}>
          Slab thickness
        </Typography>
        {SLAB_CHOICES.map((cm) => (
          <Button
            key={cm}
            size="small"
            variant={Math.abs(thickness - cm) < 0.05 ? 'contained' : 'outlined'}
            color={Math.abs(thickness - cm) < 0.05 ? 'primary' : 'inherit'}
            disabled={locked}
            onClick={() => dispatch({ type: 'setSlabThickness', cm })}
          >
            {cm.toFixed(1)} cm
          </Button>
        ))}
        <Typography component="span" sx={note}>
          {locked ? 'locked — the outline is traced' : 'a thicker slab shifts the ray further'}
        </Typography>
      </Box>

      <Typography component="p" sx={{ mt: 1.25, fontSize: 'inherit' }}>
        <RichText
          text={
            (path && path.i < 0.6
              ? 'Straight down the normal: nothing bends, and **d = 0**. The one ray a slab leaves completely alone.'
              : '∠e has come back to ∠i, so the emergent ray is **parallel** to the incident ray — the slab shifts ' +
                'the light sideways by **d**, it does not turn it. Swing the ray box and watch **sin i / sin r** ' +
                `hold at **${NG.toFixed(2)}**: that ratio is the refractive index of the glass, and it belongs to ` +
                `the glass rather than to the angle you happened to choose. Slab thickness ${thickness.toFixed(1)} cm.`) +
            '\n\nNone of this is visible in a real lab, and none of it is marked. The **four pins** are how you find ' +
            'a ray you cannot see — and the ray box is not one of them: it is a ray of your own, not the one you ' +
            'pinned.'
          }
        />
      </Typography>
    </>
  );
}

// ---------------------------------------------------------------------------
// The magnified views, docked beside the task
// ---------------------------------------------------------------------------

function readerLabel(state: GlassSlabState): string {
  const tr = currentTrial(state);
  const aim = state.protAim;
  if (aim === null) return 'Turn the sight line with the arrow keys, or drag it across the scale.';
  const ang = angleFromReading(aim);
  if (!tr.joined) {
    return `Reading ${aim}° — that is ${ang}° from the normal, and this trace wants ${tr.target}°.`;
  }
  return `Reading ${aim}°, so ∠${state.pending ?? 'i'} = |90 − ${aim}| = ${ang}°.`;
}

function Aside({ state, maxWidth }: View & { maxWidth: number }): React.ReactElement | null {
  const tr = currentTrial(state);
  if (state.prot) {
    return (
      <ProtractorReader
        reading={state.protAim}
        rayReading={rayCrossingReading(state)}
        label={readerLabel(state)}
        maxWidth={maxWidth}
      />
    );
  }
  if (state.held === 'pin' && !tr.joined) {
    return (
      <SightingView
        trial={tr}
        slab={state.slab}
        aiming={tr.pins.length >= 2 ? state.cross : null}
        maxWidth={maxWidth}
      />
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// The current step, and its one input
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
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1.5 }}>{children}</Box>
  );
}

/** The acts inside one trace, as a checklist of chips. */
function Acts({ items }: { items: readonly [boolean, string][] }): React.ReactElement {
  return (
    <Fields>
      {items.map(([done, label]) => (
        <EmergeChip key={label} tone={done ? 'green' : 'grey'} dot label={label} />
      ))}
    </Fields>
  );
}

function SetupTask(): React.ReactElement {
  return (
    <>
      <SectionTitle>Fix the paper and the slab</SectionTitle>
      <Hint>
        <RichText
          text={
            'The sheet is already pinned to the board. Put the **glass slab** down on it, trace round it with the ' +
            '**pencil**, then mark the point of incidence **O** on the upper face and draw the **normal** through ' +
            'it. Trace the outline _before_ the pins go in — once the slab has been nudged, an outline drawn late ' +
            'is in the wrong place.'
          }
        />
      </Hint>
    </>
  );
}

function TrialTask({ state, dispatch, now }: View): React.ReactElement {
  const tr = currentTrial(state);
  const o = traceOfCurrent(state);
  const pins = tr.pins.length;
  const next = nextTrialIndex(state);

  if (!tr.joined) {
    return (
      <>
        <SectionTitle>
          Trial {tr.k + 1} — {tr.target}° incidence
        </SectionTitle>
        <Hint>
          {tr.drawn === null ? (
            <RichText
              text={`Lay the **protractor** on **O** and turn its sight line until the angle from the normal reads **${tr.target}°** — the normal is the 90° mark. Then draw the ray.`}
            />
          ) : (
            <RichText
              text={
                'Two pins on the ray you drew, then round to the far side: sight through the glass and put **P₃** ' +
                'and **P₄** where they line up with the images of the first two. The view beside this tells you how ' +
                'close you are — it never moves the pin for you.'
              }
            />
          )}
        </Hint>
        <Acts
          items={[
            [tr.drawn !== null, `Incident ray at ${tr.target}°`],
            [pins >= 2, `P₁ and P₂ on the ray (${Math.min(pins, 2)}/2)`],
            [pins >= 4, `P₃ and P₄ in line with the images (${Math.max(0, pins - 2)}/2)`],
          ]}
        />
        <Fields>
          {tr.drawn === null ? (
            <Button
              variant="contained"
              disabled={!state.prot || state.protAim === null}
              onClick={() => dispatch({ type: 'commitProtractor', now: now() })}
            >
              Draw the ray
            </Button>
          ) : (
            <Button
              variant="contained"
              disabled={pins < 4}
              onClick={() => dispatch({ type: 'join', now: now() })}
            >
              Lift the slab off and join the points
            </Button>
          )}
          {tr.drawn !== null && pins > 0 ? (
            <Button variant="outlined" color="inherit" onClick={() => dispatch({ type: 'pullPin' })}>
              Pull out the last pin
            </Button>
          ) : null}
        </Fields>
      </>
    );
  }

  return (
    <>
      <SectionTitle>
        Trial {tr.k + 1} — read the angles
      </SectionTitle>
      <Hint>
        <RichText
          text={
            'Pick the angle, lay the **protractor** on its point, and set the sight line where the ray crosses the ' +
            'scale. The angle from the normal is **90° minus the reading**.' +
            (tr.lat === null ? ' The **ruler** gives you the lateral displacement.' : '')
          }
        />
      </Hint>
      <Fields>
        {ANGLE_KEYS.map((key) => (
          <Button
            key={key}
            size="small"
            variant={state.pending === key ? 'contained' : 'outlined'}
            color={state.pending === key ? 'primary' : 'inherit'}
            onClick={() => dispatch({ type: 'measure', which: key })}
          >
            ∠{key}
            {tr.meas[key] !== null ? ` = ${tr.meas[key]}°` : ''}
          </Button>
        ))}
        <Button
          variant="contained"
          disabled={!state.prot || state.protAim === null}
          onClick={() => dispatch({ type: 'commitProtractor', now: now() })}
        >
          Write it down
        </Button>
      </Fields>
      <Fields>
        <EmergeChip
          tone={tr.lat === null ? 'grey' : 'green'}
          dot
          label={tr.lat === null ? 'Lateral shift not measured' : `Lateral shift ${tr.lat.toFixed(1)} cm`}
        />
        {o.ang ? (
          <EmergeChip
            tone="blue"
            label={`your trace: ∠i ${o.ang.i.toFixed(0)}° · ∠r ${o.ang.r.toFixed(0)}° · ∠e ${o.ang.e.toFixed(0)}°`}
          />
        ) : null}
        {trialDone(tr) && next >= 0 ? (
          <Button variant="contained" onClick={() => dispatch({ type: 'selectTrial', k: next })}>
            Put the slab back and trace at {state.trials[next]?.target ?? 0}°
          </Button>
        ) : null}
      </Fields>
    </>
  );
}

function ConclusionsTask({ state, dispatch, now }: View): React.ReactElement {
  return (
    <>
      <SectionTitle>What the three traces show</SectionTitle>
      <Hint>
        <RichText text="Read your **own** observation table below before you answer — the first statement is marked against your rows, not the textbook’s." />
      </Hint>
      <Box sx={{ mt: 1.5 }}>
        <ChoiceQuiz
          idPrefix="glass-slab-concl"
          questions={CONCL.map((c, i) => ({
            q: c.q,
            options: c.o,
            answer: conclusionAnswer(state, i),
            why: state.concl[i]?.why ?? c.why,
          }))}
          picks={state.concl.map((c) => (c ? c.pick : null))}
          onPick={(question, option) => dispatch({ type: 'answerConclusion', question, option, now: now() })}
        />
      </Box>
    </>
  );
}

function Task(view: View): React.ReactElement {
  switch (phase(view.state)) {
    case 'setup':
      return <SetupTask />;
    case 'trial':
      return <TrialTask {...view} />;
    default:
      // The viva takes the whole console, so the workspace never asks for it here.
      return <ConclusionsTask {...view} />;
  }
}

// ---------------------------------------------------------------------------
// The notebook
// ---------------------------------------------------------------------------

function ObservationsPanel({ state }: { state: GlassSlabState }): React.ReactElement {
  const theme = useTheme();
  const n = meanIndex(state);
  const dash = (
    <Box component="span" sx={{ color: theme.brand.tert }}>
      —
    </Box>
  );

  return (
    <>
      <ObservationTable
        caption={
          state.done
            ? 'Your readings, against the angles your own trace makes'
            : `Fills in as you measure · slab ${slabThicknessCm(state.slab).toFixed(1)} cm thick`
        }
        columns={[
          { label: 'Trial' },
          { label: '∠i' },
          { label: '∠r' },
          { label: '∠e' },
          { label: 'sin i / sin r' },
          { label: 'd (cm)' },
        ]}
        rows={state.trials.map((t, k) => {
          const ang = t.joined ? traceOfTrial(state, k).ang : null;
          const cell = (key: AngleKey): React.ReactNode => {
            const wrote = t.meas[key];
            if (wrote === null) return dash;
            const off = ang ? Math.abs(wrote - ang[key]) : 0;
            return (
              <>
                {wrote}°
                {state.done && ang && off > 2 ? (
                  <Box component="span" sx={{ color: theme.brand.tert }}> ({ang[key].toFixed(0)}°)</Box>
                ) : null}
              </>
            );
          };
          return [
            t.target + '°',
            cell('i'),
            cell('r'),
            cell('e'),
            t.meas.i !== null && t.meas.r ? indexFrom(t.meas.i, t.meas.r).toFixed(2) : dash,
            t.lat !== null ? t.lat.toFixed(1) : dash,
          ];
        })}
        summary={['Mean', '', '', '', <strong key="n">{n === null ? '—' : n.toFixed(2)}</strong>, '']}
      />
      <Typography sx={{ mt: 1.5, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert, textWrap: 'pretty' }}>
        A protractor reads to 1°, so an angle within 2° of your own trace earns all 3 marks. ∠e should come back
        equal to ∠i, and sin i / sin r near 1.50.
      </Typography>
    </>
  );
}

function DiagramPanel({ state }: { state: GlassSlabState }): React.ReactElement {
  const theme = useTheme();
  const tr = currentTrial(state);
  const o: Trace = traceOfCurrent(state);
  const n = o.ang && o.ang.r > 0 ? indexFrom(o.ang.i, o.ang.r) : null;

  if (!tr.joined) {
    return (
      <>
        <SightingView trial={tr} slab={state.slab} aiming={state.held === 'pin' ? state.cross : null} />
        <Typography sx={{ mt: 1, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert, textWrap: 'pretty' }}>
          P₁ and P₂ are seen through the glass along the emergent ray, so their images sit on the dashed line. Put
          the next pin on that line and all four will look like one straight line.
        </Typography>
      </>
    );
  }

  return (
    <RayDiagram
      ang={o.ang}
      side={o.inc ? (o.inc.d.x >= 0 ? 1 : -1) : 1}
      caption={
        <>
          Trial {tr.k + 1} · {tr.target}° · from your own trace: ∠i {o.ang?.i.toFixed(1)}°, ∠r {o.ang?.r.toFixed(1)}°,
          ∠e {o.ang?.e.toFixed(1)}°{n === null ? '' : `, so sin i / sin r = ${n.toFixed(2)}`}
          {tr.lat === null ? '' : `, shift d = ${tr.lat.toFixed(1)} cm`}.
        </>
      }
    />
  );
}

function TheoryPanel(): React.ReactElement {
  const theme = useTheme();
  const { meta } = glassSlabEngine;
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

export const glassSlabBench: BenchDefinition<GlassSlabState, GlassSlabAction> = {
  engine: glassSlabEngine,
  ui: {
    Stage,
    Controls,
    Task,
    Aside,
    // The magnified views earn their space exactly while something is being
    // read off them: the protractor's scale, or the line of sight.
    showAside: (state) => state.prot !== null || (state.held === 'pin' && !currentTrial(state).joined),
    // THE TEACHING LAYER. On this bench it is the light path itself, so the
    // bench's own `reveal` is the switch and the workspace drives it: one
    // control, and the drawing on the sheet can never disagree with it.
    Teach,
    // Both words spelled out: the reference's own switch reads
    // "Reveal the light path" / "Hide the light path".
    teachLabel: { show: 'Reveal the light path', hide: 'Hide the light path' },
    teachOpen: (state) => state.reveal,
    teachToggle: (on) => ({ type: 'reveal', on }),
    // Readouts and a slider, not prose: it measures the ray it is drawing, so
    // it stays beside the apparatus. See `teachIsInstrument`.
    teachIsInstrument: true,
    tabs: [
      { id: 'observations', label: 'Observations', Panel: ObservationsPanel },
      { id: 'diagram', label: 'Ray diagram', Panel: DiagramPanel },
      { id: 'theory', label: 'Theory', Panel: TheoryPanel },
    ],
    tabForStep: (state) => {
      const step = glassSlabEngine.step(state);
      if (step >= STEP.conclusions) return 'observations';
      if (step === STEP.setup) return 'theory';
      return 'diagram';
    },
    tours: (ctx) => createGlassSlabTours(ctx),
    // Passed by reference, not wrapped: it reads the `teach` flag as it builds
    // the set, so it is a hook and has to be called as one — by the workspace,
    // in the workspace's own render.
    useTrainer: useGlassSlabTrainer,
    highlightsFor: (step) => step?.highlight ?? [],
  },
};
