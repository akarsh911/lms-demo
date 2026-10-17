import { mulberry32 } from '../seed';

/**
 * The chemistry of CBSE practical 1B, and nothing else.
 *
 * Nothing here is scripted. A tube holds millilitres of dilute HCl and/or
 * dilute NaOH, drops of litmus solution, and grams of zinc or of solid sodium
 * carbonate. `pHof` works the tube's pH out from what is actually in it, the
 * litmus colour follows that pH, and gas is produced by a rate law from the
 * acid or alkali left and the solid left. The two gas tests read the gas that
 * is really in the tube.
 *
 * That is the whole reason the practical is worth simulating: a wrong procedure
 * has to produce a wrong observation, and the student is marked on recording
 * honestly what THEIR tube showed.
 */

export type ReagentId = 'HCl' | 'NaOH';
export type LitmusId = 'blue' | 'red';
export type SolidId = 'Zn' | 'Na2CO3';
/** What a tube is set up to test with. */
export type TestId = LitmusId | SolidId;

export interface Reagent {
  id: ReagentId;
  /** On the bottle and under the tube. */
  label: string;
  name: string;
  sub: string;
  /** Mol per litre of H⁺ or OH⁻ it brings. */
  H: number;
  OH: number;
}

export const REAGENTS: Readonly<Record<ReagentId, Reagent>> = {
  HCl: { id: 'HCl', label: 'dil. HCl', name: 'dilute hydrochloric acid', sub: '0.1 M', H: 1e-1, OH: 0 },
  NaOH: { id: 'NaOH', label: 'dil. NaOH', name: 'dilute sodium hydroxide', sub: '0.1 M', H: 0, OH: 1e-1 },
};

/** Litmus as it is actually seen. Apparatus colours, not theme colours. */
export const LITMUS_COLOUR = { blue: '#3350c8', red: '#c8323c', purple: '#7b4aa8' } as const;

/** mL per pour, tube capacity, one litmus drop, drops per squeeze. */
export const POUR = 5;
export const CAP = 12;
export const DROP_ML = 0.15;
export const DROPS = 3;
/** A spatula of granules, and of solid sodium carbonate. */
export const ZN_G = 2.0;
export const CARB_G = 1.0;
/** g/mol, g/mol, and mL of gas per mole at room temperature. */
const ZN_MOL = 65.4;
const CARB_MOL = 106;
const MOLAR_VOL = 24400;
/** mL of gas per second at full strength. */
const K = { znAcid: 0.15, znBase: 0.03, carbAcid: 0.3 };
/** The tube is open at the top: gas escapes from its mouth, 2% a second. */
const LEAK = 0.02;
/** mL of a gas needed before a test at the mouth of the tube can see it. */
export const GAS_MIN = 0.15;
/**
 * Seconds for lime water to go milky once the carbon dioxide reaches it. The
 * calcium carbonate has to come out of solution, so the tube clouds over about
 * a second rather than at the instant the test is made — which is what the
 * student watches for, and how they tell the test apart from a dirty tube.
 */
export const LIME_CLOUDS = 1.2;
/** mL/s boundaries between brisk, slow and no effervescence. */
const FIZZ_BRISK = 0.1;
const FIZZ_SLOW = 0.008;
/**
 * mL of gas in one bubble breaking off a zinc granule or a grain of carbonate.
 * Fine effervescence: a bubble about two millimetres across. It is what turns
 * the rate in mL s⁻¹ into a rate in bubbles per second, and it is the only
 * thing standing between the model's number and what is drawn.
 */
export const ML_PER_BUBBLE = 0.006;

// ---------------------------------------------------------------------------
// The eight tubes of the CBSE table
// ---------------------------------------------------------------------------

export interface TubeSpec {
  /** A…H, printed on the rack. */
  id: string;
  reagent: ReagentId;
  test: TestId;
  /** How the test reads under the tube: "blue litmus", "Na₂CO₃". */
  what: string;
}

const TEST_WORD: Readonly<Record<TestId, string>> = {
  blue: 'blue litmus',
  red: 'red litmus',
  Zn: 'zinc',
  Na2CO3: 'Na₂CO₃',
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
/** Test per position, exactly as the CBSE table lays the rack out. */
const TESTS: readonly TestId[] = ['blue', 'red', 'blue', 'red', 'Zn', 'Zn', 'Na2CO3', 'Na2CO3'];
/**
 * The four pairs that share a test: one tube of each pair takes the acid and
 * the other the alkali, which is what makes the pair a comparison.
 */
export const PAIRS: readonly (readonly [number, number])[] = [
  [0, 2],
  [1, 3],
  [4, 5],
  [6, 7],
];

/**
 * Which member of each pair gets the acid is decided by the bench seed.
 *
 * The chemistry, the rack and the marks are identical either way; what changes
 * is that "E fizzes briskly" cannot be copied from the bench next door. A
 * student reads the label under the tube, which is what they would do in the
 * lab.
 */
export function tubeLayout(seed: number): TubeSpec[] {
  const random = mulberry32(seed);
  const reagents: ReagentId[] = new Array<ReagentId>(8).fill('HCl');
  for (const [a, b] of PAIRS) {
    const acidFirst = random() < 0.5;
    reagents[a] = acidFirst ? 'HCl' : 'NaOH';
    reagents[b] = acidFirst ? 'NaOH' : 'HCl';
  }
  return LETTERS.map((id, i) => ({
    id,
    reagent: reagents[i]!,
    test: TESTS[i]!,
    what: TEST_WORD[TESTS[i]!],
  }));
}

export const isLitmusTest = (spec: TubeSpec): boolean => spec.test === 'blue' || spec.test === 'red';

/** The tube in `layout` that holds `reagent` and is tested with `test`. */
export function tubeWith(layout: readonly TubeSpec[], reagent: ReagentId, test: TestId): number {
  return layout.findIndex((s) => s.reagent === reagent && s.test === test);
}

// ---------------------------------------------------------------------------
// A tube
// ---------------------------------------------------------------------------

export type SplinterResult = 'pop' | 'out' | 'burns';
export type LimeResult = 'milky' | 'clear';
export type FizzLevel = 'none' | 'slow' | 'brisk';
/** What the student has ESTABLISHED about the gas, not what is in the tube. */
export type GasClaim = 'untested' | 'H2' | 'CO2' | 'none';
export type LitmusObs =
  | 'none'
  | 'mixed'
  | 'purple'
  | 'blue-blue'
  | 'blue-red'
  | 'red-red'
  | 'red-blue';

export interface Tube {
  liq: Record<ReagentId, number>;
  drops: Record<LitmusId, number>;
  /** Grams of each solid still undissolved. */
  solid: Record<SolidId, number>;
  /** Grams of each solid ever tipped in. */
  put: Record<SolidId, number>;
  spentH: number;
  spentOH: number;
  gas: { H2: number; CO2: number };
  rateNow: number;
  peakRate: number;
  /**
   * Seconds this tube has actually spent fizzing. It used to be the phase the
   * bubbles were drawn at; they are now a train spaced by `rateNow`, which is
   * the rate the marking reads, so nothing draws from this any more. It stays
   * because how long a tube fizzed for is a fact about the tube.
   */
  phase: number;
  /** Every solution poured in, so a tube that was spoiled says so. */
  poured: ReagentId[];
  tests: { splinter: SplinterResult | null; lime: LimeResult | null };
  ident: { H2: boolean; CO2: boolean };
}

export function newTube(): Tube {
  return {
    liq: { HCl: 0, NaOH: 0 },
    drops: { blue: 0, red: 0 },
    solid: { Zn: 0, Na2CO3: 0 },
    put: { Zn: 0, Na2CO3: 0 },
    spentH: 0,
    spentOH: 0,
    gas: { H2: 0, CO2: 0 },
    rateNow: 0,
    peakRate: 0,
    phase: 0,
    poured: [],
    tests: { splinter: null, lime: null },
    ident: { H2: false, CO2: false },
  };
}

export const solutionVol = (t: Tube): number => t.liq.HCl + t.liq.NaOH;
/** Everything in the tube, litmus drops included: they add volume, not acid. */
export const tubeVol = (t: Tube): number => solutionVol(t) + (t.drops.blue + t.drops.red) * DROP_ML;

/** Moles of H⁺ and OH⁻ still in the tube, and its volume. */
function amounts(t: Tube): { nH: number; nOH: number; v: number } {
  let nH = 0;
  let nOH = 0;
  for (const id of ['HCl', 'NaOH'] as const) {
    const ml = t.liq[id];
    nH += REAGENTS[id].H * (ml / 1000);
    nOH += REAGENTS[id].OH * (ml / 1000);
  }
  return { nH: Math.max(0, nH - t.spentH), nOH: Math.max(0, nOH - t.spentOH), v: tubeVol(t) };
}

/** Net effective concentration: positive is acid, negative alkali. Mixing really does cancel. */
export function net(t: Tube): number {
  const { nH, nOH, v } = amounts(t);
  return v ? (nH - nOH) / (v / 1000) : 0;
}

export function pHof(t: Tube): number | null {
  if (!tubeVol(t)) return null;
  const n = net(t);
  if (Math.abs(n) < 1e-7) return 7;
  return Math.max(0, Math.min(14, n > 0 ? -Math.log10(n) : 14 + Math.log10(-n)));
}

export type LitmusShade = 'red' | 'blue' | 'purple';

export const litmusShade = (ph: number | null): LitmusShade | null =>
  ph === null ? null : ph < 6 ? 'red' : ph > 8 ? 'blue' : 'purple';

/** What the litmus in this tube shows, as an observation a student can record. */
export function litmusObs(t: Tube): LitmusObs {
  const b = t.drops.blue > 0;
  const r = t.drops.red > 0;
  if (!b && !r) return 'none';
  if (b && r) return 'mixed';
  const shade = solutionVol(t) ? litmusShade(pHof(t)) : b ? 'blue' : 'red';
  if (shade === 'purple') return 'purple';
  if (b) return shade === 'red' ? 'blue-red' : 'blue-blue';
  return shade === 'blue' ? 'red-blue' : 'red-red';
}

/** The colour the litmus in the tube actually is, or null if none was added. */
export function litmusColour(t: Tube): string | null {
  const b = t.drops.blue > 0;
  const r = t.drops.red > 0;
  if (!b && !r) return null;
  const shade = solutionVol(t)
    ? (litmusShade(pHof(t)) ?? 'purple')
    : b && r
      ? 'purple'
      : b
        ? 'blue'
        : 'red';
  return LITMUS_COLOUR[shade];
}

/** The colour of the liquid as drawn, deepening with the drops added. */
export function liquidColour(t: Tube): string {
  if (!tubeVol(t)) return 'transparent';
  const c = litmusColour(t);
  if (!c) return 'rgba(214,232,240,.13)';
  const k = Math.min(1, (t.drops.blue + t.drops.red) / DROPS);
  const [rr, gg, bb] = [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));
  return `rgba(${rr},${gg},${bb},${(0.2 + 0.4 * k).toFixed(2)})`;
}

// ---------------------------------------------------------------------------
// The reactions
// ---------------------------------------------------------------------------

/**
 * mL of gas per second, from what is in the tube right now.
 *
 *   Zn + 2HCl → ZnCl₂ + H₂
 *   Zn + 2NaOH → Na₂ZnO₂ + H₂   (slower: zinc is amphoteric, not equally so)
 *   Na₂CO₃ + 2HCl → 2NaCl + H₂O + CO₂
 *   Na₂CO₃ + NaOH → no reaction
 */
export function rates(t: Tube): { znAcid: number; znBase: number; carbAcid: number } {
  const n = net(t);
  const acid = Math.max(0, n);
  const base = Math.max(0, -n);
  const af = Math.min(1, acid / 0.05);
  const bf = Math.min(1, base / 0.05);
  const znf = Math.min(1, t.solid.Zn / ZN_G);
  const cf = Math.min(1, t.solid.Na2CO3 / CARB_G);
  return { znAcid: K.znAcid * af * znf, znBase: K.znBase * bf * znf, carbAcid: K.carbAcid * af * cf };
}

export function gasRate(t: Tube): number {
  const r = rates(t);
  return r.znAcid + r.znBase + r.carbAcid;
}

/**
 * One step of the reaction, in place on a tube the caller owns. Everything
 * produced is paid for out of the acid, the alkali and the solid, so a tube
 * that has used its acid up stops fizzing on its own.
 */
export function reactTube(t: Tube, dt: number): void {
  const n = net(t);
  const v = tubeVol(t);
  const nAcid = (Math.max(0, n) * v) / 1000;
  const nBase = (Math.max(0, -n) * v) / 1000;
  const r = rates(t);
  const want = {
    znAcid: (r.znAcid * dt) / MOLAR_VOL,
    znBase: (r.znBase * dt) / MOLAR_VOL,
    carbAcid: (r.carbAcid * dt) / MOLAR_VOL,
  };

  // Both acid reactions take 2 H⁺ per mole of gas.
  const acidMol = want.znAcid + want.carbAcid;
  if (acidMol > 0 && acidMol * 2 > nAcid) {
    const f = nAcid / (2 * acidMol);
    want.znAcid *= f;
    want.carbAcid *= f;
  }
  if (want.znBase > 0 && want.znBase * 2 > nBase) want.znBase *= nBase / (2 * want.znBase);
  const znMol = want.znAcid + want.znBase;
  const znAvail = t.solid.Zn / ZN_MOL;
  if (znMol > znAvail) {
    const f = znAvail / znMol;
    want.znAcid *= f;
    want.znBase *= f;
  }
  want.carbAcid = Math.min(want.carbAcid, t.solid.Na2CO3 / CARB_MOL);

  t.spentH += 2 * (want.znAcid + want.carbAcid);
  t.spentOH += 2 * want.znBase;
  t.solid.Zn = Math.max(0, t.solid.Zn - (want.znAcid + want.znBase) * ZN_MOL);
  t.solid.Na2CO3 = Math.max(0, t.solid.Na2CO3 - want.carbAcid * CARB_MOL);

  const h2 = (want.znAcid + want.znBase) * MOLAR_VOL;
  const co2 = want.carbAcid * MOLAR_VOL;
  t.gas.H2 += h2;
  t.gas.CO2 += co2;
  const keep = Math.max(0, 1 - LEAK * dt);
  t.gas.H2 *= keep;
  t.gas.CO2 *= keep;
  if (t.gas.H2 < 1e-3) t.gas.H2 = 0;
  if (t.gas.CO2 < 1e-3) t.gas.CO2 = 0;
  t.rateNow = dt > 0 ? (h2 + co2) / dt : 0;
  t.peakRate = Math.max(t.peakRate, t.rateNow);
  if (t.rateNow > 0) t.phase += dt;
}

/** True while anything in the tube still needs the clock. */
export const tubeIsLive = (t: Tube): boolean =>
  t.rateNow > 0 || t.gas.H2 > 0 || t.gas.CO2 > 0 || gasRate(t) > 0;

export const fizzLevel = (rate: number): FizzLevel =>
  rate >= FIZZ_BRISK ? 'brisk' : rate >= FIZZ_SLOW ? 'slow' : 'none';

/**
 * Bubbles per second coming off the bottom of a tube.
 *
 * Read from `rateNow` — what the last tick ACTUALLY produced after the acid,
 * the alkali and the solid had been paid — rather than from `gasRate`, which is
 * what the tube would give if nothing ran out. So a tube that has used its acid
 * up stops bubbling at the moment it stops reacting, and the drawing and the
 * observation agree about when the fizzing stopped.
 *
 * Below the slow/none boundary a real tube shows nothing, and neither does
 * this: the answer is zero rather than one very slow bubble.
 */
export function bubbleRate(t: Tube): number {
  return fizzLevel(t.rateNow) === 'none' ? 0 : t.rateNow / ML_PER_BUBBLE;
}

/** A burning splinter at the mouth of the tube reads the gas that is really there. */
export function splinterResult(t: Tube): SplinterResult {
  if (t.gas.CO2 >= GAS_MIN && t.gas.CO2 >= t.gas.H2) return 'out';
  if (t.gas.H2 >= GAS_MIN) return 'pop';
  return 'burns';
}

export const limeResult = (t: Tube): LimeResult => (t.gas.CO2 >= GAS_MIN ? 'milky' : 'clear');

/** What the student has actually established about the gas in this tube. */
export function identifiedGas(t: Tube): GasClaim {
  if (t.ident.H2) return 'H2';
  if (t.ident.CO2) return 'CO2';
  if (t.tests.splinter || t.tests.lime) return 'none';
  return 'untested';
}
