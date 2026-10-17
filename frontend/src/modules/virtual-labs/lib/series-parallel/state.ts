import type { BenchInitOptions } from '@labs/types/lab-bench';
import type { Wire } from '../circuit';
import type { Message, Mistake } from '../types';
import { VIVA_DRAW } from '../viva';

import { CONFIG_IDS, benchFromSeed, type ConfigId, type ResistorId, type TerminalId } from './apparatus';
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
   * How many cells drove this reading, under the cells method — the
   * observation table's first column, and what stops the same operating point
   * being recorded twice for one circuit. Null under the rheostat method.
   */
  cells: number | null;
  /** What the meters actually showed at that moment. */
  trueI: number;
  trueV: number;
  pts: number;
}

/** One of the four circuits, and how it has gone. */
export interface ConfigProgress {
  /** Verified by the assistant and not touched since. */
  ok: boolean;
  /** Was verified, then the wiring changed and broke it. */
  broken: boolean;
  fails: number;
  hints: number;
  pts: number;
  readings: Reading[];
  /** How many times the key came out between two readings of this circuit. */
  gaps: number;
}

/** What the student worked out from their own four means. */
export interface ComboResult {
  /** What they typed for R₁ + R₂ and for R₁R₂/(R₁ + R₂). */
  rsIn: number;
  rpIn: number;
  /** Theory, from their OWN means of R₁ and R₂. */
  ts: number;
  tp: number;
  /** Their measured means. */
  m1: number;
  m2: number;
  ms: number;
  mp: number;
  pts: number;
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
  /** The two true resistances. Shown only once the calculation is in. */
  R: Record<ResistorId, number>;

  // --- the bench ------------------------------------------------------------
  wires: Wire<TerminalId>[];
  key: boolean;
  /** Rheostat slider, 0 at end A to 1 at end B. */
  s: number;
  /** Whether the connecting-wire ends have been rubbed bright on the sand paper. */
  sanded: boolean;
  /** Temperature rise of each coil, °C. */
  T: Record<ResistorId, number>;
  /** Seconds the key has been in with current flowing. */
  keyClosedFor: number;
  /** Seconds the needles have been settling at this operating point. */
  obsFor: number;
  lastObs: Observation | null;

  // --- the procedure --------------------------------------------------------
  /** Index into `STAGES`. */
  stage: number;
  lc: { A: LeastCountPart; V: LeastCountPart };
  cfg: Record<ConfigId, ConfigProgress>;
  /** Procedure marks deducted so far. */
  procDed: number;
  keyOpenedSinceRec: boolean;
  result: ComboResult | null;
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
}

export const WELCOME: Message = {
  text:
    'Four circuits today: **R₁ alone, R₂ alone, series, parallel** — three readings each. Everything here behaves like the real apparatus, so wire it wrong and it will **behave** wrong. ' +
    'Start with step 1: the least counts. New to series and parallel? Try the **Guided build**.',
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
  const cfg = {} as Record<ConfigId, ConfigProgress>;
  for (const id of CONFIG_IDS) {
    cfg[id] = { ok: false, broken: false, fails: 0, hints: 0, pts: 0, readings: [], gaps: 0 };
  }

  return {
    seed,
    vivaShuffled: options.vivaShuffled !== false,
    method,
    R: benchFromSeed(seed),
    wires: [],
    key: false,
    s: 0.4,
    sanded: false,
    T: { r1: 0, r2: 0 },
    keyClosedFor: 0,
    obsFor: 0,
    lastObs: null,
    stage: 0,
    lc: { A: lc(), V: lc() },
    cfg,
    procDed: 0,
    keyOpenedSinceRec: true,
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
  };
}

/** Mean of V/I over a circuit's readings; NaN while it has none. */
export function meanResistance(progress: ConfigProgress): number {
  const rs = progress.readings.filter((r) => r.I > 0).map((r) => r.V / r.I);
  return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : Number.NaN;
}
