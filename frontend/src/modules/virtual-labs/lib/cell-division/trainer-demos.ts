import { STEP } from './marking';
import {
  COARSE,
  FINE,
  MOVE_STEP,
  OBJECTIVES,
  clearance,
  crashHeight,
  focalPlane,
  type Objective,
} from './optics';
import type { CellDivisionAction } from './reducer';
import { locked, mountedSlide, slideDone, type CellDivisionState } from './state';

/**
 * WHAT THE VISUAL TRAINER ACTUALLY DOES on the fission-and-budding bench.
 *
 * The narration lives with the steps in
 * `@labs/components/cell-division/trainer.tsx`; this is the other half — the
 * hands. It is pure, so the one thing that must be true of it can be checked
 * without a browser: drive every demonstration from plain Node and the score,
 * the mistake log and the attempt record come back untouched.
 *
 * FIVE RULES, and every function here keeps all five.
 *
 * 1. **Never the marked act.** It drives the instrument; it never names an
 *    organism, never names a process, never drops a label on a pointer and never
 *    writes a row of the table. Naming what is on a slide IS this practical, and
 *    the workspace restoring the snapshot afterwards is not a reason to do it
 *    for the student.
 * 2. **Never says what is on the slide.** Not in the state it leaves and not in
 *    the words beside it. The demonstration works on the slide the student
 *    already has on the stage, precisely so it cannot be a hint about a
 *    different one — and when the stage is empty it takes the next slide that is
 *    not finished and says nothing about that either.
 * 3. **Never completes the step.** `engine.step()` must read the same before and
 *    after — and at every moment in between, since the demonstrations are keyed
 *    to the step they were built for. The set-up step ends when the lamp is on
 *    AND the 10× is in, so the demonstration deliberately leaves the nosepiece
 *    on the 40× and hands that last press over.
 * 4. **Never logs a slip.** It will not clip a slide on under a dark field or
 *    under the 40×, which are the two penalties `mount` can hand out.
 * 5. **Never cracks a slide.** Every rack and every change of objective is
 *    checked against the working distance of the lens that will be in place
 *    afterwards. A cracked slide has no spare, and it is the one accident on
 *    this bench that cannot be undone.
 */

/** The least a demonstration needs of the bench. The tour context satisfies it. */
export interface DemoCtx {
  state: CellDivisionState;
  /** Applies an action and returns the resulting state, synchronously. */
  dispatch: (action: CellDivisionAction) => CellDivisionState;
  now: () => number;
}

/** Medium: enough for the 10×, and the position the demonstration settles on. */
export const DEMO_LAMP = 2;

/**
 * The slide the demonstration works on.
 *
 * Whatever is already clipped to the stage, so a student pressing "show me" gets
 * their own slide driven rather than a hint about another one. Only when the
 * stage is empty does it take one out of the box, and then the next unfinished
 * one — the same one they were going to reach for.
 */
export function demoSlide(state: CellDivisionState): number | null {
  if (state.mounted !== null && !state.tray[state.mounted]?.broken) return state.mounted;
  const next = state.tray.findIndex((s) => !s.broken && !slideDone(s));
  if (next >= 0) return next;
  const any = state.tray.findIndex((s) => !s.broken);
  return any >= 0 ? any : null;
}

/** Where this slide comes into focus under this objective. */
function planeFor(state: CellDivisionState, objective: Objective): number | null {
  const slide = mountedSlide(state);
  return slide ? focalPlane(objective) + slide.dz : null;
}

// ---------------------------------------------------------------------------
// Setting the instrument up
// ---------------------------------------------------------------------------

/**
 * Swing an objective in, when doing so can neither crack a slide nor end a step.
 *
 * The set-up step ends the moment the lamp is on and the **10×** is in place, so
 * that combination is refused there: the demonstration shows the 40× barrel and
 * the lamp, and leaves the press that completes the set-up to the student.
 */
export function swingIn(objective: Objective) {
  return ({ state, dispatch, now }: DemoCtx): void => {
    if (locked(state) || state.objective === objective) return;
    // `setObjective` drives the tube down to the crash height when the new
    // barrel is longer than the room left, and breaks whatever is under it.
    if (state.h > crashHeight(objective)) return;
    if (state.step === STEP.setup && objective === 10 && state.lamp > 0) return;
    dispatch({ type: 'setObjective', objective, now: now() });
  };
}

/**
 * Turn the lamp up to `DEMO_LAMP`, one position at a time, as the dial really
 * works. Refused at the set-up step while the 10× is in, for the same reason.
 */
export function turnTheLampUp({ state, dispatch }: DemoCtx): void {
  if (locked(state)) return;
  if (state.step === STEP.setup && state.objective === 10) return;
  let s = state;
  for (let i = 0; i < 4 && s.lamp !== DEMO_LAMP; i += 1) s = dispatch({ type: 'cycleLamp' });
}

// ---------------------------------------------------------------------------
// One slide, from the box to a high-power view
// ---------------------------------------------------------------------------

/** Lamp on and the low-power objective in place — the state every slide starts from. */
export function readyTheInstrument(ctx: DemoCtx): void {
  swingIn(10)(ctx);
  let s = ctx.state;
  for (let i = 0; i < 4 && s.lamp < DEMO_LAMP; i += 1) s = ctx.dispatch({ type: 'cycleLamp' });
}

/**
 * Clip the demonstration slide to the stage.
 *
 * Only under a lit field and the 10×: `mount` docks marks for a slide that goes
 * on in the dark or under the high-power objective, and a demonstration that
 * logged either would have put a line in the student's own mistake book.
 */
export function clipTheSlideOn({ state, dispatch, now }: DemoCtx): void {
  if (locked(state) || state.mounted !== null) return;
  if (state.lamp === 0 || state.objective !== 10) return;
  const index = demoSlide(state);
  if (index === null) return;
  if (clearance(state.objective, state.h) < 8) return;
  dispatch({ type: 'mountSlide', index, now: now() });
}

/**
 * Rack the body tube to this objective's plane of best focus.
 *
 * At 10× nothing here is marked: `noteBest` only records a view under the 40×.
 * Every step is checked against the crash height first, so the loop cannot reach
 * the coverslip however far out of focus it started.
 */
export function rackToFocus(knob: 'coarse' | 'fine') {
  return ({ state, dispatch, now }: DemoCtx): void => {
    if (locked(state)) return;
    let s = state;
    const target = planeFor(s, s.objective);
    if (target === null) return;
    const step = knob === 'coarse' ? COARSE : FINE;
    const limit = crashHeight(s.objective);
    for (let i = 0; i < 40; i += 1) {
      const d = target - s.h;
      if (Math.abs(d) <= step / 2) return;
      const dir: 1 | -1 = d > 0 ? 1 : -1;
      if (s.h + dir * step > limit) return;
      s = dispatch({ type: 'rack', knob, dir, now: now() });
      if (mountedSlide(s)?.broken) return;
    }
  };
}

/**
 * Walk the mechanical stage until the specimen sits in the middle of the field.
 *
 * Arrow by arrow, the way the four buttons do it, so the dust in the mountant
 * drifts past and the student can see that the stage really moved. Nothing about
 * where a specimen IS is marked — what is marked is naming it.
 */
export function centreTheSpecimen({ state, dispatch }: DemoCtx): void {
  if (locked(state)) return;
  let s = state;
  for (let i = 0; i < 60; i += 1) {
    const slide = mountedSlide(s);
    if (!slide || slide.broken) return;
    const dx = slide.sx - s.pos.x;
    const dy = slide.sy - s.pos.y;
    if (Math.abs(dx) <= MOVE_STEP / 2 && Math.abs(dy) <= MOVE_STEP / 2) return;
    const dir =
      Math.abs(dx) > MOVE_STEP / 2 ? (dx > 0 ? 'r' : 'l') : dy > 0 ? 'd' : 'u';
    s = dispatch({ type: 'moveStage', dir });
  }
}

/** The width of the two fields, for the commentary to quote rather than assert. */
export const FIELD_MM = {
  low: OBJECTIVES[10].R * 2,
  high: OBJECTIVES[40].R * 2,
} as const;
