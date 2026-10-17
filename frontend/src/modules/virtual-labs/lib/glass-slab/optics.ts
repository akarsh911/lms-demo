/**
 * The optics of a rectangular glass slab: Snell's law at both faces, worked out
 * from the pins the student actually stuck in the paper.
 *
 * Nothing here is a lookup and nothing is scripted. Move a pin and the emergent
 * ray moves with it, because the whole path is recomputed from the two lines
 * those pins define. That is what makes a badly sighted pin produce a badly
 * measured angle, which is the only reason the pin method is worth teaching.
 *
 * Pure: no React, no DOM, no clock. It can be driven from plain Node.
 */

export const DEG = 180 / Math.PI;
export const RAD = Math.PI / 180;

/** Refractive index of the crown-glass slab. */
export const NG = 1.5;
/** Pixels per centimetre on the drawing paper. */
export const PX_CM = 25;
/** Millimetres, in paper pixels. The pin tolerances are all in millimetres. */
export const mm = (n: number): number => (n * PX_CM) / 10;

/** The sheet pinned to the drawing board, in bench coordinates. */
export const PAPER = { x: 30, y: 62, w: 940, h: 512 } as const;

/** Where the student marks the point of incidence O on the upper face. */
export const OX = 460;

export interface Vec {
  x: number;
  y: number;
}

/** The slab as it lies on the paper: upper face at `y`, lower face at `y + t`. */
export interface SlabSpec {
  x: number;
  y: number;
  w: number;
  t: number;
}

/** Slab thicknesses the cupboard holds, in centimetres. */
export const THICKNESSES = [3, 4, 5] as const;

/**
 * The slab this bench was issued, from its seed.
 *
 * The physics never varies — crown glass is always n = 1.50 — but the thickness
 * does, so the lateral displacement two students measure is not the same number
 * and a teacher can reproduce either bench from the seed in its attempt record.
 */
export function slabFromSeed(seed: number): SlabSpec {
  const cm = THICKNESSES[Math.abs(seed) % THICKNESSES.length] ?? 4;
  return { x: 340, y: 250, w: 280, t: cm * PX_CM };
}

export const slabThicknessCm = (slab: SlabSpec): number => +(slab.t / PX_CM).toFixed(1);

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const vlen = (v: Vec): number => Math.hypot(v.x, v.y);
export const unit = (v: Vec): Vec => {
  const l = vlen(v) || 1;
  return { x: v.x / l, y: v.y / l };
};
/** Orient a direction along the ray's travel: down the sheet, away from the eye. */
export const down = (v: Vec): Vec => (v.y < 0 ? { x: -v.x, y: -v.y } : v);
/** The angle a travelling direction makes with the normal, in degrees. */
export const angFromNormal = (v: Vec): number => Math.abs(Math.atan2(v.x, v.y)) * DEG;
/** Where a ray from `p` along `d` crosses the horizontal line `y = yy`. */
export const hitY = (p: Vec, d: Vec, yy: number): Vec => ({
  x: p.x + (d.x * (yy - p.y)) / d.y,
  y: yy,
});
/** Signed perpendicular distance of `q` from the line through `p` along unit `d`. */
export const perp = (q: Vec, p: Vec, d: Vec): number => (q.x - p.x) * d.y - (q.y - p.y) * d.x;

/** A direction meeting a horizontal face at `i` from the normal, from the given side. */
export const rayDir = (i: number, side: number): Vec => ({
  x: side * Math.sin(i * RAD),
  y: Math.cos(i * RAD),
});

/** The refractive index a pair of measured angles gives. */
export const indexFrom = (i: number, r: number): number => Math.sin(i * RAD) / Math.sin(r * RAD);

// ---------------------------------------------------------------------------
// Snell's law
// ---------------------------------------------------------------------------

/**
 * Snell's law at a horizontal face. `d` travels downwards; `n1` is the medium
 * it comes from. Null on total internal reflection, which cannot happen going
 * into the glass and cannot happen coming out of a slab either — the angle
 * inside is always below the critical angle, because it came from outside.
 */
export function refract(d: Vec, n1: number, n2: number): Vec | null {
  const th1 = Math.atan2(d.x, d.y);
  const s = (n1 * Math.sin(th1)) / n2;
  if (Math.abs(s) > 1) return null;
  const th2 = Math.asin(s);
  return { x: Math.sin(th2), y: Math.cos(th2) };
}

/** The whole path of a ray meeting the upper face at P travelling along d. */
export interface SlabPath {
  /** Point of incidence on the upper face. */
  O: Vec;
  /** Point of emergence on the lower face. */
  O2: Vec;
  din: Vec;
  dmid: Vec;
  dout: Vec;
  /** Angle of incidence, refraction and emergence, degrees from the normal. */
  i: number;
  r: number;
  e: number;
  /** Lateral displacement, in paper pixels: d = t·sin(i − r)/cos r. */
  lat: number;
  n: number;
  t: number;
}

export function slabPath(P: Vec, d: Vec, slab: SlabSpec, n: number = NG): SlabPath | null {
  const din = unit(down(d));
  if (din.y < 1e-6) return null;
  const dmid = refract(din, 1, n);
  if (!dmid) return null;
  const O2 = hitY(P, dmid, slab.y + slab.t);
  const dout = refract(dmid, n, 1);
  if (!dout) return null;
  const i = angFromNormal(din);
  const r = angFromNormal(dmid);
  const e = angFromNormal(dout);
  const lat = (slab.t * Math.sin((i - r) * RAD)) / Math.cos(r * RAD);
  return { O: P, O2, din, dmid, dout, i, r, e, lat, n, t: slab.t };
}

// ---------------------------------------------------------------------------
// One trial's trace, from its own pins
// ---------------------------------------------------------------------------

/** The pins and pencil work of one trace. Mirrors the trial in the bench state. */
export interface TraceInput {
  /** The protractor reading the incident ray was drawn at, or null. */
  drawn: number | null;
  pins: readonly Vec[];
  /** Whether the slab has been lifted and the points joined. */
  joined: boolean;
  /** The lateral displacement, once measured with the ruler (cm). */
  lat: number | null;
}

/** Everything the drawing shows for one trial, derived from that trial's own pins. */
export interface Trace {
  /** Direction of the pencil line drawn with the protractor, travelling. */
  drawDir: Vec | null;
  /** The incident ray the two first pins define, and where it meets the slab. */
  inc: { d: Vec; O: Vec } | null;
  /** Where the light REALLY goes, given that incident ray. */
  real: SlabPath | null;
  /** The emergent ray the last two pins define, and where it leaves the slab. */
  emg: { d: Vec; O2: Vec } | null;
  /** The ray inside the glass, as the student's own trace has it. */
  mid: Vec | null;
  /** The three angles the student's own trace makes. */
  ang: { i: number; r: number; e: number } | null;
  /** Lateral displacement of the student's own trace, in paper pixels. */
  lat: number | null;
  /** Foot of the perpendicular from O′ onto the incident ray produced. */
  foot: Vec | null;
}

const EMPTY: Trace = {
  drawDir: null,
  inc: null,
  real: null,
  emg: null,
  mid: null,
  ang: null,
  lat: null,
  foot: null,
};

export function traceOf(tr: TraceInput, slab: SlabSpec): Trace {
  const o: Trace = { ...EMPTY };
  const p = tr.pins;

  if (tr.drawn !== null) {
    const th = tr.drawn * RAD;
    o.drawDir = unit({ x: -Math.cos(th), y: Math.sin(th) });
  }

  const p0 = p[0];
  const p1 = p[1];
  if (p0 && p1) {
    const d = unit(down(sub(p1, p0)));
    if (d.y > 1e-6) {
      o.inc = { d, O: hitY(p0, d, slab.y) };
      o.real = slabPath(o.inc.O, d, slab);
    }
  }

  const p2 = p[2];
  const p3 = p[3];
  if (o.inc && o.real && p2 && p3) {
    const d2 = unit(down(sub(p3, p2)));
    if (d2.y > 1e-6) {
      const O2 = hitY(p2, d2, slab.y + slab.t);
      const mid = unit(down(sub(O2, o.inc.O)));
      const off = perp(O2, o.inc.O, o.inc.d);
      o.emg = { d: d2, O2 };
      o.mid = mid;
      o.ang = { i: o.real.i, r: angFromNormal(mid), e: angFromNormal(d2) };
      o.lat = Math.abs(off);
      o.foot = { x: O2.x - o.inc.d.y * off, y: O2.y + o.inc.d.x * off };
    }
  }

  return o;
}

/**
 * How far a point sits from the emergent ray the light really takes.
 *
 * This is what the eye judges when the last two pins are lined up with the
 * images of the first two: a pin on that line is "in line", a pin off it is
 * off by exactly this much. Null until the incident ray exists.
 */
export function sightOff(tr: TraceInput, slab: SlabSpec, q: Vec): number | null {
  const o = traceOf(tr, slab);
  if (!o.real) return null;
  return perp(q, o.real.O2, o.real.dout);
}

/** The worst of the two emergent pins' distances from the true line of sight, mm. */
export function emergentMissMm(tr: TraceInput, slab: SlabSpec): number | null {
  const offs = [2, 3]
    .map((k) => tr.pins[k])
    .filter((q): q is Vec => Boolean(q))
    .map((q) => sightOff(tr, slab, q));
  if (offs.length < 2 || offs.some((v) => v === null)) return null;
  return Math.max(...offs.map((v) => Math.abs(v ?? 0))) / mm(1);
}

/** True while the point is on the sheet, with a margin for the pin's head. */
export const inPaper = (p: Vec): boolean =>
  p.x > PAPER.x + 6 &&
  p.x < PAPER.x + PAPER.w - 6 &&
  p.y > PAPER.y + 6 &&
  p.y < PAPER.y + PAPER.h - 6;

/**
 * The reading on a protractor laid with its centre at `c`.
 *
 * `up` is the half the scale covers: over the air above the face at O for ∠i,
 * turned over onto the glass side for ∠r. 0 to 180 along the straight edge, so
 * the normal is the 90° mark and an angle from the normal is |90 − reading|.
 */
export function protractorReading(c: Vec, up: boolean, p: Vec): number | null {
  const dx = p.x - c.x;
  const dy = (up ? -1 : 1) * (p.y - c.y);
  if (Math.hypot(dx, dy) < 12 || dy < -6) return null;
  return Math.max(0, Math.min(180, Math.round(Math.atan2(Math.max(dy, 0), dx) * DEG)));
}

/** The angle from the normal a scale reading stands for. */
export const angleFromReading = (reading: number): number => Math.abs(90 - reading);

/** A point on the protractor's scale at that reading, for drawing the sight line. */
export const scalePoint = (c: Vec, up: boolean, reading: number, radius: number): Vec => ({
  x: c.x + radius * Math.cos(reading * RAD),
  y: c.y + (up ? -1 : 1) * radius * Math.sin(reading * RAD),
});
