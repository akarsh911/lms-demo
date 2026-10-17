import { SAMPLE_BY_ID, volume, type SampleId } from './chemistry';
import type { PhAction } from './reducer';
import { tubeOf, type PhState } from './state';

/**
 * WHAT THE VISUAL TRAINER ACTUALLY DOES on the pH bench.
 *
 * The narration lives with the tour steps in `@labs/components/ph-samples/`;
 * this is the hands. Pure, so the thing that must be true of it can be checked
 * without a browser: drive every demonstration from plain Node and the marks,
 * the mistake log and the attempt record come back untouched.
 *
 * THREE RULES, kept by every function here.
 *
 * 1. **Never the marked act.** It pours, it dips a strip, it drops the
 *    indicator in; it never types a pH, never picks a nature, never taps a
 *    sample into the order and never presses submit. Every mark on this bench
 *    is decided by those four, and they are the student's.
 * 2. **Never completes the step.** Pouring the sixth tube would carry the
 *    procedure from *pour* to *test* underneath a demonstration keyed to
 *    *pour*, so a pour that would finish the rack is not made, and a test that
 *    would finish the rack is moved onto a tube that has already been tested.
 * 3. **Never logs a slip.** A sample only ever goes into the tube labelled for
 *    it, so contamination cannot be charged; a tube that already holds
 *    something is emptied and rinsed first, so it cannot overflow either.
 */

/** The least a demonstration needs of the bench. The tour context satisfies it. */
export interface DemoCtx {
  state: PhState;
  /** Applies an action and returns the resulting state, synchronously. */
  dispatch: (action: PhAction) => PhState;
  now: () => number;
}

/** The sample the demonstration is run with: the strong acid, on every bench. */
export const DEMO_SAMPLE: SampleId = 'HCl';

export const DEMO_SAMPLE_LABEL = SAMPLE_BY_ID[DEMO_SAMPLE].label;

/** Where that sample's tube sits on THIS rack — the layout comes from the seed. */
export function demoTube(s: PhState): number {
  return tubeOf(s, DEMO_SAMPLE);
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * Whether pouring the right sample into `k` would be the pour that finishes the
 * rack. True means the demonstration leaves the bottle in the air instead: the
 * step it is keyed to would otherwise end while it was still running.
 */
export function pourWouldFinish(s: PhState, k: number): boolean {
  return s.tubes.every((t, i) => i === k || (t.added.length > 0 && t.added.every((a) => a === t.sample)));
}

/** The same question for a test: would this be the last untested tube? */
export function testWouldFinish(s: PhState, k: number): boolean {
  return s.tubes.every((t, i) => i === k || t.tested !== null);
}

/**
 * A tube to demonstrate a test on. An UNTESTED one while testing it still
 * leaves another untested; otherwise one that has already been tested, where
 * dipping again changes nothing the procedure is watching for.
 */
export function testDemoTube(s: PhState, avoid: number | null = null): number {
  const untested = s.tubes.map((t, i) => (t.tested === null ? i : -1)).filter((i) => i >= 0 && i !== avoid);
  if (untested.length >= 2) return untested[0]!;
  const tested = s.tubes.map((t, i) => (t.tested !== null ? i : -1)).filter((i) => i >= 0 && i !== avoid);
  return tested[0] ?? untested[0] ?? (avoid === 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// The demonstrations
// ---------------------------------------------------------------------------

/** Pick the strong acid's bottle up, unless it is already in hand. */
export function takeTheAcidBottle(c: DemoCtx): void {
  const held = c.state.held;
  if (held?.kind === 'bottle' && held.id === DEMO_SAMPLE) return;
  c.dispatch({ type: 'putDown' });
  c.dispatch({ type: 'pickUp', held: { kind: 'bottle', id: DEMO_SAMPLE } });
}

/**
 * Empty the demonstration's tube and pour its own sample into it.
 *
 * From clean, so the demonstration looks the same on a fresh bench and on one
 * that is half poured, and so the pour can never overflow a tube that is
 * already full. Skipped outright when it would be the pour that ends the step.
 */
export function pourItIntoItsOwnTube(c: DemoCtx): void {
  const k = demoTube(c.state);
  if (k < 0) return;
  let s = c.state;
  if (pourWouldFinish(s, k)) return;
  if (volume(s.tubes[k] ?? { liq: {} }) > 0) s = c.dispatch({ type: 'rinseTube', index: k, now: c.now() });
  const held = s.held;
  if (!(held?.kind === 'bottle' && held.id === DEMO_SAMPLE)) return;
  c.dispatch({ type: 'tapTube', index: k, now: c.now() });
}

/** Put whatever is in hand back on the bench. */
export function handsDown(c: DemoCtx): void {
  c.dispatch({ type: 'putDown' });
}

/** Tear a fresh strip off the pad and dip it into a tube that can spare the test. */
export function dipAFreshStrip(c: DemoCtx): void {
  const k = testDemoTube(c.state);
  if (!c.state.tubes[k] || testWouldFinish(c.state, k)) return;
  c.dispatch({ type: 'putDown' });
  c.dispatch({ type: 'pickUp', held: { kind: 'paper' } });
  c.dispatch({ type: 'tapTube', index: k, now: c.now() });
}

/** The other method: universal indicator, straight into a different tube. */
export function dropTheIndicatorIn(c: DemoCtx): void {
  const k = testDemoTube(c.state, testDemoTube(c.state));
  if (!c.state.tubes[k] || testWouldFinish(c.state, k)) return;
  c.dispatch({ type: 'putDown' });
  c.dispatch({ type: 'pickUp', held: { kind: 'ui' } });
  c.dispatch({ type: 'tapTube', index: k, now: c.now() });
}

/** Bring one tube into the close-up. Selection is not marked and never has been. */
export function bringTubeIntoTheCloseUp(c: DemoCtx): void {
  const k = demoTube(c.state);
  if (k < 0) return;
  c.dispatch({ type: 'selectTube', index: k });
}
