/**
 * THE RAY BOX: a teaching demonstration, and only that.
 *
 * The marked practical is four pins and a pencil, because that is what a real
 * bench gives you: the glass is clear and the ray inside it leaves no track.
 * This is the other thing a teacher does — puts a ray box on the paper, aims it,
 * and lets the class watch the light go through. It answers a different
 * question: not "what did you measure?" but "what is actually happening?".
 *
 * NOTHING HERE IS EVER MARKED. No part of this module is read by `score.ts` or
 * by `buildAttemptRecord`, it adds no step, it logs no mistake, and it cannot
 * change a reading: the state it owns is `PrismState.demo`, and the only other
 * thing it touches is the assistant's line. Turning it on, sweeping it from end
 * to end and turning it off again leaves the mark exactly where it was.
 *
 * Pure: no React, no DOM, no clock. The sweep is advanced by the engine's
 * `tick`, so it can be driven from plain Node one dt at a time.
 */
import {
  APEX,
  DEG,
  FACE,
  angBetween,
  lineLine,
  minimumDeviation,
  smallestUsefulIncidence,
  trace,
  vcross,
  vdot,
  vmul,
  vnorm,
  vrot,
  vsub,
  type FaceId,
  type RayEvent,
  type TraceResult,
  type Vec,
} from './optics';

/**
 * How far in front of face AB the box stands. Far enough that the lamp is not
 * sitting on the glass, near enough that it is still on the sheet at both ends
 * of the swing.
 */
export const RAYLEN = 250;

/**
 * How far the box can be turned. Below 15° the ray misses the paper on its way
 * in; above 88° it grazes the face and there is nothing left to see.
 */
export const IMIN = 15;
export const IMAX = 88;

/** Where a sweep starts, where it stops, and how fast it turns. */
export const SWEEP_FROM = 30;
export const SWEEP_TO = IMAX - 0.5;
/** Degrees per second. Slow enough to watch the curve bend, quick enough to end. */
export const SWEEP_RATE = 11;

/** Within this of e, the passage is symmetric and D has bottomed out. */
const AT_MIN = 0.9;
/** A looser band for "the student has seen the minimum happen". */
const NEAR_MIN = 1.2;

/**
 * The demonstration's whole state.
 *
 * `lo`/`hi` are the range of i the ray box has actually been turned through, so
 * the plotted curve is only the part the student has visited — the curve draws
 * itself as the box swings, instead of being handed over complete.
 */
export interface DemoState {
  on: boolean;
  /** Where the box is aimed, in degrees from the normal at AB. */
  i: number;
  /** 0 when still, 1 while the sweep is running. */
  sweep: 0 | 1;
  lo: number | null;
  hi: number | null;
  seenMin: boolean;
  seenTIR: boolean;
}

export function newDemo(): DemoState {
  return { on: false, i: 50, sweep: 0, lo: null, hi: null, seenMin: false, seenTIR: false };
}

export const clampAim = (i: number): number => Math.max(IMIN, Math.min(IMAX, i));

// ---------------------------------------------------------------------------
// One aimed ray
// ---------------------------------------------------------------------------

export interface DemoRay {
  i: number;
  /** Where the box stands, and which way it points. */
  o: Vec;
  d: Vec;
  res: TraceResult;
  tir: boolean;
  tirAt: { face: FaceId; ang: number; pt: Vec } | null;
  /** True once the light has been refracted at AB and again at AC. */
  clean: boolean;
  /** Point of incidence, and the angle of refraction inside the glass. */
  P: Vec | null;
  r1: number | null;
  /** Point of emergence, the angle inside at that face, and the angle outside. */
  M: Vec | null;
  r2: number | null;
  e: number | null;
  D: number | null;
  /** Where the incident ray produced crosses the emergent ray: the D vertex. */
  X: Vec | null;
  exitDir: Vec;
  exitFace: FaceId | null;
}

const isRefract = (e: RayEvent): e is Extract<RayEvent, { type: 'refract' }> => e.type === 'refract';

/**
 * The ray the box throws at `i`, through the SAME tracer the student's own
 * trace is marked against. There is no demonstration physics: aim it too
 * squarely and it really is trapped, because the refraction equation at AC has
 * no solution.
 */
export function demoRay(i: number, n: number): DemoRay {
  const f = FACE.AB;
  const d = vrot(vmul(f.n, -1), -i / DEG);
  const o = vsub(f.mid, vmul(d, RAYLEN));
  const res = trace(o, d, n);
  const refr = res.ev.filter(isRefract);
  const tirEv = res.ev.find((e) => e.type === 'tir');
  const out: DemoRay = {
    i,
    o,
    d,
    res,
    tir: Boolean(tirEv),
    tirAt: tirEv && tirEv.type === 'tir' ? { face: tirEv.face, ang: tirEv.ang, pt: tirEv.pt } : null,
    clean: false,
    P: refr[0] ? refr[0].pt : null,
    r1: refr[0] ? refr[0].ref : null,
    M: null,
    r2: null,
    e: null,
    D: null,
    X: null,
    exitDir: res.exitDir,
    exitFace: res.exitFace,
  };
  if (!out.tir && refr.length === 2 && refr[0]!.face === 'AB' && refr[1]!.face === 'AC') {
    out.M = refr[1]!.pt;
    out.r2 = refr[1]!.ang;
    out.e = refr[1]!.ref;
    out.D = angBetween(d, res.exitDir);
    out.clean = true;
    out.X = lineLine(out.P!, d, out.M, res.exitDir);
  }
  return out;
}

/** True when the passage is symmetric: i = e, and D is at its minimum. */
export const atMinimum = (r: DemoRay): boolean => r.clean && Math.abs(r.i - r.e!) < AT_MIN;
const nearMinimum = (r: DemoRay): boolean => r.clean && Math.abs(r.i - r.e!) < NEAR_MIN;

/** The segment inside the glass, which at the minimum runs parallel to the base. */
export function insideSegment(r: DemoRay): { a: Vec; b: Vec } | null {
  const seg = r.res.segs.find((s) => s.inside);
  return seg ? { a: seg.a, b: seg.b } : null;
}

/**
 * Which angle of incidence a point on the paper implies, if the box were
 * dragged there: the angle at face AB between the normal and the line from that
 * point to the middle of the face. Unclamped, so the caller decides the range.
 */
export function aimFromPoint(p: Vec): number {
  const into = vmul(FACE.AB.n, -1);
  const u = vnorm(vsub(FACE.AB.mid, p));
  return -Math.atan2(vcross(into, u), vdot(into, u)) * DEG;
}

// ---------------------------------------------------------------------------
// The true curve, for the plot the sweep fills in
// ---------------------------------------------------------------------------

export interface CurvePoint {
  i: number;
  D: number;
}

const CURVES = new Map<number, readonly CurvePoint[]>();

/**
 * D against i for this glass, sampled from the tracer rather than from a
 * formula, so the plot and the beam cannot disagree. Cached per refractive
 * index: it is 300-odd ray traces and the glass does not change during a bench.
 */
export function deviationCurve(n: number): readonly CurvePoint[] {
  const had = CURVES.get(n);
  if (had) return had;
  const from = smallestUsefulIncidence(n);
  const pts: CurvePoint[] = [];
  for (let i = from; i <= 89.001; i += 0.25) {
    const r = demoRay(i, n);
    if (r.clean) pts.push({ i, D: r.D! });
  }
  const out: readonly CurvePoint[] = pts;
  CURVES.set(n, out);
  return out;
}

/** The part of it the ray box has actually been turned through. */
export function sweptCurve(n: number, lo: number | null, hi: number | null): readonly CurvePoint[] {
  if (lo === null || hi === null) return [];
  return deviationCurve(n).filter((p) => p.i >= lo - 0.3 && p.i <= hi + 0.3);
}

/**
 * The lowest angle in the sweep at which anything actually leaves the prism,
 * or null if nothing does. On denser glass the foot of the sweep is still
 * inside the trapped band, so this is where the deviation curve really begins —
 * asked of the tracer rather than of a formula, like everything else here.
 */
export function firstEmerging(n: number): number | null {
  for (let i = SWEEP_FROM; i <= SWEEP_TO; i += 0.1) {
    if (demoRay(i, n).clean) return Math.round(i * 10) / 10;
  }
  return null;
}

/** Where the curve bottoms out for this glass: the symmetric passage, i = e. */
export function demoMinimum(n: number): { i: number; D: number } {
  return minimumDeviation(n, APEX);
}

// ---------------------------------------------------------------------------
// Aiming
// ---------------------------------------------------------------------------

/**
 * Point the box at `i` and remember it: the range swept so far, whether the
 * minimum has been passed through, whether the light has been trapped. Mutates
 * a draft, because the reducer beside it works on a clone.
 */
export function aimAt(d: DemoState, i: number, n: number): void {
  d.i = clampAim(i);
  d.lo = d.lo === null ? d.i : Math.min(d.lo, d.i);
  d.hi = d.hi === null ? d.i : Math.max(d.hi, d.i);
  const r = demoRay(d.i, n);
  if (nearMinimum(r)) d.seenMin = true;
  if (r.tir) d.seenTIR = true;
}

/** One step of a running sweep. Returns the aim it should now hold. */
export const sweepNext = (d: DemoState, dt: number): number => d.i + dt * SWEEP_RATE * d.sweep;

/** True once the sweep has run out of range and should stop. */
export const sweepOver = (next: number): boolean => next >= SWEEP_TO;
