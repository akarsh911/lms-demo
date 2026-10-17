import type { BenchInitOptions } from '@labs/types/lab-bench';
import type { Message, Mistake } from '../types';
import { VIVA_DRAW } from '../viva';

import { newRack, type ColourCode, type DepositCode, type Metal, type Salt, type Tube, type TubeTruth } from './chemistry';
import { STAGE, VIVA, type PartKey } from './marking';

/** What is in the student's hand: a dropper bottle, a strip, or the sandpaper. */
export type Held =
  | { kind: 'bottle'; salt: Salt }
  | { kind: 'strip'; metal: Metal }
  | { kind: 'sand' };

/** One line of the observation table, as the student filled it in. */
export interface RecordedCell {
  c: ColourCode | '';
  d: DepositCode | '';
}

/** The same line once it has been marked against what the tube showed. */
export interface GradedCell {
  pts: number;
  truth: TubeTruth;
}

export interface Conclusion {
  order: Metal[];
  /** How many solutions each metal visibly reacted in, BY THE STUDENT'S table. */
  counts: Record<Metal, number>;
  consistent: boolean;
  truth: boolean;
}

export interface VivaAnswer {
  pick: number;
  pts: number;
}

/** What the assistant reports after a wait: the lesson of this practical. */
export interface WaitReport {
  from: number;
  to: number;
  /** Tubes that look different from when the student last looked at them. */
  changed: number;
}

/**
 * The whole practical, as plain data. The reducer never mutates a state it was
 * given; it returns the same object when nothing changed.
 */
export interface RxState {
  seed: number;
  /**
   * Whether this attempt's viva was drawn and shuffled, or is the bank's
   * first five in their authored order. Settled at init and never changed,
   * so the reducer always marks against the paper that was shown.
   */
  vivaShuffled: boolean;

  // --- the bench ------------------------------------------------------------
  /** Sixteen tubes, metal-major: the observation table's own layout. */
  tubes: Tube[];
  /** Which metals have been sanded on the tile. */
  clean: Record<Metal, boolean>;
  /** Whether each metal was clean when its FIRST strip went into a tube. */
  cleanAtFirstUse: Partial<Record<Metal, boolean>>;
  /** The lab clock, in simulated minutes. */
  min: number;
  /** While a wait runs, the reading the clock is travelling to. */
  waitTo: number | null;
  /** The wait that just finished, for "what changed while you were away". */
  lastWait: WaitReport | null;
  held: Held | null;
  /** The tube in the close-up. */
  sel: number;

  // --- the practical --------------------------------------------------------
  step: number;
  /** Tubes poured with the wrong solution. */
  contam: number;
  /** Strips dropped into the wrong tube. */
  wrongStrip: number;
  pts: Record<Exclude<PartKey, 'viva'>, number>;
  rec: Record<string, RecordedCell>;
  graded: { cells: Record<string, GradedCell>; min: number } | null;
  order: Metal[];
  concl: Conclusion | null;
  viva: (VivaAnswer | null)[];
  log: Mistake[];
  /** One-per-incident warnings, so the assistant does not nag. */
  warned: Record<string, boolean>;
  readyWarned: boolean;

  t0: number;
  tEnd: number;
  done: boolean;
  message: Message;
}

export const WELCOME: Message = {
  text:
    'Sixteen tubes, four metals, four solutions. Nothing here is scripted: every colour is worked out from what is actually in the tube. ' +
    'Start by pouring — each group of four tubes gets the solution named above it. New here? Press **How to play**.',
  tone: 'info',
};

export function newRxState(seed: number, now: number, message: Message = WELCOME,
  options: BenchInitOptions = {},
): RxState {
  return {
    seed,
    vivaShuffled: options.vivaShuffled !== false,
    tubes: newRack(),
    clean: { Zn: false, Fe: false, Cu: false, Al: false },
    cleanAtFirstUse: {},
    min: 0,
    waitTo: null,
    lastWait: null,
    held: null,
    sel: 0,
    step: STAGE.fill,
    contam: 0,
    wrongStrip: 0,
    pts: { setup: 0, metals: 0, observe: 0, conclude: 0 },
    rec: {},
    graded: null,
    order: [],
    concl: null,
    // One slot per question ACTUALLY ASKED. Sizing this from the bank would
    // leave slots the student is never shown, and the practical would never
    // register as finished.
    viva: Array.from({ length: VIVA_DRAW }, () => null),
    log: [],
    warned: {},
    readyWarned: false,
    t0: now,
    tEnd: 0,
    done: false,
    message,
  };
}
