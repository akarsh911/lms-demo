import type { BenchInitOptions } from '@labs/types/lab-bench';
import type { Message, Mistake } from '../types';
import { VIVA_DRAW } from '../viva';

import { STEP, TARGETS, VIVA } from './marking';
import {
  DEG,
  OX,
  PX_CM,
  THICKNESSES,
  rayDir,
  slabFromSeed,
  slabPath,
  traceOf,
  type SlabPath,
  type SlabSpec,
  type Trace,
  type Vec,
} from './optics';

/**
 * The whole practical as plain data. The reducer never mutates a state it was
 * given; it returns the same object when nothing changed.
 */

/** What the student can pick up off the tray. */
export type ToolId = 'slab' | 'pin' | 'pencil' | 'protractor' | 'ruler';

/** Which angle the protractor is being laid for. */
export type AngleKey = 'i' | 'r' | 'e';

/** Where the protractor's centre is: the point of incidence, or of emergence. */
export type ProtractorAt = 'O' | 'E';

/** Marks a single trace's four pins earned, with the offsets they came from. */
export interface PinMarks {
  /** Out of 2, for the two incident pins. */
  inc: number;
  /** Out of 3, for the two emergent pins. */
  emg: number;
  /** Worst distance of an incident pin from the ray you drew, mm. */
  offInc: number;
  /** Worst distance of an emergent pin from the true line of sight, mm. */
  offEmg: number;
  total: number;
}

/** One of the three traces, at its own angle of incidence. */
export interface Trial {
  k: number;
  /** The angle of incidence this trace is for: 30, 45 or 60. */
  target: number;
  /** The protractor reading the incident ray was drawn at, 0–180. */
  drawn: number | null;
  pins: Vec[];
  joined: boolean;
  meas: Record<AngleKey, number | null>;
  /** Lateral displacement measured with the ruler, cm. */
  lat: number | null;
  pinPts: PinMarks | null;
  /** Attempts at drawing the incident ray at the wrong angle. */
  tries: number;
}

export interface ConclusionAnswer {
  pick: number;
  /** The option that was right for THIS student — the first is marked on their rows. */
  a: number;
  pts: number;
  why: string;
}

export interface VivaAnswer {
  pick: number;
  pts: number;
}

export interface GlassSlabState {
  seed: number;
  /**
   * Whether this attempt's viva was drawn and shuffled, or is the bank's
   * first five in their authored order. Settled at init and never changed,
   * so the reducer always marks against the paper that was shown.
   */
  vivaShuffled: boolean;
  /** The slab issued to this bench. Its thickness comes from the seed. */
  slab: SlabSpec;

  // --- the sheet ------------------------------------------------------------
  trials: Trial[];
  /** Which trace is on the drawing board now. */
  trial: number;
  slabOn: boolean;
  outline: boolean;
  origin: boolean;

  // --- what is in the student's hands --------------------------------------
  held: ToolId | null;
  /** Where the protractor is laid, or null while it is back in the tray. */
  prot: ProtractorAt | null;
  /** The scale reading the sight line is on, 0–180. */
  protAim: number | null;
  /** Which angle the next protractor reading will be recorded as. */
  pending: AngleKey | null;
  /** The crosshair on the paper: dragged with a pointer, nudged with arrow keys. */
  cross: Vec;

  // --- the marking ----------------------------------------------------------
  setupDed: number;
  concl: (ConclusionAnswer | null)[];
  viva: (VivaAnswer | null)[];
  log: Mistake[];

  // --- teaching view --------------------------------------------------------
  /**
   * Draw the path the light really takes. Off by default: a real ray is
   * invisible, and a student should look at their own sheet first.
   *
   * THIS IS THE TEACHING LAYER on this bench — not a panel beside the
   * apparatus but the apparatus itself, because the ray is the thing that
   * cannot be seen. The bench bar's switch drives it (`ui.teachOpen` /
   * `ui.teachToggle`), so there is one switch and the drawing cannot disagree
   * with it. Nothing reads it but the drawing: no mark, no step, no log entry
   * and no line of the attempt record depends on whether it was ever on.
   */
  reveal: boolean;
  /**
   * Where the teaching view's RAY BOX is aimed: degrees from the normal at O,
   * signed, so a negative angle is a ray coming in from the other side.
   *
   * It is an INDEPENDENT ray, not the student's. That is the whole reason the
   * live readout beside it can quote ∠i, ∠r, ∠e and the shift without handing
   * anything over: the marks come from measuring the four-pin trace, and this
   * ray was never pinned. Wire the readout to the student's own trace and it
   * would leak — do not.
   */
  rayA: number;
  /**
   * Every finished trace drawn together, one colour each.
   *
   * Not part of the teaching view and not gated by `teach`: these are the
   * student's OWN traces, already on their own sheet, laid over each other so
   * the three can be compared. One picture at a time, though — turning this on
   * puts the light path away and the other way round.
   */
  showAll: boolean;

  t0: number;
  tEnd: number;
  done: boolean;
  message: Message;

  /** Monotonic counters a guided tour takes baselines of. */
  pickUps: number;
}

export const WELCOME: Message = {
  text:
    'Three traces to do, at **30°**, **45°** and **60°**. Start by putting the **glass slab** on the paper — tap it in ' +
    'the tray, then tap the sheet. New here? Press **How to play**.',
  tone: 'info',
};

/** How far the ray box can be swung either side of the normal, degrees. */
export const RAY_LIMIT = 75;
/** Where it starts: a good working angle, well clear of the normal. */
export const RAY_START = 40;

export function newTrial(k: number): Trial {
  return {
    k,
    target: TARGETS[k] ?? 30,
    drawn: null,
    pins: [],
    joined: false,
    meas: { i: null, r: null, e: null },
    lat: null,
    pinPts: null,
    tries: 0,
  };
}

export function newGlassSlabState(seed: number, now: number, message: Message = WELCOME,
  options: BenchInitOptions = {},
): GlassSlabState {
  const slab = slabFromSeed(seed);
  return {
    seed,
    vivaShuffled: options.vivaShuffled !== false,
    slab,
    trials: TARGETS.map((_, k) => newTrial(k)),
    trial: 0,
    slabOn: false,
    outline: false,
    origin: false,
    held: null,
    prot: null,
    protAim: null,
    pending: null,
    cross: { x: OX, y: slab.y - 90 },
    setupDed: 0,
    concl: [null, null, null, null],
    // One slot per question ACTUALLY ASKED. Sizing this from the bank would
    // leave slots the student is never shown, and the practical would never
    // register as finished.
    viva: Array.from({ length: VIVA_DRAW }, () => null),
    log: [],
    reveal: false,
    rayA: RAY_START,
    showAll: false,
    t0: now,
    tEnd: 0,
    done: false,
    message,
    pickUps: 0,
  };
}

// ---------------------------------------------------------------------------
// Reading the state
// ---------------------------------------------------------------------------

export function currentTrial(s: GlassSlabState): Trial {
  return s.trials[s.trial] ?? newTrial(0);
}

export const setupDone = (s: GlassSlabState): boolean => s.slabOn && s.outline && s.origin;

/** A trace is finished when the points are joined and all three angles are down. */
export const trialDone = (t: Trial): boolean =>
  t.joined && t.meas.i !== null && t.meas.r !== null && t.meas.e !== null;

/** The first trace still unfinished, or −1 when all three are done. */
export const nextTrialIndex = (s: GlassSlabState): number => s.trials.findIndex((t) => !trialDone(t));

export type Phase = 'setup' | 'trial' | 'concl' | 'viva';

export function phase(s: GlassSlabState): Phase {
  if (!setupDone(s)) return 'setup';
  if (s.trials.some((t) => !trialDone(t))) return 'trial';
  if (s.concl.some((c) => c === null)) return 'concl';
  return 'viva';
}

/** Which step of the strip is live. The trace steps follow the trial on the board. */
export function stepIndex(s: GlassSlabState): number {
  const p = phase(s);
  if (p === 'setup') return STEP.setup;
  if (p === 'trial') {
    const here = currentTrial(s);
    return STEP.firstTrial + (trialDone(here) ? nextTrialIndex(s) : s.trial);
  }
  return p === 'concl' ? STEP.conclusions : STEP.viva;
}

/** The trace of one trial, worked out from that trial's own pins. */
export const traceOfTrial = (s: GlassSlabState, k: number): Trace =>
  traceOf(s.trials[k] ?? newTrial(k), s.slab);

export const traceOfCurrent = (s: GlassSlabState): Trace => traceOf(currentTrial(s), s.slab);

// ---------------------------------------------------------------------------
// The teaching view: an independent ray, aimed by the student
// ---------------------------------------------------------------------------

/**
 * Where the teaching ray meets the glass. The same point O the pencil marks,
 * so the beam and the student's own normal share a foot and the two drawings
 * can be read against each other.
 */
export const revealO = (s: GlassSlabState): Vec => ({ x: OX, y: s.slab.y });

/** The direction the teaching ray travels, from `rayA`. */
export const revealDir = (s: GlassSlabState): Vec =>
  rayDir(Math.abs(s.rayA), s.rayA < 0 ? -1 : 1);

/**
 * The whole path of the teaching ray, from Snell's law at both faces — the
 * same `slabPath` the marking is computed with, so nothing here is a picture.
 */
export const revealPath = (s: GlassSlabState): SlabPath | null =>
  slabPath(revealO(s), revealDir(s), s.slab);

/** Lateral displacement of the teaching ray, in centimetres. */
export function revealShiftCm(s: GlassSlabState): number {
  const p = revealPath(s);
  return p ? Math.abs(p.lat) / PX_CM : 0;
}

/**
 * The angle the ray box is at when it is dragged to a point on the paper: the
 * pointer names where the light comes FROM, so the direction is the point
 * towards O. Null while the pointer is level with the face or below it, where
 * there is no incident ray to name.
 */
export function rayAngleFromPoint(s: GlassSlabState, p: Vec): number | null {
  const O = revealO(s);
  const d = { x: O.x - p.x, y: O.y - p.y };
  if (d.y < 8) return null;
  const a = Math.atan2(d.x, d.y) * DEG;
  return Math.max(-RAY_LIMIT, Math.min(RAY_LIMIT, a));
}

/**
 * Whether the slab may still be swapped for another thickness.
 *
 * Free until the first pencil line: a slab is chosen out of the cupboard, not
 * changed halfway through. Once the outline is round it, or a pin is in the
 * paper, the trace on the sheet belongs to THAT slab and swapping it would put
 * the outline where the glass no longer is.
 */
export const slabLocked = (s: GlassSlabState): boolean =>
  s.outline || s.trials.some((t) => t.pins.length > 0 || t.joined);

/** The thicknesses the cupboard holds, in centimetres. */
export const SLAB_CHOICES = THICKNESSES;

/** The traces that are finished enough to be drawn beside each other. */
export const joinedTrials = (s: GlassSlabState): Trial[] => s.trials.filter((t) => t.joined);

/**
 * Where the protractor's centre sits and which half of the scale is in use.
 *
 * At O the straight edge lies along the face AB: over the air for ∠i, turned
 * over onto the glass for ∠r. At O′ it lies along DC, scale over the air below.
 */
export function protractorPose(s: GlassSlabState): { c: Vec; up: boolean } | null {
  if (!s.prot) return null;
  const o = traceOfCurrent(s);
  if (s.prot === 'O') {
    return { c: { x: o.inc ? o.inc.O.x : OX, y: s.slab.y }, up: s.pending !== 'r' };
  }
  return { c: o.emg ? o.emg.O2 : { x: OX, y: s.slab.y + s.slab.t }, up: false };
}

/**
 * The scale reading the ray being measured actually crosses at.
 *
 * This is what the student lays the sight line on, and the only reason the
 * magnified protractor is honest: it says where the ray IS, never what it
 * reads. Null while nothing is drawn on that half of the scale — drawing the
 * incident ray, for one, where there is nothing to align to yet.
 */
export function rayCrossingReading(s: GlassSlabState): number | null {
  const pose = protractorPose(s);
  const o = traceOfCurrent(s);
  if (!pose || !o.inc || !o.mid || !o.emg) return null;
  const v =
    s.pending === 'e' ? o.emg.d : s.pending === 'r' ? o.mid : { x: -o.inc.d.x, y: -o.inc.d.y };
  const dyUp = (pose.up ? -1 : 1) * v.y;
  if (dyUp <= 0) return null;
  return Math.atan2(dyUp, v.x) * DEG;
}
