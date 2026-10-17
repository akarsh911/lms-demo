import type { BenchInitOptions } from '@labs/types/lab-bench';
import { mulberry32 } from '../seed';
import type { Message, Mistake } from '../types';
import { VIVA_DRAW } from '../viva';

import { PINNED, PINS, VIVA, type LabelId } from './marking';
import { Z0, type MicState, type Peel, type SlideState, type Surface } from './peel';

/**
 * The whole practical, as plain data.
 *
 * The reducer clones before it changes anything, so nothing in here may be a
 * function or a class — which is also why the peel's few thousand cells are
 * derived from its seed in `peel.ts` rather than stored here.
 */

export type ToolId = 'forceps' | 'needle' | 'brush' | 'water' | 'safranin' | 'glycerine' | 'blot';

export const TOOL_IDS: readonly ToolId[] = [
  'forceps',
  'needle',
  'brush',
  'water',
  'safranin',
  'glycerine',
  'blot',
];

export const TOOL_NAMES: Readonly<Record<ToolId | 'slide', string>> = {
  forceps: 'the forceps',
  needle: 'the mounted needle',
  brush: 'the brush',
  water: 'the water dropper',
  safranin: 'the safranin',
  glycerine: 'the glycerine',
  blot: 'blotting paper',
  slide: 'the slide',
};

/** What is in the student's hand. A peel remembers what it is being carried on. */
export type Held =
  | { kind: ToolId | 'slide' }
  | { kind: 'peel'; by: 'forceps' | 'brush'; peel: Peel };

export interface GradedObsCell {
  ok: boolean;
  truth: string;
  mine: string;
}

export interface GradedLabelCell {
  ok: boolean;
  truth: LabelId;
  mine: string;
}

/** The marking of the observation step, frozen at the moment it was submitted. */
export interface Graded {
  obsCells: Record<string, GradedObsCell>;
  obs: number;
  count: number;
  said: number;
  trueCount: number;
  hidden: number;
  label: number;
  labelCells: Record<string, GradedLabelCell>;
  sharp: number;
}

export interface Conclusion {
  mine: string;
  truth: string;
  /** Whether the surface named matches the one actually peeled. */
  consistent: boolean;
  truthOk: boolean;
  pts: number;
}

export interface VivaAnswer {
  pick: number;
  pts: number;
}

export interface StomataState {
  seed: number;
  /**
   * Whether this attempt's viva was drawn and shuffled, or is the bank's
   * first five in their authored order. Settled at init and never changed,
   * so the reducer always marks against the paper that was shown.
   */
  vivaShuffled: boolean;
  /** Which way up the leaf is lying. */
  faceUp: Surface;
  /** The peel floating in the watch glass, if one is. */
  dish: Peel | null;
  held: Held | null;
  slide: SlideState;
  mic: MicState;

  step: number;
  /** How many peels have been taken, and how many mounts ruined. */
  peelN: number;
  broken: number;
  wasted: number;

  /** What the student wrote in the observation table, and what they counted. */
  rec: Record<string, string>;
  count: string;
  labels: Record<string, string>;
  /** Which part each pin is really on, shuffled per bench. */
  labelMap: Record<string, LabelId>;

  /**
   * Peel, mount and focus marks as they stood when the observations were
   * submitted. After that the slide may be broken or remade without changing a
   * mark that was already earned.
   */
  frozen: { peel: number; mount: number; focus: number } | null;
  graded: Graded | null;
  concl: { mine: string; truth: string };
  conclDone: Conclusion | null;
  viva: (VivaAnswer | null)[];

  log: Mistake[];
  message: Message;
  t0: number;
  tEnd: number;
  done: boolean;

  /** Monotonic counters a guided tour can take a baseline of. */
  focusMoves: number;
  panMoves: number;
}

export function newSlide(seed: number, wasted: number): SlideState {
  return {
    seed: (seed * 7919 + 13 + wasted * 104729) >>> 0,
    peel: null,
    water: 0,
    stain: 0,
    glyc: false,
    blotted: false,
    cover: null,
    bubbles: [],
    dry: false,
    onStage: false,
    broken: false,
    waterFirst: false,
  };
}

export function newMic(): MicState {
  return {
    obj: 10,
    z: Z0,
    cx: 0.9,
    cy: -0.55,
    foundLow: false,
    centredLow: false,
    switched: false,
    lowFirst: false,
    centredFirst: false,
    bestHigh: 0,
  };
}

export const WELCOME: Message = {
  text:
    'A leaf, a slide and a microscope. Start by peeling: pick up the **forceps** and pull the thin transparent flap ' +
    'off the torn edge of the leaf. New here? Press **How to play**.',
  tone: 'info',
};

function shuffled<T>(arr: readonly T[], seed: number): T[] {
  const a = arr.slice();
  const rnd = mulberry32(seed >>> 0);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

export function newStomataState(seed: number, now: number, message: Message = WELCOME,
  options: BenchInitOptions = {},
): StomataState {
  const parts = shuffled(PINNED, seed + 77);
  const labelMap: Record<string, LabelId> = {};
  const labels: Record<string, string> = {};
  PINS.forEach((p, i) => {
    labelMap[p] = parts[i]!;
    labels[p] = '';
  });

  return {
    seed,
    vivaShuffled: options.vivaShuffled !== false,
    faceUp: 'lower',
    dish: null,
    held: null,
    slide: newSlide(seed, 0),
    mic: newMic(),
    step: 0,
    peelN: 0,
    broken: 0,
    wasted: 0,
    rec: {},
    count: '',
    labels,
    labelMap,
    frozen: null,
    graded: null,
    concl: { mine: '', truth: '' },
    conclDone: null,
    // One slot per question ACTUALLY ASKED. Sizing this from the bank would
    // leave slots the student is never shown, and the practical would never
    // register as finished.
    viva: Array.from({ length: VIVA_DRAW }, () => null),
    log: [],
    message,
    t0: now,
    tEnd: 0,
    done: false,
    focusMoves: 0,
    panMoves: 0,
  };
}
