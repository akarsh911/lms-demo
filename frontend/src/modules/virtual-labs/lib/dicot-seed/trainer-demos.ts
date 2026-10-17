import { STEP, type LabelId } from './marking';
import { OVERSOAK_HOURS, PEEL_SOFT, SPLIT_SOFT, softness, swellFrac, type SpeciesId } from './seed-model';
import type { DicotSeedAction } from './reducer';
import type { DicotSeedState, ToolId } from './state';

/**
 * WHAT THE VISUAL TRAINER ACTUALLY DOES on the dicot-seed bench.
 *
 * The narration lives with the steps in
 * `@labs/components/dicot-seed/trainer.tsx`; this is the other half — the hands.
 * It is pure, so the one thing that must be true of it can be checked without a
 * browser: drive every demonstration from plain Node and the score, the mistake
 * log and the attempt record come back untouched.
 *
 * FIVE RULES, and every function here keeps all five.
 *
 * 1. **Never the marked act.** It soaks a seed and it picks tools up. It does
 *    NOT tap the hilum or the micropyle, does NOT peel the coat, does NOT split
 *    the seed, places no label, fills in no cell of the table and answers
 *    nothing. Those are all ten-, thirty- and fourteen-mark acts, and the
 *    workspace restoring the snapshot afterwards is not a reason to do them for
 *    the student.
 * 2. **Never completes the step.** On this bench the step is DERIVED from the
 *    specimen — on the tile, marks found, coat off, split — so the acts that
 *    would advance it are exactly the acts that are marked. Refusing rule 1
 *    keeps rule 3 for free, and each function below names the line it stays
 *    behind.
 * 3. **Never logs a slip, and never ruins a seed.** It will not touch the blade,
 *    will not force a coat off a brittle seed, will not tap at the figure at all
 *    — every stray tap under the lens costs 2 marks after the first two — and
 *    will not soak a seed past the point where it goes to mush.
 * 4. **Never takes a seed the student is already using.** If one is soaking or
 *    on the tile, the demonstration works with that one.
 * 5. **Gives the clock back.** Bench hours are spent through the same `wait` the
 *    student has, and the whole state — clock included — is restored on exit.
 */

/** The least a demonstration needs of the bench. The tour context satisfies it. */
export interface DemoCtx {
  state: DicotSeedState;
  /** Applies an action and returns the resulting state, synchronously. */
  dispatch: (action: DicotSeedAction) => DicotSeedState;
  now: () => number;
}

/** The two hours that buy almost nothing, and the twelve that are the point. */
export const SHORT_SOAK = 2;
export const OVERNIGHT = 12;

/** Softness thresholds, so the commentary quotes the bench rather than asserting. */
export const SOFT = { peel: PEEL_SOFT, split: SPLIT_SOFT } as const;

/** How swollen and how soft the working seed is, for the words beside the picture. */
export function seedNow(state: DicotSeedState): { hours: number; swell: number; soft: number } | null {
  const sd = state.specimen;
  return sd ? { hours: sd.h, swell: swellFrac(sd.h), soft: softness(sd.h) } : null;
}

// ---------------------------------------------------------------------------
// Soaking
// ---------------------------------------------------------------------------

/**
 * Take a seed from a dish — but only if the bench is empty.
 *
 * `takeSeed` throws away whatever was in the beaker, and a student who pressed
 * "show me" halfway through an overnight soak would not thank a demonstration
 * that binned it. Theirs is the seed this script works on.
 */
export function takeASeed({ state, dispatch, now }: DemoCtx): void {
  if (state.specimen || state.step > STEP.soak) return;
  const sp: SpeciesId = state.dishes[0] ?? 'gram';
  dispatch({ type: 'takeSeed', sp, now: now() });
}

/** Into the beaker, and completely under: water gets in through one pore only. */
export function dropItInTheBeaker({ state, dispatch, now }: DemoCtx): void {
  const sd = state.specimen;
  if (!sd || sd.onTile || sd.inWater) return;
  if (state.held?.kind !== 'seed' && state.held?.kind !== 'wet') return;
  dispatch({ type: 'tapBeaker', now: now() });
}

/**
 * Put `hours` of bench time through the soak.
 *
 * Refused if it would carry the seed past `OVERSOAK_HOURS`, where the coat
 * begins to split on its own and the cotyledons start to waterlog: a
 * demonstration must not hand back a specimen worse than it borrowed.
 */
export function soakFor(hours: number) {
  return ({ state, dispatch }: DemoCtx): void => {
    const sd = state.specimen;
    if (!sd || !sd.inWater || sd.onTile || sd.ruined) return;
    if (state.pending > 0) return;
    if (sd.h + state.pending + hours > OVERSOAK_HOURS) return;
    dispatch({ type: 'wait', hours });
  };
}

// ---------------------------------------------------------------------------
// Hands, and only hands
// ---------------------------------------------------------------------------

/**
 * Pick a tool up. Picking one up is free; USING it is the dissection mark, and
 * on this bench using it is also what advances the step.
 */
export function takeUp(id: ToolId) {
  return ({ state, dispatch }: DemoCtx): void => {
    if (state.step >= STEP.label) return;
    if (state.held?.kind === 'tool' && state.held.id === id) return;
    dispatch({ type: 'hold', held: { kind: 'tool', id } });
  };
}

/** Hold a label chip, so the strip under the bench shows what is being carried. */
export function takeUpTheLabel(id: LabelId) {
  return ({ state, dispatch }: DemoCtx): void => {
    if (state.labelGrade) return;
    if (state.held?.kind === 'label' && state.held.id === id) return;
    dispatch({ type: 'hold', held: { kind: 'label', id } });
  };
}

/** Hands free. Nothing is ever dropped on the seed by this script. */
export function putItDown({ state, dispatch }: DemoCtx): void {
  if (!state.held) return;
  dispatch({ type: 'hold', held: null });
}

/** Squeeze the coat: a bead of water out of the micropyle, and nothing marked. */
export function squeezeIt({ state, dispatch, now }: DemoCtx): void {
  const sd = state.specimen;
  if (!sd || !sd.coat || sd.ruined || sd.pressed) return;
  dispatch({ type: 'press', now: now() });
}

/** Show the docked lens on one of the two drawings. Presentation only. */
export function showTheLens(view: 'ext' | 'cut') {
  return ({ state, dispatch }: DemoCtx): void => {
    if (state.lens === view) return;
    dispatch({ type: 'setLens', view });
  };
}

/** Open a row of the observation table, without writing in it. */
export function openRow(index: number) {
  return ({ state, dispatch }: DemoCtx): void => {
    if (state.selRow === index || state.tableGrade) return;
    dispatch({ type: 'selectRow', index });
  };
}
