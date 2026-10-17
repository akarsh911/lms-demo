import { mulberry32 } from '../seed';

/**
 * The optics of CBSE practical 10: the focal length of a concave mirror and of
 * a convex lens, from the image of a distant object.
 *
 * Nothing here is scripted. The image position comes from the mirror/lens
 * formula applied to the object distance actually in use, and what the card
 * shows is the cross-section of the real converging cone where the screen
 * stands — a blur circle that grows with defocus on either side of the image
 * plane. "Focus the screen" is therefore a genuine search with a genuine best
 * position, and a student who stops 3 mm short measures 3 mm of blur.
 *
 * Everything is in CENTIMETRES along the bench, as read off the metre scale.
 * Pixels belong to `@labs/components/focal-length/`; this file never sees one.
 *
 * Ported from `lms-lab-engine/web/focal-length.html`, which stays the reference.
 */

export type PartId = 'mirror' | 'lens';
export type StandId = 'comp' | 'scr';
export type ObjectId = 'tree' | 'bldg' | 'candle' | 'sun';

/** Physical properties of the bench. The tolerances are derived from them. */
export const OPT = {
  /** Metre scale least count, cm. One millimetre. */
  lc: 0.1,
  /** A blur circle this small cannot be told from sharp, cm. */
  sharp: 0.1,
  /** Still nearly sharp — worth half the focus marks, cm. */
  okBlur: 0.25,
  /** Aperture of the concave mirror, cm. */
  apM: 5.0,
  /** Aperture of the convex lens, cm. */
  apL: 4.0,
  /** Height of the distant tree, cm. An 8 m tree. */
  objH: 800,
  /** A candle stood on the bench at the 12 cm mark. */
  candleX: 12,
  candleH: 20,
  /** The tree, about 120 m beyond the window. */
  uTree: 12000,
  /** The water tank on the building across the road, about 250 m. */
  uBldg: 25000,
  /** The component must be moved this far along the bench between trials, cm. */
  moveBetweenTrials: 3,
} as const;

export interface ObjectSpec {
  label: string;
  /** Object distance, cm. Null when it depends on where the component stands. */
  u: number | null;
  /** Object height, cm. */
  h: number;
  far: boolean;
  /** The Sun: never to be used, and the bench says why. */
  refuse?: boolean;
  /** How the assistant refers to it in a sentence. */
  name: string;
}

export const OBJECTS: Readonly<Record<ObjectId, ObjectSpec>> = {
  tree: {
    label: 'Tree ≈ 120 m away',
    u: OPT.uTree,
    h: OPT.objH,
    far: true,
    name: 'the tree about 120 m beyond the window',
  },
  bldg: {
    label: 'Water tank ≈ 250 m',
    u: OPT.uBldg,
    h: OPT.objH,
    far: true,
    name: 'the water tank on the building about 250 m away',
  },
  candle: {
    label: 'Candle on the bench',
    u: null,
    h: OPT.candleH,
    far: false,
    name: 'the candle standing on the bench at the 12 cm mark',
  },
  sun: { label: 'The Sun', u: null, h: 0, far: true, refuse: true, name: 'the Sun' },
};

export const OBJECT_IDS = Object.keys(OBJECTS) as ObjectId[];

/** How far along the metre scale each stand may be pushed, cm. */
export const LIMITS: Readonly<Record<PartId, Readonly<Record<StandId, readonly [number, number]>>>> = {
  mirror: { comp: [55, 95], scr: [5, 92] },
  lens: { comp: [8, 50], scr: [12, 96] },
};

export interface BenchSpec {
  /** True focal length of this bench's concave mirror, cm. */
  fM: number;
  /** True focal length of this bench's convex lens, cm. */
  fL: number;
  start: Readonly<Record<PartId, { comp: number; scr: number }>>;
}

/**
 * Two set-ups from one bench seed, so answers cannot be copied and a teacher
 * can reproduce any attempt from the number in its record.
 */
export function benchFromSeed(seed: number): BenchSpec {
  const r = mulberry32(seed);
  const fM = Math.round((15 + r() * 5) * 10) / 10; // concave mirror, 15.0–20.0 cm
  const fL = Math.round((22 + r() * 8) * 10) / 10; // convex lens,    22.0–30.0 cm
  return {
    fM,
    fL,
    start: {
      mirror: { comp: 72 + r() * 10, scr: 26 + r() * 8 },
      lens: { comp: 16 + r() * 8, scr: 80 + r() * 8 },
    },
  };
}

/** Object distance for the set-up actually on the bench. Null when there is none. */
export function objectDistance(objId: ObjectId | null, compX: number): number | null {
  if (!objId) return null;
  const o = OBJECTS[objId];
  if (o.refuse) return null;
  return o.far ? o.u : Math.max(0.5, compX - OPT.candleX);
}

/**
 * The mirror/lens formula, with distances measured as positive lengths from
 * the pole or the optical centre: 1/v = 1/f − 1/u for a real object, which
 * rearranges to v = fu/(u − f). An object at or inside the focus gives no real
 * image, and an object at infinity gives v = f — the whole point of the
 * experiment.
 */
export function imageDistance(f: number, u: number): number {
  return u <= f + 1e-9 ? Number.POSITIVE_INFINITY : (f * u) / (u - f);
}

/** Everything about the component as it stands: which one, where, facing what. */
export interface Setup {
  part: PartId;
  /** The true focal length of the component in the stand. */
  f: number;
  /** Where the component stands on the metre scale, cm. */
  x: number;
  /** −1 for the mirror (light comes back towards the object), +1 for the lens. */
  side: -1 | 1;
  /** Aperture, cm: it sets how fast the blur circle grows with defocus. */
  ap: number;
  objId: ObjectId | null;
  u: number | null;
  objH: number;
}

/** The least a setup needs to know about the bench, so the state may be anything. */
export interface BenchOptics {
  fM: number;
  fL: number;
  pos: Readonly<Record<PartId, { comp: number; scr: number }>>;
  obj: Readonly<Record<PartId, ObjectId | null>>;
}

export function setupFor(part: PartId, s: BenchOptics): Setup {
  const objId = s.obj[part];
  const x = s.pos[part].comp;
  return {
    part,
    f: part === 'mirror' ? s.fM : s.fL,
    x,
    side: part === 'mirror' ? -1 : 1,
    ap: part === 'mirror' ? OPT.apM : OPT.apL,
    objId,
    u: objectDistance(objId, x),
    objH: objId ? OBJECTS[objId].h : 0,
  };
}

export interface Optics {
  /** Whether a real image forms at all. */
  real: boolean;
  /** Image distance from the pole or optical centre, cm. */
  di: number;
  /** Where the image plane falls on the metre scale, cm. */
  xImg: number;
  /** Linear magnification v/u. The image is inverted. */
  k: number;
  /** Image height, cm. */
  h: number;
}

export function opticsOf(st: Setup): Optics {
  if (st.u === null) return { real: false, di: Number.POSITIVE_INFINITY, xImg: Number.NaN, k: 0, h: 0 };
  const di = imageDistance(st.f, st.u);
  if (!Number.isFinite(di)) return { real: false, di: Number.POSITIVE_INFINITY, xImg: Number.NaN, k: 0, h: 0 };
  const k = di / st.u;
  return { real: true, di, xImg: st.x + st.side * di, k, h: st.objH * k };
}

export type ScreenView =
  | {
      lit: false;
      /** `side`: the card is behind the component. `novirtual`: no real image exists. */
      why: 'side' | 'novirtual';
      o: Optics;
    }
  | {
      lit: true;
      /** How far the card is from the image plane, cm. */
      defocus: number;
      /** Diameter of the blur circle a point spreads into on the card, cm. */
      blur: number;
      /** Total height of the patch of light, cm. */
      patch: number;
      /** Relative brightness: the same light spread over a bigger patch. */
      bright: number;
      sharp: boolean;
      o: Optics;
    };

/** What the card actually shows with the screen standing at `sx` cm. */
export function screenView(st: Setup, sx: number): ScreenView {
  const o = opticsOf(st);
  if (!o.real) return { lit: false, why: 'novirtual', o };
  // Distance along the direction the light travels after the component.
  const d = (sx - st.x) * st.side;
  if (d <= 1) return { lit: false, why: 'side', o };
  const defocus = Math.abs(sx - o.xImg);
  const blur = (st.ap * defocus) / o.di;
  const patch = o.h + blur;
  const bright = patch > 0 ? (o.h * o.h) / (patch * patch) : 0;
  return { lit: true, defocus, blur, patch, bright, sharp: blur <= OPT.sharp, o };
}

/**
 * HALF the width of the cone of light where it crosses the bench at `xcm`, cm.
 *
 * It is the same quantity as `screenView().blur`, halved: a card standing there
 * would collect a blur circle of `2 * coneHalfCm(...)`. That is the point of it
 * being here rather than in the drawing. The bench, the zoom panel and the mark
 * scheme all ask this file how wide the cone is, so what a student watches
 * narrow to a point and what the trial is marked on cannot come apart.
 *
 * Zero where no real image forms: there is no cone to measure.
 */
export function coneHalfCm(st: Setup, o: Optics, xcm: number): number {
  return o.real ? (st.ap * Math.abs(xcm - o.xImg)) / (2 * o.di) : 0;
}

/**
 * How far either side of the image plane the card may stand and still collect a
 * blur circle no wider than `blur` cm. The inverse of the blur formula in
 * `screenView`, and so the half-width of the stretch of bench the zoom panel
 * shades green.
 *
 * A fast cone (a big aperture, a short image distance) gives a short stretch,
 * which is exactly why a short-focus mirror is harder to focus than a lens.
 */
export function defocusForBlur(st: Setup, o: Optics, blur: number): number {
  return o.real ? (blur * o.di) / st.ap : 0;
}

/**
 * The angular half-size of the object seen from the optic, radians: an 8 m tree
 * 120 m away subtends about two hundredths of a degree.
 *
 * Used to draw the bundle arriving from the TOP of the object and the one from
 * its FOOT at the angle they really arrive at, so the two visibly cross at the
 * pole. Zero when nothing is aimed at.
 */
export function objectAngle(st: Setup): number {
  return st.u ? st.objH / 2 / st.u : 0;
}

/** Mean of a set of readings. NaN for an empty set, which never reaches a mark. */
export function meanOf(values: readonly number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : Number.NaN;
}

/** Two decimals, as a notebook records a centimetre reading. */
export function cm2(x: number): string {
  return (Math.round(x * 100) / 100).toFixed(2);
}

/** One decimal, for a focal length or a millimetre of blur. */
export function cm1(x: number): string {
  return (Math.round(x * 10) / 10).toFixed(1);
}
