/**
 * The chemistry of practical 3: four metals in four salt solutions.
 *
 * A tube holds MILLILITRES of salt solutions and at most one metal strip, and
 * nothing about an observation is scripted. Each simulated minute a strip
 * displaces any less reactive metal from the solution at a first-order rate,
 * turning that salt into its own and laying the displaced metal on its surface.
 * Colour is blended from what is actually in the tube; the deposit is the metal
 * that has actually been laid.
 *
 * Everything a student is marked against comes out of this file, so a tube can
 * never be marked for something it did not show.
 */

export type Metal = 'Zn' | 'Fe' | 'Cu' | 'Al';
export type Salt = 'ZnSO4' | 'FeSO4' | 'CuSO4' | 'Al2SO43';

/** Rows of the observation table, and the four strips on the tile. */
export const METALS: readonly Metal[] = ['Zn', 'Fe', 'Cu', 'Al'];
/** Columns of the observation table, and the four rack groups, left to right. */
export const SALTS: readonly Salt[] = ['ZnSO4', 'FeSO4', 'CuSO4', 'Al2SO43'];

export interface MetalSpec {
  name: string;
  /** A freshly sanded strip. */
  strip: string;
  /** The same strip with its oxide coat still on. */
  dull: string;
  /** The metal once displaced and settled on another strip. */
  dep: string;
}

export const METAL: Readonly<Record<Metal, MetalSpec>> = {
  Zn: { name: 'zinc', strip: '#a4abb3', dull: '#7c8288', dep: '#383a3d' },
  Fe: { name: 'iron', strip: '#73787e', dull: '#6a5446', dep: '#2a2b2d' },
  Cu: { name: 'copper', strip: '#d0824f', dull: '#8f5d3e', dep: '#8a3a1c' },
  Al: { name: 'aluminium', strip: '#e2e6ea', dull: '#a2a7ac', dep: '#9ba0a5' },
};

export interface SaltSpec {
  /** The metal this salt would give up. */
  metal: Metal;
  label: string;
  name: string;
  rgb: readonly [number, number, number];
  /** How strongly 1 mL of it colours the tube. */
  a: number;
}

export const SALT: Readonly<Record<Salt, SaltSpec>> = {
  ZnSO4: { metal: 'Zn', label: 'ZnSO₄', name: 'zinc sulphate', rgb: [226, 236, 242], a: 0.1 },
  FeSO4: { metal: 'Fe', label: 'FeSO₄', name: 'iron(II) sulphate', rgb: [150, 204, 118], a: 0.45 },
  CuSO4: { metal: 'Cu', label: 'CuSO₄', name: 'copper sulphate', rgb: [40, 122, 214], a: 0.58 },
  Al2SO43: { metal: 'Al', label: 'Al₂(SO₄)₃', name: 'aluminium sulphate', rgb: [230, 236, 242], a: 0.1 },
};

export const SALT_OF: Readonly<Record<Metal, Salt>> = {
  Zn: 'ZnSO4',
  Fe: 'FeSO4',
  Cu: 'CuSO4',
  Al: 'Al2SO43',
};

/**
 * Rate constants per simulated minute, for a CLEANED strip of the row metal
 * displacing the column metal. Tuned so the order of appearance is realistic:
 * zinc in copper sulphate shows within a couple of minutes, aluminium in zinc
 * sulphate takes closer to nine, and aluminium in iron(II) sulphate only turns
 * the green plainly colourless after a quarter of an hour.
 */
export const K: Readonly<Partial<Record<Metal, Partial<Record<Metal, number>>>>> = {
  Zn: { Fe: 0.035, Cu: 0.12 },
  Fe: { Cu: 0.06 },
  Al: { Zn: 0.02, Fe: 0.022, Cu: 0.03 },
};

/**
 * An uncleaned strip keeps its oxide layer: zinc and iron react at a third of
 * the rate, and aluminium's oxide film stops it completely. That is the whole
 * reason the procedure says to rub every strip with sandpaper.
 */
export const OXIDE: Readonly<Record<Metal, number>> = { Zn: 0.35, Fe: 0.35, Cu: 1, Al: 0 };

/** mL per pour, and what a tube will hold. */
export const POUR = 5;
export const CAP = 12;

/**
 * Visibility thresholds, as fractions of the solution converted. The drawing
 * uses the same numbers, so a student is never marked against something the
 * tube did not show.
 */
export const VIS = { deposit: 0.15, colourSure: 0.45, colourMaybe: 0.15 } as const;

export type ColourCode = 'none' | 'b2c' | 'b2g' | 'g2c';
export type DepositCode = 'none' | 'rb' | 'gb';

/** The true order, and the thing the whole practical is for. */
export const TRUE_ORDER: readonly Metal[] = ['Al', 'Zn', 'Fe', 'Cu'];

export interface Strip {
  metal: Metal;
  /** Whether it was sanded BEFORE it went in. Cleaning the tile later is too late. */
  clean: boolean;
}

export interface Tube {
  /** The solution this tube's group is for. */
  salt: Salt;
  /** The metal this tube is labelled with. */
  metal: Metal;
  /** What is dissolved in it now, in mL of each salt. */
  liq: Partial<Record<Salt, number>>;
  strip: Strip | null;
  /** Metal displaced onto the strip, in mL-equivalents of solution converted. */
  dep: Partial<Record<Metal, number>>;
  /** The tube as it was when a strip first met a solution in it. */
  start: { liq: Partial<Record<Salt, number>>; min: number } | null;
  /** Every pour, so a contaminated tube stays contaminated in the record. */
  added: Salt[];
  /** What it looked like when the student last looked at it. */
  seen: string | null;
  /** True when it has changed since then. */
  fresh: boolean;
}

export function tubeKey(metal: Metal, salt: Salt): string {
  return `${metal}-${salt}`;
}

export function newTube(metal: Metal, salt: Salt): Tube {
  return { salt, metal, liq: {}, strip: null, dep: {}, start: null, added: [], seen: null, fresh: false };
}

/** The rack, row by row: the observation table's own layout. */
export function newRack(): Tube[] {
  return METALS.flatMap((m) => SALTS.map((s) => newTube(m, s)));
}

export function tubeIndex(metal: Metal, salt: Salt): number {
  return METALS.indexOf(metal) * SALTS.length + SALTS.indexOf(salt);
}

export function volumeOf(t: Tube): number {
  return Object.values(t.liq).reduce((a, b) => a + b, 0);
}

export function depositTotal(t: Tube): number {
  return Object.values(t.dep).reduce((a, b) => a + b, 0);
}

/** The clock for a tube starts when it first holds both a solution and a strip. */
export function beginIfReady(t: Tube, min: number): void {
  if (t.strip && volumeOf(t) > 0 && !t.start) {
    t.start = { liq: { ...t.liq }, min };
    t.seen = truthSignature(truthOf(t));
    t.fresh = false;
  }
}

/** One first-order step of displacement, in place. `dt` is simulated minutes. */
export function react(t: Tube, dt: number): void {
  if (!t.strip || volumeOf(t) <= 0) return;
  const m = t.strip.metal;
  const f = t.strip.clean ? 1 : OXIDE[m];
  if (!f) return;
  for (const s of Object.keys(t.liq) as Salt[]) {
    const displaced = SALT[s].metal;
    const k = K[m]?.[displaced];
    const have = t.liq[s] ?? 0;
    if (!k || have <= 1e-9) continue;
    const d = have * (1 - Math.exp(-k * f * dt));
    t.liq[s] = have - d;
    t.liq[SALT_OF[m]] = (t.liq[SALT_OF[m]] ?? 0) + d;
    t.dep[displaced] = (t.dep[displaced] ?? 0) + d;
  }
}

/** The colour of the liquid, blended from what is actually dissolved in it. */
export function liquidColour(t: Tube): string {
  const v = volumeOf(t);
  if (v <= 0) return 'transparent';
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (const [s, ml] of Object.entries(t.liq) as [Salt, number][]) {
    const spec = SALT[s];
    const wt = (spec.a * ml) / v;
    r += spec.rgb[0] * wt;
    g += spec.rgb[1] * wt;
    b += spec.rgb[2] * wt;
    w += wt;
  }
  if (!w) return 'transparent';
  return `rgba(${Math.round(r / w)},${Math.round(g / w)},${Math.round(b / w)},${Math.max(w, 0.1).toFixed(3)})`;
}

export function depositFraction(t: Tube): number {
  const v = volumeOf(t);
  return v ? depositTotal(t) / v : 0;
}

export function depositOpacity(t: Tube): number {
  const x = depositFraction(t);
  return x < VIS.deposit ? 0 : Math.min(0.92, 0.32 + (x - VIS.deposit) * 1.8);
}

/**
 * How many crystals of the displaced metal are visible on the strip, out of the
 * `max` the drawing has room for.
 *
 * Deposition lays an even film first and grows crystals out of it, so the count
 * is proportional to the metal actually displaced — `depositFraction`, the same
 * number `depositOpacity` and `truthOf` read. It lives here rather than in the
 * drawing for the reason the whole file exists: the tube a student looks at and
 * the tube they are marked against have to be the same tube, and a count of
 * crystals invented beside the SVG would be neither.
 */
export function depositGrains(t: Tube, max: number): number {
  const x = depositFraction(t);
  if (x < VIS.deposit) return 0;
  return Math.max(1, Math.min(max, Math.round(max * x)));
}

/** Whichever metal has settled most thickly is the one you can see. */
export function topDeposit(t: Tube): Metal | null {
  const entries = Object.entries(t.dep) as [Metal, number][];
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0]![0];
}

export function depositColour(t: Tube): string {
  const m = topDeposit(t);
  return m ? METAL[m].dep : 'transparent';
}

export interface TubeTruth {
  c: ColourCode;
  /** A change only just visible: either answer is fair. */
  cMaybe: ColourCode | null;
  d: DepositCode;
}

/** What the tube honestly shows right now, in the observation table's vocabulary. */
export function truthOf(t: Tube): TubeTruth {
  const out: TubeTruth = { c: 'none', cMaybe: null, d: 'none' };
  if (!t.start || !volumeOf(t)) return out;

  if (depositFraction(t) >= VIS.deposit) {
    const top = topDeposit(t);
    if (top) out.d = top === 'Cu' ? 'rb' : 'gb';
  }

  const s0 = t.start.liq;
  const cu0 = s0.CuSO4 ?? 0;
  const fe0 = s0.FeSO4 ?? 0;
  let conv = 0;
  let change: ColourCode | null = null;
  if (cu0 >= fe0 && cu0 > 0) {
    conv = 1 - (t.liq.CuSO4 ?? 0) / cu0;
    // Blue goes green only if what replaced it is iron(II) sulphate.
    const gainedFe = (t.liq.FeSO4 ?? 0) - fe0;
    const gainedClear = (t.liq.ZnSO4 ?? 0) + (t.liq.Al2SO43 ?? 0) - (s0.ZnSO4 ?? 0) - (s0.Al2SO43 ?? 0);
    change = gainedFe > gainedClear ? 'b2g' : 'b2c';
  } else if (fe0 > 0) {
    conv = 1 - (t.liq.FeSO4 ?? 0) / fe0;
    change = 'g2c';
  }

  if (change && conv >= VIS.colourSure) out.c = change;
  else if (change && conv >= VIS.colourMaybe) out.cMaybe = change;
  return out;
}

export function reacted(o: { c: ColourCode; d: DepositCode }): boolean {
  return o.c !== 'none' || o.d !== 'none';
}

/** What a tube looks like, as one string, so "has it changed" is a comparison. */
export function truthSignature(o: TubeTruth): string {
  return `${o.c}|${o.cMaybe ?? ''}|${o.d}`;
}

/** Whether the textbook expects this pairing to react at all. */
export function shouldReact(metal: Metal, salt: Salt): boolean {
  return Boolean(K[metal]?.[SALT[salt].metal]);
}

/** How long a CLEANED strip needs before this pairing shows anything at all. */
export function minutesToVisible(metal: Metal, salt: Salt): number | null {
  const k = K[metal]?.[SALT[salt].metal];
  if (!k) return null;
  return -Math.log(1 - VIS.deposit) / k;
}
