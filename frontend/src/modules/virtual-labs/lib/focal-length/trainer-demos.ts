import {
  LIMITS,
  OBJECTS,
  OPT,
  opticsOf,
  screenView,
  setupFor,
  type PartId,
} from './optics';
import type { FocalLengthAction } from './reducer';
import type { FocalLengthState } from './state';

/**
 * WHAT THE VISUAL TRAINER ACTUALLY DOES on the optical bench.
 *
 * The narration lives with the tour steps in `@labs/components/focal-length/`;
 * this is the hands. Pure, so the thing that must be true of it can be checked
 * without a browser: drive every demonstration from plain Node and the marks,
 * the mistake log and the attempt record come back untouched.
 *
 * THREE RULES, kept by every function here.
 *
 * 1. **Never the marked act.** It hunts the sharp image and selects the stands
 *    so the magnifier slides under them; it never presses **Record**, never
 *    types a scale reading, never submits a mean or a conclusion. Four marks of
 *    every trial ride on the judgement of "sharp enough" and four more on the
 *    two readings — those are the practical.
 * 2. **Never completes the step.** `engine.step()` reads the same before and
 *    after, so the script cannot change out from under a demonstration keyed to
 *    the step that started it. **Ready** is left unpressed for the same reason.
 * 3. **Never logs a slip.** It never chooses the Sun or the candle to show what
 *    happens: both cost four set-up marks and put a line in the student's own
 *    mistake log. The refusal is worth knowing, so the words describe it and
 *    the hands stay off it.
 */

/** The least a demonstration needs of the bench. The tour context satisfies it. */
export interface DemoCtx {
  state: FocalLengthState;
  /** Applies an action and returns the resulting state, synchronously. */
  dispatch: (action: FocalLengthAction) => FocalLengthState;
  now: () => number;
}

/** Where the sharp image stands on the scale, or null when there is none. */
export function imageAt(s: FocalLengthState, part: PartId): number | null {
  const o = opticsOf(setupFor(part, s));
  return o.real ? o.xImg : null;
}

/** Push a stand along the bench to a mark, the way a hand would. */
function push(ctx: DemoCtx, stand: 'comp' | 'scr', target: number): void {
  const s = ctx.state;
  const limit = LIMITS[s.part][stand];
  ctx.dispatch({
    type: 'dragStand',
    stand,
    cm: Math.min(limit[1], Math.max(limit[0], target)),
    now: ctx.now(),
  });
}

// ---------------------------------------------------------------------------
// Setting up
// ---------------------------------------------------------------------------

/** The convex lens out of the rack and into the stand, the mirror out of it. */
export function mountTheLens({ state, dispatch, now }: DemoCtx): void {
  if (state.mounted !== 'lens') dispatch({ type: 'mountLens', now: now() });
}

/**
 * Aim the optic at the distant tree — unless the student has already aimed it
 * at something far enough away, in which case their choice stands.
 *
 * Choosing is not itself a mark: the set-up marks come from having aimed at
 * something distant when **Ready** is pressed, and Ready is never pressed here.
 */
export const aimAtSomethingDistant =
  (part: PartId) =>
  ({ state, dispatch, now }: DemoCtx): void => {
    const chosen = state.obj[part];
    if (chosen && OBJECTS[chosen].far) return;
    dispatch({ type: 'chooseObject', id: 'tree', now: now() });
  };

// ---------------------------------------------------------------------------
// The search for the sharp image
// ---------------------------------------------------------------------------

export function takeHoldOfTheScreen({ dispatch }: DemoCtx): void {
  dispatch({ type: 'selectStand', stand: 'scr' });
}

export function takeHoldOfTheOptic({ dispatch }: DemoCtx): void {
  dispatch({ type: 'selectStand', stand: 'comp' });
}

/** Well short of the focal plane, where the patch is wide and dim. */
export const startShortOfTheFocus =
  (part: PartId) =>
  (ctx: DemoCtx): void => {
    const x = imageAt(ctx.state, part);
    if (x === null) return;
    push(ctx, 'scr', x - 4 * setupFor(part, ctx.state).side);
  };

/** Past it, on purpose: a blur that is growing again is how you know. */
export const overshootTheFocus =
  (part: PartId) =>
  (ctx: DemoCtx): void => {
    const x = imageAt(ctx.state, part);
    if (x === null) return;
    push(ctx, 'scr', x + 3 * setupFor(part, ctx.state).side);
  };

/**
 * Millimetre steps until the blur circle closes to a point — the search itself,
 * at the pace a student makes it. Every push carries the same hand wobble
 * theirs does, so it lands on a real position rather than a snapped one.
 */
export const creepBackToTheFocus =
  (part: PartId) =>
  (ctx: DemoCtx): void => {
    const dir = -setupFor(part, ctx.state).side;
    let s = ctx.dispatch({ type: 'selectStand', stand: 'scr' });
    for (let i = 0; i < 140; i += 1) {
      const view = screenView(setupFor(s.part, s), s.pos[s.part].scr);
      if (view.lit && view.sharp) return;
      s = ctx.dispatch({ type: 'nudge', delta: dir * OPT.lc, now: ctx.now() });
    }
  };

/**
 * Shift the optic, so the sharp image can be seen moving with it: a second
 * reading of the same set-up is not a second trial.
 */
export function moveOnToTheNextTrial(ctx: DemoCtx): void {
  const s = ctx.state;
  const limit = LIMITS[s.part].comp;
  const here = s.pos[s.part].comp;
  push(ctx, 'comp', here + OPT.moveBetweenTrials + 0.5 <= limit[1] ? here + 3.5 : here - 3.5);
}

// ---------------------------------------------------------------------------
// The teaching layer
// ---------------------------------------------------------------------------

/** The drawn rays. Only ever called with `teach` on. */
export function showTheRays({ state, dispatch }: DemoCtx): void {
  if (!state.rays) dispatch({ type: 'showRays', on: true });
}

export function hideTheRays({ state, dispatch }: DemoCtx): void {
  if (state.rays) dispatch({ type: 'showRays', on: false });
}
