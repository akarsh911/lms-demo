import type { BenchInitOptions } from '@labs/types/lab-bench';
import { mulberry32 } from '../seed';
import type { Message, Mistake } from '../types';
import { VIVA_DRAW } from '../viva';

import { SAMPLE_IDS, type Nature, type SampleId } from './chemistry';
import { VIVA } from './marking';

/**
 * The whole practical as plain data. The reducer never mutates a state it was
 * given; it returns the same object when nothing changed.
 */

/** What is in one tube on the rack, and what has been done to it. */
export interface Tube {
  /** The sample the rack position is labelled for — what BELONGS in this tube. */
  sample: SampleId;
  /** mL of each sample actually in it. */
  liq: Partial<Record<SampleId, number>>;
  /** Every pour, in order, so a spoiled tube can be named. */
  added: SampleId[];
  tested: 'paper' | 'ui' | null;
  indicator: boolean;
  /** pH the dipped strip froze at, or null if no strip was laid on the tile. */
  strip: number | null;
}

/** What is in the student's hand. Nothing happens to a tube without one. */
export type Held =
  | { kind: 'bottle'; id: SampleId }
  | { kind: 'paper' }
  | { kind: 'ui' };

/** One row of the observation table as the student is filling it in. */
export interface Entry {
  /** Kept as typed: a half-written "1." must survive a keystroke. */
  ph: string;
  nature: Nature | '';
}

export interface GradedCell {
  pts: number;
  /** The pH of what was really in that tube when it was marked. */
  truePh: number | null;
}

export interface Conclusion {
  order: SampleId[];
  /** Does the order follow from the student's own table? */
  consistent: boolean;
  /** Is it the true order of pH? */
  truth: boolean;
}

export interface VivaAnswer {
  pick: number;
  pts: number;
}

export interface PhState {
  seed: number;
  /**
   * Whether this attempt's viva was drawn and shuffled, or is the bank's
   * first five in their authored order. Settled at init and never changed,
   * so the reducer always marks against the paper that was shown.
   */
  vivaShuffled: boolean;
  /** Which sample each rack position is labelled for, left to right. */
  layout: SampleId[];
  tubes: Tube[];
  held: Held | null;
  /** The tube in the close-up and in the record step's one input. */
  sel: number;

  step: number;
  /** Tubes spoiled by the wrong sample, ever. Costs setup marks. */
  contam: number;
  pts: { setup: number; testing: number; ph: number; nature: number; order: number };
  rec: Record<number, Entry>;
  graded: { cells: Record<number, GradedCell> } | null;
  order: SampleId[];
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
    'Six samples to test. Start by pouring: each tube is labelled underneath with the sample that belongs in it. ' +
    'New here? Press **How to play**.',
  tone: 'info',
};

export function emptyTube(sample: SampleId): Tube {
  return { sample, liq: {}, added: [], tested: null, indicator: false, strip: null };
}

/**
 * The rack, arranged from the seed.
 *
 * The chemistry never varies — HCl is always pH 1 — but WHICH tube holds it
 * does, so two students side by side cannot copy a row of poured tubes, and a
 * teacher can reproduce any bench exactly from the seed in its attempt record.
 */
export function layoutFromSeed(seed: number): SampleId[] {
  const rand = mulberry32(seed);
  const ids = [...SAMPLE_IDS];
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = ids[i]!;
    ids[i] = ids[j]!;
    ids[j] = a;
  }
  return ids;
}

export function newPhState(seed: number, now: number, message: Message = WELCOME,
  options: BenchInitOptions = {},
): PhState {
  const layout = layoutFromSeed(seed);
  return {
    seed,
    vivaShuffled: options.vivaShuffled !== false,
    layout,
    tubes: layout.map((id) => emptyTube(id)),
    held: null,
    sel: 0,
    step: 0,
    contam: 0,
    pts: { setup: 0, testing: 0, ph: 0, nature: 0, order: 0 },
    rec: {},
    graded: null,
    order: [],
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

/** Every tube holds its own sample and nothing else. */
export function poursDone(s: PhState): boolean {
  return s.tubes.every((t) => t.added.length > 0 && t.added.every((a) => a === t.sample));
}

export function testsDone(s: PhState): boolean {
  return s.tubes.every((t) => t.tested !== null);
}

/** Rows of the observation table that have both a pH and a nature written in. */
export function recordedCount(s: PhState): number {
  return s.tubes.filter((_, i) => {
    const r = s.rec[i];
    return Boolean(r && r.ph.trim() !== '' && r.nature !== '');
  }).length;
}

/** Where a sample sits on this bench's rack. */
export function tubeOf(s: PhState, id: SampleId): number {
  return s.layout.indexOf(id);
}
