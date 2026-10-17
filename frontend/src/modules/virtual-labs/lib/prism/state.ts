import type { BenchInitOptions } from '@labs/types/lab-bench';
import type { Message, Mistake } from '../types';
import { VIVA_DRAW } from '../viva';

import { newDemo, type DemoState } from './demo';
import { CONCLUSIONS, RAYS, STEP, VIVA, type MeasuredRay } from './marking';
import {
  FACE,
  glassFromSeed,
  PAPER,
  vmul,
  type TraceResult,
  type Vec,
} from './optics';

/** Which of the three angles of a ray the protractor is laid down for. */
export type AngleId = 'i' | 'e' | 'D';

export interface Answer {
  pick: number;
  pts: number;
}

/**
 * One ray of the three. Everything that is TRUE of it (`i`, `e`, `D`, the
 * sighting error) is worked out from the student's own four pins, never from
 * the physics: a crooked trace gives crooked angles, and the protractor
 * readings are then marked against that crooked trace. Nobody corrects it for
 * you, which is exactly what happens in the lab.
 */
export interface Trial {
  k: number;
  pins: Vec[];
  /** Point of incidence on face AB, from the line through P1 and P2. */
  P: Vec | null;
  /** Unit direction of the incident ray as drawn. */
  dinc: Vec | null;
  /** The angle of incidence the student's own line makes with the normal. */
  i: number | null;
  /** What the light actually did, for the ghost pins and the TIR reveal. */
  phys: TraceResult | null;
  /** Point of emergence on face AC, from the line through P3 and P4. */
  Mp: Vec | null;
  demg: Vec | null;
  e: number | null;
  D: number | null;
  /** Where the incident ray produced crosses the emergent ray: the D vertex. */
  X: Vec | null;
  traced: boolean;
  /** True when the ray never got out of face AC at all. */
  tir: boolean;
  reveal: boolean;
  /** How far the drawn emergent line is from the line of the real images. */
  err: number | null;
  pinPts: number;
  tracePts: number;
  meas: Record<AngleId, number | null>;
  mp: Record<AngleId, number>;
  consist: number;
}

export interface PrismState {
  seed: number;
  /**
   * Whether this attempt's viva was drawn and shuffled, or is the bank's
   * first five in their authored order. Settled at init and never changed,
   * so the reducer always marks against the paper that was shown.
   */
  vivaShuffled: boolean;
  /** The refractive index of this bench's glass. Shown once the marks are in. */
  n: number;

  // --- the bench ------------------------------------------------------------
  outline: boolean;
  /** Whether a pin is in the hand. */
  tool: 'pin' | null;
  /** The crosshair, which is where a pin goes in from the keyboard. */
  cx: number;
  cy: number;
  /** The white-light demonstration. Never marked. */
  white: boolean;
  /**
   * The ray box and its sweep. A teaching demonstration and nothing more: no
   * part of it reaches `scoreParts` or the attempt record, and it can be run
   * from end to end without moving a single mark.
   */
  demo: DemoState;
  /** Which ray's trace is drawn solid. */
  sel: number;

  // --- the procedure --------------------------------------------------------
  step: number;
  trial: number;
  trials: Trial[];
  /** Which angle the protractor is laid down for, if any. */
  arm: { k: number; which: AngleId } | null;
  /** The provisional reading under the protractor's pointer, 0–180. */
  prov: number;
  minPick: number | null;
  /** True once the conclusion has been submitted: the true curve is drawn. */
  graded: boolean;
  concl: (Answer | null)[];
  result: { least: number; picked: number; Dm: number; nFromDm: number } | null;
  viva: (Answer | null)[];

  log: Mistake[];
  t0: number;
  tEnd: number;
  done: boolean;
  message: Message;

  /** Monotonic counters a guided tour can take baselines of. */
  pinsPlaced: number;
  protMoves: number;
}

export const WELCOME: Message = {
  text:
    'A drawing board, a sheet of paper and a **60° glass prism**. Start by tapping the prism to pin it down and ' +
    'trace round it. New here? Press **How to play**.',
  tone: 'info',
};

export function newTrial(k: number): Trial {
  return {
    k,
    pins: [],
    P: null,
    dinc: null,
    i: null,
    phys: null,
    Mp: null,
    demg: null,
    e: null,
    D: null,
    X: null,
    traced: false,
    tir: false,
    reveal: false,
    err: null,
    pinPts: 0,
    tracePts: 0,
    meas: { i: null, e: null, D: null },
    mp: { i: 0, e: 0, D: 0 },
    consist: 0,
  };
}

export function newPrismState(seed: number, now: number, message: Message = WELCOME,
  options: BenchInitOptions = {},
): PrismState {
  return {
    seed,
    vivaShuffled: options.vivaShuffled !== false,
    n: glassFromSeed(seed),
    outline: false,
    tool: null,
    cx: PAPER.x + 134,
    cy: PAPER.y + 380,
    white: false,
    demo: newDemo(),
    sel: 0,
    step: STEP.fix,
    trial: 0,
    trials: Array.from({ length: RAYS }, (_, k) => newTrial(k)),
    arm: null,
    prov: 0,
    minPick: null,
    graded: false,
    concl: CONCLUSIONS.map(() => null),
    result: null,
    // One slot per question ACTUALLY ASKED. Sizing this from the bank would
    // leave slots the student is never shown, and the practical would never
    // register as finished.
    viva: Array.from({ length: VIVA_DRAW }, () => null),
    log: [],
    t0: now,
    tEnd: 0,
    done: false,
    message,
    pinsPlaced: 0,
    protMoves: 0,
  };
}

// ---------------------------------------------------------------------------
// Selectors: what the drawing and the console read off the state
// ---------------------------------------------------------------------------

export const currentTrial = (s: PrismState): Trial => s.trials[s.trial]!;

export const measuredRays = (s: PrismState): MeasuredRay[] =>
  s.trials.map((t) => ({ i: t.meas.i, e: t.meas.e, D: t.meas.D }));

export const readingsTaken = (s: PrismState): number =>
  s.trials.reduce((a, t) => a + (['i', 'e', 'D'] as AngleId[]).filter((w) => t.meas[w] !== null).length, 0);

export const allTraced = (s: PrismState): boolean => s.trials.every((t) => t.traced);

/** Whether the bench may still be worked on. */
export const benchLive = (s: PrismState): boolean => !s.done && !s.graded;

/**
 * The glass is on the paper while you are pinning; once you lift it to join the
 * pins, only the pencil outline is left, as on a real sheet. A demonstration
 * puts it back down: light cannot be shown going through a prism that has been
 * taken off the paper.
 */
export const glassDown = (s: PrismState): boolean =>
  s.white || s.demo.on || (s.step < STEP.measure && !(s.step === STEP.trace && currentTrial(s).traced));

/** Where the protractor is laid down, what it is measuring, and from what. */
export interface MeasureGeometry {
  which: AngleId;
  k: number;
  /** The vertex the protractor is centred on. */
  c: Vec;
  /** The direction its baseline lies along: 0° on the scale. */
  ref: Vec;
  /** The ray whose crossing of the scale is the reading. */
  target: Vec;
  /** The angle the student's own trace actually makes. */
  truth: number;
  what: string;
  at: string;
  baseline: string;
  rayName: string;
}

export function measureGeometry(s: PrismState): MeasureGeometry | null {
  if (!s.arm) return null;
  const t = s.trials[s.arm.k];
  if (!t || !t.traced) return null;
  const { which, k } = s.arm;

  if (which === 'i') {
    if (!t.P || !t.dinc || t.i === null) return null;
    return {
      which,
      k,
      c: t.P,
      ref: FACE.AB.n,
      target: vmul(t.dinc, -1),
      truth: t.i,
      what: 'the angle of incidence i',
      at: 'the point of incidence P',
      baseline: 'the normal (dashed blue)',
      rayName: 'incident ray',
    };
  }
  if (which === 'e') {
    if (!t.Mp || !t.demg || t.e === null) return null;
    return {
      which,
      k,
      c: t.Mp,
      ref: FACE.AC.n,
      target: t.demg,
      truth: t.e,
      what: 'the angle of emergence e',
      at: 'the point of emergence M',
      baseline: 'the normal (dashed blue)',
      rayName: 'emergent ray',
    };
  }
  if (!t.X || !t.dinc || !t.demg || t.D === null) return null;
  return {
    which,
    k,
    c: t.X,
    ref: t.dinc,
    target: t.demg,
    truth: t.D,
    what: 'the angle of deviation D',
    at: 'where the produced incident ray crosses the emergent ray',
    baseline: 'the produced incident ray',
    rayName: 'emergent ray',
  };
}
