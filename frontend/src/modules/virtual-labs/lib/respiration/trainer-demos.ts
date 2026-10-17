import {
  DIP_ML,
  GRAM,
  POUR,
  SETUPS,
  SETUP_A,
  SETUP_B,
  dips,
  type SeedKind,
} from './biology';
import { STEP } from './marking';
import type { RespirationAction } from './reducer';
import { flaskAt, type Held, type RespirationState } from './state';

/**
 * WHAT THE VISUAL TRAINER ACTUALLY DOES on the respiration bench.
 *
 * The narration lives with the steps in
 * `@labs/components/respiration/trainer.tsx`; this is the other half — the hands.
 * It is pure, so the one thing that must be true of it can be checked without a
 * browser: drive every demonstration from plain Node and the score, the mistake
 * log and the attempt record come back untouched.
 *
 * FOUR RULES, and every function here keeps all four.
 *
 * 1. **Never the marked act.** It builds apparatus and it runs a clock; it never
 *    presses **Set up**, never presses **Start the clock**, never writes a row of
 *    the observation table and never picks a conclusion. Those are the four
 *    presses this practical is scored on, and the workspace restoring the
 *    snapshot afterwards is not a reason to make them for the student.
 * 2. **Never says what a tube shows.** Nothing here reads the lime water, and
 *    nothing in the commentary beside it does either. Judging how milky it has
 *    gone is the 8-mark observation, and the "was CO₂ given out?" row follows
 *    straight out of it.
 * 3. **Never completes the step.** Every step of this practical ends on an
 *    explicit press, and the demonstrations stop short of all four, so
 *    `engine.step()` reads the same before and after — and at every moment in
 *    between, which matters because the scripts are keyed to the step.
 * 4. **Never logs a slip.** It puts germinating seed in A and boiled seed in B
 *    and never the other way round, never hangs KOH in a marked flask, and never
 *    pours past the cap — which is every mistake the build can record.
 */

/** The least a demonstration needs of the bench. The tour context satisfies it. */
export interface DemoCtx {
  state: RespirationState;
  /** Applies an action and returns the resulting state, synchronously. */
  dispatch: (action: RespirationAction) => RespirationState;
  now: () => number;
}

/** A sensible charge: 20 g, which is two taps of the jar. */
export const DEMO_GRAMS = GRAM * 2;

/** What each marked flask is supposed to hold — from the bench, not from here. */
function wants(index: number): SeedKind {
  return SETUPS[index]?.want ?? 'germ';
}

/**
 * Take something up, unless it is already in the hand.
 *
 * `pickUp` TOGGLES: picking up what you are holding puts it down. A loop that
 * picked the lime bottle up before every pour would therefore pour, put it
 * down, pour nothing, and leave the tube half full — which is the bug this
 * helper exists to make impossible.
 */
function takeUp(
  dispatch: DemoCtx['dispatch'],
  state: RespirationState,
  held: Held,
): RespirationState {
  if (state.held && sameHeld(state.held, held)) return state;
  return dispatch({ type: 'pickUp', held });
}

function sameHeld(a: Held, b: Held): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'seed' || b.kind !== 'seed' || a.seed === b.seed;
}

// ---------------------------------------------------------------------------
// Building one set-up
// ---------------------------------------------------------------------------

/**
 * Tip `DEMO_GRAMS` of the RIGHT seed into a flask.
 *
 * The right one: germinating in A, boiled in B. Putting the other in logs a
 * mistake and is exactly what the control marks are for, so it never happens
 * here even for the seconds before the snapshot goes back.
 */
export function tipSeedInto(index: number) {
  return ({ state, dispatch, now }: DemoCtx): void => {
    const f = flaskAt(state, index);
    if (!f || f.cork || state.graded) return;
    const kind = wants(index);
    if (f.seeds && f.seeds.kind !== kind) return;
    let s = state;
    for (let i = 0; i < 4; i += 1) {
      const flask = flaskAt(s, index);
      if (!flask || (flask.seeds?.g ?? 0) >= DEMO_GRAMS) break;
      s = takeUp(dispatch, s, { kind: 'seed', seed: kind });
      s = dispatch({ type: 'tapFlask', index, now: now() });
    }
  };
}

/**
 * One pour of lime water — and deliberately only one, so the close-up shows the
 * mouth of the bent tube still standing ABOVE the liquid.
 *
 * That is the whole point of the first pour: a delivery tube that does not dip
 * bubbles the gas into empty space, and no amount of waiting will then turn the
 * lime water milky.
 */
export function pourOnePartOfLimeWater(index: number) {
  return ({ state, dispatch, now }: DemoCtx): void => {
    const f = flaskAt(state, index);
    if (!f || state.graded || f.lime.ml >= POUR) return;
    takeUp(dispatch, state, { kind: 'lime' });
    dispatch({ type: 'tapTube', index, now: now() });
  };
}

/** Pour on until the delivery tube is under the surface — `DIP_ML` and no more. */
export function pourUntilItDips(index: number) {
  return ({ state, dispatch, now }: DemoCtx): void => {
    if (state.graded) return;
    let s = state;
    for (let i = 0; i < 4; i += 1) {
      const f = flaskAt(s, index);
      if (!f || f.lime.ml >= DIP_ML) break;
      s = takeUp(dispatch, s, { kind: 'lime' });
      s = dispatch({ type: 'tapTube', index, now: now() });
    }
  };
}

/** The cork with its bent delivery tube. Seeds first: once it is in, the flask is closed. */
export function fitTheCork(index: number) {
  return ({ state, dispatch, now }: DemoCtx): void => {
    const f = flaskAt(state, index);
    if (!f || f.cork || !f.seeds || state.graded) return;
    takeUp(dispatch, state, { kind: 'cork' });
    dispatch({ type: 'tapFlask', index, now: now() });
  };
}

/** Vaseline round the joint, so the only way out is down the delivery tube. */
export function sealTheJoint(index: number) {
  return ({ state, dispatch, now }: DemoCtx): void => {
    const f = flaskAt(state, index);
    if (!f || !f.cork || f.sealed || state.graded) return;
    takeUp(dispatch, state, { kind: 'vas' });
    dispatch({ type: 'tapFlask', index, now: now() });
  };
}

/** Squeeze the flask and watch: the whole of the seal test. Nothing it does is marked. */
export function squeezeAndWatch(index: number) {
  return ({ state, dispatch }: DemoCtx): void => {
    const f = flaskAt(state, index);
    if (!f || !f.cork) return;
    dispatch({ type: 'selectSetup', index });
    dispatch({ type: 'testSeal', index });
  };
}

/** Bring a set-up into the close-up, so the commentary and the picture agree. */
export function lookAt(index: number) {
  return ({ state, dispatch }: DemoCtx): void => {
    if (state.sel === index) return;
    dispatch({ type: 'selectSetup', index });
  };
}

/** Hands free, so the next thing that happens on this bench is the student's. */
export function putEverythingDown({ state, dispatch }: DemoCtx): void {
  if (!state.held) return;
  dispatch({ type: 'putDown' });
}

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

/**
 * Put `minutes` of lab time through the apparatus.
 *
 * `skip` is the button the student has, so the demonstration uses exactly that:
 * every simulated minute passes through every flask, a leak leaks for all of
 * them, and the tubes stand where they really would. It cannot end the step —
 * only **Record observations** does that.
 */
export function waitFor(minutes: number) {
  return ({ state, dispatch }: DemoCtx): void => {
    if (state.step < STEP.watch || state.graded) return;
    dispatch({ type: 'skip', minutes });
  };
}

/** Both marked flasks built and sealed: what the bench needs before the clock is worth running. */
export function bothSetUpsReady(state: RespirationState): boolean {
  return [SETUP_A, SETUP_B].every((i) => {
    const f = flaskAt(state, i);
    return Boolean(f && f.seeds && f.cork && dips(f));
  });
}
