import {
  OX,
  mm,
  rayDir,
  scalePoint,
  slabPath,
  traceOf,
  type SlabPath,
  type Vec,
} from './optics';
import type { GlassSlabAction } from './reducer';
import { currentTrial, protractorPose, type GlassSlabState } from './state';

/**
 * WHAT THE VISUAL TRAINER ACTUALLY DOES on this bench.
 *
 * The narration lives with the tour steps in `@labs/components/glass-slab/`;
 * this is the other half — the hands. It is pure, so the one thing that must be
 * true of it can be checked without a browser: drive every demonstration from
 * plain Node and the marks, the mistake log and the attempt record come back
 * untouched.
 *
 * THREE RULES, and every function here keeps all three.
 *
 * 1. **Never the marked act.** The demonstration draws the ray and sticks the
 *    pins; it never presses *join*, never writes a protractor reading down and
 *    never answers a statement. The workspace would put those back — it
 *    restores a snapshot — but restoring them is not the point. The practical
 *    is the student's to do.
 * 2. **Never completes the step.** `engine.step()` must read the same before
 *    and after: the demonstrations are keyed to the step they were built for,
 *    so one that finished its own step would swap the script out from under
 *    itself mid-run.
 * 3. **Never logs a slip.** Nothing here draws a ray at the wrong angle or
 *    traces an outline late, so nothing here can put a line in the student's
 *    own mistake log even for the seconds before the snapshot goes back.
 */

/** The least a demonstration needs of the bench. The tour context satisfies it. */
export interface DemoCtx {
  state: GlassSlabState;
  /** Applies an action and returns the resulting state, synchronously. */
  dispatch: (action: GlassSlabAction) => GlassSlabState;
  now: () => number;
}

// ---------------------------------------------------------------------------
// The demonstration's own geometry
// ---------------------------------------------------------------------------

/**
 * Where this trace's four pins would go if they were put in properly, and where
 * the two deliberately bad ones go.
 *
 * Every point is chosen by CONSTRUCTION — two on the ray the protractor draws,
 * two on the ray the light really leaves along — so the numbers the commentary
 * quotes are the bench's own answer rather than an assertion.
 */
export interface TrainerPlan {
  target: number;
  /** The protractor reading the ray is drawn at: the normal is the 90° mark. */
  drawn: number;
  O: Vec;
  dir: Vec;
  real: SlabPath;
  p1: Vec;
  p2: Vec;
  q3: Vec;
  q4: Vec;
  /** P₃ four millimetres off the line of the images, and P₄ two. */
  q3off: Vec;
  q4off: Vec;
  /** The angles a properly sighted trace makes, and a badly sighted one. */
  good: { i: number; r: number; e: number } | null;
  bad: { i: number; r: number; e: number } | null;
}

export function trainerPlan(state: GlassSlabState): TrainerPlan | null {
  const tr = currentTrial(state);
  const { slab } = state;
  const O: Vec = { x: OX, y: slab.y };
  const dir = rayDir(tr.target, 1);
  const real = slabPath(O, dir, slab);
  if (!real) return null;

  const back = (len: number): Vec => ({ x: O.x - dir.x * len, y: O.y - dir.y * len });
  const across: Vec = { x: real.dout.y, y: -real.dout.x };
  const out = (len: number, offMm: number): Vec => ({
    x: real.O2.x + real.dout.x * len + across.x * mm(offMm),
    y: real.O2.y + real.dout.y * len + across.y * mm(offMm),
  });

  const drawn = 90 + tr.target;
  const p1 = back(80);
  const p2 = back(190);
  const q3 = out(96, 0);
  const q4 = out(196, 0);
  const q3off = out(96, 4);
  const q4off = out(196, 2);
  const angles = (pins: Vec[]): { i: number; r: number; e: number } | null =>
    traceOf({ drawn, pins, joined: true, lat: null }, slab).ang;

  return {
    target: tr.target,
    drawn,
    O,
    dir,
    real,
    p1,
    p2,
    q3,
    q4,
    q3off,
    q4off,
    good: angles([p1, p2, q3, q4]),
    bad: angles([p1, p2, q3, q4off]),
  };
}

// ---------------------------------------------------------------------------
// Fixing the paper and the slab
// ---------------------------------------------------------------------------

/** Tap the slab in the tray, then press on the paper: it goes down square. */
export function putTheSlabDown({ state, dispatch, now }: DemoCtx): void {
  if (state.slabOn) return;
  // Picking up what is already in the hand PUTS IT DOWN, so every one of these
  // checks first: a student who has just taken the tool out is exactly the
  // student most likely to press "show me".
  if (state.held !== 'slab') dispatch({ type: 'pickUp', tool: 'slab' });
  dispatch({ type: 'useTool', at: { x: OX, y: state.slab.y + state.slab.t / 2 }, now: now() });
}

/** The pencil, right round all four faces — before any pin goes in. */
export function traceTheOutline({ state, dispatch, now }: DemoCtx): void {
  if (state.outline) return;
  if (state.held !== 'pencil') dispatch({ type: 'pickUp', tool: 'pencil' });
  dispatch({
    type: 'useTool',
    at: { x: state.slab.x + 40, y: state.slab.y + state.slab.t / 2 },
    now: now(),
  });
}

/**
 * The crosshair on the upper face, where O goes — and nothing else. Pressing it
 * would finish the set-up, which is both a mark and a change of step.
 */
export function offerThePointOfIncidence({ state, dispatch }: DemoCtx): void {
  if (state.origin) return;
  if (state.held !== 'pencil') dispatch({ type: 'pickUp', tool: 'pencil' });
  dispatch({ type: 'aim', at: { x: OX, y: state.slab.y } });
}

// ---------------------------------------------------------------------------
// The teaching view
// ---------------------------------------------------------------------------

/** Light the ray box at a chosen angle. Only ever called with `teach` on. */
export const showTheLightPath =
  (deg: number) =>
  ({ state, dispatch }: DemoCtx): void => {
    dispatch({ type: 'aimRay', deg });
    if (!state.reveal) dispatch({ type: 'reveal', on: true });
  };

/** Light the ray box at the angle this trace is being drawn at. */
export function showTheLightPathHere(ctx: DemoCtx): void {
  showTheLightPath(currentTrial(ctx.state).target)(ctx);
}

export function hideTheLightPath({ state, dispatch }: DemoCtx): void {
  if (state.reveal) dispatch({ type: 'reveal', on: false });
}

// ---------------------------------------------------------------------------
// One trace
// ---------------------------------------------------------------------------

/** Protractor centre on O, straight edge along the face. */
export function layTheProtractorOnO({ state, dispatch, now }: DemoCtx): void {
  if (!state.origin) return;
  if (state.held !== 'protractor') dispatch({ type: 'pickUp', tool: 'protractor' });
  dispatch({ type: 'useTool', at: { x: OX, y: state.slab.y }, now: now() });
}

/**
 * Turn the sight line to this trial's angle and rule the line.
 *
 * Drawing the incident ray is not itself marked — the pins and the readings
 * are — and it is drawn at exactly the angle the trial asks for, so it cannot
 * log the "set at x° instead of y°" slip either.
 */
export function drawTheIncidentRay({ state, dispatch, now }: DemoCtx): void {
  const tr = currentTrial(state);
  if (tr.joined) return;
  const pose = protractorPose(state);
  if (!pose) return;
  dispatch({ type: 'aimProtractor', at: scalePoint(pose.c, pose.up, 90 + tr.target, 150) });
  if (tr.drawn === null) dispatch({ type: 'commitProtractor', now: now() });
}

/** P₁ and P₂ on the drawn line, well apart. */
export function stickTheIncidentPins({ state, dispatch, now }: DemoCtx): void {
  const plan = trainerPlan(state);
  const tr = currentTrial(state);
  if (!plan || tr.joined || tr.drawn === null || tr.pins.length >= 2) return;
  if (state.held !== 'pin') dispatch({ type: 'pickUp', tool: 'pin' });
  if (tr.pins.length < 1) dispatch({ type: 'useTool', at: plan.p1, now: now() });
  dispatch({ type: 'useTool', at: plan.p2, now: now() });
}

/** The crosshair four millimetres off the line of the images, and left there. */
export function aimOffTheLine({ state, dispatch }: DemoCtx): void {
  const plan = trainerPlan(state);
  const tr = currentTrial(state);
  if (!plan || tr.joined || tr.pins.length !== 2) return;
  if (state.held !== 'pin') dispatch({ type: 'pickUp', tool: 'pin' });
  dispatch({ type: 'aim', at: plan.q3off });
}

/** Moved until it reads "in line", and only then pressed in. */
export function stickTheThirdPinInLine({ state, dispatch, now }: DemoCtx): void {
  const plan = trainerPlan(state);
  const tr = currentTrial(state);
  if (!plan || tr.joined || tr.pins.length !== 2) return;
  if (state.held !== 'pin') dispatch({ type: 'pickUp', tool: 'pin' });
  dispatch({ type: 'aim', at: plan.q3 });
  dispatch({ type: 'useTool', at: plan.q3, now: now() });
}

/** P₄ about two millimetres out — the width of a pin head, and what it costs. */
export function stickTheFourthPinBadly({ state, dispatch, now }: DemoCtx): void {
  const plan = trainerPlan(state);
  const tr = currentTrial(state);
  if (!plan || tr.joined || tr.pins.length !== 3) return;
  if (state.held !== 'pin') dispatch({ type: 'pickUp', tool: 'pin' });
  dispatch({ type: 'aim', at: plan.q4off });
  dispatch({ type: 'useTool', at: plan.q4off, now: now() });
}

/** Out it comes, and back in square on the line of both images. */
export function sightTheFourthPinAgain({ state, dispatch, now }: DemoCtx): void {
  const plan = trainerPlan(state);
  const tr = currentTrial(state);
  if (!plan || tr.joined || tr.pins.length !== 4) return;
  dispatch({ type: 'pullPin' });
  if (state.held !== 'pin') dispatch({ type: 'pickUp', tool: 'pin' });
  dispatch({ type: 'aim', at: plan.q4 });
  dispatch({ type: 'useTool', at: plan.q4, now: now() });
}

/**
 * Say which angle is being measured, so the bench knows whether the protractor
 * belongs at O or at O′. It writes nothing down: `measure` chooses, `commit`
 * records, and recording is the marked act.
 */
export function chooseTheFirstAngle({ state, dispatch }: DemoCtx): void {
  if (!currentTrial(state).joined) return;
  dispatch({ type: 'measure', which: 'i' });
}

// ---------------------------------------------------------------------------
// The interpretation
// ---------------------------------------------------------------------------

/** The finished traces, one colour each, over the top of each other. */
export function compareTheTraces({ state, dispatch }: DemoCtx): void {
  if (state.trials.filter((t) => t.joined).length < 2) return;
  dispatch({ type: 'showAll', on: true });
}
