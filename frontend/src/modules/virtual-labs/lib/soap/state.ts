import type { BenchInitOptions } from '@labs/types/lab-bench';
import type { Message, Mistake } from '../types';
import { VIVA_DRAW } from '../viva';

import {
  SHAKES_MIN,
  hardnessFromSeed,
  model,
  volume,
  type Hardness,
  type Lather,
  type TubeContents,
  type WaterId,
} from './chemistry';
import { TUBE_A, TUBE_B, TUBES, VIVA } from './marking';

/**
 * The whole practical as plain data. The reducer never mutates a state it was
 * given; it returns the same object when nothing changed.
 */

export interface Tube extends TubeContents {
  /** Every pour, in order, so a spoiled tube can be named. */
  added: WaterId[];
  /** The scale is against this tube AND nothing has changed since. */
  measured: boolean;
}

/** What is in the student's hand. Nothing happens to a tube without one. */
export type Held =
  | { kind: 'water'; id: WaterId }
  | { kind: 'soap' }
  | { kind: 'cork' }
  | { kind: 'scale' };

/** One row of the observation table as the student is filling it in. */
export interface Entry {
  /** Kept as typed: a half-written "2." must survive a keystroke. */
  height: string;
  scum: 'scum' | 'none' | '';
}

export interface GradedCell {
  pts: number;
  /** Of which, for the froth height. */
  heightPts: number;
  /** And for scum. */
  scumPts: number;
  /** What that tube really showed when it was marked. */
  trueHeight: number;
  trueScum: boolean;
  /** Tube C is recorded for the record and earns nothing. */
  extra?: boolean;
}

export interface FairTest {
  volumes: boolean;
  soap: boolean;
  shaking: boolean;
}

export interface Extension {
  skipped: boolean;
  lathered: boolean;
  dropsRecorded: number | null;
  dropsNeeded: number | null;
  dropsUsed: number;
}

export interface Conclusion {
  which: number;
  why: number;
  /** Does the choice follow from the student's own two heights? */
  consistent: boolean;
  reasonOk: boolean;
  /** What their own table says, whatever they picked. */
  fromMyTable: number;
  myHeights: { A: number | null; B: number | null };
}

export interface VivaAnswer {
  pick: number;
  pts: number;
}

export interface SoapState {
  seed: number;
  /**
   * Whether this attempt's viva was drawn and shuffled, or is the bank's
   * first five in their authored order. Settled at init and never changed,
   * so the reducer always marks against the paper that was shown.
   */
  vivaShuffled: boolean;
  /** How hard this bench's hard water is. Fixed when the bench is dealt. */
  hardness: Hardness;
  tubes: Tube[];
  held: Held | null;
  /** The tube in the close-up and in the record step's one input. */
  sel: number;

  step: number;
  pts: {
    setup: number;
    fair: number;
    heights: number;
    scum: number;
    extension: number;
    conclusion: number;
  };
  rec: Record<number, Entry>;
  graded: { cells: Record<number, GradedCell> } | null;
  fair: FairTest | null;
  /** The extension's answer box, as typed. */
  extDrops: string;
  ext: Extension | null;
  conclPick: { which: string; why: string };
  concl: Conclusion | null;
  viva: (VivaAnswer | null)[];
  log: Mistake[];

  t0: number;
  tEnd: number;
  done: boolean;
  message: Message;

  /** Monotonic counters a guided tour takes baselines of. */
  pickUps: number;
}

export const WELCOME: Message = {
  text:
    'Two tubes, two waters, one fair test. Start by pouring **equal volumes**: distilled water into tube A, ' +
    'hard water into tube B. New here? Press **How to play**.',
  tone: 'info',
};

export function emptyTube(): Tube {
  return { liq: {}, added: [], drops: 0, shakes: 0, measured: false };
}

export function newSoapState(seed: number, now: number, message: Message = WELCOME,
  options: BenchInitOptions = {},
): SoapState {
  return {
    seed,
    vivaShuffled: options.vivaShuffled !== false,
    hardness: hardnessFromSeed(seed),
    tubes: TUBES.map(() => emptyTube()),
    held: null,
    sel: TUBE_A,
    step: 0,
    pts: { setup: 0, fair: 0, heights: 0, scum: 0, extension: 0, conclusion: 0 },
    rec: {},
    graded: null,
    fair: null,
    extDrops: '',
    ext: null,
    conclPick: { which: '', why: '' },
    concl: null,
    // One slot per question ACTUALLY ASKED. Sizing this from the bank would
    // leave slots the student is never shown, and the practical would never
    // register as finished.
    viva: Array.from({ length: VIVA_DRAW }, () => null),
    log: [],
    t0: now,
    tEnd: 0,
    done: false,
    message,
    pickUps: 0,
  };
}

// ---------------------------------------------------------------------------
// Reading a state
// ---------------------------------------------------------------------------

/** A fresh empty tube rather than a shared one: callers write to what they get. */
export function tubeAt(s: SoapState, index: number): Tube {
  return s.tubes[index] ?? emptyTube();
}

/** What tube `index` is showing right now, worked out from its contents. */
export function latherIn(s: SoapState, index: number): Lather {
  return model(tubeAt(s, index), s.hardness);
}

export function volumeIn(s: SoapState, index: number): number {
  return volume(tubeAt(s, index));
}

/** A tube holds water, and every pour into it was the water it is labelled for. */
export function filledCorrectly(s: SoapState, index: number): boolean {
  const t = tubeAt(s, index);
  const want = TUBES[index]?.water;
  return volume(t) > 0 && t.added.every((a) => a === want);
}

export function entryAt(s: SoapState, index: number): Entry {
  return s.rec[index] ?? { height: '', scum: '' };
}

/** Both marked tubes hold water. */
export function bothFilled(s: SoapState): boolean {
  return volumeIn(s, TUBE_A) > 0 && volumeIn(s, TUBE_B) > 0;
}

export function bothSoaped(s: SoapState): boolean {
  return tubeAt(s, TUBE_A).drops > 0 && tubeAt(s, TUBE_B).drops > 0;
}

export function bothShaken(s: SoapState): boolean {
  return tubeAt(s, TUBE_A).shakes >= SHAKES_MIN && tubeAt(s, TUBE_B).shakes >= SHAKES_MIN;
}

export function bothMeasured(s: SoapState): boolean {
  return tubeAt(s, TUBE_A).measured && tubeAt(s, TUBE_B).measured;
}

/** Equal volumes, equal soap, equal shaking — judged live, as it stands now. */
export function fairness(s: SoapState): FairTest {
  const a = tubeAt(s, TUBE_A);
  const b = tubeAt(s, TUBE_B);
  return {
    volumes: volumeIn(s, TUBE_A) === volumeIn(s, TUBE_B),
    soap: a.drops === b.drops,
    shaking: a.shakes === b.shakes,
  };
}

/** Rows of the table that have both a height and a scum answer written in. */
export function recordedCount(s: SoapState): number {
  return [0, 1].filter((k) => {
    const r = entryAt(s, k);
    return r.height.trim() !== '' && r.scum !== '';
  }).length;
}
