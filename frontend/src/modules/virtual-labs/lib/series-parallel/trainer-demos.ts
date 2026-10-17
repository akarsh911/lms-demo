import type { Wire } from '../circuit';

import {
  CONFIGS,
  P,
  TAP_IDS,
  canonOf,
  cellsUsed,
  tapId,
  tapsWired,
  type ConfigSpec,
  type TerminalId,
} from './apparatus';
import { diagnose } from './diagnose';
import type { LabAction } from './reducer';
import { configOf, stageOf } from './reducer';
import { solveBench } from './solve';
import type { LabState } from './state';

/**
 * WHAT THE VISUAL TRAINER ACTUALLY DOES on the series/parallel bench.
 *
 * The narration lives with the cards in
 * `@labs/components/series-parallel/trainer.tsx`; this is the other half — the
 * hands. It is pure, so the one thing that must be true of it can be checked
 * without a browser: drive every demonstration from plain Node and the marks,
 * the mistake log and the attempt record come back untouched.
 *
 * THREE RULES, and every function here keeps all three.
 *
 * 1. **Never the marked act.** It lays wires, it moves the lead, it puts the
 *    plug in and takes it out again — it never presses *Check least counts*,
 *    never presses *Check my circuit* for any of the four circuits, never
 *    presses *Record*, never submits a calculation and never answers a viva
 *    question. The workspace would put those back — it restores a snapshot —
 *    but restoring them is not the point. The practical is the student's to do.
 * 2. **Never logs a slip.** This is the hard one on an electrical bench, where
 *    a mistake is a physical event rather than a wrong answer: a short, an
 *    over-ranged ammeter (which the PARALLEL combination can genuinely reach,
 *    being the smallest resistance of the four), a needle kicking backwards, a
 *    key inserted with more than one cell behind the circuit, a key left in
 *    long enough to warm the coils. So every hand here keeps three habits:
 *      - **Nothing is ever wired live.** Laying a wire, clearing the bench and
 *        moving the lead along the holder each take the plug OUT first, which
 *        is what a student is told to do and is also what makes a half-built
 *        circuit electrically silent: `settle` returns immediately with the key
 *        out, so no intermediate state can be judged.
 *      - **The plug only goes back in when the circuit as it stands is safe**,
 *        which `safeToClose` decides by SOLVING the bench with the key forced
 *        closed and refusing anything that would draw a short, drive the
 *        ammeter past its stop, deflect either needle backwards, or count as
 *        inserting the key above the smallest current.
 *      - **Only one cell tap ever carries a lead.** The old lead comes off
 *        before the new one goes on, so the holder is never momentarily
 *        shorted between two studs.
 * 3. **The teaching layer is a card, not a hand.** The "What's happening" panel
 *    is opened by the workspace's own switch and there is nothing here to press
 *    for it; the card that points at that switch is left OUT of the script when
 *    the `teach` flag is off.
 *
 * WHY EACH HAND THREADS ITS OWN STATE. `ctx.state` is the bench as it was when
 * the card mounted. A hand that dispatches twice must read the state the first
 * dispatch RETURNED, or its second action is computed against a bench that no
 * longer exists — which is exactly how a second lead ends up on the holder.
 */

/** The least a demonstration needs of the bench. The tour context satisfies it. */
export interface DemoCtx {
  state: LabState;
  /** Applies an action and returns the resulting state, synchronously. */
  dispatch: (action: LabAction) => LabState;
  now: () => number;
}

/** One thing a demonstration does on the bench. */
export type Hand = (ctx: DemoCtx) => void;

// ---------------------------------------------------------------------------
// Safety, decided by solving the bench rather than by pattern matching
// ---------------------------------------------------------------------------

function isTap(id: TerminalId): boolean {
  return TAP_IDS.includes(id);
}

/**
 * Whether the plug may go in RIGHT NOW without putting a line in the student's
 * mistake log.
 *
 * It re-solves the student's own bench with the key forced closed — the same
 * thing the reducer's `settle` will do a moment later — and refuses anything
 * `settle` would report. It then asks the question `onKeyInserted` asks, so a
 * demonstration can never earn the "key inserted above the smallest current"
 * deduction either.
 *
 * It is deliberately stricter than the reducer: the reducer warns once per
 * incident, so a bench that has ALREADY been shorted would not log a second
 * time. Refusing anyway costs nothing — the card still reads — and keeps this
 * answer a property of the circuit rather than of what has happened to it.
 */
export function safeToClose(s: LabState): boolean {
  if (s.key) return false;
  const r = solveBench({ ...s, key: true });
  if (Math.abs(r.Ibat) > P.shortI) return false;
  if (Math.abs(r.Iam) > P.amFS * 1.05) return false;
  if (r.Iam < -0.01 || r.Vvm < -0.05) return false;

  // The one deduction that is earned by the act of inserting the key.
  const stage = stageOf(s);
  if (stage?.type !== 'start' || !s.cfg[stage.cfg].ok) return true;
  const dx = diagnose(s, CONFIGS[stage.cfg]);
  if (!dx.ok) return true; // `onKeyInserted` gives up before it can deduct
  if (s.method === 'cells') return cellsUsed(s.wires, s.method) <= 1;
  const minI = Math.min(Math.abs(dx.lo.Iam), Math.abs(dx.hi.Iam));
  return Math.abs(r.Iam) <= minI * 1.08;
}

// ---------------------------------------------------------------------------
// The plug key
// ---------------------------------------------------------------------------

/** Plug out. Nothing on this bench is ever rewired live. */
export const takeTheKeyOut: Hand = ({ state, dispatch, now }) => {
  if (state.key) dispatch({ type: 'toggleKey', now: now() });
};

/** Plug in — but only onto a circuit that is safe to close. */
export const putTheKeyIn: Hand = ({ state, dispatch, now }) => {
  if (safeToClose(state)) dispatch({ type: 'toggleKey', now: now() });
};

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/**
 * Every wire off, so the next circuit can be laid in the order the current
 * flows. Three of the four circuits are reached with the previous one still on
 * the bench, and seeing it come off is half of what "rewire for the next one"
 * means.
 *
 * The plug comes out first, which is what makes the empty bench that follows
 * electrically silent rather than an open circuit the assistant has to judge.
 */
export const clearTheBench: Hand = (ctx) => {
  // Taking the plug out cannot change the wiring, so the wires read here are
  // still the wires there are.
  takeTheKeyOut(ctx);
  if (ctx.state.wires.length) ctx.dispatch({ type: 'clearWires', now: ctx.now() });
};

/** One wire, from a to b — skipped when that wire is already there. */
export function layWire(a: TerminalId, b: TerminalId): Hand {
  return (ctx) => {
    takeTheKeyOut(ctx);
    const { state, dispatch, now } = ctx;
    if (state.wires.some((w) => (w[0] === a && w[1] === b) || (w[0] === b && w[1] === a))) return;
    dispatch({ type: 'connect', a, b, now: now() });
  };
}

/** The circuit this stage is about, falling back to the first of the four. */
export function configForDemo(state: LabState): ConfigSpec {
  return configOf(state) ?? CONFIGS.r1;
}

/** The textbook layout for that circuit on whichever apparatus is on the bench. */
export function textbookWires(state: LabState): readonly Wire<TerminalId>[] {
  return canonOf(configForDemo(state), state.method);
}

// ---------------------------------------------------------------------------
// The control that varies the current
// ---------------------------------------------------------------------------

/**
 * Move the single lead on the holder to the stud `k` cells along.
 *
 * THE OLD LEAD COMES OFF FIRST. Two studs wired is a wire lying straight across
 * the cells between them — a short, and one the assistant diagnoses by name. So
 * every tap wire is removed (highest index first, so the ones below keep their
 * indices) and exactly one is laid again on the stud we want, carrying whatever
 * the first of them was joined to.
 */
export function moveTheLeadTo(k: number): Hand {
  return (ctx) => {
    const { dispatch, now } = ctx;
    if (ctx.state.method !== 'cells') return;
    const target = tapId(k);
    let s = ctx.state;
    if (s.key) s = dispatch({ type: 'toggleKey', now: now() });
    if (tapsWired(s.wires) === 1 && cellsUsed(s.wires, s.method) === k) return;
    const ends: TerminalId[] = [];
    for (let i = s.wires.length - 1; i >= 0; i -= 1) {
      const w = s.wires[i]!;
      const tap = isTap(w[0]) ? w[0] : isTap(w[1]) ? w[1] : null;
      if (!tap) continue;
      ends.unshift(w[0] === tap ? w[1] : w[0]);
      s = dispatch({ type: 'removeWire', index: i, now: now() });
    }
    const end = ends[0];
    if (end) dispatch({ type: 'connect', a: target, b: end, now: now() });
  };
}

/** The whole coil in circuit: current enters at A and leaves at the slider. */
export const setTheRheostatToMaximum: Hand = (ctx) => {
  const { dispatch, now } = ctx;
  if (ctx.state.method !== 'rheostat') return;
  let s = ctx.state;
  if (s.key) s = dispatch({ type: 'toggleKey', now: now() });
  if (s.s < 0.999) dispatch({ type: 'setSlider', s: 1, now: now() });
};

/**
 * The smallest current this arrangement can be given, by whichever control the
 * bench has: one cell, or the whole coil.
 */
export const startAtTheSmallestCurrent: Hand = (ctx) => {
  if (ctx.state.method === 'cells') moveTheLeadTo(1)(ctx);
  else setTheRheostatToMaximum(ctx);
};

/**
 * A fresh operating point for the next reading, under the rheostat method.
 *
 * It moves by a quarter of the travel and stays in the upper half, so the three
 * points of a circuit spread out without ever walking the ammeter towards its
 * stop — which on this bench matters, because the parallel combination is the
 * smallest resistance of the four and draws the largest current.
 */
export const moveTheSliderOn: Hand = (ctx) => {
  const { dispatch, now } = ctx;
  if (ctx.state.method !== 'rheostat') return;
  let s = ctx.state;
  if (s.key) s = dispatch({ type: 'toggleKey', now: now() });
  const next = s.s >= 0.75 ? s.s - 0.25 : Math.min(1, s.s + 0.25);
  dispatch({ type: 'setSlider', s: next, now: now() });
};

/** Which tap the next reading of this circuit belongs on. */
export function nextTap(state: LabState): TerminalId {
  const used = Math.max(1, cellsUsed(state.wires, state.method));
  return tapId(Math.min(used + 1, P.cells));
}

// ---------------------------------------------------------------------------
// The close-up
// ---------------------------------------------------------------------------

export const openTheAmmeter: Hand = ({ dispatch }) => {
  dispatch({ type: 'openLens', meter: 'am' });
};

export const openTheVoltmeter: Hand = ({ dispatch }) => {
  dispatch({ type: 'openLens', meter: 'vm' });
};

export const closeTheCloseUp: Hand = ({ dispatch }) => {
  dispatch({ type: 'closeLens' });
};

/**
 * EVERY HAND THIS BENCH HAS, for the Node harness that proves none of them can
 * move a mark. The wire-laying hands are built per circuit and per method,
 * because the textbook layout is.
 */
export function everyHand(state: LabState): readonly Hand[] {
  return [
    takeTheKeyOut,
    putTheKeyIn,
    clearTheBench,
    startAtTheSmallestCurrent,
    setTheRheostatToMaximum,
    moveTheSliderOn,
    openTheAmmeter,
    openTheVoltmeter,
    closeTheCloseUp,
    ...Array.from({ length: P.cells }, (_, i) => moveTheLeadTo(i + 1)),
    ...textbookWires(state).map(([a, b]) => layWire(a, b)),
  ];
}
