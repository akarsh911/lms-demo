import { OBJ, coverage, sharpness, type Magnification } from './peel';
import { STEP } from './marking';
import type { StomataAction } from './reducer';
import type { StomataState } from './state';

/**
 * WHAT THE VISUAL TRAINER ACTUALLY DOES on the leaf-peel bench.
 *
 * The narration lives with the steps in `@labs/components/stomata/trainer.tsx`;
 * this is the other half — the hands. It is pure, so the one thing that must be
 * true of it can be checked without a browser: drive every demonstration from
 * plain Node and the score, the mistake log and the attempt record come back
 * untouched.
 *
 * FOUR RULES, and every function here keeps all four.
 *
 * 1. **Never the marked act.** The demonstration picks the forceps up; it does
 *    not pull the peel. It lays the drop and the stain; it does not lower the
 *    coverslip. It racks the stage towards focus; it does not find and centre
 *    the field. Every one of those is what the part is awarded for, and the
 *    workspace putting the snapshot back afterwards is not a reason to do them:
 *    the practical is the student's to do.
 * 2. **Never completes the step.** `engine.step()` must read the same before and
 *    after — and at every moment in between. The demonstrations are keyed to the
 *    step they were built for, so one that finished its own step would swap the
 *    script out from under itself in the middle of a run. Each function below
 *    names the condition it has to stay short of.
 * 3. **Never logs a slip.** Nothing here tears at the leaf with the needle,
 *    floods the peel with stain or swings the 40× round before the peel has been
 *    found on 10×, so nothing here can put a line in the student's own mistake
 *    log even for the seconds before the snapshot goes back.
 * 4. **Never cracks the slide.** Racking is bounded by the working distance of
 *    the objective actually in use, which is the one accident on this bench that
 *    costs marks outright.
 */

/** The least a demonstration needs of the bench. The tour context satisfies it. */
export interface DemoCtx {
  state: StomataState;
  /** Applies an action and returns the resulting state, synchronously. */
  dispatch: (action: StomataAction) => StomataState;
  now: () => number;
}

/**
 * How far short of "found" the racking demonstration stops.
 *
 * `micTick` sets `foundLow` at a sharpness of 0.6, and `foundLow` with
 * `centredLow` is what completes the low-power step. Stopping at a blur that is
 * plainly improving leaves the last half-turn — the one that is marked — to the
 * student, and keeps rule 2.
 */
export const FOUND = 0.6;
/** `sharpness >= 0.8` at 40× is what completes the high-power step. */
export const SHARP = 0.8;

/** Sharpness at a given stage height, for the objective in use. */
function sharpAt(state: StomataState, z: number): number {
  return sharpness({ slide: state.slide, mic: { ...state.mic, z } });
}

/** Is there a peel under the objective worth focusing on at all? */
export function focusable(state: StomataState): boolean {
  return state.slide.onStage && !state.slide.broken && state.slide.peel !== null;
}

// ---------------------------------------------------------------------------
// Peeling
// ---------------------------------------------------------------------------

/**
 * Turn the leaf until the lower surface is up.
 *
 * Flipping is free — it is a decision, not a mark, and the bench says which way
 * it is lying — and it changes nothing the `peel` step advances on.
 */
export function layTheLeafLowerSideUp({ state, dispatch, now }: DemoCtx): void {
  if (state.faceUp === 'lower') return;
  dispatch({ type: 'flipLeaf', now: now() });
}

/**
 * The forceps, into the hand. Picking a tool up never advances the step and is
 * never marked; the pull that follows is both, so it is left alone.
 */
export function takeUpTheForceps({ state, dispatch, now }: DemoCtx): void {
  // A hand already holding the peel refuses every tool with a warning, and a
  // second tap on the tool you are holding PUTS IT DOWN.
  if (state.held?.kind === 'peel' || state.held?.kind === 'forceps') return;
  dispatch({ type: 'pickTool', tool: 'forceps', now: now() });
}

/** Nothing in the hand, so the next thing the student does is their own. */
export function putEverythingDown({ state, dispatch, now }: DemoCtx): void {
  if (!state.held || state.held.kind === 'peel') return;
  dispatch({ type: 'dropHeld', now: now() });
}

// ---------------------------------------------------------------------------
// Mounting
// ---------------------------------------------------------------------------

/**
 * A drop of water on the clean slide, BEFORE the specimen.
 *
 * Water alone advances nothing: the `mount` step ends when the coverslip goes
 * down. Four of the sixteen mounting marks are for this drop going on first,
 * which is why it is shown rather than described.
 */
export function layTheDropOfWater({ state, dispatch, now }: DemoCtx): void {
  const sl = state.slide;
  if (sl.onStage || sl.cover || sl.water > 0) return;
  const held = dispatch({ type: 'pickTool', tool: 'water', now: now() });
  if (held.held?.kind !== 'water') return;
  dispatch({ type: 'tapSlide', now: now() });
}

/**
 * The brush lifts the floating peel and lays it flat in the drop.
 *
 * Only from the WATER: a peel that has not been floated goes on curled and puts
 * a line in the mistake log, and lifting a wet peel on forceps tears it. Both
 * are refused here — rule 3.
 */
export function layThePeelInTheDrop({ state, dispatch, now }: DemoCtx): void {
  const sl = state.slide;
  if (sl.onStage || sl.cover || sl.peel || !state.dish || !state.dish.floated) return;
  let s = dispatch({ type: 'pickTool', tool: 'brush', now: now() });
  if (s.held?.kind !== 'brush') return;
  s = dispatch({ type: 'tapDish', now: now() });
  if (s.held?.kind !== 'peel') return;
  dispatch({ type: 'tapSlide', now: now() });
}

/**
 * One drop of safranin.
 *
 * Stops well short of the fourth, which is where the bench logs "flooded the
 * peel with safranin" and halves the stain marks.
 */
export function addOneDropOfSafranin({ state, dispatch, now }: DemoCtx): void {
  const sl = state.slide;
  if (sl.onStage || sl.cover || !sl.peel || sl.stain >= 2) return;
  const s = dispatch({ type: 'pickTool', tool: 'safranin', now: now() });
  if (s.held?.kind !== 'safranin') return;
  dispatch({ type: 'tapSlide', now: now() });
}

/**
 * The needle, into the hand — and no further.
 *
 * Lowering the coverslip is worth four marks and ENDS the mount step, so the
 * demonstration stops with the needle held and the coverslip untouched. That is
 * the whole of rules 1 and 2 in one gesture.
 */
export function takeUpTheNeedle({ state, dispatch, now }: DemoCtx): void {
  const sl = state.slide;
  if (sl.cover || state.held?.kind === 'peel' || state.held?.kind === 'needle') return;
  dispatch({ type: 'pickTool', tool: 'needle', now: now() });
}

// ---------------------------------------------------------------------------
// Checking the mount
// ---------------------------------------------------------------------------

/**
 * The slide, into the hand. Putting it ON the stage is what ends the `check`
 * step, so the demonstration hands it over instead.
 */
export function pickTheSlideUp({ state, dispatch, now }: DemoCtx): void {
  const sl = state.slide;
  if (sl.onStage || !sl.cover || state.held) return;
  dispatch({ type: 'tapSlide', now: now() });
}

// ---------------------------------------------------------------------------
// The microscope
// ---------------------------------------------------------------------------

/** Swing an objective round, but only when doing so is neither marked nor a step. */
export function swingIn(objective: Magnification) {
  return ({ state, dispatch, now }: DemoCtx): void => {
    const m = state.mic;
    if (m.obj === objective) return;
    // Going to 40× before the peel has been found and centred on 10× costs 8
    // marks and logs two slips. Going back DOWN to 10× costs nothing.
    if (objective === 40 && !(m.foundLow && m.centredLow)) return;
    // At the low-power step, 40× in the nosepiece IS the end of the step.
    if (objective === 40 && state.step === STEP.low) return;
    dispatch({ type: 'mic', cmd: objective === 40 ? 'obj40' : 'obj10', now: now() });
  };
}

/**
 * Rack the stage towards the focal plane, and stop while the image is still
 * plainly short of sharp.
 *
 * `limit` is the sharpness this must not reach: `FOUND` on low power, where
 * reaching it starts the half of the step that is marked, and `SHARP` on high
 * power, where reaching it ends the step. Each tap is checked BEFORE it is made,
 * against both that ceiling and the working distance of the lens in use, so the
 * demonstration can neither finish the step nor drive the objective into the
 * coverslip.
 */
export function rackTowardsFocus(knob: 'coarse' | 'fine', limit: number) {
  return ({ state, dispatch, now }: DemoCtx): void => {
    if (!focusable(state)) return;
    let s = state;
    const crash = OBJ[s.mic.obj].crash;
    for (let i = 0; i < 24; i += 1) {
      const up = s.mic.z < 0;
      const step = knob === 'coarse' ? 1.5 : 0.2;
      const next = s.mic.z + (up ? step : -step);
      // Never past the ceiling, never past the working distance, and never
      // further than the plane itself — one step short is the demonstration.
      if (sharpAt(s, next) >= limit) return;
      if (next > crash - 0.5) return;
      if (Math.abs(next) >= Math.abs(s.mic.z)) return;
      s = dispatch({
        type: 'mic',
        cmd: knob === 'coarse' ? (up ? 'coarseUp' : 'coarseDown') : up ? 'fineUp' : 'fineDown',
        now: now(),
      });
      if (s.slide.broken) return;
    }
  };
}

/**
 * Walk the stage until the peel fills the field.
 *
 * Safe at any moment the image is short of `FOUND`, because `micTick` only ever
 * records `centredLow` on a field that is ALSO sharp — which is exactly the
 * state `rackTowardsFocus` leaves the bench in. It checks anyway: a student who
 * pressed "show me" with a sharp field already found would otherwise have the
 * step completed for them.
 */
export function centreTheField({ state, dispatch, now }: DemoCtx): void {
  if (!focusable(state)) return;
  let s = state;
  for (let i = 0; i < 40; i += 1) {
    if (s.mic.centredLow && s.mic.foundLow) return;
    if (sharpness(s) >= FOUND && coverage(s) >= 0.9) return;
    const dx = -s.mic.cx;
    const dy = -s.mic.cy;
    if (Math.abs(dx) < 0.08 && Math.abs(dy) < 0.08) return;
    const cmd =
      Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'panR' : 'panL') : dy > 0 ? 'panD' : 'panU';
    s = dispatch({ type: 'mic', cmd, now: now() });
  }
}
