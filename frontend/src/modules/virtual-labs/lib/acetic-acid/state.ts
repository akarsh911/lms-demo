import type { BenchInitOptions } from '@labs/types/lab-bench';
import type { Message, Mistake } from '../types';
import { VIVA_DRAW } from '../viva';

import { acidConcFromSeed, type Hue, type LiquidId, type SmellWord, type TubeContents } from './chemistry';
import { RACK } from './rack';
import { VIVA } from './marking';

/**
 * The whole practical, as plain data.
 *
 * The reducer never mutates a state it was given; it returns the same object
 * when nothing changed, which is what lets the bench clock run at 10 Hz without
 * re-rendering an idle bench.
 */

/** What is in the student's hand. Only one thing at a time, as on a real bench. */
export type ToolKind = 'jar' | 'blue' | 'red' | 'ph' | 'rod' | 'waft' | 'sniff' | 'pipe' | 'splint';

export type HeldItem = { kind: 'bottle'; id: LiquidId } | { kind: ToolKind };

export type StripKind = 'blue' | 'red';

export interface StripResult {
  /** The colour the strip went. */
  hue: Hue;
  /** The tube's pH at the moment it was dipped. */
  ph: number;
}

export interface TubeState extends TubeContents {
  /** Its place in the rack, 0-based. */
  i: number;
  /** Every pour, in order, so a spoiled tube can be described. */
  added: LiquidId[];
  /** mmol of NaHCO₃ ever tipped in. */
  solidAdded: number;
  /** mmol of gas given off, and the fastest it ever came off. */
  gasMade: number;
  peakRate: number;
  /** mmol s⁻¹ right now. */
  rate: number;
  /** mL of gas standing above the liquid. */
  head: number;
  /** mmol bubbled in from a delivery tube, in total and this tick. */
  gasIn: number;
  inflow: number;
  /**
   * The same inflow as a RATE, mmol s⁻¹ — `inflow` divided by the tick that
   * collected it. It lives here so that nothing outside the reducer has to know
   * how long a tick is; a drawing that divided by 0.1 itself would be silently
   * wrong the day the bench clock changed.
   */
  inflowRate: number;
  /** The milkiest the lime water ever went. */
  milkyMax: number;
  strips: Partial<Record<StripKind, StripResult>>;
  phPaper: number | null;
  stirs: number;
  /** Bench clock when it was last shaken, for the emulsion to settle out of. */
  stirAt: number;
  /**
   * How cloudy the emulsion in this tube is, 0 to 1.
   *
   * A shake of two liquids that will not mix sets it to 1; the bench clock
   * separates it again with the half-life the chemistry gives. It is a property
   * of the tube rather than of the drawing, which is why the docked close-up
   * cannot show a shake that finished minutes ago: by then the model says the
   * tube is clear.
   */
  emul: number;
  layersSeen: 'one' | 'two' | null;
  smelled: 'waft' | 'sniff' | null;
  smellSeen: SmellWord | null;
  splinter: 'out' | 'burns' | null;
}

export interface GradedCell {
  /** What the tube actually showed. */
  truth: string;
  pick: string | null;
  ok: boolean;
  pts: number;
}

export interface VivaAnswer {
  pick: number;
  pts: number;
}

export interface AceticAcidState {
  seed: number;
  /**
   * Whether this attempt's viva was drawn and shuffled, or is the bank's
   * first five in their authored order. Settled at init and never changed,
   * so the reducer always marks against the paper that was shown.
   */
  vivaShuffled: boolean;
  /** The concentration of the acid on this bench, mol L⁻¹. */
  acidConc: number;

  // --- the bench ------------------------------------------------------------
  tubes: TubeState[];
  held: HeldItem | null;
  /** The tube the delivery tube is corked into while its other end is chosen. */
  pend: number | null;
  delivery: { from: number; to: number } | null;
  /** The tube in the close-up. */
  sel: number;

  // --- the practical --------------------------------------------------------
  step: number;
  /** How many times a tube was smelled by nose instead of by wafting. */
  sniffs: number;
  /** What the student has written in the observation table, by row id. */
  rec: Record<string, string>;
  /** Which row the console is asking for. */
  row: number;
  graded: { cells: Record<string, GradedCell>; pts: number } | null;
  concl: Record<string, string>;
  conclPts: number | null;
  viva: (VivaAnswer | null)[];
  log: Mistake[];
  warned: { milky: boolean };
  t0: number;
  tEnd: number;
  done: boolean;

  // --- what the bench is showing --------------------------------------------
  message: Message;
  /** Monotonic counters a guided tour can take baselines of. */
  picks: number;
  empties: number;
}

export function newTube(i: number): TubeState {
  return {
    i,
    liq: {},
    added: [],
    solid: 0,
    solidAdded: 0,
    acidUsed: 0,
    gasMade: 0,
    peakRate: 0,
    rate: 0,
    head: 0,
    gasIn: 0,
    co2In: 0,
    inflow: 0,
    inflowRate: 0,
    milkyMax: 0,
    strips: {},
    phPaper: null,
    stirs: 0,
    stirAt: 0,
    emul: 0,
    layersSeen: null,
    smelled: null,
    smellSeen: null,
    splinter: null,
  };
}

export const WELCOME: Message = {
  text:
    'Four properties of one acid. Every smell, layer, colour and bubble here is worked out from what is actually in the tube — ' +
    'so what you write down has to be what **your** tube did.\n' +
    'Start by setting up the rack: each tube is labelled underneath with what belongs in it. New here? Press **How to play**.',
  tone: 'info',
};

export function newAceticAcidState(seed: number, now: number, message: Message = WELCOME,
  options: BenchInitOptions = {},
): AceticAcidState {
  return {
    seed,
    vivaShuffled: options.vivaShuffled !== false,
    acidConc: acidConcFromSeed(seed),
    tubes: RACK.map((_, i) => newTube(i)),
    held: null,
    pend: null,
    delivery: null,
    sel: 0,
    step: 0,
    sniffs: 0,
    rec: {},
    row: 0,
    graded: null,
    concl: {},
    conclPts: null,
    // One slot per question ACTUALLY ASKED. Sizing this from the bank would
    // leave slots the student is never shown, and the practical would never
    // register as finished.
    viva: Array.from({ length: VIVA_DRAW }, () => null),
    log: [],
    warned: { milky: false },
    t0: now,
    tEnd: 0,
    done: false,
    message,
    picks: 0,
    empties: 0,
  };
}
