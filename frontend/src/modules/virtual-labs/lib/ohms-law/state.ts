import type { BenchInitOptions } from '@labs/types/lab-bench';
import type { Wire } from '../circuit';
import type { Line } from '../fit';
import type { Message, Mistake } from '../types';
import { VIVA_DRAW } from '../viva';

import { benchFromSeed, type TerminalId } from './apparatus';
import { currentMethod, type LabMethod } from './method';

export type MeterId = 'am' | 'vm';

export interface LeastCountPart {
  tries: number;
  pts: number;
  ok: boolean;
  /** How the field was last judged: drives its green/red outline. */
  flag: 'ok' | 'no' | null;
}

export interface Reading {
  /** What the student typed. */
  I: number;
  V: number;
  /**
   * How many cells drove this reading, under the cells method — the whole of
   * the observation table's first column, and what stops the same operating
   * point being recorded twice. Null under the rheostat method.
   */
  cells: number | null;
  /** What the meters actually showed at that moment. */
  trueI: number;
  trueV: number;
  pts: number;
}

export interface LabResult {
  /** The resistance the student wrote. */
  r: number;
  /** Best fit through the student's own readings (x = I, y = V). */
  fit: Line;
  pts: number;
  /** Relative error of `r` against the fit's slope. */
  err: number;
}

export interface VivaAnswer {
  pick: number;
  pts: number;
}

/**
 * A settled pair of meter readings at one operating point.
 *
 * `ctl` is whichever control decides the current: the number of cells in the
 * circuit, or the slider's position. Moving either makes this stale, which is
 * what forces a student to look at the needles again before recording.
 */
export interface Observation {
  Iam: number;
  Vvm: number;
  ctl: number;
}

/**
 * The whole practical, as plain data. The reducer never mutates a state it was
 * given; it returns the same object when nothing changed.
 */
export interface LabState {
  seed: number;
  /**
   * Whether this attempt's viva was drawn and shuffled, or is the bank's
   * first five in their authored order. Settled at init and never changed,
   * so the reducer always marks against the paper that was shown.
   */
  vivaShuffled: boolean;
  /**
   * Which apparatus this attempt is being done with. A snapshot: everything
   * that decides a mark reads it from here, so the reducer stays a pure
   * function of the state it is handed. Changing it restarts the practical,
   * because the terminals themselves change.
   */
  method: LabMethod;
  /** The wire's true resistance. Shown only once the result is in. */
  R0: number;

  // --- the bench ------------------------------------------------------------
  wires: Wire<TerminalId>[];
  key: boolean;
  /** Rheostat slider, 0 at end A to 1 at end B. */
  s: number;
  /** Whether the connecting-wire ends have been rubbed bright on the sand paper. */
  sanded: boolean;
  /** Temperature rise of the nichrome, °C. */
  T: number;
  /** Seconds the key has been in with current flowing. */
  keyClosedFor: number;
  /** Seconds the needles have been settling at this operating point. */
  obsFor: number;
  lastObs: Observation | null;

  // --- the procedure --------------------------------------------------------
  step: number;
  lc: { A: LeastCountPart; V: LeastCountPart };
  circuit: { ok: boolean; broken: boolean; fails: number; hints: number; pts: number };
  /** Procedure marks deducted so far. */
  procDed: number;
  readings: Reading[];
  keyOpenedSinceRec: boolean;
  /** How many times the key came out between two readings. */
  gaps: number;
  result: LabResult | null;
  viva: (VivaAnswer | null)[];
  log: Mistake[];
  warned: {
    short: boolean;
    over: boolean;
    rev: 'ammeter' | 'voltmeter' | null;
    heat: boolean;
  };
  t0: number;
  tEnd: number;
  done: boolean;

  // --- what the bench is showing --------------------------------------------
  message: Message;
  /** Terminals pulsing after a bought hint, until a moment on the clock. */
  hint: { pair: Wire<TerminalId>; until: number } | null;
  /** Increments whenever the bench should flash red. */
  flashes: number;
  lens: MeterId | null;

  /** Monotonic counters a guided tour can take baselines of. */
  keyToggles: number;
  lensOpens: number;
  /**
   * The reading the guided build asked for, kept so its next step can compare
   * V/I before and after. It lives here rather than in React because the tour's
   * completion test is a pure function of the bench's state.
   */
  tourReading: { I: number; V: number } | null;
}

export const WELCOME: Message = {
  text:
    'Welcome to the bench. Everything here behaves like the real apparatus — wire it wrong and it will **behave** wrong. ' +
    'Start with step 1: tap the ammeter’s dial to look closely. New here? Press **How to play**.',
  tone: 'info',
};

export function newLabState(
  seed: number,
  now: number,
  message: Message = WELCOME,
  options: BenchInitOptions = {},
  // The bench the student chose, unless a caller says otherwise. `BenchEngine.init`
  // has no room for it, which is exactly why `method.ts` keeps the choice.
  method: LabMethod = currentMethod(),
): LabState {
  const lc = (): LeastCountPart => ({ tries: 0, pts: 0, ok: false, flag: null });
  return {
    seed,
    vivaShuffled: options.vivaShuffled !== false,
    method,
    R0: benchFromSeed(seed).R0,
    wires: [],
    key: false,
    s: 0.4,
    sanded: false,
    T: 0,
    keyClosedFor: 0,
    obsFor: 0,
    lastObs: null,
    step: 0,
    lc: { A: lc(), V: lc() },
    circuit: { ok: false, broken: false, fails: 0, hints: 0, pts: 0 },
    procDed: 0,
    readings: [],
    keyOpenedSinceRec: true,
    gaps: 0,
    result: null,
    // One slot per question ACTUALLY ASKED. Sizing this from the bank would
    // leave slots the student is never shown, and the practical would never
    // register as finished.
    viva: Array.from({ length: VIVA_DRAW }, () => null),
    log: [],
    warned: { short: false, over: false, rev: null, heat: false },
    t0: now,
    tEnd: 0,
    done: false,
    message,
    hint: null,
    flashes: 0,
    lens: null,
    keyToggles: 0,
    lensOpens: 0,
    tourReading: null,
  };
}
