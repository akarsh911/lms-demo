import type { BenchInitOptions } from '@labs/types/lab-bench';
import { mulberry32 } from '../seed';
import type { Message, Mistake } from '../types';
import { VIVA_DRAW } from '../viva';

import { CONCLUSION, IDENT_MIN_Q, LABEL_MIN_Q, TRAY_SIZE, VIVA } from './marking';
import {
  OBJECTIVES,
  fieldFactor,
  lightAt,
  sharpnessAt,
  type Objective,
} from './optics';
import {
  DIVIDING_IDS,
  PINS_PER_SLIDE,
  PLAIN_IDS,
  SPECIMEN_BY_ID,
  type FeatureId,
  type Organism,
  type Process,
  type Specimen,
  type SpecimenId,
} from './specimens';

/**
 * The whole practical as plain data. The reducer never mutates a state it was
 * given; it returns the same object when nothing changed.
 */

/** One slide in the box, and everything the student has done with it. */
export interface TraySlide {
  /** The number printed on its label. It tells you nothing else. */
  n: number;
  specimen: SpecimenId;
  /** Where the specimen sits on the slide, in mm from the mounting centre. */
  sx: number;
  sy: number;
  /** How far this slide's plane of best focus is from the nominal one. */
  dz: number;
  broken: boolean;
  /** The best view the student ever managed of it at 40×. */
  best: number;
  org: Organism | '';
  proc: Process | '';
  labels: (string | null)[];
  seen: FeatureId | '';
}

export interface Answer {
  pick: number;
  pts: number;
}

export interface GradedCell {
  pts: number;
}

export interface Graded {
  cells: Record<number, GradedCell>;
  ident: number;
  label: number;
  seen: number;
}

export interface CellDivisionState {
  seed: number;
  /**
   * Whether this attempt's viva was drawn and shuffled, or is the bank's
   * first five in their authored order. Settled at init and never changed,
   * so the reducer always marks against the paper that was shown.
   */
  vivaShuffled: boolean;
  tray: TraySlide[];
  /** Index of the slide clipped to the stage, or null. */
  mounted: number | null;
  objective: Objective;
  /** How far the body tube is racked down, in focus units. */
  h: number;
  /** Lamp position, 0 (off) to 3 (bright). */
  lamp: number;
  /** Where the mechanical stage has carried the slide, in mm. */
  pos: { x: number; y: number };
  /** Which pointer is being named — the one ringed in the eyepiece. */
  pin: number;
  /** Which row of the observation table the record step is writing. */
  row: number;

  step: number;
  flags: { darkMount: boolean; highMount: boolean };
  warned: { coarse40: boolean; close: boolean };
  graded: Graded | null;
  concl: (Answer | null)[];
  viva: (Answer | null)[];
  log: Mistake[];

  t0: number;
  tEnd: number;
  done: boolean;
  message: Message;

  /** Monotonic counter a guided tour takes a baseline of. */
  mounts: number;
}

export const WELCOME: Message = {
  text:
    'Six prepared slides, numbered but not named. Three of them show a cell or an animal reproducing; three do not. ' +
    'Set the microscope up first — **lamp on, 10× objective**. New here? Press **How to play**.',
  tone: 'info',
};

/** The offsets a prepared slide can be mounted at, in focus units. */
const MOUNT_OFFSETS: readonly number[] = [-2, -1, 0, 1, 2];

function shuffle<T>(items: T[], rand: () => number): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = items[i]!;
    items[i] = items[j]!;
    items[j] = a;
  }
  return items;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The box of slides, generated from the bench seed.
 *
 * Three of the six carry something reproducing and three do not — that ratio is
 * the practical, so it never varies. WHICH organism is on each, in what order,
 * where on the slide it was mounted and how thickly it was mounted all do, so
 * two students at neighbouring benches cannot copy a row of answers and a
 * teacher can reproduce any attempt exactly from the seed in its record.
 *
 * At most one substitution is made, and only ever inside one half, so every
 * organism is still somewhere in the box: a tray may hold two yeast slides and
 * one Hydra, never no Hydra at all.
 *
 * Every specimen is placed completely OUTSIDE the 40× field and well inside the
 * 10× field, which is what makes low power first the only way in rather than
 * good advice.
 */
export function trayFromSeed(seed: number): TraySlide[] {
  const rand = mulberry32(seed);
  const dividing = shuffle([...DIVIDING_IDS], rand);
  const plain = shuffle([...PLAIN_IDS], rand);

  if (rand() < 0.7) {
    const intoDividing = rand() < 0.5;
    const half = intoDividing ? dividing : plain;
    const pool = intoDividing ? DIVIDING_IDS : PLAIN_IDS;
    const i = Math.floor(rand() * half.length);
    const choices = pool.filter((id) => id !== half[i]);
    half[i] = choices[Math.floor(rand() * choices.length)]!;
  }

  const ids = shuffle([...dividing, ...plain], rand);

  return ids.map((id, i) => {
    const spec = SPECIMEN_BY_ID[id];
    const near = OBJECTIVES[40].R + spec.rS + 0.08;
    const far = OBJECTIVES[10].R - spec.rS - 0.35;
    const d = near + rand() * (far - near);
    const angle = rand() * Math.PI * 2;
    return {
      n: i + 1,
      specimen: id,
      sx: round2(d * Math.cos(angle)),
      sy: round2(d * Math.sin(angle)),
      dz: MOUNT_OFFSETS[Math.floor(rand() * MOUNT_OFFSETS.length)]!,
      broken: false,
      best: 0,
      org: '',
      proc: '',
      labels: Array.from({ length: PINS_PER_SLIDE }, () => null),
      seen: '',
    };
  });
}

export function newCellDivisionState(
  seed: number,
  now: number,
  message: Message = WELCOME,
  options: BenchInitOptions = {},
): CellDivisionState {
  return {
    seed,
    vivaShuffled: options.vivaShuffled !== false,
    tray: trayFromSeed(seed),
    mounted: null,
    objective: 10,
    h: 12,
    lamp: 0,
    pos: { x: 0, y: 0 },
    pin: 0,
    row: 0,
    step: 0,
    flags: { darkMount: false, highMount: false },
    warned: { coarse40: false, close: false },
    graded: null,
    concl: CONCLUSION.map(() => null),
    // One slot per question ACTUALLY ASKED. Sizing this from the bank would
    // leave slots the student is never shown, and the practical would never
    // register as finished.
    viva: Array.from({ length: VIVA_DRAW }, () => null),
    log: [],
    t0: now,
    tEnd: 0,
    done: false,
    message,
    mounts: 0,
  };
}

// ---------------------------------------------------------------------------
// Reading the bench
// ---------------------------------------------------------------------------

export function mountedSlide(s: CellDivisionState): TraySlide | null {
  return s.mounted === null ? null : (s.tray[s.mounted] ?? null);
}

export function specimenOf(slide: TraySlide): Specimen {
  return SPECIMEN_BY_ID[slide.specimen];
}

/** Everything visible through the eyepiece, computed from the instrument. */
export interface EyeView {
  slide: TraySlide | null;
  specimen: Specimen | null;
  /** Nothing is clipped to the stage. */
  none: boolean;
  broken: boolean;
  sharp: number;
  /** How much of the specimen is inside the field. */
  f: number;
  light: number;
  /** Distance from the centre of the field to the specimen, in mm. */
  d: number;
  /** The view as one number: sharpness × field × light. */
  q: number;
}

export function viewThrough(s: CellDivisionState): EyeView {
  const light = lightAt(s.objective, s.lamp);
  const slide = mountedSlide(s);
  if (!slide) {
    return { slide: null, specimen: null, none: true, broken: false, sharp: 0, f: 0, light, d: 0, q: 0 };
  }
  const specimen = specimenOf(slide);
  if (slide.broken) {
    return { slide, specimen, none: false, broken: true, sharp: 0, f: 0, light, d: 0, q: 0 };
  }
  const sharp = sharpnessAt(s.h, s.objective, slide.dz);
  const d = Math.hypot(slide.sx - s.pos.x, slide.sy - s.pos.y);
  const f = fieldFactor(d, specimen.rS, s.objective);
  return { slide, specimen, none: false, broken: false, sharp, f, light, d, q: sharp * f * light };
}

/**
 * HOW FAR THE SLIDE IS RIDING under the objective, in millimetres, peak.
 *
 * A prepared slide is a specimen in a film of mountant under a coverslip, and
 * it creeps: over a few seconds the whole field wanders by a fraction of its
 * width. It is small, and it is the reason a microscope does not look like a
 * photograph of one — a student who has centred something at 40× spends the
 * practical nudging it back.
 *
 * A physical distance rather than a number of pixels, because that is what it
 * is, and because the drawing scales it by whatever the objective in use is
 * worth: about three per cent of the field either way at both powers, which on
 * the slide is four times as far at 40× as at 10×. That is the right way round,
 * and it is why the drift a student ignored at low power is the one they spend
 * the high-power step nudging against.
 *
 * Zero when there is nothing to ride: no slide clipped on, a cracked one, or a
 * lamp that is off and a field that is therefore black. Nothing here reaches
 * the marking — `viewThrough` computes the distance from the centre of the
 * field from `pos` and `sx/sy` alone, and this moves neither — so which
 * organism and which process the student is looking at cannot be changed by it.
 */
export const RIDE_MM = 0.018;

export function mountRide(s: CellDivisionState): { x: number; y: number } {
  const slide = mountedSlide(s);
  if (!slide || slide.broken || s.lamp <= 0) return { x: 0, y: 0 };
  return { x: RIDE_MM, y: RIDE_MM * 0.62 };
}

/** Marked work stays exactly as it was marked. */
export function locked(s: CellDivisionState): boolean {
  return s.graded !== null || s.done;
}

/** You cannot name what you cannot see. */
export function canIdentify(v: EyeView): boolean {
  return !v.none && !v.broken && v.q >= IDENT_MIN_Q;
}

/**
 * The pointers appear only on a sharp, centred view at high power: at 100× the
 * parts simply are not resolved, whatever the student thinks they can see.
 */
export function canLabel(s: CellDivisionState, v: EyeView): boolean {
  return !v.none && !v.broken && s.objective === 40 && v.q >= LABEL_MIN_Q;
}

/** A cracked slide counts as finished with: there is no spare. */
export function slideDone(slide: TraySlide): boolean {
  return slide.broken || Boolean(slide.org && slide.proc && slide.labels.every((l) => l));
}

export function examinedCount(s: CellDivisionState): number {
  return s.tray.filter(slideDone).length;
}

export function recordedCount(s: CellDivisionState): number {
  return s.tray.filter((slide) => slide.seen !== '').length;
}

export function trayFull(s: CellDivisionState): boolean {
  return s.tray.length === TRAY_SIZE && s.tray.every(slideDone);
}

/** The first pointer on this slide that has not been named yet. */
export function nextUnlabelled(slide: TraySlide, from: number): number {
  for (let k = 0; k < slide.labels.length; k += 1) {
    const i = (from + k) % slide.labels.length;
    if (!slide.labels[i]) return i;
  }
  return from;
}
