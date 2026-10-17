import { CAP, POUR, SHAKES_MIN, type WaterId } from './chemistry';
import { TUBE_A, TUBE_B } from './marking';
import type { SoapAction } from './reducer';
import { tubeAt, volumeIn, type Held, type SoapState } from './state';

/**
 * WHAT THE VISUAL TRAINER ACTUALLY DOES on the hard-water bench.
 *
 * The narration lives with the tour steps in `@labs/components/soap/`; this is
 * the hands. Pure, so the thing that must be true of it can be checked without
 * a browser: drive every demonstration from plain Node and the marks, the
 * mistake log and the attempt record come back untouched.
 *
 * THREE RULES, kept by every function here.
 *
 * 1. **Never the marked act.** It pours, squeezes the dropper, corks and
 *    shakes, and stands the scale against a tube; it never types a froth
 *    height, never picks scum or none, never writes the extension's number of
 *    drops, never chooses a conclusion and never submits any of them. Those
 *    decide every one of the 100 marks bar the setup.
 * 2. **Never completes the step.** Four of the eight stages end when a PAIR has
 *    been done — both tubes filled, both soaped, both shaken, both measured —
 *    so the demonstration always does one of the pair and hands the other over.
 *    That is not only a technicality here: **the pair IS the fair test**, and a
 *    student who watched both halves done for them has watched the experiment
 *    rather than run it.
 * 3. **Never logs a slip.** Water only ever goes into the tube labelled for it,
 *    and a tube that could not take another 5 mL is emptied and rinsed first.
 */

/** The least a demonstration needs of the bench. The tour context satisfies it. */
export interface DemoCtx {
  state: SoapState;
  /** Applies an action and returns the resulting state, synchronously. */
  dispatch: (action: SoapAction) => SoapState;
  now: () => number;
}

/** Which water belongs in which tube. A is the soft-water tube, B the hard. */
export const waterFor = (index: number): WaterId => (index === TUBE_B ? 'hard' : 'soft');

// ---------------------------------------------------------------------------
// Which of the pair to demonstrate on
// ---------------------------------------------------------------------------

/**
 * Each of these four stages ends when BOTH tubes have had the thing done to
 * them, so there is always one that can be demonstrated without finishing the
 * step: the one whose partner is still outstanding, or — once the partner is
 * done — the partner itself again, where repeating it changes nothing the
 * procedure is waiting for.
 */
export const fillTube = (s: SoapState): number => (volumeIn(s, TUBE_B) > 0 ? TUBE_B : TUBE_A);

export const soapTube = (s: SoapState): number => (tubeAt(s, TUBE_B).drops > 0 ? TUBE_B : TUBE_A);

export const shakeTubeIndex = (s: SoapState): number =>
  tubeAt(s, TUBE_B).shakes >= SHAKES_MIN ? TUBE_B : TUBE_A;

export const measureTubeIndex = (s: SoapState): number =>
  tubeAt(s, TUBE_B).measured ? TUBE_B : TUBE_A;

/** The other one: what the narration hands over. */
export const partnerOf = (k: number): number => (k === TUBE_A ? TUBE_B : TUBE_A);

// ---------------------------------------------------------------------------
// Hands
// ---------------------------------------------------------------------------

function hold(c: DemoCtx, held: Held): void {
  c.dispatch({ type: 'putDown' });
  c.dispatch({ type: 'pickUp', held });
}

export function handsDown(c: DemoCtx): void {
  c.dispatch({ type: 'putDown' });
}

// ---------------------------------------------------------------------------
// Equal volumes
// ---------------------------------------------------------------------------

/**
 * Start both tubes clean, so the demonstration is the same every time and
 * nothing left over from an earlier run is mistaken for a result.
 *
 * Emptying both is also what makes the pour below safe: with the partner empty,
 * filling one tube cannot be the act that ends the stage.
 */
export function emptyBothTubes(c: DemoCtx): void {
  handsDown(c);
  c.dispatch({ type: 'emptyTube', index: TUBE_A, now: c.now() });
  c.dispatch({ type: 'emptyTube', index: TUBE_B, now: c.now() });
}

export function takeTheDistilledWater(c: DemoCtx): void {
  hold(c, { kind: 'water', id: waterFor(fillTube(c.state)) });
}

/** Five millilitres into the tube labelled for that water, and no other. */
export function pourIntoItsOwnTube(c: DemoCtx): void {
  const k = fillTube(c.state);
  if (volumeIn(c.state, k) + POUR > CAP) c.dispatch({ type: 'emptyTube', index: k, now: c.now() });
  hold(c, { kind: 'water', id: waterFor(k) });
  c.dispatch({ type: 'tapTube', index: k, now: c.now() });
}

export function takeTheHardWater(c: DemoCtx): void {
  hold(c, { kind: 'water', id: 'hard' });
}

// ---------------------------------------------------------------------------
// Equal soap
// ---------------------------------------------------------------------------

export function takeTheDropper(c: DemoCtx): void {
  hold(c, { kind: 'soap' });
}

/** Two squeezes into one of the pair. The same two into the other are the student's. */
export function twoSqueezesIntoOne(c: DemoCtx): void {
  const k = soapTube(c.state);
  hold(c, { kind: 'soap' });
  c.dispatch({ type: 'tapTube', index: k, now: c.now() });
  c.dispatch({ type: 'tapTube', index: k, now: c.now() });
}

// ---------------------------------------------------------------------------
// Equal shaking
// ---------------------------------------------------------------------------

export function takeACork(c: DemoCtx): void {
  hold(c, { kind: 'cork' });
}

/** Three shakes — the minimum — on one of the pair. */
export function threeShakesOnOne(c: DemoCtx): void {
  const k = shakeTubeIndex(c.state);
  hold(c, { kind: 'cork' });
  for (let i = 0; i < SHAKES_MIN; i += 1) c.dispatch({ type: 'tapTube', index: k, now: c.now() });
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

export function takeTheScale(c: DemoCtx): void {
  hold(c, { kind: 'scale' });
}

/** Stand the scale against one tube. Reading the number off it is the student's. */
export function standTheScaleAgainstOne(c: DemoCtx): void {
  const k = measureTubeIndex(c.state);
  hold(c, { kind: 'scale' });
  c.dispatch({ type: 'tapTube', index: k, now: c.now() });
}

// ---------------------------------------------------------------------------
// Looking
// ---------------------------------------------------------------------------

/** Bring a tube into the close-up. Looking is not marked and never has been. */
export function look(c: DemoCtx, index: number): void {
  handsDown(c);
  c.dispatch({ type: 'selectTube', index });
}

export const lookAtTheSoftTube = (c: DemoCtx): void => look(c, TUBE_A);
export const lookAtTheHardTube = (c: DemoCtx): void => look(c, TUBE_B);

// ---------------------------------------------------------------------------
// The extension
// ---------------------------------------------------------------------------

/**
 * Carry the extension on by one round: a squeeze of soap into the hard-water
 * tube, then a shake.
 *
 * Safe at any point in the extension stage — that stage is left only by
 * pressing **Submit** or **Skip**, and the trainer presses neither. **How many
 * drops it takes is the marked answer**, so one round is all that is shown and
 * the counting is left where it belongs.
 */
export function oneMoreRoundOfSoap(c: DemoCtx): void {
  hold(c, { kind: 'soap' });
  c.dispatch({ type: 'tapTube', index: TUBE_B, now: c.now() });
}

export function thenACork(c: DemoCtx): void {
  hold(c, { kind: 'cork' });
}

export function andAShake(c: DemoCtx): void {
  hold(c, { kind: 'cork' });
  c.dispatch({ type: 'tapTube', index: TUBE_B, now: c.now() });
}
