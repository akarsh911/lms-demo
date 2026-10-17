import { CAP, POUR, tubeVol, tubeWith, type LitmusId } from './chemistry';
import type { AcidBaseAction } from './reducer';
import type { AcidBaseState } from './state';

/**
 * WHAT THE VISUAL TRAINER ACTUALLY DOES on the acid/alkali bench.
 *
 * The narration lives with the tour steps in `@labs/components/acid-base/`; this
 * is the hands. Pure, so the thing that must be true of it can be checked
 * without a browser: drive every demonstration from plain Node and the marks,
 * the mistake log and the attempt record come back untouched.
 *
 * THREE RULES, kept by every function here.
 *
 * 1. **Never the marked act.** It fills tubes, drops litmus in, tips a solid in
 *    and brings a test to the mouth of a tube; it never writes a row of the
 *    observation table, never presses **Submit the table**, and never answers a
 *    conclusion or a viva question. Those are where 64 of the 100 marks are
 *    decided, and they are the student's.
 * 2. **Never completes the step.** Every stage on this bench ends on a
 *    condition the demonstration could otherwise trip — the eighth pour, the
 *    fourth litmus test, the gas test on the acid tube of a pair — and the
 *    procedure moving on would swap the script out from under the
 *    demonstration keyed to it. So the pair a gas demonstration uses is run
 *    from clean and only ever half set up, and a pour or a litmus drop that
 *    would finish its stage is simply not made.
 * 3. **Never logs a slip.** A solution only ever goes into a tube labelled for
 *    it and a tube only ever gets the litmus its label calls for, so neither
 *    contamination nor a wrong-litmus note can be charged; a tube that is too
 *    full is emptied and rinsed first, so nothing overflows.
 *
 * THE TIMING LESSON. The reference teaches, by demonstration rather than by
 * assertion, that a gas test made the instant the solid lands finds nothing.
 * Hydrogen comes off at 0.15 mL/s and a test at the mouth needs 0.15 mL, so a
 * tube left fizzing for even two seconds would **pop** — which means the lesson
 * only survives if the tipping and the testing happen in ONE synchronous burst.
 * That is why `testTheGasTooSoon` starts its tube over rather than testing the
 * one the previous step left fizzing.
 */

/** The least a demonstration needs of the bench. The tour context satisfies it. */
export interface DemoCtx {
  state: AcidBaseState;
  /** Applies an action and returns the resulting state, synchronously. */
  dispatch: (action: AcidBaseAction) => AcidBaseState;
  now: () => number;
}

/** The two tubes of the zinc pair, and of the carbonate pair. */
export const zincAcid = (s: AcidBaseState): number => tubeWith(s.layout, 'HCl', 'Zn');
export const zincAlkali = (s: AcidBaseState): number => tubeWith(s.layout, 'NaOH', 'Zn');
export const carbAcid = (s: AcidBaseState): number => tubeWith(s.layout, 'HCl', 'Na2CO3');
export const carbAlkali = (s: AcidBaseState): number => tubeWith(s.layout, 'NaOH', 'Na2CO3');

/** The tube the pour demonstration fills: acid, blue litmus, on every bench. */
export const pourDemoTube = (s: AcidBaseState): number => tubeWith(s.layout, 'HCl', 'blue');

export const idOf = (s: AcidBaseState, i: number): string => s.layout[i]?.id ?? '?';

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Would filling `k` correctly be the pour that finishes the rack? */
export function pourWouldFinish(s: AcidBaseState, k: number): boolean {
  return s.tubes.every((t, i) => {
    if (i === k) return true;
    const want = s.layout[i]!.reagent;
    return t.liq[want] >= POUR && t.poured.every((a) => a === want);
  });
}

/**
 * A litmus tube to demonstrate on: one still without its own litmus while
 * dipping it leaves another undone, otherwise one already dipped, where three
 * more drops of the same dye change nothing the procedure is waiting for.
 */
export function litmusDemoTube(s: AcidBaseState): number {
  const four = [0, 1, 2, 3];
  const undone = four.filter((i) => s.tubes[i]!.drops[s.layout[i]!.test as LitmusId] === 0);
  if (undone.length >= 2) return undone[0]!;
  const done = four.filter((i) => !undone.includes(i));
  return done[0] ?? undone[0] ?? 0;
}

/** Whether a gas test on `acid` would be the act that finishes its stage. */
function gasTestWouldFinish(s: AcidBaseState, acid: number, alkali: number, solid: 'Zn' | 'Na2CO3'): boolean {
  return s.tubes[acid]!.put[solid] > 0 && s.tubes[alkali]!.put[solid] > 0;
}

// ---------------------------------------------------------------------------
// Hands
// ---------------------------------------------------------------------------

function pickUp(c: DemoCtx, held: DemoCtx['state']['held']): AcidBaseState {
  return c.dispatch({ type: 'pickUp', held, now: c.now() });
}

/** Put whatever is in hand back on the bench. */
export function handsDown(c: DemoCtx): void {
  c.dispatch({ type: 'pickUp', held: null, now: c.now() });
}

/** Empty a tube and refill it with exactly the solution its label calls for. */
function fromClean(c: DemoCtx, k: number): AcidBaseState {
  c.dispatch({ type: 'rinse', tube: k, now: c.now() });
  pickUp(c, { kind: 'reagent', id: c.state.layout[k]!.reagent });
  return c.dispatch({ type: 'tapTube', tube: k, now: c.now() });
}

// ---------------------------------------------------------------------------
// Filling the tubes
// ---------------------------------------------------------------------------

export function takeTheAcidBottle(c: DemoCtx): void {
  const held = c.state.held;
  if (held?.kind === 'reagent' && held.id === 'HCl') return;
  pickUp(c, { kind: 'reagent', id: 'HCl' });
}

/** Fill the acid/blue-litmus tube, from clean if it is already near the brim. */
export function fillItsOwnTube(c: DemoCtx): void {
  const k = pourDemoTube(c.state);
  if (k < 0 || pourWouldFinish(c.state, k)) return;
  if (tubeVol(c.state.tubes[k]!) + POUR > CAP) c.dispatch({ type: 'rinse', tube: k, now: c.now() });
  const held = c.state.held;
  if (!(held?.kind === 'reagent' && held.id === 'HCl')) pickUp(c, { kind: 'reagent', id: 'HCl' });
  c.dispatch({ type: 'tapTube', tube: k, now: c.now() });
}

/** Change bottles: the alkali tubes take the other one. */
export function takeTheAlkaliBottle(c: DemoCtx): void {
  pickUp(c, { kind: 'reagent', id: 'NaOH' });
}

// ---------------------------------------------------------------------------
// Litmus
// ---------------------------------------------------------------------------

/** Pick up the litmus a tube's own label calls for, and put three drops in. */
export function dipTheLitmusItsLabelCallsFor(c: DemoCtx): void {
  const k = litmusDemoTube(c.state);
  const id = c.state.layout[k]!.test as LitmusId;
  const undone = [0, 1, 2, 3].filter((i) => c.state.tubes[i]!.drops[c.state.layout[i]!.test as LitmusId] === 0);
  // The fourth litmus test carries the procedure to the zinc stage.
  if (undone.length === 1 && undone[0] === k) return;
  pickUp(c, { kind: 'litmus', id });
  c.dispatch({ type: 'tapTube', tube: k, now: c.now() });
}

// ---------------------------------------------------------------------------
// The two gas pairs
// ---------------------------------------------------------------------------

/**
 * Run a pair of tubes from clean.
 *
 * Both, not just the one being demonstrated on: emptying the partner is what
 * takes its solid back to zero, and with no solid in the partner the stage
 * cannot end however the demonstration goes.
 */
export function runTheZincPairFromClean(c: DemoCtx): void {
  fromClean(c, zincAlkali(c.state));
  fromClean(c, zincAcid(c.state));
  handsDown(c);
}

export function runTheCarbonatePairFromClean(c: DemoCtx): void {
  fromClean(c, carbAlkali(c.state));
  fromClean(c, carbAcid(c.state));
  handsDown(c);
}

export function takeTheZincJar(c: DemoCtx): void {
  pickUp(c, { kind: 'jar', id: 'Zn' });
}

export function takeTheCarbonateJar(c: DemoCtx): void {
  pickUp(c, { kind: 'jar', id: 'Na2CO3' });
}

/** A spatula into the acid tube of the pair. The alkali one is left for the student. */
export function tipASpatulaIntoTheAcidTube(c: DemoCtx): void {
  const k = zincAcid(c.state);
  if (gasTestWouldFinish(c.state, k, zincAlkali(c.state), 'Zn')) return;
  pickUp(c, { kind: 'jar', id: 'Zn' });
  c.dispatch({ type: 'tapTube', tube: k, now: c.now() });
}

export function tipCarbonateIntoTheAcidTube(c: DemoCtx): void {
  const k = carbAcid(c.state);
  if (gasTestWouldFinish(c.state, k, carbAlkali(c.state), 'Na2CO3')) return;
  pickUp(c, { kind: 'jar', id: 'Na2CO3' });
  c.dispatch({ type: 'tapTube', tube: k, now: c.now() });
}

export function takeTheSplinter(c: DemoCtx): void {
  pickUp(c, { kind: 'splinter' });
}

export function takeTheLimeWater(c: DemoCtx): void {
  pickUp(c, { kind: 'lime' });
}

/**
 * THE TIMING LESSON, demonstrated rather than asserted.
 *
 * The tube is started over and tested in the same breath, because hydrogen
 * reaches the 0.15 mL a mouth test can see inside about a second: test it any
 * later and the splinter pops, and the lesson — that a test made too early
 * finds nothing — would not be there to learn.
 */
export function testTheGasTooSoon(c: DemoCtx): void {
  const k = zincAcid(c.state);
  if (gasTestWouldFinish(c.state, k, zincAlkali(c.state), 'Zn')) return;
  fromClean(c, k);
  pickUp(c, { kind: 'jar', id: 'Zn' });
  c.dispatch({ type: 'tapTube', tube: k, now: c.now() });
  pickUp(c, { kind: 'splinter' });
  c.dispatch({ type: 'tapTube', tube: k, now: c.now() });
}

/** The same lesson on the carbonate pair, through the lime water. */
export function passTheGasTooSoon(c: DemoCtx): void {
  const k = carbAcid(c.state);
  if (gasTestWouldFinish(c.state, k, carbAlkali(c.state), 'Na2CO3')) return;
  fromClean(c, k);
  pickUp(c, { kind: 'jar', id: 'Na2CO3' });
  c.dispatch({ type: 'tapTube', tube: k, now: c.now() });
  pickUp(c, { kind: 'lime' });
  c.dispatch({ type: 'tapTube', tube: k, now: c.now() });
}

// ---------------------------------------------------------------------------
// Writing it down
// ---------------------------------------------------------------------------

/** Open one tube in the close-up and put the table on its row. Neither is marked. */
export function openTheFirstTube(c: DemoCtx): void {
  handsDown(c);
  c.dispatch({ type: 'tapTube', tube: 0, now: c.now() });
  c.dispatch({ type: 'goToRow', row: 0 });
}

/** The comparison the pair exists for: the alkali tube of the zinc pair. */
export function openTheAlkaliOfThePair(c: DemoCtx): void {
  handsDown(c);
  const k = zincAlkali(c.state);
  c.dispatch({ type: 'tapTube', tube: k, now: c.now() });
  c.dispatch({ type: 'goToRow', row: k });
}
