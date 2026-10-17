import type { BenchInitOptions } from '@labs/types/lab-bench';
import type { Message, Mistake } from '../types';
import { VIVA_DRAW } from '../viva';

import {
  BATH_RISE,
  BUBBLE_FLOOR,
  ML_PER_BUBBLE,
  ML_PER_MMOL,
  SETUPS,
  SETUP_B,
  deliveredRate,
  dips,
  newFlask,
  roomTempFromSeed,
  type Appearance,
  type Flask,
  type SeedKind,
} from './biology';
import { VIVA } from './marking';

/**
 * The whole practical as plain data. The reducer never mutates a state it was
 * given; it returns the same object when nothing changed.
 */

/** What is in the student's hand. Nothing goes into a flask without one. */
export type Held =
  | { kind: 'seed'; seed: SeedKind }
  | { kind: 'lime' }
  | { kind: 'cork' }
  | { kind: 'vas' }
  | { kind: 'koh' };

/**
 * The lab clock. Respiration is slow, so the bench offers a fast-forward —
 * but it never skips past a flask: every simulated minute is integrated, so a
 * leak that lets the gas out leaks for all of them.
 */
export type ClockMode = 'paused' | 'run' | 'fast';

/** Simulated lab minutes per real second, by clock mode. */
export const CLOCK_SPEED: Readonly<Record<ClockMode, number>> = {
  paused: 0,
  run: 1,
  fast: 6,
};

/** One row of the observation table as the student is filling it in. */
export interface Entry {
  app: Appearance | '';
  det: 'yes' | 'no' | '';
}

export interface GradedCell {
  pts: number;
  /** Was this ever a working set-up? An empty flask scores nothing. */
  ready: boolean;
  /** What that lime water actually showed when the table was submitted. */
  trueApp: Appearance;
  trueDet: 'yes' | 'no';
  milk: number;
}

export interface Conclusion {
  picked: number;
  text: string;
  /** Does it follow from the student's own two rows? */
  followsFromTable: boolean;
  /** Is it the conclusion this experiment supports? */
  trueConclusion: boolean;
}

export interface VivaAnswer {
  pick: number;
  pts: number;
}

export interface RespirationState {
  seed: number;
  /**
   * Whether this attempt's viva was drawn and shuffled, or is the bank's
   * first five in their authored order. Settled at init and never changed,
   * so the reducer always marks against the paper that was shown.
   */
  vivaShuffled: boolean;
  /** This lab's room temperature today. */
  roomC: number;
  /** What the flasks are at now: the room, or the water bath. */
  tempC: number;
  /** Simulated minutes on the lab clock. */
  min: number;
  clock: ClockMode;

  /** Set-up A, the boiled-seed control, and the optional method 2 flask. */
  flasks: Flask[];
  held: Held | null;
  /** The set-up in the close-up and in the record step's one input. */
  sel: number;

  step: number;
  pts: { observe: number; conclude: number };
  rec: Record<number, Entry>;
  graded: { cells: Record<number, GradedCell>; min: number } | null;
  /** The conclusion highlighted but not yet submitted. */
  pick: number | null;
  concl: Conclusion | null;
  viva: (VivaAnswer | null)[];
  log: Mistake[];
  /** Warnings that are given once and then let the student go on regardless. */
  warned: { control: boolean; leak: boolean; early: boolean; seed: Record<string, boolean> };

  t0: number;
  tEnd: number;
  done: boolean;
  message: Message;

  /** Monotonic counters a guided tour takes baselines of. */
  pickUps: number;
  looks: number;
}

export const WELCOME: Message = {
  text:
    'Two flasks to build. **Set-up A** gets germinating seeds; **set-up B** gets boiled seeds and is your control. ' +
    'New here? Press **How to play**.',
  tone: 'info',
};

export function newRespirationState(seed: number, now: number, message: Message = WELCOME,
  options: BenchInitOptions = {},
): RespirationState {
  const roomC = roomTempFromSeed(seed);
  return {
    seed,
    vivaShuffled: options.vivaShuffled !== false,
    roomC,
    tempC: roomC,
    min: 0,
    clock: 'paused',
    flasks: [newFlask(0), newFlask(1), newFlask(2)],
    held: null,
    sel: 0,
    step: 0,
    pts: { observe: 0, conclude: 0 },
    rec: {},
    graded: null,
    pick: null,
    concl: null,
    // One slot per question ACTUALLY ASKED. Sizing this from the bank would
    // leave slots the student is never shown, and the practical would never
    // register as finished.
    viva: Array.from({ length: VIVA_DRAW }, () => null),
    log: [],
    warned: { control: false, leak: false, early: false, seed: {} },
    t0: now,
    tEnd: 0,
    done: false,
    message,
    pickUps: 0,
    looks: 0,
  };
}

export function bathTemp(s: RespirationState): number {
  return s.roomC + BATH_RISE;
}

export function warmed(s: RespirationState): boolean {
  return s.tempC > s.roomC;
}

/** The two marked set-ups. The method 2 flask is never marked. */
export function markedFlasks(s: RespirationState): Flask[] {
  return s.flasks.slice(0, SETUPS.length);
}

export function flaskAt(s: RespirationState, index: number): Flask | null {
  return s.flasks[index] ?? null;
}

/** The name of a set-up, for anything the assistant says. */
export function nameOf(index: number): string {
  return SETUPS[index]?.name ?? 'the method 2 flask';
}

/** A flask that was genuinely built: seeds in it and closed. Its row can be marked. */
export function builtForRecording(f: Flask): boolean {
  return Boolean(f.seeds && f.cork);
}

/** The control counts only if a second flask of boiled seeds actually ran. */
export function controlOk(s: RespirationState): boolean {
  const b = s.flasks[SETUP_B];
  return Boolean(b && b.seeds && b.seeds.kind === 'boiled' && b.seeds.g > 0 && b.lime.ml > 0 && b.cork && b.runMin > 0);
}

export function entryAt(s: RespirationState, index: number): Entry {
  return s.rec[index] ?? { app: '', det: '' };
}

/** Rows of the observation table with both columns filled in. */
export function recordedCount(s: RespirationState): number {
  return markedFlasks(s).filter((_, i) => {
    const r = s.rec[i];
    return Boolean(r && r.app !== '' && r.det !== '');
  }).length;
}

/**
 * Are bubbles visibly coming up through this tube right now?
 *
 * The drawing asks, so the answer is worked out from the rate that produces
 * them rather than from whether the clock happens to be moving.
 */
export function bubbling(s: RespirationState, index: number): boolean {
  const f = s.flasks[index];
  if (!f || s.clock === 'paused' || !dips(f)) return false;
  return deliveredRate(f, s.tempC) >= BUBBLE_FLOOR;
}

/**
 * HOW FAST THE TUBE IS BUBBLING, in bubbles per real second.
 *
 * The flask's own delivered rate, in mmol per SIMULATED minute, turned into gas
 * and then into bubbles and then into the student's own seconds by the speed
 * the lab clock is running at. Everything in it is the model's: more seed, a
 * warmer bath or a faster clock all make the tube bubble faster because they
 * all make more gas arrive, and a leaking cork or a tube of KOH slow it for the
 * same reason. Nothing about it is a decoration that could be true while the
 * chemistry was not.
 *
 * Zero whenever `bubbling` is false, so the drawing has one thing to ask.
 */
export function bubbleRate(s: RespirationState, index: number): number {
  const f = s.flasks[index];
  if (!f || !bubbling(s, index)) return 0;
  return (deliveredRate(f, s.tempC) * ML_PER_MMOL * CLOCK_SPEED[s.clock]) / ML_PER_BUBBLE;
}

/** What a set-up still needs before it could collect anything. */
export function missingFrom(s: RespirationState, index: number): string[] {
  const f = s.flasks[index];
  const want = SETUPS[index]?.want;
  const miss: string[] = [];
  if (!f) return miss;
  if (!f.seeds || !f.seeds.g) miss.push('seeds');
  else if (want && f.seeds.kind !== want) miss.push(want === 'germ' ? 'germinating seeds' : 'boiled seeds');
  if (!f.lime.ml) miss.push('lime water');
  else if (!dips(f)) miss.push('more lime water');
  if (!f.cork) miss.push('cork + tube');
  return miss;
}
