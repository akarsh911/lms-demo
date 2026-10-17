import type { BenchInitOptions } from '@labs/types/lab-bench';
import type { Message, Mistake } from '../types';
import { VIVA_DRAW } from '../viva';

import {
  newTube,
  tubeLayout,
  type FizzLevel,
  type GasClaim,
  type LitmusId,
  type LitmusObs,
  type ReagentId,
  type SolidId,
  type Tube,
  type TubeSpec,
} from './chemistry';
import { CONCLUSIONS, VIVA } from './marking';

/** What is in the student's hand. Nothing acts on a tube until something is. */
export type Held =
  | { kind: 'reagent'; id: ReagentId }
  | { kind: 'litmus'; id: LitmusId }
  | { kind: 'jar'; id: SolidId }
  | { kind: 'splinter' }
  | { kind: 'lime' };

/** One row of the observation table, as the student wrote it. */
export interface RecordedRow {
  lit: LitmusObs | null;
  eff: FizzLevel | null;
  gas: GasClaim | null;
}

/** One row of the observation table, as it was marked. */
export interface GradedRow {
  pts: number;
  /** What that tube actually showed, in the same words the student chose from. */
  truth: string;
  recorded: string | null;
}

export interface Answer {
  pick: number;
  pts: number;
}

/**
 * The whole practical, as plain data. The reducer never mutates a state it was
 * given; it clones, edits the clone, and returns the same object when nothing
 * changed.
 */
export interface AcidBaseState {
  seed: number;
  /**
   * Whether this attempt's viva was drawn and shuffled, or is the bank's
   * first five in their authored order. Settled at init and never changed,
   * so the reducer always marks against the paper that was shown.
   */
  vivaShuffled: boolean;
  /** Which tube takes which solution on THIS bench. */
  layout: TubeSpec[];
  tubes: Tube[];

  held: Held | null;
  /** The tube the close-up is showing. */
  sel: number;

  step: number;
  /** Tubes given a solution their label does not call for. */
  contam: number;

  /** The observation-table row being written, while recording. */
  row: number;
  rec: RecordedRow[];
  graded: GradedRow[] | null;
  obsPts: number;

  /** What the lime water tube on the bench is showing, and which tube it came from. */
  lime: { from: string; milky: boolean } | null;

  concl: (Answer | null)[];
  viva: (Answer | null)[];
  log: Mistake[];

  t0: number;
  tEnd: number;
  done: boolean;
  message: Message;

  /** Monotonic counters a guided tour takes baselines of. */
  pickUps: number;
  rinses: number;
}

export const WELCOME: Message = {
  text:
    'Two colourless solutions, and eight tubes to tell them apart. Start by filling the tubes — the label under each one says which solution belongs in it. ' +
    'New here? Press **How to play**.',
  tone: 'info',
};

export function newAcidBaseState(seed: number, now: number, message: Message = WELCOME,
  options: BenchInitOptions = {},
): AcidBaseState {
  return {
    seed,
    vivaShuffled: options.vivaShuffled !== false,
    layout: tubeLayout(seed),
    tubes: Array.from({ length: 8 }, () => newTube()),
    held: null,
    sel: 0,
    step: 0,
    contam: 0,
    row: 0,
    rec: Array.from({ length: 8 }, () => ({ lit: null, eff: null, gas: null })),
    graded: null,
    obsPts: 0,
    lime: null,
    concl: CONCLUSIONS.map(() => null),
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
    rinses: 0,
  };
}

/** True while a row of the table has everything its tube calls for. */
export function rowFilled(state: AcidBaseState, i: number): boolean {
  const r = state.rec[i]!;
  const spec = state.layout[i]!;
  return spec.test === 'blue' || spec.test === 'red' ? r.lit !== null : r.eff !== null && r.gas !== null;
}

export const tableComplete = (state: AcidBaseState): boolean =>
  state.rec.every((_, i) => rowFilled(state, i));
