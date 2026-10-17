import { CAP, POUR, volume, type LiquidId } from './chemistry';
import { RACK, TUBE, tubeReady, wantedIds } from './rack';
import type { AceticAcidAction } from './reducer';
import type { AceticAcidState, HeldItem, StripKind } from './state';

/**
 * WHAT THE VISUAL TRAINER ACTUALLY DOES on the acetic-acid bench.
 *
 * The narration lives with the tour steps in `@labs/components/acetic-acid/`;
 * this is the hands. Pure, so the thing that must be true of it can be checked
 * without a browser: drive every demonstration from plain Node and the marks,
 * the mistake log and the attempt record come back untouched.
 *
 * FOUR RULES, kept by every function here.
 *
 * 1. **Never the marked act.** It pours, wafts, shakes, dips and fits the
 *    delivery tube; it never writes a row of the observation table, never
 *    submits it, and never answers a conclusion or a viva question.
 * 2. **Never completes the step.** Each stage ends on one last act — the sixth
 *    tube filled, the second tube smelled, the second tube shaken, the second
 *    litmus strip, the spatula of carbonate — and the procedure moving on would
 *    swap the script out from under the demonstration keyed to it. That act is
 *    always the student's, said out loud rather than quietly skipped.
 * 3. **Never logs a slip.** A liquid only ever goes into a tube its own label
 *    calls for, so a spoiled sample cannot be charged; a tube too full to take
 *    another 5 mL is emptied and rinsed first.
 * 4. **IT NEVER SNIFFS.** `sniff` is on this bench precisely so that choosing it
 *    can cost technique marks and be logged, and in a real lab it can burn an
 *    airway. The trainer wafts, every time, and names the other tool only to
 *    say that it is never demonstrated.
 */

/** The least a demonstration needs of the bench. The tour context satisfies it. */
export interface DemoCtx {
  state: AceticAcidState;
  /** Applies an action and returns the resulting state, synchronously. */
  dispatch: (action: AceticAcidAction) => AceticAcidState;
  now: () => number;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Would finishing tube `k` be the pour that finishes the rack? */
export function pourWouldFinish(s: AceticAcidState, k: number): boolean {
  return s.tubes.every((t, i) => i === k || tubeReady(i, t));
}

/** The tube the setup demonstration works on: the first still short of its label. */
export function setupTube(s: AceticAcidState): number | null {
  const k = s.tubes.findIndex((t, i) => !tubeReady(i, t));
  if (k < 0 || pourWouldFinish(s, k)) return null;
  return k;
}

/** What that tube is still missing. */
export function missingFrom(s: AceticAcidState, k: number): LiquidId | null {
  const t = s.tubes[k]!;
  const want = RACK[k]!.want;
  return wantedIds(k).find((id) => (t.liq[id] ?? 0) < (want[id] ?? 0)) ?? null;
}

/**
 * Each of the next three stages ends when a PAIR of things has been done, so
 * there is always one of the pair that can be demonstrated without finishing
 * the step: either the one whose partner is still outstanding, or one already
 * done, where doing it again changes nothing the procedure is waiting for.
 */

/** Which tube to waft. The odour stage ends when tubes 1 AND 2 have been smelled. */
export const waftTube = (s: AceticAcidState): number =>
  s.tubes[TUBE.diluted]!.smelled ? TUBE.diluted : TUBE.sample;

/** Which tube to shake. The solubility stage ends when tubes 2 AND 3 have been. */
export const shakeTube = (s: AceticAcidState): number =>
  s.tubes[TUBE.oil]!.stirs > 0 ? TUBE.oil : TUBE.diluted;

/** Which strip to dip. The litmus stage ends when tube 1 has BOTH of them. */
export const litmusStrip = (s: AceticAcidState): StripKind =>
  s.tubes[TUBE.sample]!.strips.red ? 'red' : 'blue';

// ---------------------------------------------------------------------------
// Hands
// ---------------------------------------------------------------------------

function hold(c: DemoCtx, item: HeldItem | null): void {
  c.dispatch({ type: 'hold', item });
}

export function handsDown(c: DemoCtx): void {
  hold(c, null);
}

function applyTo(c: DemoCtx, item: HeldItem, k: number): void {
  hold(c, item);
  c.dispatch({ type: 'applyTo', tube: k, now: c.now() });
}

// ---------------------------------------------------------------------------
// Setting the rack up
// ---------------------------------------------------------------------------

/** Pick up the bottle the first unfinished tube is still short of. */
export function takeTheBottleItNeeds(c: DemoCtx): void {
  const k = setupTube(c.state);
  const id = k === null ? 'acid' : (missingFrom(c.state, k) ?? 'acid');
  hold(c, { kind: 'bottle', id });
}

/**
 * Pour it into that tube, and only that tube: the label under a tube is the
 * whole setup instruction and also what the setup marks are judged against.
 */
export function pourItIntoItsOwnTube(c: DemoCtx): void {
  const k = setupTube(c.state);
  if (k === null) return;
  const id = missingFrom(c.state, k);
  if (!id) return;
  if (volume(c.state.tubes[k]!) + POUR > CAP) c.dispatch({ type: 'emptyTube', tube: k, now: c.now() });
  applyTo(c, { kind: 'bottle', id }, k);
}

// ---------------------------------------------------------------------------
// Odour — the one step that can hurt you
// ---------------------------------------------------------------------------

export function takeTheWaft(c: DemoCtx): void {
  hold(c, { kind: 'waft' });
}

/**
 * Waft one tube. NEVER `sniff`: that tool exists so that choosing it can be
 * marked down and logged, and a demonstration of it would be a demonstration
 * of the wrong technique.
 */
export function waftTheSample(c: DemoCtx): void {
  applyTo(c, { kind: 'waft' }, waftTube(c.state));
}

// ---------------------------------------------------------------------------
// Solubility
// ---------------------------------------------------------------------------

export function takeTheRod(c: DemoCtx): void {
  hold(c, { kind: 'rod' });
}

/** Shake one of the pair. The other is what carries the step, so it is left. */
export function shakeOneOfThePair(c: DemoCtx): void {
  applyTo(c, { kind: 'rod' }, shakeTube(c.state));
}

// ---------------------------------------------------------------------------
// Litmus and pH paper
// ---------------------------------------------------------------------------

export function takeABlueStrip(c: DemoCtx): void {
  hold(c, { kind: litmusStrip(c.state) });
}

/** One fresh strip into the sample. The second strip is the student's. */
export function dipTheFirstStrip(c: DemoCtx): void {
  applyTo(c, { kind: litmusStrip(c.state) }, TUBE.sample);
}

/**
 * pH paper into the strong acid.
 *
 * Safe at any point: this stage is left when tube 1 has BOTH litmus strips, and
 * pH paper is neither of them. It is also the comparison the whole of tube 6
 * exists for.
 */
export function readThePhOfTheStrongAcid(c: DemoCtx): void {
  if (volume(c.state.tubes[TUBE.strong]!) === 0) return;
  applyTo(c, { kind: 'ph' }, TUBE.strong);
}

// ---------------------------------------------------------------------------
// The carbonate, and the order that matters
// ---------------------------------------------------------------------------

export function takeTheDeliveryTube(c: DemoCtx): void {
  hold(c, { kind: 'pipe' });
}

/**
 * THE ORDER LESSON: the delivery tube goes on BEFORE the solid, or the gas is
 * lost to the room.
 *
 * Fitting it is safe — the stage is left only once a solid has been tipped in
 * AND gas has bubbled through — so the whole of the order can be demonstrated
 * and the spatula still left to the student.
 */
export function fitTheDeliveryTube(c: DemoCtx): void {
  if (c.state.delivery) return;
  hold(c, { kind: 'pipe' });
  c.dispatch({ type: 'applyTo', tube: TUBE.carbonate, now: c.now() });
  c.dispatch({ type: 'applyTo', tube: TUBE.lime, now: c.now() });
}

export function takeTheJar(c: DemoCtx): void {
  hold(c, { kind: 'jar' });
}

/** Bring a tube into the close-up. Looking is not marked and never has been. */
export function look(c: DemoCtx, k: number): void {
  c.dispatch({ type: 'selectTube', tube: k });
}

export function lookAtTheGasTube(c: DemoCtx): void {
  handsDown(c);
  look(c, TUBE.carbonate);
}

export function lookAtTheLimeWater(c: DemoCtx): void {
  handsDown(c);
  look(c, TUBE.lime);
}

export function lookAtTheSample(c: DemoCtx): void {
  handsDown(c);
  look(c, TUBE.sample);
}

/** Open the table on its first row. Neither the row nor the selection is marked. */
export function openTheFirstRow(c: DemoCtx): void {
  handsDown(c);
  c.dispatch({ type: 'goToRow', row: 0 });
  look(c, TUBE.sample);
}
