import type { BenchInitOptions } from '@labs/types/lab-bench';
import type { Message, Mistake } from '../types';
import { VIVA_DRAW } from '../viva';

import {
  dosesForSeed,
  newVessel,
  RX,
  VDEF,
  type LitmusKind,
  type ReagentKey,
  type RxId,
  type TagKey,
  type Truth,
  type TypeKey,
  type Vessel,
} from './chemistry';
import { VIVA } from './marking';

/**
 * The practical as plain data.
 *
 * Everything a student has done is here and nothing else is: the reducer never
 * mutates a state it was given, and returns the same object when nothing
 * changed. Which means the whole bench can be driven from Node.
 */

/** What is in the student's hand. Nothing happens to a vessel until it is tapped. */
export type Held =
  | { kind: 'bottle'; k: ReagentKey }
  | { kind: 'nails' }
  | { kind: LitmusKind }
  | { kind: 'thermo' }
  | { kind: 'stopper' }
  | { kind: 'burner' };

export type ToolKind = Exclude<Held, { kind: 'bottle' }>['kind'];

export interface GradedRow {
  /** Marks out of 7 for this reaction's row. */
  pts: number;
  /** How many of the six ticks matched. */
  match: number;
  truth: Truth;
  /** Plain English for what the vessel was showing at that moment. */
  shown: string;
  picked: TagKey[];
}

export interface ClassifiedRow {
  picked: TypeKey | '';
  truth: TypeKey | null;
  pts: number;
}

export interface VivaAnswer {
  pick: number;
  pts: number;
}

export interface ReactionTypesState {
  seed: number;
  /**
   * Whether this attempt's viva was drawn and shuffled, or is the bank's
   * first five in their authored order. Settled at init and never changed,
   * so the reducer always marks against the paper that was shown.
   */
  vivaShuffled: boolean;
  /** How much one pour of each reagent puts in, on this bench. */
  dose: Readonly<Record<ReagentKey, number>>;

  // --- the bench ------------------------------------------------------------
  vessels: Vessel[];
  /** The lab clock, in simulated minutes. */
  min: number;
  /** Simulated minutes still to run, and how fast they are being run off. */
  pending: number;
  rate: number;
  held: Held | null;
  /** Which vessel the close-up is showing. */
  sel: number;
  flame: boolean;
  burnerAt: number | null;
  thermoIn: number | null;
  thermoBroken: boolean;

  // --- the procedure --------------------------------------------------------
  step: number;
  /** Vessels spoiled by a reagent that does not belong in them. */
  badSetup: number;
  wrongHeat: boolean;
  stopperHeat: boolean;
  /** Minutes the burner has actually stood lit under the crystals. */
  fsHeatMin: number;
  thermoSeen: boolean;
  litmusSeen: boolean;
  /** Which reaction the observation step is filling in. */
  focus: RxId;
  rec: Record<RxId, TagKey[]>;
  cls: Record<RxId, TypeKey | ''>;
  graded: { rows: Record<RxId, GradedRow>; min: number } | null;
  clsGraded: Record<RxId, ClassifiedRow> | null;
  /** Marks frozen at the moment they were submitted. */
  pts: { observe: number; classify: number };
  viva: (VivaAnswer | null)[];

  log: Mistake[];
  warned: { overheat: boolean };
  /** A tube burst or cracked this wait; its message must not be written over. */
  alert: boolean;
  /** The "the blue has not gone yet" warning has been given once. */
  readyWarned: boolean;

  t0: number;
  tEnd: number;
  done: boolean;
  message: Message;
}

export const WELCOME: Message = {
  text:
    'Four reactions on one bench, and the job is to find out what **kind** each one is. ' +
    'Start wherever you like — (iii) is slow, so it pays to set it going early. New here? Press **How to play**.',
  tone: 'info',
};

export function newReactionState(seed: number, now: number, message: Message = WELCOME,
  options: BenchInitOptions = {},
): ReactionTypesState {
  const blankTags = Object.fromEntries(RX.map((r) => [r.id, [] as TagKey[]])) as Record<RxId, TagKey[]>;
  const blankCls = Object.fromEntries(RX.map((r) => [r.id, '' as TypeKey | ''])) as Record<RxId, TypeKey | ''>;
  return {
    seed,
    vivaShuffled: options.vivaShuffled !== false,
    dose: dosesForSeed(seed),
    vessels: VDEF.map((_, k) => newVessel(k)),
    min: 0,
    pending: 0,
    rate: 0,
    held: null,
    sel: 0,
    flame: false,
    burnerAt: null,
    thermoIn: null,
    thermoBroken: false,
    step: 0,
    badSetup: 0,
    wrongHeat: false,
    stopperHeat: false,
    fsHeatMin: 0,
    thermoSeen: false,
    litmusSeen: false,
    focus: 'i',
    rec: blankTags,
    cls: blankCls,
    graded: null,
    clsGraded: null,
    pts: { observe: 0, classify: 0 },
    // One slot per question ACTUALLY ASKED. Sizing this from the bank would
    // leave slots the student is never shown, and the practical would never
    // register as finished.
    viva: Array.from({ length: VIVA_DRAW }, () => null),
    log: [],
    warned: { overheat: false },
    alert: false,
    readyWarned: false,
    t0: now,
    tEnd: 0,
    done: false,
    message,
  };
}
