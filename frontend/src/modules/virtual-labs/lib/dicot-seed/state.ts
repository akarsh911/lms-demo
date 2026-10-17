import type { BenchInitOptions } from '@labs/types/lab-bench';
import { mulberry32 } from '../seed';
import type { Message, Mistake } from '../types';
import { VIVA_DRAW } from '../viva';

import {
  CONCL,
  LABELS,
  STEP,
  TABLE_ROWS,
  VIVA,
  type ConclId,
  type ConclSide,
  type LabelId,
} from './marking';
import { SPECIES_IDS, type Germinating, type PartId, type Seed, type SpeciesId } from './seed-model';

/**
 * The whole practical as plain data. The reducer never mutates a state it was
 * given; it returns the same object when nothing changed.
 */

/** What is in the student's hand. Nothing happens to the seed without one. */
export type ToolId = 'forceps' | 'needle' | 'blade';

export type Held =
  | { kind: 'seed'; sp: SpeciesId }
  /** The soaked seed, lifted out of the beaker and dripping. */
  | { kind: 'wet' }
  | { kind: 'tool'; id: ToolId }
  | { kind: 'label'; id: LabelId };

/** Where one label was dropped: which drawing, and where in that drawing's own units. */
export interface LabelPin {
  fig: 'ext' | 'cut';
  x: number;
  y: number;
}

export interface LabelGrade {
  placed: boolean;
  /** What was really under the pin. */
  got: PartId | null;
  ok: boolean;
}

export interface TableEntry {
  is: string;
  does: string;
}

export interface TableGrade {
  is: boolean;
  does: boolean;
  pts: number;
}

export interface ConclEntry {
  a: string;
  b: string;
}

export interface VivaAnswer {
  pick: number;
  pts: number;
}

export interface DicotSeedState {
  /** The bench seed: it arranges the dishes, and nothing else. */
  seed: number;
  /**
   * Whether this attempt's viva was drawn and shuffled, or is the bank's
   * first five in their authored order. Settled at init and never changed,
   * so the reducer always marks against the paper that was shown.
   */
  vivaShuffled: boolean;
  /** The three dishes, left to right. */
  dishes: SpeciesId[];

  /** The specimen being worked on, or null before one is taken from a dish. */
  specimen: Seed | null;
  /** The optional seed sown on wet cotton. */
  germ: Germinating | null;
  /** The lab clock, in hours. */
  clock: number;
  /** Hours still to run off as the clock turns. Drained by `tick`. */
  pending: number;

  held: Held | null;
  found: { hilum: boolean; micropyle: boolean };
  /** Taps under the lens that landed on neither the hilum nor the micropyle. */
  misses: number;
  ruinedCount: number;
  tornCount: number;

  /** The specimen as it was when it opened cleanly — the evidence, frozen. */
  dissected: Seed | null;
  /** Which drawing the docked lens is showing. */
  lens: 'ext' | 'cut';
  labels: Partial<Record<LabelId, LabelPin>>;
  labelGrade: Record<LabelId, LabelGrade> | null;

  step: number;
  pts: { prep: number; external: number; dissect: number; label: number; table: number; concl: number };

  /** Which row of the observation table the task is on. */
  selRow: number;
  rec: Partial<Record<PartId, TableEntry>>;
  tableGrade: Partial<Record<PartId, TableGrade>> | null;
  concl: Partial<Record<ConclId, ConclEntry>>;
  conclGrade: Partial<Record<ConclId, { a: boolean; b: boolean }>> | null;
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
    'A dicot seed, opened up. Start by taking a seed from one of the three dishes and putting it in the beaker to ' +
    'soak — **overnight**, or the lab clock will do it for you. New here? Press **How to play**.',
  tone: 'info',
};

/**
 * The dishes, arranged from the seed.
 *
 * The anatomy never varies — every dicot seed here has the same parts — but
 * which dish sits where does, so two students side by side are not tapping the
 * same pixel, and a teacher can reproduce any bench from the seed in its
 * attempt record.
 */
export function dishesFromSeed(seed: number): SpeciesId[] {
  const rand = mulberry32(seed);
  const ids = [...SPECIES_IDS];
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = ids[i]!;
    ids[i] = ids[j]!;
    ids[j] = a;
  }
  return ids;
}

export function newDicotSeedState(seed: number, now: number, message: Message = WELCOME,
  options: BenchInitOptions = {},
): DicotSeedState {
  return {
    seed,
    vivaShuffled: options.vivaShuffled !== false,
    dishes: dishesFromSeed(seed),
    specimen: null,
    germ: null,
    clock: 0,
    pending: 0,
    held: null,
    found: { hilum: false, micropyle: false },
    misses: 0,
    ruinedCount: 0,
    tornCount: 0,
    dissected: null,
    lens: 'ext',
    labels: {},
    labelGrade: null,
    step: STEP.soak,
    pts: { prep: 0, external: 0, dissect: 0, label: 0, table: 0, concl: 0 },
    selRow: 0,
    rec: {},
    tableGrade: null,
    concl: {},
    conclGrade: null,
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

/**
 * How far the dissection itself has actually got, whatever step the strip says.
 *
 * The first five steps are not submitted: they are reached by doing the thing,
 * so the step is DERIVED from the specimen rather than incremented by a button.
 */
export function reach(s: DicotSeedState): number {
  const sd = s.specimen;
  if (!sd || !sd.onTile) return STEP.soak;
  if (!(s.found.hilum && s.found.micropyle)) return STEP.outside;
  if (sd.coat && !sd.ruined) return STEP.coat;
  if (!(sd.split === 'natural' && !sd.ruined)) return STEP.split;
  return STEP.label;
}

/** Labels actually dropped somewhere. */
export function placedCount(s: DicotSeedState): number {
  return LABELS.filter((k) => s.labels[k]).length;
}

/** Rows of the observation table with both cells chosen. */
export function tableFilled(s: DicotSeedState): number {
  return TABLE_ROWS.filter((r) => {
    const e = s.rec[r.id];
    return Boolean(e && e.is && e.does);
  }).length;
}

export function conclFilled(s: DicotSeedState): boolean {
  return CONCL.every((c) => {
    const e = s.concl[c.id];
    return Boolean(e && e.a && e.b);
  });
}

export function conclValue(s: DicotSeedState, id: ConclId, side: ConclSide): string {
  return s.concl[id]?.[side] ?? '';
}
