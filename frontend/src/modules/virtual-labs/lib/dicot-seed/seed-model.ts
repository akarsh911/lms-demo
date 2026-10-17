/**
 * The seed itself.
 *
 * A seed is an object with a species, the hours it has spent in water, whether
 * its coat is off and whether it has been split — and along which plane. Size,
 * coat softness, which parts are exposed and WHERE every part lies are all
 * computed from that. Nothing about the drawing or the marking is scripted, so
 * a student is marked on what THEIR seed actually showed.
 *
 * Pure: no React, no DOM, no clock. Everything here can be driven from Node,
 * which is how the dissection is checked without a browser.
 */

export type SpeciesId = 'gram' | 'pea' | 'rajma';
export type ShapeId = 'gram' | 'round' | 'kidney';

/** A named structure of the seed. `axis` has no label chip; it is table-only. */
export type PartId = 'testa' | 'hilum' | 'micropyle' | 'cotyledon' | 'axis' | 'plumule' | 'radicle';

/** Which drawing a point was taken in: the intact seed, the split seed, or the seed as it is now. */
export type SeedView = 'ext' | 'cut' | 'live';

export interface Species {
  id: SpeciesId;
  name: string;
  short: string;
  shape: ShapeId;
  /** Dry length and width, in the figure's own units. */
  L: number;
  W: number;
  /** How much longer it gets, as a fraction, when fully swollen. */
  maxSwell: number;
  coat: string;
  coatDark: string;
  coty: string;
  cotyEdge: string;
}

export const SPECIES: Record<SpeciesId, Species> = {
  gram: {
    id: 'gram',
    name: 'gram (chana)',
    short: 'gram',
    shape: 'gram',
    L: 96,
    W: 88,
    maxSwell: 0.58,
    coat: '#c49a5c',
    coatDark: '#8d6b38',
    coty: '#f2e6bd',
    cotyEdge: '#d3bd85',
  },
  pea: {
    id: 'pea',
    name: 'pea (matar)',
    short: 'pea',
    shape: 'round',
    L: 92,
    W: 90,
    maxSwell: 0.62,
    coat: '#a4b263',
    coatDark: '#74813f',
    coty: '#f0ecc2',
    cotyEdge: '#cfc78e',
  },
  rajma: {
    id: 'rajma',
    name: 'red kidney bean (rajma)',
    short: 'rajma',
    shape: 'kidney',
    L: 142,
    W: 84,
    maxSwell: 0.48,
    coat: '#93413a',
    coatDark: '#672823',
    coty: '#f4ecd7',
    cotyEdge: '#d8c9a6',
  },
};

export const SPECIES_IDS: readonly SpeciesId[] = ['gram', 'pea', 'rajma'];

export interface Point {
  x: number;
  y: number;
}

/**
 * The outline of each seed, in local units: x along the length, y across it,
 * ventral (flat or notched) edge at +y. `hil` and `mic` are where the hilum and
 * the micropyle sit on that edge, as fractions of the half-axes.
 */
export const SHAPE: Record<ShapeId, { hil: readonly [number, number]; mic: readonly [number, number]; path: (a: number, b: number) => string }> = {
  gram: {
    hil: [-0.05, 0.95],
    mic: [-0.45, 0.8],
    path: (a, b) =>
      `M${-0.99 * a} ${0.28 * b} C${-0.95 * a} ${-0.45 * b} ${-0.45 * a} ${-1.0 * b} ${0.15 * a} ${-0.96 * b}` +
      ` C${0.72 * a} ${-0.92 * b} ${a} ${-0.42 * b} ${a} ${0.22 * b}` +
      ` C${a} ${0.82 * b} ${0.45 * a} ${1.0 * b} ${-0.05 * a} ${0.97 * b}` +
      ` C${-0.55 * a} ${0.94 * b} ${-1.02 * a} ${0.8 * b} ${-0.99 * a} ${0.28 * b} Z`,
  },
  round: {
    hil: [0.0, 0.97],
    mic: [-0.35, 0.84],
    path: (a, b) =>
      `M${-a} 0 C${-a} ${-0.75 * b} ${-0.6 * a} ${-b} 0 ${-b} C${0.6 * a} ${-b} ${a} ${-0.75 * b} ${a} 0` +
      ` C${a} ${0.78 * b} ${0.6 * a} ${b} 0 ${b} C${-0.6 * a} ${b} ${-a} ${0.78 * b} ${-a} 0 Z`,
  },
  kidney: {
    hil: [0.02, 0.81],
    mic: [-0.42, 0.58],
    path: (a, b) =>
      `M${-a} ${0.05 * b} C${-a} ${-0.75 * b} ${-0.45 * a} ${-1.02 * b} ${0.1 * a} ${-0.95 * b}` +
      ` C${0.7 * a} ${-0.88 * b} ${a} ${-0.4 * b} ${a} ${0.18 * b}` +
      ` C${a} ${0.8 * b} ${0.55 * a} ${1.02 * b} ${0.05 * a} ${0.82 * b}` +
      ` C${-0.35 * a} ${0.66 * b} ${-0.72 * a} ${0.72 * b} ${-a} ${0.05 * b} Z`,
  },
};

/** The embryo axis, in the same local units — the same anatomy in every species. */
export const AX = {
  radA: [-0.56, 0.52],
  radB: [-0.24, 0.58],
  axA: [-0.24, 0.58],
  axB: [0.06, 0.4],
  plum: [0.22, 0.26],
} as const;

/** Centre-to-centre of the two split halves, in units of `a`. */
export const HALF_GAP = 2.22;

// ---------------------------------------------------------------------------
// Water, and what it does
// ---------------------------------------------------------------------------

/** Hours. Swelling and softening are both exponential approaches, at different rates. */
export const TAU_SWELL = 3.5;
export const TAU_SOFT = 4.5;

/** The coat lifts off cleanly above this softness; below it, it tears into flakes. */
export const PEEL_SOFT = 0.55;
/** The cotyledons part along their natural plane above this; below it, they crumble. */
export const SPLIT_SOFT = 0.72;

/**
 * Soaking past this and the water turns cloudy and the coat begins to split of
 * its own accord: the seed has taken all the water it can and is now going over.
 */
export const OVERSOAK_HOURS = 24;
/**
 * Past this the cotyledons are waterlogged and fall apart under the needle —
 * the other way to arrive at a ruined specimen, and the one a student gets by
 * leaving the beaker all weekend rather than overnight.
 */
export const MUSH_HOURS = 36;

/** How fully swollen a seed soaked for `h` hours is, 0 to 1. */
export function swellFrac(h: number): number {
  return 1 - Math.exp(-Math.max(0, h) / TAU_SWELL);
}

/** How soft its coat and cotyledons have gone, 0 to 1. */
export function softness(h: number): number {
  return 1 - Math.exp(-Math.max(0, h) / TAU_SOFT);
}

/**
 * THE UNIFORM FACTOR every dimension of the seed has grown by since it was dry.
 *
 * It is worth having on its own, and not only inside `geom`, because every path
 * in the figure is LINEAR in `a` and `b` — each coordinate is some constant
 * times one of them — so the seed drawn at `dryGeom` inside `scale(swellScale)`
 * is the same drawing, to the pixel, as the seed drawn at `geom`. That is what
 * lets the bench carry the swelling on a transform, which a browser can ease
 * between the ten ticks a second the soak clock runs at, rather than on a path
 * string, which it cannot. The swelling is not re-modelled to do it: this is
 * the same `s` `geom` has always multiplied by.
 */
export function swellScale(sd: Pick<Seed, 'sp' | 'h'>): number {
  return 1 + SPECIES[sd.sp].maxSwell * swellFrac(sd.h);
}

/** What a seed has swollen to, as a percentage of its dry size. */
export function swollenPercent(sd: Pick<Seed, 'sp' | 'h'>): number {
  return Math.round(swellScale(sd) * 100);
}

// ---------------------------------------------------------------------------
// A seed, and where its parts are
// ---------------------------------------------------------------------------

export interface Seed {
  sp: SpeciesId;
  /** Hours in water. */
  h: number;
  inWater: boolean;
  onTile: boolean;
  /** Whether the testa is still on. */
  coat: boolean;
  split: 'natural' | 'transverse' | null;
  /** Non-null once the specimen is spoilt; the string says how. */
  ruined: string | null;
  pressed: boolean;
}

/** A seed sown on wet cotton, with the hours since it was sown. */
export interface Germinating extends Seed {
  g: number;
}

export function newSeed(sp: SpeciesId): Seed {
  return { sp, h: 0, inWater: false, onTile: false, coat: true, split: null, ruined: null, pressed: false };
}

/** The species and the half-axes the seed had before it took up any water. */
export function dryGeom(sd: Pick<Seed, 'sp'>): { sp: Species; a: number; b: number } {
  const sp = SPECIES[sd.sp];
  return { sp, a: sp.L / 2, b: sp.W / 2 };
}

/** The species and the half-axes of a seed at its current swelling. */
export function geom(sd: Pick<Seed, 'sp' | 'h'>): { sp: Species; s: number; a: number; b: number } {
  const { sp, a, b } = dryGeom(sd);
  const s = swellScale(sd);
  return { sp, s, a: a * s, b: b * s };
}

const fp = (f: readonly [number, number], a: number, b: number): Point => ({ x: f[0] * a, y: f[1] * b });

const inEll = (p: Point, a: number, b: number, f = 1): boolean =>
  (p.x * p.x) / (a * a) + (p.y * p.y) / (b * b) <= f * f;

function segDist(p: Point, A: Point, B: Point): number {
  const vx = B.x - A.x;
  const vy = B.y - A.y;
  const wx = p.x - A.x;
  const wy = p.y - A.y;
  const L2 = vx * vx + vy * vy;
  const t = L2 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2)) : 0;
  return Math.hypot(wx - t * vx, wy - t * vy);
}

/** Whether a seed in this state, seen in this view, is lying open. */
export function isOpen(sd: Seed, view: SeedView): boolean {
  if (view === 'cut') return true;
  if (view === 'live') return sd.split === 'natural' && !sd.ruined;
  return false;
}

/** Whether the coat is drawn on in this view. */
export function coatOn(sd: Seed, view: SeedView): boolean {
  return view === 'ext' ? true : view === 'cut' ? false : sd.coat;
}

/**
 * Which part of the seed lies at a point, in the figure's own local units.
 *
 * This is the whole marking of the labelling step: a pin is judged against
 * where that part actually is on THIS seed, at its size and shape. A label in
 * roughly the right area is wrong.
 */
export function partAt(sd: Seed, p: Point, view: SeedView): PartId | null {
  const { a, b } = geom(sd);
  const sh = SHAPE[SPECIES[sd.sp].shape];
  const withCoat = coatOn(sd, view);
  const open = isOpen(sd, view);

  if (withCoat) {
    const m = fp(sh.mic, a, b);
    const h = fp(sh.hil, a, b);
    if (Math.hypot(p.x - m.x, p.y - m.y) <= 0.09 * a) return 'micropyle';
    if (((p.x - h.x) / (0.22 * a)) ** 2 + ((p.y - h.y) / (0.15 * b)) ** 2 <= 1) return 'hilum';
    return inEll(p, a, b) ? 'testa' : null;
  }
  if (open) {
    const P = fp(AX.plum, a, b);
    const t = (a + b) / 2;
    if (Math.hypot(p.x - P.x, p.y - P.y) <= 0.16 * a) return 'plumule';
    if (segDist(p, fp(AX.radA, a, b), fp(AX.radB, a, b)) <= 0.14 * t) return 'radicle';
    if (segDist(p, fp(AX.axA, a, b), fp(AX.axB, a, b)) <= 0.09 * t) return 'axis';
  }
  if (inEll(p, a, b)) return 'cotyledon';
  if (open && inEll({ x: p.x + HALF_GAP * a, y: p.y }, a, b)) return 'cotyledon';
  return null;
}

/**
 * The middle of a part, for pointing at it: a highlight ring while its row of
 * the table is being filled in, and a target a harness can aim a pin at.
 * Returns null when that part is not on show in this view.
 */
export function partAnchor(sd: Seed, id: PartId, view: SeedView): Point | null {
  const { a, b } = geom(sd);
  const sh = SHAPE[SPECIES[sd.sp].shape];
  const withCoat = coatOn(sd, view);
  const open = isOpen(sd, view);

  if (withCoat) {
    if (id === 'hilum') return fp(sh.hil, a, b);
    if (id === 'micropyle') return fp(sh.mic, a, b);
    if (id === 'testa') return { x: -0.18 * a, y: -0.42 * b };
    return null;
  }
  if (id === 'cotyledon') return open ? { x: -HALF_GAP * a, y: 0 } : { x: 0.4 * a, y: -0.3 * b };
  if (!open) return null;
  if (id === 'plumule') return fp(AX.plum, a, b);
  if (id === 'radicle') {
    const A = fp(AX.radA, a, b);
    const B = fp(AX.radB, a, b);
    return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  }
  if (id === 'axis') {
    const A = fp(AX.axA, a, b);
    const B = fp(AX.axB, a, b);
    return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  }
  return null;
}

/** Which named structures a seed in this state actually shows. */
export function exposed(sd: Seed): Record<PartId, boolean> {
  const ok = sd.split === 'natural' && !sd.ruined;
  const intact = sd.coat && !sd.ruined;
  return {
    testa: intact,
    hilum: intact,
    micropyle: intact,
    cotyledon: !sd.coat && !sd.ruined,
    axis: ok,
    plumule: ok,
    radicle: ok,
  };
}

// ---------------------------------------------------------------------------
// The two dissection moves. Both can fail, and a failure changes the seed.
// ---------------------------------------------------------------------------

export type PeelFail = 'ruined' | 'already' | 'brittle';
export type SplitFail = 'ruined' | 'already' | 'plane' | 'hard' | 'coat' | 'mush';

export interface PeelResult {
  ok: boolean;
  why?: PeelFail;
  soft: number;
  /** The seed as it is after the attempt — never the one passed in. */
  seed: Seed;
}

export interface SplitResult {
  ok: boolean;
  why?: SplitFail;
  soft: number;
  seed: Seed;
}

export function tryPeel(sd: Seed): PeelResult {
  const sf = softness(sd.h);
  if (sd.ruined) return { ok: false, why: 'ruined', soft: sf, seed: sd };
  if (!sd.coat) return { ok: false, why: 'already', soft: sf, seed: sd };
  // Still brittle: it comes away in flakes and the seed keeps its coat.
  if (sf < PEEL_SOFT) return { ok: false, why: 'brittle', soft: sf, seed: sd };
  return { ok: true, soft: sf, seed: { ...sd, coat: false } };
}

export function trySplit(sd: Seed, plane: 'natural' | 'transverse'): SplitResult {
  const sf = softness(sd.h);
  if (sd.ruined) return { ok: false, why: 'ruined', soft: sf, seed: sd };
  if (sd.split) return { ok: false, why: 'already', soft: sf, seed: sd };

  if (plane === 'transverse') {
    return {
      ok: false,
      why: 'plane',
      soft: sf,
      seed: { ...sd, split: 'transverse', ruined: 'cut straight across the cotyledons' },
    };
  }
  if (sf < SPLIT_SOFT) {
    return {
      ok: false,
      why: 'hard',
      soft: sf,
      seed: {
        ...sd,
        split: 'natural',
        ruined: sf < 0.3 ? 'shattered — it was still bone dry' : 'crumbled — it had not soaked long enough',
      },
    };
  }
  if (sd.h >= MUSH_HOURS) {
    return {
      ok: false,
      why: 'mush',
      soft: sf,
      seed: {
        ...sd,
        split: 'natural',
        ruined: 'mushed — waterlogged, the cotyledons fell apart with the embryo in them',
      },
    };
  }
  if (sd.coat) return { ok: false, why: 'coat', soft: sf, seed: sd };
  return { ok: true, soft: sf, seed: { ...sd, split: 'natural' } };
}

/** Germination on wet cotton: the radicle comes out first, the plumule later. */
export function germState(g: Germinating | null): { radicle: number; plumule: number } {
  const h = g ? g.g : 0;
  return {
    radicle: Math.max(0, Math.min(1, (h - 18) / 30)),
    plumule: Math.max(0, Math.min(1, (h - 42) / 30)),
  };
}
