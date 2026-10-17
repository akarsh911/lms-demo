'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { TextbookPassage } from '@/components/textbook/textbook-passage';
import { EmergeChip, NumberField } from '@/components/ui';
import { focalLengthEngine } from '@labs/lib/focal-length/engine';
import { CONCLUSIONS, STEP, TRIALS } from '@labs/lib/focal-length/marking';
import {
  OBJECTS,
  OBJECT_IDS,
  OPT,
  cm1,
  cm2,
  meanOf,
  opticsOf,
  screenView,
  setupFor,
  type ObjectId,
  type PartId,
} from '@labs/lib/focal-length/optics';
import { partOfStep, type FocalLengthAction } from '@labs/lib/focal-length/reducer';
import { benchLive, type FocalLengthState } from '@labs/lib/focal-length/state';
import { focalLengthTeach } from '@labs/lib/focal-length/teach';
import type { BenchDefinition, BenchStageProps, BenchViewProps } from '@labs/types/lab-bench';

import { apparatus } from '../apparatus-palette';
import { useLabFeature } from '../lab-features';
import { ObservationTable } from '../observation-table';
import { TeachSections } from '../teach-sections';

import { OpticalBench } from './bench';
import { BenchCloseUp } from './close-up';
import { RayDiagram } from './ray-diagram';
import { createFocalLengthTours } from './tours';
import { useFocalLengthTrainer } from './trainer';

type View = BenchViewProps<FocalLengthState, FocalLengthAction>;

/**
 * Focal length from a distant object: everything about this practical that is
 * drawn.
 *
 * The engine beside it decides what happens; the shared workspace draws the
 * frame, the strip, the assistant, the notebook, the viva and the marks. What
 * is left here is the apparatus, the controls on it, the one input the current
 * step asks for, and the three notebook panels.
 */

/** The live optics of whatever is on the bench, for both halves of the screen. */
function useOptics(state: FocalLengthState) {
  return React.useMemo(() => {
    const setup = setupFor(state.part, state);
    const optics = opticsOf(setup);
    const view = screenView(setup, state.pos[state.part].scr);
    return { setup, optics, view };
  }, [state]);
}

const opticName = (part: PartId): string => (part === 'mirror' ? 'Concave mirror' : 'Convex lens');
const opticWord = (part: PartId): string => (part === 'mirror' ? 'mirror' : 'lens');

// ---------------------------------------------------------------------------
// The apparatus
// ---------------------------------------------------------------------------

function Stage({
  state,
  dispatch,
  now,
  onStageElement,
  highlights,
}: BenchStageProps<FocalLengthState, FocalLengthAction>): React.ReactElement {
  const { setup, optics, view } = useOptics(state);
  const live = benchLive(state);
  /**
   * The drawn rays are the teaching layer, so an administrator who has turned
   * `teach` off must not get them — and `state.rays` starts ON, which on its
   * own would leave them drawn with no switch anywhere to take them away. The
   * flag is the outer gate and the student's switch the inner one; with the
   * flag off the state is never consulted and the layer is never built.
   */
  const teach = useLabFeature('teach');

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 220,
        display: 'flex',
        p: { xs: 0.5, sm: 1 },
        backgroundColor: apparatus.bench,
      }}
    >
      <OpticalBench
        fill
        part={state.part}
        mounted={state.mounted}
        comp={state.pos[state.part].comp}
        scr={state.pos[state.part].scr}
        sel={state.sel}
        setup={setup}
        optics={optics}
        view={view}
        live={live}
        canMount={state.step === STEP.setupL && state.mounted === 'mirror'}
        rays={teach && state.rays}
        pulse={highlights}
        onSvg={onStageElement}
        onSelect={(stand) => dispatch({ type: 'selectStand', stand })}
        onDrag={(stand, cm) => dispatch({ type: 'dragStand', stand, cm, now: now() })}
        onNudge={(_stand, delta) => dispatch({ type: 'nudge', delta, now: now() })}
        onMount={() => dispatch({ type: 'mountLens', now: now() })}
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

/** Which stand the hand is on, and the pushes it can give it. */
function Controls({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const live = benchLive(state);
  const held = state.sel === 'comp' ? opticWord(state.mounted) : 'screen';
  const pushes: readonly { delta: number; label: string; aria: string }[] = [
    { delta: -1, label: '1 cm', aria: 'Move 1 centimetre towards 0' },
    { delta: -OPT.lc, label: '1 mm', aria: 'Move 1 millimetre towards 0' },
    { delta: OPT.lc, label: '1 mm', aria: 'Move 1 millimetre towards 100' },
    { delta: 1, label: '1 cm', aria: 'Move 1 centimetre towards 100' },
  ];

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
      <Box component="span" role="status" sx={{ fontWeight: 600 }}>
        Holding the <b>{held}</b> stand
      </Box>
      <Box component="span" sx={{ opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>
        near {Math.round(state.pos[state.part][state.sel])} cm
      </Box>
      <Box sx={{ flex: 1 }} />
      {pushes.map((p, i) => (
        <Button
          key={p.aria}
          size="small"
          variant="outlined"
          disabled={!live}
          aria-label={p.aria}
          onClick={() => dispatch({ type: 'nudge', delta: p.delta, now: now() })}
          startIcon={p.delta < 0 ? <ChevronLeft size={14} /> : undefined}
          endIcon={p.delta > 0 ? <ChevronRight size={14} /> : undefined}
          sx={{ ...BENCH_BUTTON, ...(i === 2 ? { ml: 0.5 } : null) }}
        >
          {p.label}
        </Button>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The teaching layer
// ---------------------------------------------------------------------------

/**
 * WHAT THE DRAWN RAYS MEAN, beside the bench they are drawn on.
 *
 * The words are DATA now, in `@labs/lib/focal-length/teach.ts`, and that module's
 * own doc comment carries the reason: everything this practical marks is a
 * number the student takes off the apparatus themselves, so a panel that read
 * the state could hand one of them over. This wrapper is handed nothing and has
 * nothing to hand on — the sections are the same at every position of every
 * stand, on every bench seed, for the mirror and for the lens.
 *
 * It says what "in focus" IS. It does not say where this bench's focal plane
 * happens to be; the card says that, and finding it is the practical.
 */
function Teach(): React.ReactElement {
  return <TeachSections sections={focalLengthTeach()} />;
}

// ---------------------------------------------------------------------------
// The close-up, docked at the top of the console
// ---------------------------------------------------------------------------

/**
 * What the student LOOKS at, above the instruction and the boxes it is typed
 * into: the card magnified fifty-five times, and a magnifier over the metre
 * scale under whichever stand is selected.
 *
 * It sizes itself from the `maxWidth` the workspace hands it, which shrinks on
 * a short console, so the task, the tab strip and the notebook underneath keep
 * their share of the column instead of being pushed past the fold.
 */
function Aside({ state, dispatch, maxWidth }: View & { maxWidth: number }): React.ReactElement {
  const { setup, optics, view } = useOptics(state);
  return (
    <BenchCloseUp
      sel={state.sel}
      onSelect={(stand) => dispatch({ type: 'selectStand', stand })}
      componentLabel={opticName(state.mounted)}
      setup={setup}
      optics={optics}
      view={view}
      comp={state.pos[state.part].comp}
      scr={state.pos[state.part].scr}
      maxWidth={maxWidth}
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
        '& > .MuiFormControl-root': { flex: '1 1 130px', minWidth: 120 },
      }}
    >
      {children}
    </Box>
  );
}

/** The four things the optic could be aimed at, one of which is never allowed. */
function ObjectChoices({
  chosen,
  onChoose,
}: {
  chosen: ObjectId | null;
  onChoose: (id: ObjectId) => void;
}): React.ReactElement {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.25 }}>
      {OBJECT_IDS.map((id) => {
        const active = chosen === id;
        return (
          <ButtonBase
            key={id}
            aria-pressed={active}
            onClick={() => onChoose(id)}
            sx={{
              px: 1.5,
              height: theme.band.control.sm,
              borderRadius: '999px',
              border: `1px solid ${active ? theme.brand.orange : theme.brand.line2}`,
              backgroundColor: active ? theme.tints.orange : theme.brand.surface,
              color: active ? theme.brand.orange : theme.brand.ink,
              fontSize: theme.band.type.min + 1,
              fontWeight: 700,
            }}
          >
            {OBJECTS[id].label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function SetUpTask({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const part = partOfStep(state.step);
  const needsMount = state.step === STEP.setupL && state.mounted !== 'lens';
  const chosen = state.obj[part];
  const ready = chosen !== null && OBJECTS[chosen].far;

  if (needsMount) {
    return (
      <>
        <SectionTitle>Set up the convex lens</SectionTitle>
        <Hint>
          Take the mirror out of the stand and put the <b>convex lens</b> in its place — it is lying at the front of
          the bench.
        </Hint>
        <Fields>
          <Button variant="contained" onClick={() => dispatch({ type: 'mountLens', now: now() })}>
            Put the convex lens in the stand
          </Button>
        </Fields>
      </>
    );
  }

  return (
    <>
      <SectionTitle>Set up the {part === 'mirror' ? 'concave mirror' : 'convex lens'}</SectionTitle>
      <Hint>
        {part === 'mirror'
          ? 'The screen stands between the window and the mirror, clear of the beam.'
          : 'The screen stands behind the lens: light passes through and converges on the far side.'}{' '}
        Aim it at something <b>far away</b>, so the rays arrive parallel to the principal axis.
      </Hint>
      <ObjectChoices chosen={chosen} onChoose={(id) => dispatch({ type: 'chooseObject', id, now: now() })} />
      <Fields>
        <Button
          variant="contained"
          disabled={!ready}
          onClick={() => dispatch({ type: 'startFocusing', now: now() })}
        >
          Ready — start focusing
        </Button>
        <Typography sx={{ fontSize: theme.band.type.min + 0.5, color: theme.hues.red, flex: '1 1 140px' }}>
          <b>Safety.</b> Never look at the Sun through a lens or a mirror.
        </Typography>
      </Fields>
    </>
  );
}

function TrialTask({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const part = partOfStep(state.step);
  const { view } = useOptics(state);
  const [entry, setEntry] = React.useState({ comp: '', scr: '' });
  const n = state.trials[part].length;
  const word = opticWord(state.mounted);

  const record = (): void => {
    const before = state.trials[part].length;
    const next = dispatch({ type: 'record', comp: entry.comp, scr: entry.scr, now: now() });
    if (next.trials[part].length > before) setEntry({ comp: '', scr: '' });
  };

  const status = !view.lit ? (
    <EmergeChip tone="red" label="No image on the card" />
  ) : view.sharp ? (
    <EmergeChip tone="green" label="Sharp" />
  ) : view.blur <= OPT.okBlur ? (
    <EmergeChip tone="amber" label={`Nearly sharp — ${cm1(view.blur * 10)} mm`} />
  ) : (
    <EmergeChip tone="red" label={`Blurred — ${cm1(view.blur * 10)} mm`} />
  );

  return (
    <>
      <SectionTitle>
        {part === 'mirror' ? 'Concave mirror' : 'Convex lens'} — trial {Math.min(n + 1, TRIALS)} of {TRIALS}
      </SectionTitle>
      <Hint>
        Move the <b>screen</b> until the image is sharpest, then read both index marks off the magnified scale.
        Their difference is <b>f</b>. Arrow keys move the selected stand by 1 mm, Shift by 1 cm.
      </Hint>
      <Box sx={{ display: 'flex', gap: 0.75, mt: 1, flexWrap: 'wrap' }}>
        {status}
        <EmergeChip tone={n >= TRIALS ? 'green' : 'grey'} label={`${n}/${TRIALS} trials`} />
      </Box>
      <Fields>
        <NumberField
          id="fl-comp"
          label={`Position of ${word}`}
          unit="cm"
          placeholder="0.0"
          value={entry.comp}
          onChange={(comp) => setEntry((e) => ({ ...e, comp }))}
          onEnter={record}
        />
        <NumberField
          id="fl-scr"
          label="Position of screen"
          unit="cm"
          placeholder="0.0"
          value={entry.scr}
          onChange={(scr) => setEntry((e) => ({ ...e, scr }))}
          onEnter={record}
        />
        <Button variant="contained" onClick={record}>
          Record
        </Button>
      </Fields>
      <Typography sx={{ mt: 1, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert }}>
        Move the {word} at least {OPT.moveBetweenTrials} cm between trials and focus again.
      </Typography>
    </>
  );
}

function MeanTask({ state, dispatch, now }: View): React.ReactElement {
  const [entry, setEntry] = React.useState({ mirror: '', lens: '' });
  const submit = (): void => {
    dispatch({ type: 'submitMeans', mirror: entry.mirror, lens: entry.lens, now: now() });
  };
  const list = (part: PartId): string => state.trials[part].map((t) => cm2(t.f)).join(', ');

  return (
    <>
      <SectionTitle>Mean focal lengths</SectionTitle>
      <Hint>
        Your three values of f for each part are in the table. Work out the <b>mean</b> of each set — that is the
        result of the experiment.
      </Hint>
      <Fields>
        <NumberField
          id="fl-mean-mirror"
          label={`Mirror — from ${list('mirror')}`}
          unit="cm"
          placeholder="0.00"
          value={entry.mirror}
          onChange={(mirror) => setEntry((e) => ({ ...e, mirror }))}
          onEnter={submit}
        />
        <NumberField
          id="fl-mean-lens"
          label={`Lens — from ${list('lens')}`}
          unit="cm"
          placeholder="0.00"
          value={entry.lens}
          onChange={(lens) => setEntry((e) => ({ ...e, lens }))}
          onEnter={submit}
        />
        <Button variant="contained" onClick={submit}>
          Submit means
        </Button>
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
        Your results: concave mirror <b>f = {state.means.mirror === null ? '—' : cm2(state.means.mirror)} cm</b>,
        convex lens <b>f = {state.means.lens === null ? '—' : cm2(state.means.lens)} cm</b>. Which statement follows
        from <b>your</b> two means?
      </Hint>
      <Box role="radiogroup" aria-label="Conclusion" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 1.25 }}>
        {CONCLUSIONS.map((option, i) => (
          <ButtonBase
            key={option}
            role="radio"
            aria-checked={false}
            onClick={() => dispatch({ type: 'submitConclusion', pick: i, now: now() })}
            sx={{
              justifyContent: 'flex-start',
              textAlign: 'left',
              px: 1.5,
              py: 1,
              borderRadius: `${theme.band.radius.sm}px`,
              border: `1px solid ${theme.brand.line2}`,
              backgroundColor: theme.brand.surface,
              color: theme.brand.ink,
              fontSize: theme.band.type.base - 1,
              lineHeight: 1.4,
              '&:hover': { borderColor: theme.brand.orange },
            }}
          >
            {option}
          </ButtonBase>
        ))}
      </Box>
    </>
  );
}

function Task(props: View): React.ReactElement {
  switch (props.state.step) {
    case STEP.setupM:
    case STEP.setupL:
      return <SetUpTask {...props} />;
    case STEP.mirror:
    case STEP.lens:
      return <TrialTask {...props} />;
    case STEP.mean:
      return <MeanTask {...props} />;
    default:
      return <ConclusionTask {...props} />;
  }
}


// ---------------------------------------------------------------------------
// The notebook
// ---------------------------------------------------------------------------

function TrialsPanel({ state }: { state: FocalLengthState }): React.ReactElement {
  const theme = useTheme();
  const reveal = state.step > STEP.lens;

  const table = (part: PartId): React.ReactElement => {
    const rows = state.trials[part];
    const done = rows.length >= TRIALS;
    return (
      <ObservationTable
        caption={
          <>
            {part === 'mirror' ? '(i) Concave mirror' : '(ii) Convex lens'} — distant object, image on the screen
          </>
        }
        columns={[
          { label: 'Trial' },
          { label: `${part === 'mirror' ? 'Mirror' : 'Lens'} a (cm)` },
          { label: 'Screen b (cm)' },
          { label: 'f = |a − b|' },
          { label: 'Marks' },
        ]}
        rows={rows.map((t, i) => [
          i + 1,
          <Reading key="a" written={t.comp} actual={t.trueComp} reveal={reveal} />,
          <Reading key="b" written={t.scr} actual={t.trueScr} reveal={reveal} />,
          <strong key="f">{cm2(t.f)}</strong>,
          <EmergeChip
            key="pts"
            tone={t.pts === 8 ? 'green' : t.pts >= 4 ? 'amber' : 'red'}
            label={`${t.pts}/8`}
          />,
        ])}
        expectedRows={TRIALS}
        summary={
          done
            ? ['Mean f', '', '', <strong key="m">{cm2(meanOf(rows.map((t) => t.f)))}</strong>, '']
            : undefined
        }
      />
    );
  };

  return (
    <>
      {table('mirror')}
      {state.step >= STEP.setupL ? <Box sx={{ mt: 2 }}>{table('lens')}</Box> : null}
      <Typography sx={{ mt: 1.5, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert }}>
        {reveal
          ? 'The grey number beside each reading is where the stand actually stood.'
          : 'A trial scores full marks for a blur circle of 1 mm or less, with both positions read within one least count — 0.1 cm.'}
      </Typography>
    </>
  );
}

/** What the student wrote, and once it can no longer help them, what was true. */
function Reading({
  written,
  actual,
  reveal,
}: {
  written: number;
  actual: number;
  reveal: boolean;
}): React.ReactElement {
  const theme = useTheme();
  return (
    <>
      {cm2(written)}
      {reveal && Math.abs(written - actual) > OPT.lc + 1e-9 ? (
        <Box component="span" sx={{ color: theme.brand.tert }}>
          {' '}
          ({cm2(actual)})
        </Box>
      ) : null}
    </>
  );
}

function DiagramPanel({ state }: { state: FocalLengthState }): React.ReactElement {
  return <RayDiagram part={state.part} />;
}

function TheoryPanel(): React.ReactElement {
  const theme = useTheme();
  const { meta } = focalLengthEngine;
  return (
    <Box sx={{ fontSize: theme.band.type.base - 1, color: theme.brand.sub }}>
      <Typography component="p" sx={{ m: 0, fontSize: 'inherit' }}>
        <b>Aim.</b> {meta.aim}
      </Typography>
      <Typography component="p" sx={{ mt: 1, mb: 0, fontSize: 'inherit' }}>
        <b>Theory.</b> {meta.theory}
      </Typography>
      <Typography component="p" sx={{ mt: 1, mb: 0, fontSize: 'inherit', color: theme.hues.red }}>
        <b>Safety.</b> Never look at the Sun through a lens or a mirror, and never use it as the distant object. Use
        a distant tree or a window.
      </Typography>
      {/* What the drawn cones mean. It lives here rather than behind the Rays
          switch because that switch controls apparatus which is on by default,
          and a teaching panel bound to it would be open before it was asked
          for. It says what "in focus" IS, never where this bench's focal plane
          happens to be — finding that is the practical. */}
      <Box sx={{ mt: 1.25 }}>
        <Teach />
      </Box>
      <TextbookPassage scope={meta.textbook} query={meta.theoryQuery} topK={3} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The bench
// ---------------------------------------------------------------------------

/** A tour step names stands; the bench pulses whatever it is handed. */
const STAND_KEYS = new Set(['comp', 'scr', 'spare']);

export const focalLengthBench: BenchDefinition<FocalLengthState, FocalLengthAction> = {
  engine: focalLengthEngine,
  ui: {
    Stage,
    Controls,
    Task,
    Aside,
    // The close-up is the only way to judge focus or read the scale, so it is
    // docked for the whole of the measuring half and retires for the write-up,
    // when there is nothing left on the bench to look at.
    showAside: benchLive,
    // THE TEACHING LAYER. On this bench it is the drawn light itself, so the
    // bench's own `rays` is the switch and the workspace drives it: one
    // control, and the drawing cannot disagree with it. On by default — a
    // student hunting for a sharp image for the first time is helped by seeing
    // where the light goes — and the Stage refuses to build any of it when an
    // administrator has turned `teach` off.
    // No `Teach` panel here, deliberately. The rays are APPARATUS and they
    // default on, so a panel bound to this switch would be open on the first
    // paint — before the student has asked for anything. The reference has no
    // teaching card on this bench either: the drawn cone IS the explanation,
    // and the prose that would have gone here sits in the Theory tab.
    teachLabel: { show: 'Rays', hide: 'Hide the rays' },
    teachOpen: (state) => state.rays,
    teachToggle: (on) => ({ type: 'showRays', on }),
    tabs: [
      { id: 'trials', label: 'Trials', Panel: TrialsPanel },
      { id: 'diagram', label: 'Ray diagram', Panel: DiagramPanel },
      { id: 'theory', label: 'Theory', Panel: TheoryPanel },
    ],
    tabForStep: (state) =>
      state.step === STEP.setupM || state.step === STEP.setupL ? 'diagram' : 'trials',
    tours: (ctx) => createFocalLengthTours(ctx),
    // Passed by reference: it reads the `teach` flag as it builds the set, so
    // it is a hook and the workspace calls it as one, in its own render.
    useTrainer: useFocalLengthTrainer,
    tourNotice: (state) =>
      state.step === STEP.setupL && state.mounted !== 'lens'
        ? 'The **convex lens** is still lying on the bench — put it in the stand to carry on.'
        : null,
    highlightsFor: (step) => (step?.highlight ?? []).filter((h) => STAND_KEYS.has(h)),
  },
};
