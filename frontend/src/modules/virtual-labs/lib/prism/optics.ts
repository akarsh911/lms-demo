/**
 * The optics of a glass prism: a general 2-D ray tracer.
 *
 * Snell's law in vector form at every face the ray meets, with total internal
 * reflection appearing wherever the maths says sin r would exceed 1. NOTHING
 * about a ray is scripted — every line the student ends up drawing comes out of
 * `trace()`, which knows nothing about "the experiment". Aim a ray at the first
 * face too squarely and it really is trapped inside the glass; there is no
 * special case for it, only a refraction equation with no solution.
 *
 * Pure: no React, no DOM. It can be driven from plain Node, which is how the
 * bench is checked without a browser.
 */
import { mulberry32 } from '../seed';

export const DEG = 180 / Math.PI;

/** The refracting angle of the prism. Equilateral, as the syllabus specifies. */
export const APEX = 60;
/** Drawing units per centimetre of paper. */
export const SCALE = 25;
/** Pins must be at least 3 cm apart for the line through them to be trusted. */
export const SEP = 3 * SCALE;
/** An emergent pin closer than this to the glass is worth a word of warning. */
export const OUTMIN = 4.4 * SCALE;
/** Where the two images of P1 and P2 appear, seen through face AC. */
export const GHOST: readonly [number, number] = [1.8 * SCALE, 3.2 * SCALE];

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

export interface Vec {
  x: number;
  y: number;
}

export const V = (x: number, y: number): Vec => ({ x, y });
export const vadd = (a: Vec, b: Vec): Vec => V(a.x + b.x, a.y + b.y);
export const vsub = (a: Vec, b: Vec): Vec => V(a.x - b.x, a.y - b.y);
export const vmul = (a: Vec, k: number): Vec => V(a.x * k, a.y * k);
export const vdot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const vcross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const vlen = (a: Vec): number => Math.hypot(a.x, a.y);

export function vnorm(a: Vec): Vec {
  const l = vlen(a) || 1;
  return V(a.x / l, a.y / l);
}

export function vrot(a: Vec, th: number): Vec {
  return V(a.x * Math.cos(th) - a.y * Math.sin(th), a.x * Math.sin(th) + a.y * Math.cos(th));
}

const clamp1 = (x: number): number => Math.max(-1, Math.min(1, x));

/** The angle between two directions, in degrees, always 0–180. */
export function angBetween(a: Vec, b: Vec): number {
  return Math.acos(clamp1(vdot(vnorm(a), vnorm(b)))) * DEG;
}

// ---------------------------------------------------------------------------
// The sheet of paper and the prism standing on it
// ---------------------------------------------------------------------------

/** The drawing board, seen from above. */
export const SHEET_WIDTH = 1000;
export const SHEET_HEIGHT = 546;
export const BOARD = { x: 34, y: 20, w: 932, h: 506 } as const;
export const PAPER = { x: 56, y: 40, w: 888, h: 464 } as const;

/**
 * The prism on the paper: equilateral, apex up, base horizontal. The apex must
 * be exactly 60°, so the height comes from the half-base and not from a round
 * number of pixels.
 */
const BASE_Y = 350;
const HALF = 120;
const MIDX = 500;

export const PR = {
  A: V(MIDX, BASE_Y - HALF * Math.sqrt(3)),
  B: V(MIDX - HALF, BASE_Y),
  C: V(MIDX + HALF, BASE_Y),
} as const;

export const CENT = V((PR.A.x + PR.B.x + PR.C.x) / 3, (PR.A.y + PR.B.y + PR.C.y) / 3);

export type FaceId = 'AB' | 'AC' | 'BC';

export interface Face {
  id: FaceId;
  p: Vec;
  q: Vec;
  /** Unit direction from p to q. */
  d: Vec;
  /** Outward unit normal. */
  n: Vec;
  mid: Vec;
  len: number;
}

function mkFace(id: FaceId, p: Vec, q: Vec): Face {
  const d = vnorm(vsub(q, p));
  const mid = vmul(vadd(p, q), 0.5);
  let n = V(d.y, -d.x);
  if (vdot(n, vsub(mid, CENT)) < 0) n = vmul(n, -1);
  return { id, p, q, d, n, mid, len: vlen(vsub(q, p)) };
}

export const FACES: readonly Face[] = [
  mkFace('AB', PR.A, PR.B),
  mkFace('AC', PR.A, PR.C),
  mkFace('BC', PR.B, PR.C),
];

export const FACE: Readonly<Record<FaceId, Face>> = {
  AB: FACES[0]!,
  AC: FACES[1]!,
  BC: FACES[2]!,
};

export interface Hit {
  t: number;
  u: number;
  pt: Vec;
  f: Face;
}

/** A ray (origin `o`, unit direction `d`) against one face, taken as a segment. */
export function isect(o: Vec, d: Vec, f: Face, allowBack = false): Hit | null {
  const ex = f.q.x - f.p.x;
  const ey = f.q.y - f.p.y;
  const det = -d.x * ey + ex * d.y;
  if (Math.abs(det) < 1e-12) return null;
  const rx = f.p.x - o.x;
  const ry = f.p.y - o.y;
  const t = (-rx * ey + ex * ry) / det;
  const u = (d.x * ry - d.y * rx) / det;
  if (u < -1e-9 || u > 1 + 1e-9) return null;
  if (!allowBack && t < 1e-6) return null;
  return { t, u, pt: vadd(o, vmul(d, t)), f };
}

export function firstHit(o: Vec, d: Vec): Hit | null {
  return FACES.reduce<Hit | null>((best, f) => {
    const h = isect(o, d, f);
    return h && (!best || h.t < best.t) ? h : best;
  }, null);
}

/** Where two infinite lines cross, or null when they are parallel. */
export function lineLine(o1: Vec, d1: Vec, o2: Vec, d2: Vec): Vec | null {
  const det = vcross(d1, vmul(d2, -1));
  if (Math.abs(det) < 1e-12) return null;
  const r = vsub(o2, o1);
  const t = vcross(r, vmul(d2, -1)) / det;
  return vadd(o1, vmul(d1, t));
}

export const insidePrism = (p: Vec): boolean => FACES.every((f) => vdot(vsub(p, f.p), f.n) <= 0);

export const inPaper = (p: Vec): boolean =>
  p.x > PAPER.x + 6 && p.x < PAPER.x + PAPER.w - 6 && p.y > PAPER.y + 6 && p.y < PAPER.y + PAPER.h - 6;

/** Clip a drawn line to the sheet of paper, or null when none of it lands on it. */
export function clipSeg(a: Vec, b: Vec): [Vec, Vec] | null {
  let t0 = 0;
  let t1 = 1;
  const d = vsub(b, a);
  const edges: readonly [number, number][] = [
    [-d.x, a.x - PAPER.x],
    [d.x, PAPER.x + PAPER.w - a.x],
    [-d.y, a.y - PAPER.y],
    [d.y, PAPER.y + PAPER.h - a.y],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [vadd(a, vmul(d, t0)), vadd(a, vmul(d, t1))];
}

// ---------------------------------------------------------------------------
// The tracer
// ---------------------------------------------------------------------------

export interface Segment {
  a: Vec;
  b: Vec;
  /** True while the segment runs through the glass. */
  inside: boolean;
  /** The segment runs off the drawing rather than to another face. */
  open?: boolean;
  /** The segment that finally left the glass. */
  exit?: boolean;
}

export type RayEvent =
  | { type: 'tir'; face: FaceId; ang: number; pt: Vec }
  | { type: 'refract'; face: FaceId; ang: number; ref: number; pt: Vec };

export interface TraceResult {
  segs: Segment[];
  ev: RayEvent[];
  exitPt: Vec;
  exitDir: Vec;
  exitFace: FaceId | null;
  escaped?: boolean;
  stuck?: boolean;
}

/**
 * Starts outside the glass, refracts or totally-internally-reflects at every
 * face it meets, and stops when the ray leaves the glass or runs off the paper.
 */
export function trace(o: Vec, d: Vec, n: number, maxBounce = 10): TraceResult {
  const segs: Segment[] = [];
  const ev: RayEvent[] = [];
  let inside = false;
  let cur = o;
  let dir = vnorm(d);

  for (let b = 0; b < maxBounce; b += 1) {
    const h = firstHit(cur, dir);
    if (!h) {
      segs.push({ a: cur, b: vadd(cur, vmul(dir, 2400)), inside, open: true });
      return { segs, ev, exitPt: cur, exitDir: dir, exitFace: null, escaped: !inside };
    }
    segs.push({ a: cur, b: h.pt, inside });

    // The face normal turned to face the ray.
    const nf = vdot(dir, h.f.n) < 0 ? h.f.n : vmul(h.f.n, -1);
    const ci = -vdot(dir, nf);
    const ai = Math.acos(clamp1(ci)) * DEG;
    const eta = inside ? n : 1 / n; // n1 / n2
    const k = 1 - eta * eta * (1 - ci * ci);

    if (k < 0) {
      // sin r > 1: the refraction equation has no solution, so none of the
      // light gets out here.
      ev.push({ type: 'tir', face: h.f.id, ang: ai, pt: h.pt });
      dir = vnorm(vadd(dir, vmul(nf, 2 * ci)));
      cur = h.pt;
      continue;
    }

    const ar = Math.asin(clamp1(eta * Math.sqrt(Math.max(0, 1 - ci * ci)))) * DEG;
    ev.push({ type: 'refract', face: h.f.id, ang: ai, ref: ar, pt: h.pt });
    dir = vnorm(vadd(vmul(dir, eta), vmul(nf, eta * ci - Math.sqrt(k))));
    cur = h.pt;
    inside = !inside;

    if (!inside) {
      segs.push({ a: cur, b: vadd(cur, vmul(dir, 2400)), inside: false, open: true, exit: true });
      return { segs, ev, exitPt: h.pt, exitDir: dir, exitFace: h.f.id };
    }
  }
  return { segs, ev, exitPt: cur, exitDir: dir, exitFace: null, stuck: true };
}

export interface IncidenceResult {
  i: number;
  d: Vec;
  res: TraceResult;
  tir: boolean;
  exitFace: FaceId | null;
  /** Angle of deviation, once the ray has been through both faces. */
  D: number | null;
  /** Angle of emergence at the second face. */
  e: number | null;
  /** Angle of refraction inside the glass at the first face. */
  r1: number | null;
  /** Angle of incidence inside the glass at the second face. */
  r2: number | null;
  clean?: boolean;
}

/**
 * A ray built to strike the middle of face AB at a chosen angle of incidence —
 * used for the theoretical curve and for checking the bench.
 */
export function rayForIncidence(ideg: number, n: number): IncidenceResult {
  const f = FACE.AB;
  const d = vrot(vmul(f.n, -1), -ideg / DEG);
  const o = vsub(f.mid, vmul(d, 500));
  const r = trace(o, d, n);
  const refr = r.ev.filter((e): e is Extract<RayEvent, { type: 'refract' }> => e.type === 'refract');
  const out: IncidenceResult = {
    i: ideg,
    d,
    res: r,
    tir: r.ev.some((e) => e.type === 'tir'),
    exitFace: r.exitFace,
    D: null,
    e: null,
    r1: refr[0] ? refr[0].ref : null,
    r2: null,
  };
  if (refr.length === 2 && refr[0]!.face === 'AB' && refr[1]!.face === 'AC') {
    out.r2 = refr[1]!.ang;
    out.e = refr[1]!.ref;
    out.D = angBetween(d, r.exitDir);
    out.clean = true;
  }
  return out;
}

/** n from the angle of minimum deviation: n = sin((A + Dm)/2) ÷ sin(A/2). */
export const nFromMinDeviation = (Dm: number, A: number = APEX): number =>
  Math.sin((A + Dm) / 2 / DEG) / Math.sin(A / 2 / DEG);

export const criticalAngle = (n: number): number => Math.asin(1 / n) * DEG;

/**
 * The smallest angle of incidence at which anything at all emerges from the
 * second face. Below it the ray meets AC beyond the critical angle and is
 * turned back into the glass. Found by scanning, not by a formula, so it is the
 * tracer's own answer.
 */
export function smallestUsefulIncidence(n: number): number {
  for (let i = 10; i <= 89; i += 0.5) {
    if (rayForIncidence(i, n).clean) return i;
  }
  return 90;
}

/** Where the deviation curve bottoms out, by the symmetric passage i = e. */
export function minimumDeviation(n: number, A: number = APEX): { i: number; D: number } {
  const r = A / 2 / DEG;
  const i = Math.asin(n * Math.sin(r)) * DEG;
  return { i, D: 2 * i - A };
}

// ---------------------------------------------------------------------------
// The glass on this bench
// ---------------------------------------------------------------------------

/**
 * Crown glass, but not the SAME crown glass on every bench: the refractive
 * index is drawn from the seed, so two students sitting together cannot copy a
 * number off each other and the true curve on the graph is genuinely theirs.
 * Every value is a real crown glass, and every one is marked against the
 * student's own trace regardless.
 */
const GLASSES: readonly number[] = [1.5, 1.51, 1.52, 1.53, 1.54];

export function glassFromSeed(seed: number): number {
  const rnd = mulberry32(seed);
  return GLASSES[Math.floor(rnd() * GLASSES.length)] ?? 1.52;
}

/**
 * Dispersion, for the white-light demonstration: each colour has its own
 * refractive index, offset from the glass's mean, so each is deviated by its
 * own amount and the single ray opens into a spectrum.
 */
export const SPECTRUM: readonly (readonly [colour: string, dn: number])[] = [
  ['#d8232a', -0.007],
  ['#e8710a', -0.004],
  ['#e2b800', -0.0015],
  ['#2f9e44', 0.0015],
  ['#1c7ed6', 0.005],
  ['#4c3bcf', 0.0085],
  ['#8b2fb0', 0.012],
];

// ---------------------------------------------------------------------------
// The curve through three points
// ---------------------------------------------------------------------------

export interface Parabola {
  A: number;
  B: number;
  C: number;
  /** Vertex: the angle of incidence at which the fitted curve is lowest. */
  vx: number | null;
  /** The deviation there. */
  vy: number | null;
}

/**
 * The parabola through exactly three points, which is what three well-spread
 * rays give you. A least-squares LINE is meaningless here — the whole point of
 * the practical is that D against i is not a line.
 */
export function fitParabola(p: readonly { x: number; y: number }[]): Parabola | null {
  if (p.length < 3) return null;
  const [a, b, c] = p as readonly [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  const d1 = (a.x - b.x) * (a.x - c.x) * (b.x - c.x);
  if (Math.abs(d1) < 1e-9) return null;
  const A = (c.x * (b.y - a.y) + b.x * (a.y - c.y) + a.x * (c.y - b.y)) / d1;
  const B = (c.x * c.x * (a.y - b.y) + b.x * b.x * (c.y - a.y) + a.x * a.x * (b.y - c.y)) / d1;
  const C =
    (b.x * c.x * (b.x - c.x) * a.y + c.x * a.x * (c.x - a.x) * b.y + a.x * b.x * (a.x - b.x) * c.y) / d1;
  return { A, B, C, vx: A ? -B / (2 * A) : null, vy: A ? C - (B * B) / (4 * A) : null };
}
