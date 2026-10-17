/**
 * The chemistry of CBSE practical 2.
 *
 * A vessel holds grams of solids and millilitres of solutions, a temperature
 * made of two parts (what the reaction gave out, and what the burner put in),
 * and a lab clock. Every reaction below runs on whatever happens to be in the
 * vessel: nothing checks "did the student do the right thing", and nothing is
 * scripted. That is the whole reason recording a change the vessel never showed
 * can cost marks — the vessel is the authority, not the syllabus.
 *
 * Pure data and pure functions: no React, no DOM. `stepVessel` mutates the
 * vessel it is given, which is always a clone made by the reducer.
 */

// ---------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------

export type SpeciesKey =
  | 'CaO'
  | 'H2O'
  | 'CaOH2'
  | 'FeSO4x7'
  | 'FeSO4s'
  | 'Fe2O3'
  | 'CuSO4'
  | 'FeSO4aq'
  | 'Na2SO4'
  | 'BaCl2'
  | 'NaCl'
  | 'BaSO4'
  | 'Fe'
  | 'Cu'
  | 'SO2'
  | 'SO3';

export type Rgb = readonly [number, number, number];

export interface Species {
  label: string;
  name: string;
  /** Dissolved colour, and `a` = how strongly it tints. */
  sol?: Rgb;
  a?: number;
  /** The colour of the solid. */
  solid?: string;
  /** A white solid that was FORMED — it counts as a precipitate. */
  ppt?: boolean;
  /** An element: what tells displacement from double displacement. */
  elem?: boolean;
  gas?: boolean;
  /** Measured in grams rather than millilitres. */
  g?: boolean;
  brown?: boolean;
}

export const SP: Readonly<Record<SpeciesKey, Species>> = {
  CaO: { label: 'CaO', name: 'quicklime', solid: '#ece9e1', g: true },
  H2O: { label: 'H₂O', name: 'water', sol: [236, 241, 246], a: 0.05 },
  CaOH2: { label: 'Ca(OH)₂', name: 'slaked lime', solid: '#f8f8f6', ppt: true, g: true },
  FeSO4x7: { label: 'FeSO₄·7H₂O', name: 'ferrous sulphate crystals', solid: '#63a94f', g: true },
  FeSO4s: { label: 'FeSO₄', name: 'anhydrous ferrous sulphate', solid: '#efece2', g: true },
  Fe2O3: { label: 'Fe₂O₃', name: 'ferric oxide', solid: '#8d3a18', brown: true, g: true },
  CuSO4: { label: 'CuSO₄', name: 'copper sulphate solution', sol: [40, 122, 214], a: 0.58 },
  FeSO4aq: { label: 'FeSO₄(aq)', name: 'ferrous sulphate solution', sol: [150, 204, 118], a: 0.45 },
  Na2SO4: { label: 'Na₂SO₄', name: 'sodium sulphate solution', sol: [236, 241, 246], a: 0.05 },
  BaCl2: { label: 'BaCl₂', name: 'barium chloride solution', sol: [236, 241, 246], a: 0.05 },
  NaCl: { label: 'NaCl', name: 'sodium chloride solution', sol: [236, 241, 246], a: 0.05 },
  BaSO4: { label: 'BaSO₄', name: 'barium sulphate', solid: '#fbfbf9', ppt: true, g: true },
  Fe: { label: 'Fe', name: 'iron', solid: '#73787e', elem: true, g: true },
  Cu: { label: 'Cu', name: 'copper', solid: '#c2693a', brown: true, elem: true, g: true },
  SO2: { label: 'SO₂', name: 'sulphur dioxide', gas: true },
  SO3: { label: 'SO₃', name: 'sulphur trioxide', gas: true },
};

export const isLiquid = (k: SpeciesKey): boolean => SP[k].sol !== undefined;
export const isSolid = (k: SpeciesKey): boolean => SP[k].g === true;

// ---------------------------------------------------------------------------
// Constants, all per simulated minute
// ---------------------------------------------------------------------------

/** Room temperature on this bench, °C. */
export const TAMB = 28;

export const K = {
  /** CaO + H₂O — fast, but it takes about a minute to finish. */
  lime: 5.0,
  /** FeSO₄·7H₂O losing its water, once above 100 °C. */
  dehyd: 2.5,
  /** 2FeSO₄ → Fe₂O₃ + SO₂ + SO₃, once above 480 °C. */
  decomp: 1.1,
  /** Fe + CuSO₄ — slow: a few minutes to see, about fifteen to be sure. */
  nail: 0.055,
} as const;

export const T_DEHYD = 100;
export const T_DECOMP = 480;
/** Of every gram of FeSO₄·7H₂O dehydrated, this much leaves as steam. */
export const STEAM_PER_HYDRATE = 1 - 0.546;
/** Of every gram of anhydrous FeSO₄ decomposed, this much leaves as SO₂. */
export const SO2_PER_ANHYDROUS = 0.211;
/** °C of adiabatic rise per gram of quicklime slaked. */
export const LIME_DT = 11.0;
/** °C per mL of copper sulphate displaced — real, but far too small to feel. */
export const NAIL_DT = 0.35;
/** Minutes for reaction heat to leak away. */
export const TAU_COOL = 6;
/** The flame drives the tube towards ≈690 °C. */
export const TAU_BURN = 1.5;
export const BURN_MAX = 660;
/** A test tube holds this many millilitres. */
export const CAP = 24;
/** The thermometer only reads this far; past it the bulb bursts. */
export const THERMO_MAX = 110;

export type ReagentKey = 'CaO' | 'H2O' | 'FeSO4x7' | 'CuSO4' | 'Na2SO4' | 'BaCl2';

export const REAGENTS: readonly ReagentKey[] = ['CaO', 'H2O', 'FeSO4x7', 'CuSO4', 'Na2SO4', 'BaCl2'];

/**
 * What one pour puts in, the way a spatula or a measuring cylinder does.
 *
 * The two weighed solids vary a little with the bench seed, as a real spatula
 * does. Neither changes what any vessel shows: 4 g of quicklime still drives its
 * tube past 70 °C, and 3.5 g of crystals still leave a brown residue.
 */
export function dosesForSeed(seed: number): Readonly<Record<ReagentKey, number>> {
  const lime = [4, 4.5, 5, 5.5, 6][seed % 5] ?? 5;
  const crystals = [3.5, 4, 4.5][Math.floor(seed / 5) % 3] ?? 4;
  return { CaO: lime, H2O: 10, FeSO4x7: crystals, CuSO4: 10, Na2SO4: 10, BaCl2: 10 };
}

// ---------------------------------------------------------------------------
// Vessels
// ---------------------------------------------------------------------------

export type VesselId = 'lime' | 'fs' | 'nail' | 'ctrl' | 'dd';

export interface VesselDef {
  id: VesselId;
  /** Where it stands on the bench drawing, in its 1000-wide coordinates. */
  x: number;
  label: string;
  name: string;
  /** What belongs in it. Anything else is a spoiled vessel. */
  allow: readonly ReagentKey[];
  nails: boolean;
}

/** The five vessels: four reactions, plus (iii)'s control tube. */
export const VDEF: readonly VesselDef[] = [
  { id: 'lime', x: 140, label: '(i) CaO + H₂O', name: 'the quicklime tube', allow: ['CaO', 'H2O'], nails: false },
  { id: 'fs', x: 330, label: '(ii) FeSO₄ crystals', name: 'the ferrous sulphate tube', allow: ['FeSO4x7'], nails: false },
  { id: 'nail', x: 520, label: '(iii) nails', name: 'the nail tube', allow: ['CuSO4'], nails: true },
  { id: 'ctrl', x: 650, label: 'control', name: 'the control tube', allow: ['CuSO4'], nails: false },
  { id: 'dd', x: 850, label: '(iv) Na₂SO₄ + BaCl₂', name: 'the sodium sulphate tube', allow: ['Na2SO4', 'BaCl2'], nails: false },
];

export const vesselIndex = (id: VesselId): number => VDEF.findIndex((d) => d.id === id);

export type Contents = Partial<Record<SpeciesKey, number>>;
export type Rgba = readonly [number, number, number, number];
export type LitmusKind = 'litmusR' | 'litmusB';

export interface Vessel {
  /** Its place in the rack, so a vessel always knows its own index. */
  k: number;
  id: VesselId;
  c: Contents;
  nails: number;
  nailsAt: number;
  /** Grams of copper plated out of solution. */
  cu: number;
  /** The copper sulphate this tube started with, for "how far has it gone". */
  cuso40: number;
  /** Grams of choking gas given off. */
  so2: number;
  /** °C the reaction itself put in, and °C the burner put in. Tracked apart. */
  dChem: number;
  dBurn: number;
  chemPeak: number;
  /** How far the precipitate has settled, 0 to 1. */
  settle: number;
  /** The vessel as it looked when it was last poured into: the baseline. */
  base: Rgba | null;
  basePpt: number;
  added: string[];
  stopper: boolean;
  burst: boolean;
  cracked: boolean;
  boiled: boolean;
  /** Minutes spent red hot with nothing left to heat, and under pressure. */
  overheat: number;
  pressure: number;
  wantBurst: boolean;
  wantCrack: boolean;
  litmus: Partial<Record<LitmusKind, 'red' | 'blue'>>;
}

export function newVessel(k: number): Vessel {
  return {
    k,
    id: VDEF[k]!.id,
    c: {},
    nails: 0,
    nailsAt: 0,
    cu: 0,
    cuso40: 0,
    so2: 0,
    dChem: 0,
    dBurn: 0,
    chemPeak: 0,
    settle: 0,
    base: null,
    basePpt: 0,
    added: [],
    stopper: false,
    burst: false,
    cracked: false,
    boiled: false,
    overheat: 0,
    pressure: 0,
    wantBurst: false,
    wantCrack: false,
    litmus: {},
  };
}

const keysOf = (c: Contents): SpeciesKey[] => Object.keys(c) as SpeciesKey[];

export const vol = (v: Vessel): number =>
  keysOf(v.c)
    .filter(isLiquid)
    .reduce((a, k) => a + (v.c[k] ?? 0), 0);

export const solidMass = (v: Vessel): number =>
  keysOf(v.c)
    .filter((k) => isSolid(k) && !SP[k].ppt)
    .reduce((a, k) => a + (v.c[k] ?? 0), 0);

export const pptMass = (v: Vessel): number =>
  keysOf(v.c)
    .filter((k) => SP[k].ppt === true)
    .reduce((a, k) => a + (v.c[k] ?? 0), 0);

export const tempOf = (v: Vessel): number => TAMB + v.dChem + v.dBurn;

export function add(v: Vessel, k: SpeciesKey, q: number): void {
  const next = (v.c[k] ?? 0) + q;
  if (next < 1e-9) delete v.c[k];
  else v.c[k] = next;
}

/**
 * pH of whatever is dissolved. Slaked lime is only slightly soluble, so lime
 * water tops out near pH 12.4 however much quicklime went in; copper sulphate is
 * mildly acidic.
 */
export function pHof(v: Vessel): number | null {
  const L = vol(v) / 1000;
  if (L <= 0) return null;
  let cOH = 0;
  let cH = 1e-7;
  if (v.c.CaOH2) cOH += (2 * Math.min(v.c.CaOH2, 1.6 * L)) / 74 / L;
  if (v.c.CuSO4) cH += (1e-5 * v.c.CuSO4) / vol(v);
  const net = cOH - cH;
  if (Math.abs(net) < 1e-7) return 7;
  return Math.max(0, Math.min(14, net > 0 ? 14 + Math.log10(net) : -Math.log10(-net)));
}

const hex2rgb = (h: string): Rgb => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;

/**
 * The colour of the bulk of the vessel: the solution if there is one, otherwise
 * the solid. A white precipitate is deliberately NOT part of this — it has its
 * own observation.
 */
export function bulkColour(v: Vessel): Rgba | null {
  const V = vol(v);
  if (V > 0) {
    const liq = keysOf(v.c).filter(isLiquid);
    let r = 0;
    let g = 0;
    let b = 0;
    let w = 0;
    for (const k of liq) {
      const wt = ((SP[k].a ?? 0) * (v.c[k] ?? 0)) / V;
      const c = SP[k].sol!;
      r += c[0] * wt;
      g += c[1] * wt;
      b += c[2] * wt;
      w += wt;
    }
    return w ? [r / w, g / w, b / w, w] : null;
  }
  const sol = keysOf(v.c).filter((k) => isSolid(k) && !SP[k].ppt);
  const M = solidMass(v);
  if (!M) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const k of sol) {
    const wt = (v.c[k] ?? 0) / M;
    const c = hex2rgb(SP[k].solid!);
    r += c[0] * wt;
    g += c[1] * wt;
    b += c[2] * wt;
  }
  return [r, g, b, 1];
}

/**
 * How far apart two vessel colours are. The tint strength is weighted in, so
 * "pale blue → strong blue" is not mistaken for a new colour.
 */
export function colourDist(a: Rgba | null, b: Rgba | null): number {
  if (!a || !b) return 0;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * Math.min(1, Math.max(a[3], b[3]) / 0.3);
}

/** The colour to paint the liquid column, or `transparent` when the tube is dry. */
export function liquidCss(v: Vessel): string {
  const c = bulkColour(v);
  if (vol(v) <= 0 || !c) return 'transparent';
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.max(c[3], 0.15).toFixed(3)})`;
}

/** The colour of the dry pile at the bottom. */
export function solidPileCss(v: Vessel): string {
  const sol = keysOf(v.c).filter((k) => isSolid(k) && !SP[k].ppt);
  const M = solidMass(v);
  if (!M) return 'transparent';
  let r = 0;
  let g = 0;
  let b = 0;
  for (const k of sol) {
    const wt = (v.c[k] ?? 0) / M;
    const c = hex2rgb(SP[k].solid!);
    r += c[0] * wt;
    g += c[1] * wt;
    b += c[2] * wt;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/** The baseline a vessel is judged against: how it looked when last poured into. */
export function rebase(v: Vessel): void {
  v.base = bulkColour(v);
  v.basePpt = pptMass(v);
  if (v.id === 'nail' || v.id === 'ctrl') v.cuso40 = v.c.CuSO4 ?? 0;
}

// ---------------------------------------------------------------------------
// One step of the bench, dt in simulated minutes
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The rates the decomposition runs at
// ---------------------------------------------------------------------------

/**
 * The two first-order constants of the decomposition, per simulated minute, at
 * the temperature the tube is actually at. Both stages switch on at a real
 * threshold and come up to full over a real span above it.
 *
 * `stepVessel` integrates these and `fumeRate` differentiates them, so the
 * fumes a student watches leaving the tube and the iron oxide the marking finds
 * in it are the same reaction. There is no second copy of the rate law.
 */
export function dehydrationK(T: number): number {
  return T > T_DEHYD ? K.dehyd * Math.min(1, (T - T_DEHYD) / 60) : 0;
}

export function decompositionK(T: number): number {
  return T > T_DECOMP ? K.decomp * Math.min(1, (T - T_DECOMP) / 200) : 0;
}

/**
 * Grams of gas leaving a heated tube each simulated minute: the water of
 * crystallisation going off as steam, and the sulphur dioxide from the
 * decomposition proper. Both are fumes escaping a dry solid, which is why they
 * are one number — what a student sees is one plume up the tube.
 */
export function fumeRate(v: Vessel): number {
  if (v.burst) return 0;
  const T = tempOf(v);
  return (
    dehydrationK(T) * (v.c.FeSO4x7 ?? 0) * STEAM_PER_HYDRATE +
    decompositionK(T) * (v.c.FeSO4s ?? 0) * SO2_PER_ANHYDROUS
  );
}

/**
 * Millilitres of liquid boiling away each simulated minute. Zero unless the
 * tube is genuinely at 100 °C with something in it — the same test `stepVessel`
 * makes before it drives the liquid off.
 */
export function boilRate(v: Vessel): number {
  if (v.burst) return 0;
  const V = vol(v);
  return V > 0 && TAMB + v.dChem + v.dBurn > 100 ? Math.min(V, 3) : 0;
}

/**
 * Grams of fume in one visible puff, and millilitres of liquid boiled away per
 * visible bubble. They turn a rate the model computed into a count of things to
 * draw, and they are the only step between the two.
 */
export const G_PER_PUFF = 0.1;
export const ML_PER_BOIL_BUBBLE = 0.35;

/**
 * How many puffs of fume, and how many boiling bubbles, leave the tube each
 * REAL second — the bench runs simulated minutes off at `minutesPerSecond`, and
 * nothing outside this file should have to know how that conversion goes.
 * A stopped clock means a still tube, which is exactly right: with `pending` at
 * zero no chemistry is happening either.
 */
export function fumePuffRate(v: Vessel, minutesPerSecond: number): number {
  return (fumeRate(v) * minutesPerSecond) / G_PER_PUFF;
}

export function boilBubbleRate(v: Vessel, minutesPerSecond: number): number {
  return (boilRate(v) * minutesPerSecond) / ML_PER_BOIL_BUBBLE;
}

export function stepVessel(v: Vessel, dt: number, heated: boolean): void {
  const c = v.c;
  if (v.burst) return;

  /* (iv) Double displacement. Two ionic solutions meeting is instantaneous on
     the lab timescale, so it completes whatever dt is — even dt = 0, right as
     the pour lands. */
  if ((c.Na2SO4 ?? 0) > 1e-9 && (c.BaCl2 ?? 0) > 1e-9) {
    const d = Math.min(c.Na2SO4!, c.BaCl2!);
    add(v, 'Na2SO4', -d);
    add(v, 'BaCl2', -d);
    add(v, 'NaCl', 2 * d);
    add(v, 'BaSO4', d * 0.0233);
  }
  if (dt <= 0) return;
  const T0 = tempOf(v);

  /* (i) Combination: CaO + H₂O → Ca(OH)₂, strongly exothermic. */
  if ((c.CaO ?? 0) > 1e-9 && (c.H2O ?? 0) > 1e-9) {
    let d = c.CaO! * (1 - Math.exp(-K.lime * dt));
    d = Math.min(d, c.H2O! / 0.321); // 56 g of CaO takes 18 mL of water
    add(v, 'CaO', -d);
    add(v, 'H2O', -d * 0.321);
    add(v, 'CaOH2', d * 1.321);
    v.dChem += d * LIME_DT;
  }

  /* (ii) Decomposition, in two stages, both keyed to the real temperature. */
  if ((c.FeSO4x7 ?? 0) > 1e-9 && T0 > T_DEHYD) {
    const d = c.FeSO4x7! * (1 - Math.exp(-dehydrationK(T0) * dt));
    add(v, 'FeSO4x7', -d);
    add(v, 'FeSO4s', d * 0.546); // 278 → 152, the water leaves as steam
  }
  if ((c.FeSO4s ?? 0) > 1e-9 && T0 > T_DECOMP) {
    const d = c.FeSO4s! * (1 - Math.exp(-decompositionK(T0) * dt));
    add(v, 'FeSO4s', -d);
    add(v, 'Fe2O3', d * 0.526);
    v.so2 += d * SO2_PER_ANHYDROUS;
  }

  /* (iii) Displacement: iron nails pushing copper out of copper sulphate. */
  if (v.nails > 0 && (c.CuSO4 ?? 0) > 1e-9) {
    const d = c.CuSO4! * (1 - Math.exp(-K.nail * dt));
    add(v, 'CuSO4', -d);
    add(v, 'FeSO4aq', d);
    v.cu += d;
    v.dChem += d * NAIL_DT;
  }

  /* Heat in and heat out. Reaction heat and burner heat are tracked apart, so
     the bench can tell "this got hot by itself" from "this got hot because you
     held a flame under it". */
  v.chemPeak = Math.max(v.chemPeak, v.dChem);
  v.dChem = Math.max(0, v.dChem - (v.dChem * dt) / TAU_COOL);
  const under = heated && !v.burst;
  if (under) v.dBurn += (BURN_MAX - v.dBurn) * (1 - Math.exp(-dt / TAU_BURN));
  else v.dBurn = Math.max(0, v.dBurn - (v.dBurn * dt) / (TAU_BURN * 1.6));

  /* Liquid boiling holds the tube at 100 °C and drives the liquid off. */
  const V = vol(v);
  if (V > 0 && TAMB + v.dChem + v.dBurn > 100) {
    v.dBurn = Math.max(0, 100 - TAMB - v.dChem);
    const lost = Math.min(V, 3 * dt);
    v.boiled = true;
    for (const k of keysOf(c).filter(isLiquid)) add(v, k, (-lost * (c[k] ?? 0)) / V);
  }

  /* Safety. A stoppered tube over a flame builds pressure; an empty tube kept
     red hot cracks. The chemistry only raises the flag — the bench acts on it,
     logs it and says why. */
  if (under && v.stopper) {
    v.pressure += dt;
    if (v.pressure > 0.6) v.wantBurst = true;
  }
  if (under && tempOf(v) > 600 && (c.FeSO4x7 ?? 0) < 1e-3 && (c.FeSO4s ?? 0) < 1e-3 && vol(v) <= 0) {
    v.overheat += dt;
    if (v.overheat > 3) v.wantCrack = true;
  }

  /* A precipitate settles out over a couple of minutes. */
  if (pptMass(v) > 0) v.settle = Math.min(1, v.settle + ((1 - v.settle) * dt) / 1.2);
}

// ---------------------------------------------------------------------------
// What a vessel honestly shows, in the observation table's vocabulary
// ---------------------------------------------------------------------------

export type TagKey = 'colour' | 'ppt' | 'hot' | 'smell' | 'brown' | 'none';

export interface Tag {
  k: TagKey;
  label: string;
  long: string;
}

/**
 * Each tag gets a visibility from 0 up: 1 or more means "plainly there", 0.5 to
 * 1 means "only just starting", and either answer is then fair.
 */
export const TAGS: readonly Tag[] = [
  { k: 'colour', label: 'Colour change', long: 'the solution or the dry solid took a new colour' },
  { k: 'ppt', label: 'White precipitate', long: 'a white precipitate or milky suspension formed' },
  { k: 'hot', label: 'Became hot by itself', long: 'the vessel warmed up on its own, without a flame' },
  { k: 'smell', label: 'Choking smell', long: 'a gas with the choking smell of burning sulphur came off' },
  { k: 'brown', label: 'Brown / reddish solid', long: 'a brown or reddish-brown solid appeared' },
  { k: 'none', label: 'No change at all', long: 'nothing changed' },
];

export function vis(v: Vessel): Record<TagKey, number> {
  const V = vol(v);
  const colour = colourDist(bulkColour(v), v.base) / 45;
  const ppt = Math.min(4, (pptMass(v) - v.basePpt) / (Math.max(V, 1) * 0.008));
  const res = (v.c.Fe2O3 ?? 0) + (v.c.FeSO4s ?? 0) + (v.c.FeSO4x7 ?? 0);
  const brownRes = res > 0 ? (v.c.Fe2O3 ?? 0) / res : 0;
  const brownCu = v.cuso40 > 0 ? v.cu / v.cuso40 : 0;
  const out: Record<TagKey, number> = {
    colour,
    ppt,
    hot: v.chemPeak / 12,
    smell: v.so2 / 0.03,
    brown: Math.max(brownRes, brownCu) / 0.12,
    none: 0,
  };
  // A heavy white suspension does change how the vessel looks, so "colour
  // change" is fair too.
  if (out.ppt >= 1 && out.colour < 1) out.colour = Math.max(out.colour, 0.6);
  return out;
}

export interface Truth {
  yes: TagKey[];
  maybe: TagKey[];
}

export function truthOf(v: Vessel): Truth {
  const x = vis(v);
  const yes: TagKey[] = [];
  const maybe: TagKey[] = [];
  for (const t of TAGS) {
    if (t.k === 'none') continue;
    if (x[t.k] >= 1) yes.push(t.k);
    else if (x[t.k] >= 0.5) maybe.push(t.k);
  }
  if (!yes.length) {
    if (maybe.length) maybe.push('none');
    else yes.push('none');
  }
  return { yes, maybe };
}

/** One line of plain English for what the vessel is showing right now. */
export function showsAs(v: Vessel): string {
  const t = truthOf(v);
  const s = TAGS.filter((g) => t.yes.includes(g.k)).map((g) => g.long);
  const m = TAGS.filter((g) => t.maybe.includes(g.k) && g.k !== 'none').map((g) => `${g.long} (only just)`);
  return [...s, ...m].join('; ') || 'nothing';
}

/** A tick is right when it matches what the vessel showed; "only just" is fair either way. */
export function tickIsRight(truth: Truth, tag: TagKey, ticked: boolean): boolean {
  return truth.maybe.includes(tag) ? true : truth.yes.includes(tag) === ticked;
}

// ---------------------------------------------------------------------------
// The four reactions, and what kind each one is
// ---------------------------------------------------------------------------

export type TypeKey = 'combination' | 'decomposition' | 'displacement' | 'double';

export const TYPES: readonly { k: TypeKey; label: string }[] = [
  { k: 'combination', label: 'Combination' },
  { k: 'decomposition', label: 'Decomposition' },
  { k: 'displacement', label: 'Displacement' },
  { k: 'double', label: 'Double displacement' },
];

export const typeLabel = (k: TypeKey | '' | null): string => TYPES.find((t) => t.k === k)?.label ?? '—';

export type RxId = 'i' | 'ii' | 'iii' | 'iv';

export interface Reaction {
  id: RxId;
  v: VesselId;
  roman: string;
  title: string;
  eq: string;
  reactants: readonly SpeciesKey[];
  products: readonly SpeciesKey[];
}

export const RX: readonly Reaction[] = [
  {
    id: 'i',
    v: 'lime',
    roman: '(i)',
    title: 'Water on quicklime',
    eq: 'CaO + H₂O → Ca(OH)₂',
    reactants: ['CaO', 'H2O'],
    products: ['CaOH2'],
  },
  {
    id: 'ii',
    v: 'fs',
    roman: '(ii)',
    title: 'Heat on ferrous sulphate crystals',
    eq: '2FeSO₄ —heat→ Fe₂O₃ + SO₂ + SO₃',
    reactants: ['FeSO4s'],
    products: ['Fe2O3', 'SO2', 'SO3'],
  },
  {
    id: 'iii',
    v: 'nail',
    roman: '(iii)',
    title: 'Iron nails in copper sulphate',
    eq: 'Fe + CuSO₄ → FeSO₄ + Cu',
    reactants: ['Fe', 'CuSO4'],
    products: ['FeSO4aq', 'Cu'],
  },
  {
    id: 'iv',
    v: 'dd',
    roman: '(iv)',
    title: 'Sodium sulphate + barium chloride',
    eq: 'Na₂SO₄ + BaCl₂ → BaSO₄↓ + 2NaCl',
    reactants: ['Na2SO4', 'BaCl2'],
    products: ['BaSO4', 'NaCl'],
  },
];

/**
 * Worked out from the equation, not looked up. Counting reactants, products and
 * free elements is the whole of the classification rule — which is exactly what
 * the student is being asked to do.
 */
export function classify(rx: Reaction): TypeKey | null {
  const R = rx.reactants;
  const P = rx.products;
  const rE = R.filter((s) => SP[s].elem).length;
  const pE = P.filter((s) => SP[s].elem).length;
  if (R.length >= 2 && P.length === 1) return 'combination';
  if (R.length === 1 && P.length >= 2) return 'decomposition';
  if (R.length === 2 && P.length === 2 && rE === 1 && pE === 1) return 'displacement';
  if (R.length === 2 && P.length === 2 && rE === 0 && pE === 0) return 'double';
  return null;
}

/** Minutes, as the lab clock prints them. */
export const fmtMin = (m: number): string => `${Math.round(m * 10) / 10} min`;
