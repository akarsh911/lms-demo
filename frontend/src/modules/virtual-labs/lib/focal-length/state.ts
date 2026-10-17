import type { BenchInitOptions } from '@labs/types/lab-bench';
import type { Message, Mistake } from '../types';
import { VIVA_DRAW } from '../viva';

import { benchFromSeed, type ObjectId, type PartId, type StandId } from './optics';
import { STEP, VIVA } from './marking';

/** One recorded trial: what was typed, what was true, and what it earned. */
export interface Trial {
  /** Position of the component the student wrote down, cm. */
  comp: number;
  /** Position of the screen the student wrote down, cm. */
  scr: number;
  /** Where the stands really were. */
  trueComp: number;
  trueScr: number;
  /** f = |a − b| from the two numbers the student wrote. */
  f: number;
  /** The image distance the optics actually put there, cm. */
  trueF: number;
  /** Blur circle left on the card, cm. */
  blur: number;
  /** How far the card was from the focal plane, cm. */
  defocus: number;
  focusPts: number;
  readPts: number;
  pts: number;
}

export interface Conclusion {
  pick: number;
  /** The statement the student's OWN two means support. */
  own: number;
  pts: number;
  accPts: number;
  cmpPts: number;
  statement: string;
  /** How far each mean sat from this bench's true focal length, cm. */
  eM: number;
  eL: number;
}

export interface VivaAnswer {
  pick: number;
  pts: number;
}

/**
 * The whole practical as plain data. The reducer never mutates a state it was
 * given; it returns the same object when nothing changed.
 */
export interface FocalLengthState {
  seed: number;
  /**
   * Whether this attempt's viva was drawn and shuffled, or is the bank's
   * first five in their authored order. Settled at init and never changed,
   * so the reducer always marks against the paper that was shown.
   */
  vivaShuffled: boolean;
  /** True focal lengths of this bench, revealed only in the conclusion. */
  fM: number;
  fL: number;

  // --- the bench ------------------------------------------------------------
  pos: Record<PartId, { comp: number; scr: number }>;
  obj: Record<PartId, ObjectId | null>;
  /** Unsafe or near objects chosen, per part. Each costs 4 of the set-up marks. */
  badObj: Record<PartId, number>;
  /** Which optic is in the stand; the other lies at the end of the bench. */
  mounted: PartId;
  /** Which part of the practical the bench is set up for. */
  part: PartId;
  /** The stand the move controls and the scale magnifier follow. */
  sel: StandId;

  // --- the procedure --------------------------------------------------------
  step: number;
  trials: Record<PartId, Trial[]>;
  /** Where the component stood for the last recorded trial, cm. */
  lastComp: Record<PartId, number | null>;
  means: Record<PartId, number | null>;
  meanPts: Record<PartId, number>;
  concl: Conclusion | null;
  viva: (VivaAnswer | null)[];
  log: Mistake[];
  t0: number;
  tEnd: number;
  done: boolean;

  // --- what the bench is showing --------------------------------------------
  /**
   * Whether the drawn light rays are on the bench: the beam arriving from the
   * distant object, the cone closing on the image and the cone opening out
   * again past it.
   *
   * THIS IS THE TEACHING LAYER on this bench. A real optical bench shows you
   * none of it — there is no chalk dust in the air and the beam is simply not
   * there to see — so the lines are a drawing over the apparatus, and the bench
   * bar's switch takes them away. ON by default, because a student hunting for
   * a sharp image for the first time is helped by seeing where the light is
   * going; off, the card and the close-up are all that is left, which is the
   * real bench.
   *
   * It is drawing only. No mark, step, log entry or line of the attempt record
   * depends on it: the image on the card, the blur circle and the scale are
   * unchanged either way, and those are the only things the student reads.
   */
  rays: boolean;
  message: Message;
  /**
   * A stand is pushed by hand, so it never lands on an exact millimetre. The
   * wobble has to be reproducible from the seed — a reducer that called
   * `Math.random` would give a different bench every time the same actions were
   * replayed — so it is drawn from this counter instead.
   */
  nudges: number;
  /** Monotonic counters a guided tour takes baselines of. */
  moves: number;
  objChoices: number;
}

export const WELCOME: Message = {
  text:
    'Two set-ups today: a **concave mirror** and then a **convex lens**, each aimed at something far away. ' +
    'Start by choosing what the mirror looks at — it has to be distant, so the rays arrive parallel. ' +
    'New here? Press **How to play**.',
  tone: 'info',
};

export function newFocalLengthState(seed: number, now: number, message: Message = WELCOME,
  options: BenchInitOptions = {},
): FocalLengthState {
  const bench = benchFromSeed(seed);
  return {
    seed,
    vivaShuffled: options.vivaShuffled !== false,
    fM: bench.fM,
    fL: bench.fL,
    pos: { mirror: { ...bench.start.mirror }, lens: { ...bench.start.lens } },
    obj: { mirror: null, lens: null },
    badObj: { mirror: 0, lens: 0 },
    mounted: 'mirror',
    part: 'mirror',
    sel: 'scr',
    step: STEP.setupM,
    trials: { mirror: [], lens: [] },
    lastComp: { mirror: null, lens: null },
    means: { mirror: null, lens: null },
    meanPts: { mirror: 0, lens: 0 },
    concl: null,
    // One slot per question ACTUALLY ASKED. Sizing this from the bank would
    // leave slots the student is never shown, and the practical would never
    // register as finished.
    viva: Array.from({ length: VIVA_DRAW }, () => null),
    log: [],
    t0: now,
    tEnd: 0,
    done: false,
    rays: true,
    message,
    nudges: 0,
    moves: 0,
    objChoices: 0,
  };
}

/** The part the bench is set up for at a given step. */
export function partForStep(step: number): PartId {
  return step === STEP.setupL || step === STEP.lens ? 'lens' : 'mirror';
}

/** Whether the stands may still be moved: not once the write-up has started. */
export function benchLive(s: FocalLengthState): boolean {
  return !s.done && s.step <= STEP.lens;
}
