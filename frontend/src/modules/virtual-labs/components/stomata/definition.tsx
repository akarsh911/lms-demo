'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { TextbookPassage } from '@/components/textbook/textbook-passage';
import { EmergeChip, NumberField, RichText, Segmented } from '@/components/ui';
import { stomataEngine } from '@labs/lib/stomata/engine';
import { LABEL_OPTS, OBS, PINS, STEP, labelName } from '@labs/lib/stomata/marking';
import { OBJ, coverage, liquidOn, sharpness } from '@labs/lib/stomata/peel';
import {
  recordReady,
  type MicCommand,
  type StomataAction,
} from '@labs/lib/stomata/reducer';
import type { StomataState, ToolId } from '@labs/lib/stomata/state';
import { TOOL_NAMES } from '@labs/lib/stomata/state';
import { stomataTeach } from '@labs/lib/stomata/teach';
import type { BenchDefinition, BenchStageProps, BenchTeachProps, BenchViewProps } from '@labs/types/lab-bench';

import { apparatus } from '../apparatus-palette';
import { benchMotionSx, motionSx, useBenchMotion } from '../bench-motion';
import { ObservationTable } from '../observation-table';
import { TeachSections } from '../teach-sections';

import { Bench } from './bench';
import { EYE, FieldOfView, fieldCaption } from './eyepiece';
import { LabelPlate } from './label-plate';
import { SlideCloseUp } from './slide-close-up';
import { createStomataTours } from './tours';
import { useStomataTrainer } from './trainer';

/**
 * The leaf-peel bench: everything about this practical that is drawn.
 *
 * The engine beside it decides what happens; the shared workspace draws the
 * frame, the strip, the assistant, the notebook, the viva and the marks. What
 * is left here is this practical's own: the apparatus, the step's one input,
 * and the three notebook panels.
 */

type View = BenchViewProps<StomataState, StomataAction>;

// ---------------------------------------------------------------------------
// Dispatch, shared with the notebook
// ---------------------------------------------------------------------------

/**
 * A notebook panel is handed only the state, and on this bench the notebook is
 * where half the marks are written: the observation table and the four labels.
 * The provider hands those panels the same dispatch the console uses.
 */
const Ctx = React.createContext<{ dispatch: (a: StomataAction) => StomataState; now: () => number } | null>(null);

function useBench(): { dispatch: (a: StomataAction) => StomataState; now: () => number } {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('The stomata notebook must be inside its provider.');
  return ctx;
}

function StomataProvider({ dispatch, now, children }: View & { children: React.ReactNode }): React.ReactElement {
  const value = React.useMemo(() => ({ dispatch, now }), [dispatch, now]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ---------------------------------------------------------------------------
// The apparatus
// ---------------------------------------------------------------------------

/** What tapping a part of the drawing means. The picture itself knows nothing. */
function actionFor(id: string, now: number): StomataAction | null {
  if (id.startsWith('tool:')) {
    const tool = id.slice(5);
    return tool === 'cover'
      ? { type: 'tapCover', now }
      : { type: 'pickTool', tool: tool as ToolId, now };
  }
  if (id.startsWith('mic:')) return { type: 'mic', cmd: id.slice(4) as MicCommand, now };
  switch (id) {
    case 'obj:flip':
      return { type: 'flipLeaf', now };
    case 'obj:leafBody':
      return { type: 'peelLeaf', where: 'body', now };
    case 'obj:leafFlap':
      return { type: 'peelLeaf', where: 'flap', now };
    case 'obj:dish':
      return { type: 'tapDish', now };
    case 'obj:slide':
      return { type: 'tapSlide', now };
    case 'obj:stage':
      return { type: 'tapStage', now };
    default:
      return null;
  }
}

function Stage({ state, dispatch, now, onStageElement, highlights }: BenchStageProps<StomataState, StomataAction>): React.ReactElement {
  return (
    <Box sx={{ flex: 1, minHeight: 240, display: 'flex', p: { xs: 0.5, sm: 1 }, backgroundColor: apparatus.bench }}>
      <Bench
        state={state}
        highlights={highlights}
        onSvg={onStageElement}
        onHot={(id) => {
          const action = actionFor(id, now());
          if (action) dispatch(action);
        }}
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

/** Under the bench: what is in your hand, and how to put it down. */
function Controls({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const held = state.held;
  const holding =
    !held
      ? 'Hands free — tap a tool to pick it up'
      : held.kind === 'peel'
        ? `Holding the peel in ${held.by === 'brush' ? 'the brush' : 'the forceps'} — float it in the water, or put it on the slide`
        : `Holding ${TOOL_NAMES[held.kind]}`;

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
        {holding}
      </Box>
      <Box sx={{ flex: 1 }} />
      <Button
        size="small"
        variant="outlined"
        disabled={!held}
        onClick={() => dispatch({ type: 'dropHeld', now: now() })}
        sx={BENCH_BUTTON}
      >
        Put down
      </Button>
      <Button
        size="small"
        variant="outlined"
        disabled={!state.slide.peel && !state.slide.cover}
        onClick={() => dispatch({ type: 'discardMount', now: now() })}
        sx={BENCH_BUTTON}
      >
        Discard the mount
      </Button>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The magnified eyepiece, docked beside the count
// ---------------------------------------------------------------------------

/**
 * The field of view, large, with the focus under it.
 *
 * On the bench the eyepiece is drawn ~250 units wide, where a stoma at 40× is
 * a few pixels and a student cannot honestly count what they cannot resolve.
 * Docking a magnified copy beside the entry box is the same answer the Ohm's
 * law bench gives its meters: the thing being read sits beside the box it is
 * read into, and it is live, not a snapshot.
 */
/**
 * THE FIELD, AS A CONTROL.
 *
 * Not a picture. Pressing a point in it drives the stage until that point sits
 * in the middle of the field — the same movement the four arrows on the
 * microscope make, in one go, and the way a mechanical stage is really driven:
 * you look at the thing you want and bring it to the middle. On a 0.38 mm
 * high-power field the arrows alone are a dozen presses, which is long enough
 * that students stop centring and start guessing.
 *
 * It is a real button in the tab order with a name that says what it does, and
 * the arrow keys pan it a step at a time, so none of that is mouse-only.
 */
function EyepieceField({
  state,
  dispatch,
  now,
}: View): React.ReactElement {
  const theme = useTheme();
  const mic = state.mic;
  const moving = useBenchMotion();
  /** Millimetres on the slide per SVG unit in this drawing. */
  const perUnit = OBJ[mic.obj].fieldR / EYE.r;

  const centreOn = (e: React.MouseEvent<SVGSVGElement>): void => {
    const box = e.currentTarget.getBoundingClientRect();
    if (!box.width) return;
    const k = EYE.size / box.width;
    const ux = (e.clientX - box.left) * k;
    const uy = (e.clientY - box.top) * k;
    if (Math.hypot(ux - EYE.cx, uy - EYE.cy) > EYE.r) return;
    dispatch({
      type: 'bringToCentre',
      dx: (ux - EYE.cx) * perUnit,
      dy: (uy - EYE.cy) * perUnit,
      now: now(),
    });
  };

  const ARROWS: Readonly<Record<string, MicCommand>> = {
    ArrowUp: 'panU',
    ArrowDown: 'panD',
    ArrowLeft: 'panL',
    ArrowRight: 'panR',
  };

  return (
    <Box
      sx={{
        borderRadius: `${theme.band.radius.md}px`,
        backgroundColor: apparatus.bench,
        p: 1,
        '& svg': { cursor: 'crosshair', outline: 'none', borderRadius: '999px' },
        '& svg:focus-visible': { outline: `3px solid ${apparatus.hintRing}`, outlineOffset: 2 },
        // The magnified copy of the field is the same drawing as the one on the
        // microscope, so it rides the same way and settles the same way.
        ...benchMotionSx,
        ...motionSx(moving),
      }}
    >
      <svg
        viewBox={`0 0 ${EYE.size} ${EYE.size}`}
        role="button"
        tabIndex={0}
        aria-label={`The field of view at ${OBJ[mic.obj].name}, ${(OBJ[mic.obj].fieldR * 2).toFixed(2)} millimetres across — press a point to bring it to the centre of the field, or use the arrow keys to move the stage`}
        onClick={centreOn}
        onKeyDown={(e) => {
          const cmd = ARROWS[e.key];
          if (!cmd) return;
          e.preventDefault();
          dispatch({ type: 'mic', cmd, now: now() });
        }}
        style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'manipulation' }}
      >
        <FieldOfView slide={state.slide} mic={mic} />
      </svg>
    </Box>
  );
}

/**
 * Docked beside the box the count is typed into: the field of view, magnified,
 * and the slide it is a window onto.
 *
 * On the bench the eyepiece is drawn ~250 units wide, where a stoma at 40× is a
 * few pixels and a student cannot honestly count what they cannot resolve — so
 * a magnified copy sits beside the entry box, live, the same answer the Ohm's
 * law bench gives its meters.
 *
 * Beside it, THE SLIDE FROM ABOVE. Before the slide goes on the stage that is
 * the whole panel — the plan view and the section strip are where a mount is
 * judged, and the section is the only drawing in which a coverslip lowered on a
 * needle and one dropped flat are different pictures. Once it is on the stage
 * the eyepiece takes the column and the plan view shrinks into the corner, where
 * its job is the one thing the eyepiece cannot show: **where** on the slide the
 * field is sitting.
 */
function Aside({ state, dispatch, now, maxWidth }: View & { maxWidth: number }): React.ReactElement | null {
  const theme = useTheme();
  const mic = state.mic;
  const view = { state, dispatch, now };
  const step = (cmd: MicCommand): void => {
    dispatch({ type: 'mic', cmd, now: now() });
  };

  if (!state.slide.onStage) {
    return <SlideCloseUp slide={state.slide} mic={mic} maxWidth={maxWidth} />;
  }

  return (
    <Box data-tour="st-eyepiece" sx={{ maxWidth, mx: 'auto', width: '100%' }}>
      <EyepieceField {...view} />

      <Typography sx={{ mt: 0.75, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert, textAlign: 'center' }}>
        {fieldCaption(mic)}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 1 }}>
        <Box sx={{ flex: '0 0 44%', minWidth: 0 }}>
          <SlideCloseUp slide={state.slide} mic={mic} compact />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 0.75, justifyContent: 'center' }}>
          <Segmented
            ariaLabel="Objective"
            value={String(mic.obj) as '10' | '40'}
            onChange={(v) => step(v === '40' ? 'obj40' : 'obj10')}
            options={[
              { value: '10', label: '10×' },
              { value: '40', label: '40×' },
            ]}
          />
          <Box sx={{ display: 'inline-flex', gap: 0.5 }}>
            <Button size="small" variant="outlined" color="inherit" onClick={() => step('fineUp')}>
              Fine ▲
            </Button>
            <Button size="small" variant="outlined" color="inherit" onClick={() => step('fineDown')}>
              Fine ▼
            </Button>
          </Box>
        </Box>
      </Box>

      <Typography sx={{ mt: 0.75, fontSize: theme.band.type.min, color: theme.brand.tert, textWrap: 'pretty' }}>
        Press a point in the field to bring it to the middle.{' '}
        {mic.obj === 40
          ? 'Fine adjustment only at 40×: the coarse knob is on the bench, and there is less than half a turn in it.'
          : 'The coarse knob is on the microscope.'}
      </Typography>
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
        '& > .MuiFormControl-root': { flex: '1 1 140px', minWidth: 130 },
      }}
    >
      {children}
    </Box>
  );
}

/** The mount as it stands, in one row of chips. */
function MountChips({ state }: { state: StomataState }): React.ReactElement {
  const sl = state.slide;
  const chips: React.ReactNode[] = [];
  if (sl.peel) {
    chips.push(
      <EmergeChip
        key="peel"
        tone={sl.peel.thick ? 'red' : sl.peel.torn ? 'amber' : 'green'}
        label={`${sl.peel.thick ? 'several cells thick' : sl.peel.torn ? 'torn scrap' : 'thin peel'} of ${sl.peel.surface} epidermis`}
      />,
    );
  } else {
    chips.push(<EmergeChip key="peel" tone="grey" label="no peel on the slide" />);
  }
  chips.push(
    <EmergeChip
      key="stain"
      tone={sl.stain === 0 ? 'amber' : sl.stain >= 4 ? 'red' : 'green'}
      label={sl.stain === 0 ? 'unstained' : `${sl.stain} drop${sl.stain > 1 ? 's' : ''} of safranin`}
    />,
  );
  if (sl.cover) {
    chips.push(
      <EmergeChip key="cover" tone={sl.cover.angle ? 'green' : 'red'} label={sl.cover.angle ? 'coverslip at an angle' : 'coverslip dropped flat'} />,
      <EmergeChip key="bub" tone={sl.bubbles.length ? 'red' : 'green'} label={sl.bubbles.length ? `${sl.bubbles.length} air bubbles` : 'no bubbles'} />,
      <EmergeChip key="blot" tone={sl.blotted ? 'green' : 'amber'} label={sl.blotted ? 'blotted' : 'not blotted'} />,
    );
  } else if (liquidOn(sl) >= 4) {
    chips.push(<EmergeChip key="flood" tone="amber" label="flooded — the coverslip will float" />);
  }
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.25 }}>{chips}</Box>;
}

function FocusChips({ state }: { state: StomataState }): React.ReactElement {
  const sh = sharpness(state);
  const cov = coverage(state);
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.25 }}>
      <EmergeChip tone={sh > 0.8 ? 'green' : sh > 0.45 ? 'amber' : 'red'} label={`image ${sh > 0.8 ? 'sharp' : sh > 0.45 ? 'soft' : 'out of focus'}`} />
      <EmergeChip tone={cov >= 0.95 ? 'green' : cov > 0.3 ? 'amber' : 'red'} label={`field ${Math.round(cov * 100)}% peel`} />
      <EmergeChip tone={state.mic.foundLow ? 'green' : 'grey'} label={state.mic.foundLow ? 'found on 10×' : 'not yet found on 10×'} />
      <EmergeChip tone={state.mic.centredLow ? 'green' : 'grey'} label={state.mic.centredLow ? 'centred on 10×' : 'not centred'} />
      {state.slide.broken ? <EmergeChip tone="red" label="the slide is cracked" /> : null}
    </Box>
  );
}

function ChoiceRow({
  value,
  options,
  onPick,
  ariaLabel,
}: {
  value: string;
  options: readonly string[];
  onPick: (v: string) => void;
  ariaLabel: string;
}): React.ReactElement {
  return (
    <Box role="radiogroup" aria-label={ariaLabel} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
      {options.map((o) => (
        <Button
          key={o}
          size="small"
          role="radio"
          aria-checked={value === o}
          variant={value === o ? 'contained' : 'outlined'}
          color={value === o ? 'primary' : 'inherit'}
          onClick={() => onPick(o)}
        >
          {o}
        </Button>
      ))}
    </Box>
  );
}

function Task({ state, dispatch, now }: View): React.ReactElement {
  const filled = OBS.filter((o) => state.rec[o.id]).length;
  const labelled = PINS.filter((p) => state.labels[p]).length;

  const putOnStage = (): void => {
    const at = now();
    dispatch({ type: 'dropHeld', now: at });
    dispatch({ type: 'tapSlide', now: at });
    dispatch({ type: 'tapStage', now: at });
  };

  switch (state.step) {
    case STEP.peel:
      return (
        <>
          <SectionTitle>Peel the epidermis</SectionTitle>
          <Hint>
            <RichText text="The leaf has been folded and snapped: a **thin transparent flap** of epidermis is hanging off the torn edge. Pick up the **forceps** and pull that flap away — not the green lamina, which is the whole leaf and far too thick to see through." />
          </Hint>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.25 }}>
            <EmergeChip
              tone={state.faceUp === 'lower' ? 'green' : 'amber'}
              label={`${state.faceUp} surface up`}
            />
            <EmergeChip tone="grey" label="on a dicot leaf the lower epidermis carries the stomata" />
          </Box>
        </>
      );

    case STEP.mount:
      return (
        <>
          <SectionTitle>Mount the peel</SectionTitle>
          <Hint>
            <RichText text="Order matters: a drop of **water** on the clean slide, the peel into the drop with the **brush**, a drop of **safranin**, then the **coverslip** — hold it on the **needle** and let one edge touch first. Blot the excess afterwards." />
          </Hint>
          <MountChips state={state} />
        </>
      );

    case STEP.check:
      return (
        <>
          <SectionTitle>Check the mount</SectionTitle>
          <Hint>
            Before it goes anywhere near the microscope, look at it.{' '}
            {state.slide.bubbles.length
              ? `There are ${state.slide.bubbles.length} bubbles under the coverslip; anything beneath one of them is hidden.`
              : 'It looks clean.'}
            {state.slide.peel?.thick ? ' The piece is several cells thick — it will never come into focus.' : ''}
          </Hint>
          <MountChips state={state} />
          <Fields>
            <Button variant="contained" onClick={putOnStage}>
              Put it on the stage
            </Button>
          </Fields>
        </>
      );

    case STEP.low:
    case STEP.high:
      return (
        <>
          <SectionTitle>{state.step === STEP.low ? 'Find it on low power' : 'High power'}</SectionTitle>
          <Hint>
            <RichText
              text={
                state.step === STEP.low
                  ? 'Always start at **10×**. Rack the stage up with the **coarse** knob until the peel appears, then move the stage until the peel fills the field. Only then swing the 40× round.'
                  : 'At **40×** the field is a quarter as wide and the depth of focus five times shallower. Touch the **fine** knob only.'
              }
            />
          </Hint>
          <FocusChips state={state} />
          <Fields>
            <Button variant="outlined" color="inherit" onClick={() => dispatch({ type: 'goRecord', now: now() })}>
              Record what I can see
            </Button>
          </Fields>
        </>
      );

    case STEP.record:
      return (
        <>
          <SectionTitle>Record and label</SectionTitle>
          <Hint>
            <RichText text="Write down what **this** field of view shows — not what the textbook says it should. Count the stomata you can actually see in it, and name the four pinned parts on the drawing." />
          </Hint>
          <Fields>
            <NumberField
              id="stomata-count"
              label="Stomata in this field"
              value={state.count}
              placeholder="0"
              onChange={(count) => dispatch({ type: 'setCount', count })}
              onEnter={() => dispatch({ type: 'submitObs', now: now() })}
            />
            <Button variant="contained" disabled={!recordReady(state)} onClick={() => dispatch({ type: 'submitObs', now: now() })}>
              Submit observations
            </Button>
          </Fields>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.25 }}>
            <EmergeChip tone={filled === OBS.length ? 'green' : 'grey'} label={`${filled}/${OBS.length} lines in the table`} />
            <EmergeChip tone={labelled === PINS.length ? 'green' : 'grey'} label={`${labelled}/${PINS.length} pins named`} />
          </Box>
        </>
      );

    default:
      return (
        <>
          <SectionTitle>Conclusion</SectionTitle>
          <Hint>The peel I mounted came from the ___ epidermis of the leaf:</Hint>
          <ChoiceRow
            ariaLabel="The surface I peeled"
            value={state.concl.mine}
            options={['lower', 'upper']}
            onPick={(value) => dispatch({ type: 'setConcl', field: 'mine', value })}
          />
          <Hint>On a dicot leaf, stomata are far more numerous on the ___ epidermis:</Hint>
          <ChoiceRow
            ariaLabel="Where stomata are more numerous"
            value={state.concl.truth}
            options={['lower', 'upper', 'both the same']}
            onPick={(value) => dispatch({ type: 'setConcl', field: 'truth', value })}
          />
          <Fields>
            <Button
              variant="contained"
              disabled={!state.concl.mine || !state.concl.truth}
              onClick={() => dispatch({ type: 'submitConcl', now: now() })}
            >
              Submit conclusion
            </Button>
          </Fields>
        </>
      );
  }
}

// ---------------------------------------------------------------------------
// The notebook
// ---------------------------------------------------------------------------

/** A compact native picker: no portal, so it works inside the fullscreen frame. */
function Picker({
  value,
  onChange,
  options,
  ariaLabel,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  options: readonly { value: string; label: string }[];
  ariaLabel: string;
  disabled?: boolean;
}): React.ReactElement {
  const theme = useTheme();
  return (
    <Box
      component="select"
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      sx={{
        width: '100%',
        minWidth: 108,
        font: 'inherit',
        fontSize: theme.band.type.base - 1,
        color: theme.brand.ink,
        backgroundColor: theme.brand.surface,
        border: `1px solid ${theme.brand.line2}`,
        borderRadius: `${theme.band.radius.sm}px`,
        px: 0.75,
        py: 0.5,
        cursor: disabled ? 'default' : 'pointer',
        '&:focus-visible': { outline: `2px solid ${theme.hues.indigo}`, outlineOffset: 1 },
      }}
    >
      <option value="">?</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Box>
  );
}

function Verdict({ ok, was }: { ok: boolean; was?: string }): React.ReactElement {
  return <EmergeChip tone={ok ? 'green' : 'red'} label={ok ? 'matches the field' : `it was: ${was}`} />;
}

function ObservationsPanel({ state }: { state: StomataState }): React.ReactElement {
  const theme = useTheme();
  const { dispatch } = useBench();
  const editable = state.step === STEP.record && !state.frozen;
  const g = state.graded;

  return (
    <ObservationTable
      caption={
        g
          ? 'Marked against the field of view you had when you submitted'
          : editable
            ? 'Write what this field of view shows'
            : 'You fill this in at the Record step'
      }
      columns={[{ label: 'Observation' }, { label: 'What you saw', align: 'left' }]}
      rows={[
        ...OBS.map((o) => {
          const mine = state.rec[o.id] ?? '';
          const cell = g?.obsCells[o.id];
          return [
            o.q,
            editable ? (
              <Picker
                key={o.id}
                ariaLabel={o.q}
                value={mine}
                onChange={(value) => dispatch({ type: 'setObs', id: o.id, value })}
                options={o.o.map((v) => ({ value: v.value, label: v.short }))}
              />
            ) : (
              <Box key={o.id} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
                <span>{mine || '—'}</span>
                {cell ? <Verdict ok={cell.ok} was={cell.truth} /> : null}
              </Box>
            ),
          ];
        }),
        [
          'Stomata counted in the field',
          g ? (
            <Box key="count" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
              <span>{g.said}</span>
              <EmergeChip
                tone={g.count === 8 ? 'green' : g.count ? 'amber' : 'red'}
                label={`the field held ${g.trueCount}${g.hidden ? ` (+${g.hidden} under bubbles)` : ''}`}
              />
            </Box>
          ) : (
            <Box key="count" component="span" sx={{ color: theme.brand.tert }}>
              {state.count || '—'} — set it in the task above
            </Box>
          ),
        ],
      ]}
    />
  );
}

function DrawingPanel({ state }: { state: StomataState }): React.ReactElement {
  const theme = useTheme();
  const { dispatch } = useBench();
  const editable = !state.frozen;
  const g = state.graded;

  return (
    <Box>
      <Typography sx={{ fontSize: theme.band.type.base - 1, color: theme.brand.sub, mb: 1 }}>
        <b>Four pins, four parts.</b> Name each one. The pins are on the parts, not on the names — one of the five
        names is not pinned at all.
      </Typography>
      <Box sx={{ maxWidth: 340, mx: 'auto' }}>
        <LabelPlate slide={state.slide} mic={state.mic} labelMap={state.labelMap} />
      </Box>
      <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', mt: 1.5, fontSize: theme.band.type.base - 1 }}>
        <tbody>
          {PINS.map((p) => {
            const cell = g?.labelCells[p];
            return (
              <Box component="tr" key={p}>
                <Box component="td" sx={{ width: 34, py: 0.5, borderTop: `1px solid ${theme.brand.line}` }}>
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-grid',
                      placeItems: 'center',
                      width: 24,
                      height: 24,
                      borderRadius: '999px',
                      backgroundColor: theme.tints.indigo,
                      color: theme.hues.indigo,
                      fontWeight: 800,
                    }}
                  >
                    {p}
                  </Box>
                </Box>
                <Box component="td" sx={{ py: 0.5, borderTop: `1px solid ${theme.brand.line}` }}>
                  {editable ? (
                    <Picker
                      ariaLabel={`Pin ${p}`}
                      value={state.labels[p] ?? ''}
                      onChange={(value) => dispatch({ type: 'setLabel', pin: p, value })}
                      options={LABEL_OPTS.map((o) => ({ value: o.id, label: o.t }))}
                    />
                  ) : (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
                      <span>{labelName(state.labels[p])}</span>
                      {cell ? <Verdict ok={cell.ok} was={labelName(cell.truth).toLowerCase()} /> : null}
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })}
        </tbody>
      </Box>
    </Box>
  );
}

function TheoryPanel(): React.ReactElement {
  const theme = useTheme();
  const { meta } = stomataEngine;
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
 * The panel is pure data and is handed nothing but `revealed` — see
 * `@labs/lib/stomata/teach.ts`. The slide, the peel, the field and the count are
 * not in its scope at all, so it cannot name, count or judge any of them; the
 * one thing `revealed` unlocks is what a typical stomatal density comes to,
 * which would anchor the count that is being marked. It draws no figures, so
 * none are passed.
 */
function Teach({ revealed }: BenchTeachProps<StomataState, StomataAction>): React.ReactElement {
  return <TeachSections sections={stomataTeach(revealed)} />;
}

// ---------------------------------------------------------------------------
// The bench
// ---------------------------------------------------------------------------

export const stomataBench: BenchDefinition<StomataState, StomataAction> = {
  engine: stomataEngine,
  ui: {
    Provider: StomataProvider,
    Stage,
    Controls,
    Task,
    Aside,
    // It earns its space from the moment there is anything on the slide. Before
    // the stage, that is the plan view and the section — where a mount is
    // judged, and the only place the coverslip lesson is drawn rather than
    // asserted. After it, the eyepiece, which is what the focusing, the counting
    // and half the table are read off.
    showAside: (state) => state.slide.onStage || state.slide.peel !== null || liquidOn(state.slide) > 0,
    // THE TEACHING LAYER. It explains the stoma, the guard cells and the
    // technique of a wet mount. It is never handed the slide or the field, so it
    // cannot name, count or judge anything in the eyepiece; only `revealed`
    // reaches it, and the one thing it holds back is what a typical stomatal
    // density comes to, because a figure like that would anchor the count that
    // is being marked. See `@labs/lib/stomata/teach.ts`. No `showTeach`: which
    // surface to peel is the first decision of the practical, and this is what
    // settles it.
    Teach,
    tabs: [
      { id: 'observations', label: 'Observations', Panel: ObservationsPanel },
      { id: 'drawing', label: 'Drawing', Panel: DrawingPanel },
      { id: 'theory', label: 'Theory', Panel: TheoryPanel },
    ],
    tabForStep: (state) => {
      if (state.step < STEP.record) return 'theory';
      const lines = OBS.every((o) => state.rec[o.id]);
      const pins = PINS.every((p) => state.labels[p]);
      // At the record step the table comes first, and the drawing opens itself
      // once the table is done — the two halves of the same step.
      if (state.step === STEP.record && lines && !pins) return 'drawing';
      return 'observations';
    },
    tours: (ctx) => createStomataTours(ctx),
    // "Show me this step", per step of the procedure. It runs on the student's
    // OWN bench and stops short of every act the step is marked for — the pull,
    // the coverslip, the stage, the last half-turn of the knob. See `trainer.tsx`.
    useTrainer: useStomataTrainer,
    tourNotice: (state) =>
      state.slide.broken
        ? 'The slide is **cracked**. Discard the mount under the bench and make another one.'
        : null,
    highlightsFor: (step) => (step?.highlight ?? []) as readonly string[],
  },
};
