import { clamp } from '../numbers';
import { mulberry32 } from '../seed';

/**
 * The chemistry of the acetic-acid bench.
 *
 * Every bottle carries a real concentration and a real acid or base constant;
 * a tube's pH, smell, layers, fizzing rate and gas are all worked out from what
 * is actually in that tube. Nothing here ever asks "which bottle was this?" to
 * decide what the student sees — which is why pouring water into the sample
 * weakens its smell, and why a spatula of carbonate in a tube with no acid
 * simply sits there.
 */

export type LiquidId = 'acid' | 'water' | 'lime' | 'oil' | 'hcl';

export interface LiquidSpec {
  id: LiquidId;
  /** On the bottle. */
  label: string;
  /** In a sentence: "5 mL acetic acid". */
  short: string;
  /** Spoken in full. */
  name: string;
  /** Acid concentration, mol L⁻¹. */
  conc?: number;
  Ka?: number;
  /** How readily it gives up H⁺ to a carbonate, relative to HCl. */
  speed?: number;
  /** Whether its un-ionised molecules can be smelled. */
  odour?: boolean;
  /** Base concentration, mol L⁻¹. */
  concB?: number;
  Kb?: number;
  /** Ca(OH)₂ available to fix CO₂, mol L⁻¹. */
  ca?: number;
  aqueous: boolean;
  density: number;
  /** How it looks in the tube, for the apparatus to colour a layer. */
  rgb: readonly [number, number, number];
  /** How strongly it tints that layer. */
  a: number;
}

export type Liquids = Readonly<Record<LiquidId, LiquidSpec>>;

/** mL per pour, and mL a tube will hold. */
export const POUR = 5;
export const CAP = 15;
/** mmol of NaHCO₃ in one spatula (about 0.1 g). */
export const SPAT = 1.2;
/** mmol s⁻¹ per (mol L⁻¹) of acid, with a fresh spatula in the tube. */
export const KRATE = 1.2;
/** mmol s⁻¹ that a student would call brisk effervescence. */
export const BRISK = 0.03;
/** mL of gas per mmol at room temperature. */
export const MLGAS = 24;
/** The share of bubbled CO₂ that lime water fixes as it passes through. */
export const ABSORB = 0.5;

/**
 * mL of gas in one bubble breaking off a grain of carbonate, or leaving the
 * mouth of a delivery tube. About the size the eye actually resolves in a test
 * tube; it is what turns a rate in mL s⁻¹ into a rate in bubbles per second.
 */
export const ML_PER_BUBBLE = 0.08;
/** mmol s⁻¹ below which nothing is seen to come off at all. */
export const FIZZ_MIN = 0.004;

/**
 * How fast a shaken emulsion separates again: the half-life of the cloudiness,
 * in seconds. Oil and water shaken by hand in a test tube are clear again in a
 * couple of seconds, and a student is meant to catch the boundary re-forming.
 */
export const EMULSION_HALFLIFE = 0.7;

/** What a vessel is giving off, as far as the drawing is concerned. */
export interface GasSource {
  /** mmol s⁻¹ coming off this tube's own reaction. */
  rate: number;
  /** mmol s⁻¹ arriving from a delivery tube. */
  inflowRate: number;
}

/**
 * Bubbles per second leaving the bottom of a tube.
 *
 * The same two numbers the reducer writes and the marking reads, turned into a
 * count by one bubble size — so the apparatus cannot bubble at a rate the model
 * does not agree with. Below `FIZZ_MIN` a real tube shows nothing, and so does
 * this: the answer is zero rather than one very slow bubble.
 */
export function bubbleRate(g: GasSource): number {
  const mmolPerSec = Math.max(g.rate, g.inflowRate);
  return mmolPerSec < FIZZ_MIN ? 0 : (mmolPerSec * MLGAS) / ML_PER_BUBBLE;
}

const KB_HCO3 = 2.3e-8;
const KA_H2CO3 = 4.3e-7;
/** Solubility of NaHCO₃, mmol per mL. */
const SOL_HCO3 = 1.1;

/**
 * The dilute acetic acid on the shelf is between 0.085 and 0.115 M, decided by
 * the bench seed. It is still a weak acid at every seed — litmus red, pH near
 * 3, brisk with a carbonate — so no rule below depends on the draw; only the
 * number the pH paper reads does, which is what a real bottle does too.
 */
export function acidConcFromSeed(seed: number): number {
  return +(0.085 + mulberry32(seed)() * 0.03).toFixed(3);
}

const cache = new Map<number, Liquids>();

/** The bottles on this bench. Cached, because the clock asks ten times a second. */
export function liquidsFor(acidConc: number): Liquids {
  const hit = cache.get(acidConc);
  if (hit) return hit;
  const liquids: Liquids = {
    acid: {
      id: 'acid',
      label: 'dil. CH₃COOH',
      short: 'acetic acid',
      name: 'dilute acetic acid',
      conc: acidConc,
      Ka: 1.8e-5,
      speed: 0.55,
      odour: true,
      aqueous: true,
      density: 1.01,
      rgb: [236, 241, 246],
      a: 0.06,
    },
    water: {
      id: 'water',
      label: 'water',
      short: 'water',
      name: 'distilled water',
      aqueous: true,
      density: 1.0,
      rgb: [236, 241, 246],
      a: 0.045,
    },
    lime: {
      id: 'lime',
      label: 'lime water',
      short: 'lime water',
      name: 'lime water',
      concB: 0.05,
      Kb: 1e3,
      ca: 0.025,
      aqueous: true,
      density: 1.0,
      rgb: [240, 244, 247],
      a: 0.075,
    },
    oil: {
      id: 'oil',
      label: 'vegetable oil',
      short: 'oil',
      name: 'vegetable oil',
      aqueous: false,
      density: 0.92,
      rgb: [231, 198, 84],
      a: 0.55,
    },
    hcl: {
      id: 'hcl',
      label: 'dil. HCl',
      short: 'dil. HCl',
      name: 'dilute hydrochloric acid',
      conc: 0.1,
      Ka: 1e3,
      speed: 1,
      aqueous: true,
      density: 1.0,
      rgb: [236, 241, 246],
      a: 0.06,
    },
  };
  cache.set(acidConc, liquids);
  return liquids;
}

export const LIQUID_IDS: readonly LiquidId[] = ['acid', 'water', 'lime', 'oil', 'hcl'];

/** What a tube holds, as far as the chemistry is concerned. */
export interface TubeContents {
  liq: Partial<Record<LiquidId, number>>;
  /** mmol of solid NaHCO₃ still undissolved on the bottom. */
  solid: number;
  /** mmol of acid already spent on the carbonate. */
  acidUsed: number;
  /** mmol of CO₂ the lime water has fixed. */
  co2In: number;
}

export function volume(t: TubeContents): number {
  return LIQUID_IDS.reduce((a, id) => a + (t.liq[id] ?? 0), 0);
}

export interface Analysis {
  /** mL of aqueous liquid, and mL of everything. */
  vAq: number;
  vTot: number;
  /** null when there is no aqueous solution for an indicator to respond to. */
  ph: number | null;
  /** mmol of titratable acid still present, and how much there was to start. */
  acidM: number;
  acid0: number;
  speed: number;
  /** Smell, scaled so neat dilute acetic acid is 1. */
  smell: number;
  /** mmol of Ca(OH)₂ in the tube. */
  caM: number;
  /** 0 to 1: how milky the lime water has gone. */
  milky: number;
  dissolved: number;
}

/**
 * One place that knows what is in a tube. Everything drawn, said and marked
 * comes from here.
 */
export function analyse(t: TubeContents, L: Liquids): Analysis {
  let vAq = 0;
  let vTot = 0;
  let acid0 = 0;
  let kaS = 0;
  let spdS = 0;
  let odour0 = 0;
  let base0 = 0;
  let kbS = 0;
  let caM = 0;

  for (const id of LIQUID_IDS) {
    const ml = t.liq[id] ?? 0;
    const spec = L[id];
    if (!ml) continue;
    vTot += ml;
    if (spec.aqueous) vAq += ml;
    if (spec.conc) {
      const n = spec.conc * ml;
      acid0 += n;
      kaS += (spec.Ka ?? 0) * n;
      spdS += (spec.speed ?? 0) * n;
      if (spec.odour) odour0 += n;
    }
    if (spec.concB) {
      const n = spec.concB * ml;
      base0 += n;
      kbS += (spec.Kb ?? 0) * n;
    }
    if (spec.ca) caM += spec.ca * ml;
  }

  const Ka0 = acid0 ? kaS / acid0 : 1.8e-5;
  const Kb0 = base0 ? kbS / base0 : KB_HCO3;
  const speed = acid0 ? spdS / acid0 : 0;
  const acidM = Math.max(0, acid0 - t.acidUsed);
  const frac = acid0 > 0 ? acidM / acid0 : 0;
  // Leftover NaHCO₃ that has dissolved acts as a weak base.
  const dissolved = vAq > 0 ? Math.min(t.solid, SOL_HCO3 * vAq) : 0;
  const takenUp = Math.min(t.co2In, caM);
  const baseM = Math.max(0, base0 - 2 * takenUp);
  // CO₂ past Ca(HCO₃)₂ is just carbonic acid.
  const carbonic = Math.max(0, t.co2In - 2 * caM);
  const totAcid = acidM + carbonic;
  const totBase = baseM + dissolved;
  const KaT = totAcid > 0 ? (Ka0 * acidM + KA_H2CO3 * carbonic) / totAcid : Ka0;
  const KbT = totBase > 0 ? (Kb0 * baseM + KB_HCO3 * dissolved) / totBase : Kb0;

  let ph: number | null = null;
  if (vAq > 0) {
    const net = totAcid - totBase;
    const C = Math.abs(net) / vAq;
    if (net > 1e-9) {
      const h0 = 0.5 * (-KaT + Math.sqrt(KaT * KaT + 4 * KaT * C));
      ph = -Math.log10((h0 + Math.sqrt(h0 * h0 + 4e-14)) / 2);
    } else if (net < -1e-9) {
      const o0 = 0.5 * (-KbT + Math.sqrt(KbT * KbT + 4 * KbT * C));
      ph = 14 + Math.log10((o0 + Math.sqrt(o0 * o0 + 4e-14)) / 2);
    } else {
      ph = 7;
    }
    ph = clamp(ph, 0, 14);
  }

  // Smell comes from the un-ionised acid still in the tube.
  const smell = vTot > 0 ? odour0 * frac * 10 / vTot : 0;
  // Lime water goes milky as CaCO₃ forms — fully white once about one CO₂ per
  // Ca(OH)₂ has been fixed.
  const milky = caM > 0 ? clamp(t.co2In / caM, 0, 1) : 0;

  return { vAq, vTot, ph, acidM, acid0, speed, smell, caM, milky, dissolved };
}

/** A settled layer in a tube. Heaviest first, so the first is the bottom one. */
export interface Layer {
  /** A liquid that will not mix, or `aq` for everything aqueous together. */
  id: LiquidId | 'aq';
  ml: number;
  density: number;
}

/**
 * How many layers a tube would settle into: every aqueous thing is one layer,
 * each immiscible liquid gets its own, floated or sunk by its density.
 */
export function layersOf(t: TubeContents, L: Liquids): Layer[] {
  const out: Layer[] = [];
  let aqMl = 0;
  for (const id of LIQUID_IDS) {
    const ml = t.liq[id] ?? 0;
    if (!ml) continue;
    if (L[id].aqueous) aqMl += ml;
    else out.push({ id, ml, density: L[id].density });
  }
  if (aqMl > 0) out.push({ id: 'aq', ml: aqMl, density: 1.0 });
  return out.sort((p, q) => q.density - p.density);
}

/** Room above the liquid for gas to collect in, mL. */
export function headCap(t: TubeContents): number {
  return Math.max(2, CAP + 5 - volume(t));
}

export type SmellWord = 'strong' | 'clear' | 'faint' | 'none';

export function smellWord(s: number): SmellWord {
  return s >= 0.7 ? 'strong' : s >= 0.3 ? 'clear' : s >= 0.08 ? 'faint' : 'none';
}

export const SMELL_TEXT: Readonly<Record<SmellWord, string>> = {
  strong: 'a strong, pungent vinegar-like smell',
  clear: 'a clear vinegar smell',
  faint: 'a faint vinegar smell',
  none: 'no smell at all',
};

export type Hue = 'red' | 'purple' | 'blue';

/** Litmus is a pH indicator: red below about 5, blue above about 8, purple in between. */
export function litmusHue(ph: number): Hue {
  return ph <= 5 ? 'red' : ph >= 8 ? 'blue' : 'purple';
}
