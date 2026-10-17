import { VDEF, vesselIndex, vol, type ReagentKey, type Vessel, type VesselId } from './chemistry';
import type { ReactionAction } from './reducer';
import type { Held, ReactionTypesState } from './state';

/**
 * WHAT THE VISUAL TRAINER ACTUALLY DOES on the four-reactions bench.
 *
 * The narration lives with the tour steps in `@labs/components/reaction-types/`;
 * this is the hands. Pure, so the thing that must be true of it can be checked
 * without a browser: drive every demonstration from plain Node and the marks,
 * the mistake log and the attempt record come back untouched.
 *
 * FOUR RULES, kept by every function here.
 *
 * 1. **Never the marked act.** It pours, it drops the nails, it slides the
 *    burner under and lights it, it wafts the gas; it never ticks a box in the
 *    observation table, never names a reaction type, never submits either, and
 *    never answers a viva question. All 70 non-viva marks are decided by those.
 * 2. **Never completes the step.** Each of the four setups ends on one last
 *    act — the water onto the quicklime, the minute of real heating, the
 *    control tube, the barium chloride — and the procedure moving on would
 *    swap the script out from under the demonstration keyed to it. So that one
 *    act is always the student's, and the narration says so rather than going
 *    quiet.
 * 3. **Never logs a slip.** A reagent only ever goes into a vessel its label
 *    allows, the nails only into the nail tube, and the burner only under
 *    reaction (ii) — the one vessel in this practical that is ever heated. It
 *    never corks a tube, so it can never be the thing that bursts one.
 * 4. **Never runs the clock.** `wait` is the student's: it is what heats the
 *    crystals, and on a bench where a lit burner can crack a tube it is not
 *    something a demonstration should set going and walk away from.
 */

/** The least a demonstration needs of the bench. The tour context satisfies it. */
export interface DemoCtx {
  state: ReactionTypesState;
  /** Applies an action and returns the resulting state, synchronously. */
  dispatch: (action: ReactionAction) => ReactionTypesState;
  now: () => number;
}

export const K = {
  lime: vesselIndex('lime'),
  fs: vesselIndex('fs'),
  nail: vesselIndex('nail'),
  ctrl: vesselIndex('ctrl'),
  dd: vesselIndex('dd'),
} as const;

const at = (s: ReactionTypesState, id: VesselId): Vessel => s.vessels[vesselIndex(id)]!;

export const nameOf = (k: number): string => VDEF[k]!.name;

// ---------------------------------------------------------------------------
// Guards: the one act per stage that carries the procedure on
// ---------------------------------------------------------------------------

/** Reaction (i) stands once the quicklime is wet. The water is the last act. */
export const limeIsReady = (s: ReactionTypesState): boolean => {
  const v = at(s, 'lime');
  return ((v.c.CaO ?? 0) > 0 || (v.c.CaOH2 ?? 0) > 0) && vol(v) > 0;
};

/** So quicklime may go in while the tube is dry, and only then. */
export const quicklimeIsSafeToAdd = (s: ReactionTypesState): boolean => vol(at(s, 'lime')) === 0;

/**
 * Reaction (ii) stands once the crystals have been really heated — half a
 * simulated minute of flame. The crystals themselves are safe to tip in until
 * that heating has already happened.
 */
export const crystalsAreSafeToAdd = (s: ReactionTypesState): boolean => s.fsHeatMin < 0.5;

/** Reaction (iii) stands once the nail tube AND the control are both filled. */
export const nailTubeIsSafeToFill = (s: ReactionTypesState): boolean =>
  !(at(s, 'nail').nails > 0 && vol(at(s, 'ctrl')) > 0);

export const nailsAreSafeToDrop = (s: ReactionTypesState): boolean =>
  !(vol(at(s, 'nail')) > 0 && vol(at(s, 'ctrl')) > 0 && at(s, 'ctrl').nails === 0);

/** Reaction (iv) stands the instant both solutions are in the same tube. */
export const sulphateIsSafeToAdd = (s: ReactionTypesState): boolean =>
  !at(s, 'dd').added.includes('BaCl2');

// ---------------------------------------------------------------------------
// Hands
// ---------------------------------------------------------------------------

/** Put down whatever is held, then pick up exactly one thing. Order, not toggle. */
function hold(c: DemoCtx, want: Held | null): void {
  c.dispatch({ type: 'drop' });
  if (!want) return;
  if (want.kind === 'bottle') c.dispatch({ type: 'tapReagent', k: want.k });
  else c.dispatch({ type: 'tapTool', tool: want.kind });
}

export function handsDown(c: DemoCtx): void {
  c.dispatch({ type: 'drop' });
}

function pourInto(c: DemoCtx, k: number, reagent: ReagentKey): void {
  hold(c, { kind: 'bottle', k: reagent });
  c.dispatch({ type: 'tapVessel', k, now: c.now() });
}

// ---------------------------------------------------------------------------
// (i) Water on quicklime
// ---------------------------------------------------------------------------

export function takeTheQuicklime(c: DemoCtx): void {
  hold(c, { kind: 'bottle', k: 'CaO' });
}

/** The powder goes into a DRY tube: with water already in it this would finish the step. */
export function tipTheQuicklimeIn(c: DemoCtx): void {
  if (!quicklimeIsSafeToAdd(c.state)) return;
  pourInto(c, K.lime, 'CaO');
}

export function takeTheWaterBottle(c: DemoCtx): void {
  hold(c, { kind: 'bottle', k: 'H2O' });
}

export function takeTheThermometer(c: DemoCtx): void {
  hold(c, { kind: 'thermo' });
}

/** Stand the thermometer in the quicklime tube. Reading it is the student's. */
export function standTheThermometerIn(c: DemoCtx): void {
  if (c.state.thermoIn === K.lime || c.state.thermoBroken) return;
  hold(c, { kind: 'thermo' });
  c.dispatch({ type: 'tapVessel', k: K.lime, now: c.now() });
}

export function takeTheRedLitmus(c: DemoCtx): void {
  hold(c, { kind: 'litmusR' });
}

// ---------------------------------------------------------------------------
// (ii) Heat on ferrous sulphate crystals
// ---------------------------------------------------------------------------

export function takeTheCrystals(c: DemoCtx): void {
  hold(c, { kind: 'bottle', k: 'FeSO4x7' });
}

export function tipTheCrystalsIn(c: DemoCtx): void {
  if (!crystalsAreSafeToAdd(c.state)) return;
  pourInto(c, K.fs, 'FeSO4x7');
}

export function takeTheBurner(c: DemoCtx): void {
  hold(c, { kind: 'burner' });
}

/** Under reaction (ii) and nowhere else: every other vessel is a logged mistake. */
export function slideTheBurnerUnderTheCrystals(c: DemoCtx): void {
  if (c.state.burnerAt === K.fs) return;
  hold(c, { kind: 'burner' });
  c.dispatch({ type: 'tapVessel', k: K.fs, now: c.now() });
}

/**
 * Light it — and nothing more.
 *
 * The clock is never run here: half a simulated minute under the flame is what
 * carries this step, and that minute is the student's to spend.
 */
export function lightTheBurner(c: DemoCtx): void {
  if (c.state.flame || c.state.burnerAt !== K.fs) return;
  handsDown(c);
  c.dispatch({ type: 'toggleFlame', now: c.now() });
}

/** THE SAFE WAY TO SMELL A GAS. Wafted towards you; never a nose over the mouth. */
export function waftTheGasTowardsYou(c: DemoCtx): void {
  c.dispatch({ type: 'smell', k: K.fs });
}

export function takeTheFlameAway(c: DemoCtx): void {
  if (!c.state.flame) return;
  c.dispatch({ type: 'toggleFlame', now: c.now() });
}

export function slideTheBurnerBackOut(c: DemoCtx): void {
  if (c.state.burnerAt === null) return;
  hold(c, { kind: 'burner' });
  c.dispatch({ type: 'tapVessel', k: c.state.burnerAt, now: c.now() });
  handsDown(c);
}

// ---------------------------------------------------------------------------
// (iii) Iron nails in copper sulphate
// ---------------------------------------------------------------------------

export function takeTheCopperSulphate(c: DemoCtx): void {
  hold(c, { kind: 'bottle', k: 'CuSO4' });
}

export function fillTheNailTube(c: DemoCtx): void {
  if (!nailTubeIsSafeToFill(c.state) || vol(at(c.state, 'nail')) > 0) return;
  pourInto(c, K.nail, 'CuSO4');
}

export function takeTheNails(c: DemoCtx): void {
  hold(c, { kind: 'nails' });
}

export function dropTheNailsIn(c: DemoCtx): void {
  if (!nailsAreSafeToDrop(c.state) || at(c.state, 'nail').nails > 0) return;
  hold(c, { kind: 'nails' });
  c.dispatch({ type: 'tapVessel', k: K.nail, now: c.now() });
  handsDown(c);
}

/** Put the control tube in the close-up. Selection is not marked. */
export function lookAtTheControl(c: DemoCtx): void {
  handsDown(c);
  c.dispatch({ type: 'select', k: K.ctrl });
}

// ---------------------------------------------------------------------------
// (iv) Sodium sulphate and barium chloride
// ---------------------------------------------------------------------------

export function takeTheSodiumSulphate(c: DemoCtx): void {
  hold(c, { kind: 'bottle', k: 'Na2SO4' });
}

export function fillTheLastTube(c: DemoCtx): void {
  if (!sulphateIsSafeToAdd(c.state) || vol(at(c.state, 'dd')) > 0) return;
  pourInto(c, K.dd, 'Na2SO4');
}

export function takeTheBariumChloride(c: DemoCtx): void {
  hold(c, { kind: 'bottle', k: 'BaCl2' });
}

export function lookAtTheLastTube(c: DemoCtx): void {
  c.dispatch({ type: 'select', k: K.dd });
}

// ---------------------------------------------------------------------------
// Writing it down
// ---------------------------------------------------------------------------

/** Open one reaction's row and its vessel. Neither the focus nor the selection is marked. */
export function openTheFirstReaction(c: DemoCtx): void {
  handsDown(c);
  c.dispatch({ type: 'focusReaction', rx: 'i' });
}

export function openTheNailReaction(c: DemoCtx): void {
  handsDown(c);
  c.dispatch({ type: 'focusReaction', rx: 'iii' });
}

/** The comparison reaction (iii) exists for. */
export function compareAgainstTheControl(c: DemoCtx): void {
  c.dispatch({ type: 'select', k: K.ctrl });
}
