import {
  FACE,
  SCALE,
  V,
  angBetween,
  inPaper,
  rayForIncidence,
  smallestUsefulIncidence,
  vadd,
  vmul,
  vsub,
  type Vec,
} from './optics';
import type { PrismAction } from './reducer';
import { currentTrial, type PrismState } from './state';

/**
 * WHAT THE VISUAL TRAINER ACTUALLY DOES on the prism bench.
 *
 * The narration lives with the tour steps in `@labs/components/prism/`; this is
 * the hands. Pure, so the thing that must be true of it can be checked without
 * a browser: drive every demonstration from plain Node and the marks, the
 * mistake log and the attempt record come back untouched.
 *
 * THREE RULES, kept by every function here.
 *
 * 1. **Never the marked act.** It puts the four pins in and shows what a
 *    badly sighted one costs; it never presses *lift the prism and join the
 *    pins*, never records a protractor reading, never picks the ray of least
 *    deviation. Those three are where every mark on this bench is decided.
 * 2. **Never completes the step.** It does not trace the outline either, which
 *    would take the procedure from *fix* to *trace* underneath a demonstration
 *    keyed to *fix*.
 * 3. **Never logs a slip.** The demonstration ray is chosen clear of total
 *    internal reflection and clear of the angles already traced, and the
 *    deliberately bad pin is pulled again before anything is joined, so nothing
 *    here can write a line into the student's own mistake log.
 */

/** The least a demonstration needs of the bench. The tour context satisfies it. */
export interface DemoCtx {
  state: PrismState;
  /** Applies an action and returns the resulting state, synchronously. */
  dispatch: (action: PrismAction) => PrismState;
  now: () => number;
}

// ---------------------------------------------------------------------------
// The demonstration's own ray
// ---------------------------------------------------------------------------

/**
 * An angle of incidence to demonstrate at: comfortably past the angle below
 * which nothing emerges from face AC at all, and clear of any the student has
 * already traced, so the bench does not tell them off for repeating one.
 */
export function demoIncidence(s: PrismState): number {
  const floor = smallestUsefulIncidence(s.n);
  let i = Math.max(48, Math.ceil(floor) + 6);
  for (let k = 0; k < 6; k += 1) {
    const clash = s.trials.some((t) => t.traced && t.i !== null && Math.abs(t.i - i) < 6);
    if (!clash) break;
    i += 7;
  }
  return Math.min(i, 72);
}

/**
 * Where the four pins would go for that ray.
 *
 * By CONSTRUCTION, from the tracer: the first two on the line that strikes the
 * middle of face AB at the chosen angle, the last two on the ray that really
 * leaves face AC. So the commentary's numbers are the bench's own answer rather
 * than an assertion — including how far out the deliberately bad pin is.
 */
export interface TrainerPlan {
  i: number;
  d: Vec;
  P1: Vec;
  P2: Vec;
  P3: Vec;
  P4: Vec;
  /** P₃ about 4 mm off the line of the images. */
  P3off: Vec;
  /** The angle that 4 mm puts into the emergent line. */
  err: number;
  D: number;
}

export function trainerPlan(s: PrismState): TrainerPlan | null {
  const i = demoIncidence(s);
  const r = rayForIncidence(i, s.n);
  if (!r.clean || r.D === null) return null;
  const mid = FACE.AB.mid;
  const P1 = vsub(mid, vmul(r.d, 120));
  const P2 = vsub(mid, vmul(r.d, 230));
  const exit = r.res.exitPt;
  const dir = r.res.exitDir;
  const P3 = vadd(exit, vmul(dir, 110));
  const P4 = vadd(exit, vmul(dir, 230));
  const across = V(dir.y, -dir.x);
  const P3off = vadd(P3, vmul(across, 0.4 * SCALE));
  if (![P1, P2, P3, P4, P3off].every(inPaper)) return null;
  return { i, d: r.d, P1, P2, P3, P4, P3off, err: angBetween(vsub(P4, P3off), dir), D: r.D };
}

// ---------------------------------------------------------------------------
// The ray box: this bench's teaching layer
// ---------------------------------------------------------------------------

/** Put the lamp on the paper, aimed at a given angle. Only called with `teach`. */
export const lightTheRayBox =
  (deg: number) =>
  ({ state, dispatch }: DemoCtx): void => {
    if (!state.demo.on) dispatch({ type: 'demoOn', on: true });
    dispatch({ type: 'setAim', i: deg, quiet: true });
  };

/** Aim it at the angle the pins have just been put in at. */
export function lightTheRayBoxHere(ctx: DemoCtx): void {
  const plan = trainerPlan(ctx.state);
  if (!ctx.state.demo.on) ctx.dispatch({ type: 'demoOn', on: true });
  if (plan) ctx.dispatch({ type: 'setAim', i: plan.i, quiet: true });
}

/**
 * Swing it through the range, so the deviation curve draws itself.
 *
 * `instant` fills the whole curve in one step instead of animating it — the
 * reduced-motion path, decided by the caller because a reducer has no window to
 * ask.
 */
export const sweepTheRayBox =
  (instant: boolean) =>
  ({ dispatch }: DemoCtx): void => {
    dispatch({ type: 'sweep', instant });
  };

/** White light, while the lamp is on: dispersion, and never marked. */
export function showWhiteLight({ state, dispatch }: DemoCtx): void {
  const t = state.trials[state.sel] ?? currentTrial(state);
  if (!t.P || state.white) return;
  dispatch({ type: 'toggleWhite' });
}

export function putTheRayBoxAway({ state, dispatch }: DemoCtx): void {
  if (state.white) dispatch({ type: 'toggleWhite' });
  if (state.demo.on) dispatch({ type: 'demoOn', on: false });
}

// ---------------------------------------------------------------------------
// The pin method
// ---------------------------------------------------------------------------

/**
 * A pin in the hand, and a clear stretch of paper to lay the line down on.
 *
 * Pulling the student's own pins looks bolder than it is: they are put back by
 * the snapshot, and nothing about a pin is marked until the pins are joined.
 */
export function takeAPin({ state, dispatch, now }: DemoCtx): void {
  const t = currentTrial(state);
  if (t.traced) return;
  for (let k = t.pins.length; k > 0; k -= 1) dispatch({ type: 'pullPin', index: null, now: now() });
  dispatch({ type: 'setTool', tool: 'pin' });
}

/** P1 and P2 in front of face AB, well over 3 cm apart. */
export function fixTheIncidentRay({ state, dispatch, now }: DemoCtx): void {
  const plan = trainerPlan(state);
  const t = currentTrial(state);
  if (!plan || t.traced || t.pins.length >= 2) return;
  dispatch({ type: 'placePin', x: plan.P1.x, y: plan.P1.y, now: now() });
  dispatch({ type: 'placePin', x: plan.P2.x, y: plan.P2.y, now: now() });
}

/** A third pin about 4 mm wide of the line the two images lie along. */
export function fixTheThirdPinBadly({ state, dispatch, now }: DemoCtx): void {
  const plan = trainerPlan(state);
  const t = currentTrial(state);
  if (!plan || t.traced || t.pins.length !== 2) return;
  dispatch({ type: 'placePin', x: plan.P3off.x, y: plan.P3off.y, now: now() });
}

/** Pulled, sighted again, and P4 put in a long way further out. */
export function sightTheEmergentRayProperly({ state, dispatch, now }: DemoCtx): void {
  const plan = trainerPlan(state);
  const t = currentTrial(state);
  if (!plan || t.traced || t.pins.length !== 3) return;
  dispatch({ type: 'pullPin', index: 2, now: now() });
  dispatch({ type: 'placePin', x: plan.P3.x, y: plan.P3.y, now: now() });
  dispatch({ type: 'placePin', x: plan.P4.x, y: plan.P4.y, now: now() });
}

// ---------------------------------------------------------------------------
// The protractor
// ---------------------------------------------------------------------------

/**
 * Lay the protractor down for whichever angle is unread — and only lay it: the
 * reading is the mark, and the first reading of each angle counts.
 */
export function layTheProtractorDown({ state, dispatch, now }: DemoCtx): void {
  const next = nextUnreadAngle(state);
  if (!next || state.arm) return;
  dispatch({ type: 'armMeasure', k: next.k, which: next.which, now: now() });
}

/** Lift it again, having read nothing off it. */
export function liftTheProtractor({ state, dispatch }: DemoCtx): void {
  if (state.arm) dispatch({ type: 'unarm' });
}

/**
 * The next angle still to be read, in ray order.
 *
 * The same walk the reducer's own `nextUnread` makes; it lives here too so this
 * module stays free of anything but the state it is handed.
 */
export function nextUnreadAngle(s: PrismState): { k: number; which: 'i' | 'e' | 'D' } | null {
  for (const t of s.trials) {
    for (const which of ['i', 'e', 'D'] as const) {
      if (t.traced && t.meas[which] === null) return { k: t.k, which };
    }
  }
  return null;
}
