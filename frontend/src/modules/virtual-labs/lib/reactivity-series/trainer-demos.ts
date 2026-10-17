import {
  CAP,
  METALS,
  POUR,
  SALTS,
  tubeIndex,
  volumeOf,
  type Metal,
  type Salt,
} from './chemistry';
import type { RxAction } from './reducer';
import type { RxState } from './state';

/**
 * WHAT THE VISUAL TRAINER ACTUALLY DOES on the reactivity-series bench.
 *
 * The narration lives with the tour steps in
 * `@labs/components/reactivity-series/`; this is the hands. Pure, so the thing
 * that must be true of it can be checked without a browser: drive every
 * demonstration from plain Node and the marks, the mistake log and the attempt
 * record come back untouched.
 *
 * THREE RULES, kept by every function here.
 *
 * 1. **Never the marked act.** It pours a solution, sands a metal and drops a
 *    strip in; it never writes a cell of the observation table, never submits
 *    it, never taps a metal into the order and never answers a viva question.
 *    Those decide 76 of the 100 marks.
 * 2. **Never completes the step.** The sixteenth pour and the sixteenth strip
 *    each carry the procedure on, and the script keyed to the step would be
 *    swapped out under the demonstration. So the last of either is left to the
 *    student, said out loud. The *watch* and *record* stages are safe by
 *    construction: only **Record observations** and **Submit** move them, and
 *    neither is ever pressed here.
 * 3. **Never logs a slip.** A solution only ever goes into a tube of its own
 *    group and a strip only ever into a tube labelled for its metal, so
 *    neither contamination nor a wrong strip can be charged; a tube that is
 *    already full is emptied and rinsed first.
 */

/** The least a demonstration needs of the bench. The tour context satisfies it. */
export interface DemoCtx {
  state: RxState;
  /** Applies an action and returns the resulting state, synchronously. */
  dispatch: (action: RxAction) => RxState;
  now: () => number;
}

/** The four tubes of one solution's group, top to bottom. */
export const groupTubes = (salt: Salt): number[] => METALS.map((m) => tubeIndex(m, salt));

// ---------------------------------------------------------------------------
// Choosing what to demonstrate on
// ---------------------------------------------------------------------------

/**
 * The group to pour: the first with a tube still empty, so the demonstration is
 * about work the student still has in front of them. Copper sulphate when the
 * rack is untouched — it is the blue one, and the easiest to see going in.
 */
export function demoSalt(s: RxState): Salt {
  const unfilled = SALTS.find((salt) =>
    groupTubes(salt).some((k) => {
      const t = s.tubes[k]!;
      return t.added.length === 0;
    }),
  );
  return unfilled ?? 'CuSO4';
}

/** Which tubes of that group still need their solution. */
export function tubesToFill(s: RxState, salt: Salt): number[] {
  return groupTubes(salt).filter((k) => s.tubes[k]!.added.length === 0);
}

/** Every tube still waiting for its own strip. */
export function tubesNeedingAStrip(s: RxState): number[] {
  return s.tubes.map((t, k) => (t.strip?.metal === t.metal ? -1 : k)).filter((k) => k >= 0);
}

/** The metal to demonstrate the sandpaper and a strip with. */
export function demoMetal(s: RxState): Metal {
  const waiting = tubesNeedingAStrip(s);
  const first = waiting[0];
  return first === undefined ? 'Zn' : s.tubes[first]!.metal;
}

/** A tube of that metal that still needs a strip. */
export function demoStripTube(s: RxState): number | null {
  const metal = demoMetal(s);
  const waiting = tubesNeedingAStrip(s).filter((k) => s.tubes[k]!.metal === metal);
  // The last strip on the whole rack carries the procedure on: that one is the
  // student's, and there is nothing else to demonstrate it on.
  if (tubesNeedingAStrip(s).length <= 1) return null;
  return waiting[0] ?? null;
}

/** The tube worth looking at: zinc in copper sulphate is the fastest on the bench. */
export const WATCH_TUBE = tubeIndex('Zn', 'CuSO4');

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Would filling `k` be the pour that finishes the rack? */
export function pourWouldFinish(s: RxState, k: number): boolean {
  return s.tubes.every((t, i) => i === k || (t.added.length > 0 && t.added.every((a) => a === t.salt)));
}

// ---------------------------------------------------------------------------
// Hands
// ---------------------------------------------------------------------------

export function handsDown(c: DemoCtx): void {
  c.dispatch({ type: 'hold', held: null });
}

/** Pick a dropper bottle up. Deterministic, rather than the bench's toggle. */
export function takeTheBottle(c: DemoCtx): void {
  c.dispatch({ type: 'hold', held: { kind: 'bottle', salt: demoSalt(c.state) } });
}

/**
 * Pour one group's solution into a tube of that group, from clean if the tube
 * is already near the brim. The tube is always one of the group's own four, so
 * contamination can never be charged.
 */
function pourInto(c: DemoCtx, k: number, salt: Salt): void {
  if (pourWouldFinish(c.state, k)) return;
  if (volumeOf(c.state.tubes[k]!) + POUR > CAP) c.dispatch({ type: 'empty', index: k, now: c.now() });
  c.dispatch({ type: 'hold', held: { kind: 'bottle', salt } });
  c.dispatch({ type: 'tapTube', index: k, now: c.now() });
}

/** The first tube of the group. */
export function pourTheFirstOfTheGroup(c: DemoCtx): void {
  const salt = demoSalt(c.state);
  const k = tubesToFill(c.state, salt)[0] ?? groupTubes(salt)[0]!;
  pourInto(c, k, salt);
}

/** And the second, so the point that all four take the same solution is made. */
export function pourTheSecondOfTheGroup(c: DemoCtx): void {
  const salt = demoSalt(c.state);
  const k = tubesToFill(c.state, salt)[0] ?? groupTubes(salt)[1]!;
  pourInto(c, k, salt);
}

// ---------------------------------------------------------------------------
// The metals
// ---------------------------------------------------------------------------

/** Rub a metal's strips until they shine. Not marked; what is marked is that
 * they were clean when the FIRST of them went into a tube. */
export function sandTheStrips(c: DemoCtx): void {
  c.dispatch({ type: 'hold', held: { kind: 'sand' } });
  c.dispatch({ type: 'tapMetal', metal: demoMetal(c.state), now: c.now() });
}

export function takeAStrip(c: DemoCtx): void {
  c.dispatch({ type: 'hold', held: { kind: 'strip', metal: demoMetal(c.state) } });
}

/** One strip, into a tube labelled for that metal — never the last one on the rack. */
export function dropTheStripIn(c: DemoCtx): void {
  const k = demoStripTube(c.state);
  if (k === null) return;
  c.dispatch({ type: 'hold', held: { kind: 'strip', metal: c.state.tubes[k]!.metal } });
  c.dispatch({ type: 'tapTube', index: k, now: c.now() });
}

// ---------------------------------------------------------------------------
// Watching and reading
// ---------------------------------------------------------------------------

/**
 * Let the lab clock run.
 *
 * Safe here in a way it is not on the reaction-types bench: nothing on this one
 * is ever heated, and the *watch* stage is left only by pressing **Record
 * observations**, which the trainer never presses.
 */
export function letFiveMinutesPass(c: DemoCtx): void {
  if (c.state.waitTo !== null) return;
  handsDown(c);
  c.dispatch({ type: 'wait', minutes: 5, now: c.now() });
}

/** Bring a tube into the close-up. Looking is not marked and never has been. */
export function lookAtATube(c: DemoCtx): void {
  handsDown(c);
  const k = c.state.tubes[WATCH_TUBE] ? WATCH_TUBE : 0;
  c.dispatch({ type: 'tapTube', index: k, now: c.now() });
}
