import { mulberry32 } from '../seed';

/**
 * The biology of practical 7. Nothing about the result is scripted.
 *
 * Seeds respire at a rate that depends on how alive they are, how much seed is
 * in the flask and how warm it is. The carbon dioxide made each simulated
 * minute has to get out of the flask past the cork, down the delivery tube and
 * under the surface of the lime water before it can react with the calcium
 * hydroxide there. The milkiness a student sees is the calcium carbonate that
 * was actually precipitated.
 *
 * Pure arithmetic: no React, no DOM, no clock of its own. Every constant is the
 * standalone bench's, so a flask that went milky there goes milky here.
 */

export type SeedKind = 'germ' | 'boiled' | 'dry';

export interface SeedSpec {
  kind: SeedKind;
  name: string;
  short: string;
  /** Share of a fully active seed's respiration rate. Boiled seeds are dead. */
  viable: number;
}

export const SEED_KINDS: readonly SeedKind[] = ['germ', 'boiled', 'dry'];

export const SEED: Readonly<Record<SeedKind, SeedSpec>> = {
  germ: { kind: 'germ', name: 'germinating seeds', short: 'germinating', viable: 1 },
  boiled: { kind: 'boiled', name: 'boiled seeds', short: 'boiled', viable: 0 },
  dry: { kind: 'dry', name: 'dry seeds', short: 'dry', viable: 0.05 },
};

/** g of seed added per tap, and the flask's sensible limit. */
export const GRAM = 10;
export const GRAM_CAP = 40;
/** mL of lime water per tap; the bent tube only dips below 10 mL. */
export const POUR = 5;
export const LIME_CAP = 15;
export const DIP_ML = 10;

/**
 * Tuned so a sensible 20–30 g of germinating seed leaves the lime water still
 * clear after one five-minute wait, just clouding by ten minutes, and plainly
 * milky by about twenty.
 */
/** mmol CO₂ per gram of fully active seed per simulated minute at 25 °C. */
export const RATE = 0.0007;
/** mmol of Ca(OH)₂ per mL of lime water — this is what can be precipitated. */
export const CA_PER_ML = 0.08;
/** Leak conductance of a vaselined cork vs. a cork just resting in the neck. */
export const LEAK_SEALED = 0.02;
export const LEAK_LOOSE = 14;
/** Fraction of CO₂ a tube of KOH inside the flask absorbs before it can leave. */
export const KOH_ABS = 0.97;
/** Water rise (px of column) per mmol of O₂ consumed, and the tube's length. */
export const RISE_PER_MMOL = 130;
export const RISE_CAP = 70;
/** Fraction of the lime water precipitated at which it *looks* faint / milky. */
export const VIS = { faint: 0.12, milky: 0.4 } as const;
/** How much warmer the water bath runs than the room. */
export const BATH_RISE = 10;

/** What the lime water looks like, in the three words a student may write. */
export type Appearance = 'clear' | 'faint' | 'milky';
export const APPEARANCE_ORDER: readonly Appearance[] = ['clear', 'faint', 'milky'];

/** Which set-up a flask is. A and B are marked; the KOH flask is method 2. */
export const SETUP_A = 0;
export const SETUP_B = 1;
export const SETUP_KOH = 2;

export interface SetupSpec {
  id: string;
  name: string;
  sub: string;
  /** The seed this set-up is meant to hold. */
  want: SeedKind;
}

export const SETUPS: readonly SetupSpec[] = [
  { id: 'A', name: 'Set-up A', sub: 'germinating seeds', want: 'germ' },
  { id: 'B', name: 'Set-up B', sub: 'boiled seeds (control)', want: 'boiled' },
];

/** What the student saw the last time they stopped the clock and looked. */
export interface Look {
  min: number;
  milk: number;
  app: Appearance;
}

export interface Flask {
  index: number;
  seeds: { kind: SeedKind; g: number } | null;
  cork: boolean;
  sealed: boolean;
  koh: boolean;
  lime: { ml: number; caCO3: number };
  co2Made: number;
  co2Down: number;
  co2Through: number;
  /** Water climbing the bent tube in the method 2 set-up, in px of column. */
  rise: number;
  /** Simulated minutes this flask stood corked but unsealed. */
  leakMin: number;
  /** Simulated minutes this flask stood with seeds in it. */
  runMin: number;
  sealTest: string | null;
  /** The last look the student took at this tube, for "what changed". */
  seen: Look | null;
}

export function newFlask(index: number): Flask {
  return {
    index,
    seeds: null,
    cork: false,
    sealed: false,
    koh: false,
    lime: { ml: 0, caCO3: 0 },
    co2Made: 0,
    co2Down: 0,
    co2Through: 0,
    rise: 0,
    leakMin: 0,
    runMin: 0,
    sealTest: null,
    seen: null,
  };
}

/** Respiration roughly doubles for every 10 °C. */
export function q10(tempC: number): number {
  return Math.pow(2, (tempC - 25) / 10);
}

/** mmol of CO₂ this flask's seeds make per simulated minute. */
export function co2Rate(f: Flask, tempC: number): number {
  return f.seeds ? RATE * f.seeds.g * SEED[f.seeds.kind].viable * q10(tempC) : 0;
}

/** The share of that gas which takes the delivery tube rather than the neck. */
export function deliveredFrac(f: Flask): number {
  return f.cork ? 1 / (1 + (f.sealed ? LEAK_SEALED : LEAK_LOOSE)) : 0;
}

/**
 * mmol of CO₂ per simulated minute that actually reaches the lime water: what
 * the seeds made, less what the KOH soaked up, less what escaped at the neck.
 *
 * This is the rate `stepFlask` integrates and the rate the bubbles are drawn
 * from, so what a student watches and what the marking is computed from are the
 * same quantity — more seed, a warmer bath, a leaking cork or a tube of KOH
 * change the drawing because they change the chemistry, and there is no second
 * number anywhere that could say otherwise.
 */
export function deliveredRate(f: Flask, tempC: number): number {
  return co2Rate(f, tempC) * (f.koh ? 1 - KOH_ABS : 1) * deliveredFrac(f);
}

/** mL of gas per mmol at bench temperature, and mL in one bubble worth seeing. */
export const ML_PER_MMOL = 24;
export const ML_PER_BUBBLE = 0.08;

/**
 * Below this the gas is trickling out of solution rather than bubbling, and a
 * drawing that showed it would be showing the student something they could not
 * see at a real bench. In mmol per simulated minute.
 */
export const BUBBLE_FLOOR = 2e-4;

/** Is the mouth of the bent tube under the lime water? */
export function dips(f: Flask): boolean {
  return f.lime.ml >= DIP_ML;
}

/** mmol of calcium hydroxide in the tube: all the precipitate there can ever be. */
export function limeCap(f: Flask): number {
  return CA_PER_ML * f.lime.ml;
}

export function milkiness(f: Flask): number {
  const cap = limeCap(f);
  return cap > 0 ? Math.min(1, f.lime.caCO3 / cap) : 0;
}

export function look(f: Flask): Appearance {
  const m = milkiness(f);
  return m >= VIS.milky ? 'milky' : m >= VIS.faint ? 'faint' : 'clear';
}

/** What an honest student would write in the second column. */
export function detected(f: Flask): 'yes' | 'no' {
  return milkiness(f) >= VIS.faint ? 'yes' : 'no';
}

/**
 * One opacity ramp for the lime water, shared by the bench, the close-up and
 * the table swatch, so the student judges the same thing everywhere. Clear lime
 * water is nearly invisible against the dark bench; a fully precipitated tube
 * is opaque white.
 */
export function limeAlpha(m: number): number {
  return 0.16 + 0.81 * Math.pow(Math.max(0, Math.min(1, m)), 0.85);
}

/**
 * One simulated minute (or fraction of one) of respiration in one flask.
 *
 * Mutates: the reducer only ever hands it a draft it has already cloned.
 */
export function stepFlask(f: Flask, dt: number, tempC: number): void {
  const made = co2Rate(f, tempC) * dt;
  f.co2Made += made;
  if (f.seeds && f.seeds.g > 0) {
    f.runMin += dt;
    if (f.cork && !f.sealed) f.leakMin += dt;
  }
  // KOH inside soaks it up; a loose cork lets the rest escape at the neck.
  // Written out rather than `deliveredRate(f, tempC) * dt`, which is the same
  // quantity: floating-point multiplication is not associative, and moving `dt`
  // to the end shifts the last bit of a figure the marking is computed from.
  // The two expressions are the same product in the same order; only where `dt`
  // enters differs, and it enters here where it always did.
  const down = made * (f.koh ? 1 - KOH_ABS : 1) * deliveredFrac(f);
  f.co2Down += down;
  // With KOH inside, CO₂ is absorbed but O₂ is still consumed, so the gas in
  // the flask shrinks and water climbs the tube.
  if (f.koh && f.cork) f.rise = Math.min(RISE_CAP, f.rise + made * RISE_PER_MMOL * deliveredFrac(f));
  // Tube mouth above the surface: the gas never meets the lime water.
  if (!dips(f)) return;
  f.co2Through += down;
  f.lime.caCO3 = Math.min(limeCap(f), f.lime.caCO3 + down);
}

/** A flask that could actually collect gas: seeds in it, closed, tube dipping. */
export function flaskReady(f: Flask): boolean {
  return Boolean(f.seeds && f.seeds.g > 0 && f.cork && dips(f));
}

/**
 * Why a tube that should have gone milky has not.
 *
 * Read in order: the first thing wrong is the thing to fix.
 */
export function explainClear(f: Flask): string {
  if (!f.seeds || SEED[f.seeds.kind].viable === 0) return 'dead seeds release no carbon dioxide at all.';
  if (!f.cork) return 'with no cork the gas simply left by the neck of the flask.';
  if (!f.sealed) return 'the unsealed cork let almost all of the gas escape at the neck.';
  if (!dips(f)) return 'the mouth of the delivery tube was above the liquid, so the gas never met the lime water.';
  if (f.koh) return 'the KOH inside the flask absorbed the gas before it could reach the lime water.';
  if (SEED[f.seeds.kind].viable < 0.5) return 'dormant seeds respire far too slowly to show in this time.';
  return 'not enough has come through yet — give it longer, or use more seed.';
}

/**
 * The temperature of THIS lab today, 22–27 °C.
 *
 * The only thing the bench seed varies, and it varies something real: a cool
 * room genuinely means a longer wait, because respiration follows Q₁₀. The
 * marking is against what the lime water actually did, so a cold bench costs
 * nothing but patience — and two students side by side cannot copy a time.
 */
export function roomTempFromSeed(seed: number): number {
  return 22 + Math.floor(mulberry32(seed)() * 6);
}
