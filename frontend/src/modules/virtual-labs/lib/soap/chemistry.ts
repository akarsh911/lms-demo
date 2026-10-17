import { mulberry32 } from '../seed';

/**
 * The chemistry of CBSE practical 9: the cleaning capacity of soap in soft and
 * hard water.
 *
 * Nothing here is scripted. A tube's lather is worked out from what is actually
 * in it — the volume of water, that water's hardness, the soap added and how
 * hard it was shaken.
 *
 * Soap is the sodium salt of a fatty acid, C₁₇H₃₅COONa. Every unit of
 * Ca²⁺/Mg²⁺ hardness precipitates a unit of soap as insoluble scum
 * (2C₁₇H₃₅COONa + Ca²⁺ → (C₁₇H₃₅COO)₂Ca↓ + 2Na⁺), so only the soap left over
 * once the ions are used up can foam. Lather then grows with the FREE soap
 * concentration and with shaking, and saturates.
 *
 * That is the whole lesson in one expression: add enough soap to a hard-water
 * tube and it lathers after all, because the ions have run out.
 *
 * Ported from `lms-lab-engine/web/soap.html`, which stays the reference.
 */

export type WaterId = 'soft' | 'hard' | 'boiled';

export interface Water {
  id: WaterId;
  /** On the bottle. */
  label: string;
  /** Under a tube and in the table: room for three across. */
  short: string;
  /** Said in full by the assistant and read out by a screen reader. */
  name: string;
  /** The small print on the label: why this bottle is different. */
  note: string;
}

export const WATERS: readonly Water[] = [
  {
    id: 'soft',
    label: 'distilled water',
    short: 'distilled',
    name: 'distilled water (soft)',
    note: 'soft — no Ca²⁺ / Mg²⁺',
  },
  { id: 'hard', label: 'hard water', short: 'hard', name: 'hard water', note: 'Ca²⁺ / Mg²⁺ salts' },
  {
    id: 'boiled',
    label: 'boiled hard water',
    short: 'boiled hard',
    name: 'boiled hard water',
    note: 'boiled and filtered',
  },
];

export const WATER_BY_ID: Readonly<Record<WaterId, Water>> = Object.fromEntries(
  WATERS.map((w) => [w.id, w]),
) as Record<WaterId, Water>;

/** mL added per tap of a water bottle, and what a test tube will take. */
export const POUR = 5;
export const CAP = 10;
/** Drops of soap solution per squeeze of the dropper. */
export const DROPS = 2;
export const MAX_DROPS = 40;
/** A test tube of this bore holds 2 mL per cm of column. */
export const ML_PER_CM = 2;
/** cm — the tallest froth column this much soap can hold up. */
export const LATHER_MAX = 4.2;
/** Free-soap concentration (units/mL) that gets you 63% of `LATHER_MAX`. */
export const SOAP_HALF = 0.35;
/** Shakes needed to mix 63% of the way. */
export const SHAKE_K = 2.2;
/** Soap units precipitated per unit of hardness. */
export const SCUM_PER_ION = 1;
/** Least count of the centimetre scale: 1 mm. */
export const LEAST_COUNT = 0.1;
/** cm — at or above this, "the tube has lathered". */
export const LATHERS = 1;
/** Fewer than this and the mixing is nobody's idea of a fair shake. */
export const SHAKES_MIN = 3;

/**
 * How hard the hard water on THIS bench is, in ions per mL.
 *
 * The chemistry never varies; the sample does, exactly as one tap does from the
 * next. It decides how much soap goes into scum before any lather appears, so
 * two students side by side cannot copy a froth height or an extension count,
 * and a teacher reproduces either from the seed in the attempt record.
 *
 * Boiling removes the temporary (bicarbonate) hardness and leaves the
 * permanent part, which is why the third bottle still carries some.
 */
export type Hardness = Readonly<Record<WaterId, number>>;

export const HARD_SAMPLES: readonly number[] = [0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];

export function hardnessFromSeed(seed: number): Hardness {
  const rand = mulberry32(seed);
  const hard = HARD_SAMPLES[Math.floor(rand() * HARD_SAMPLES.length)] ?? 1.2;
  return { soft: 0, hard, boiled: Math.round(hard * 40) / 100 };
}

/** What is in one tube, and what has been done to it. */
export interface TubeContents {
  liq: Partial<Record<WaterId, number>>;
  /** Drops of soap solution, one soap unit each. */
  drops: number;
  shakes: number;
}

export function volume(t: TubeContents): number {
  return Object.values(t.liq).reduce((a: number, ml) => a + (ml ?? 0), 0);
}

/** Total Ca²⁺/Mg²⁺ in the tube: hardness times the volume that carries it. */
export function ionsIn(t: TubeContents, hardness: Hardness): number {
  let n = 0;
  for (const [id, ml] of Object.entries(t.liq) as [WaterId, number | undefined][]) {
    n += hardness[id] * (ml ?? 0);
  }
  return n;
}

export interface Lather {
  /** mL of water in the tube. */
  volume: number;
  /** Ca²⁺/Mg²⁺ available to precipitate soap. */
  ions: number;
  /** Soap units added. */
  soap: number;
  /** Soap thrown out of solution as insoluble scum. */
  scum: number;
  /** Soap still in solution — the only soap that can foam. */
  free: number;
  /** How far the shaking has got, 0 to 1. */
  mix: number;
  /** Height of the froth column above the water, cm, to the nearest ½ mm. */
  lather: number;
  /** Height of the water column itself, cm. */
  waterCm: number;
  /** Thickness of the curdy layer on the surface, cm. */
  scumCm: number;
  /** Enough scum for a student to honestly record "scum". */
  scumSeen: boolean;
}

export function model(t: TubeContents, hardness: Hardness): Lather {
  const v = volume(t);
  const ions = ionsIn(t, hardness);
  const soap = t.drops;
  const scum = Math.min(soap, ions * SCUM_PER_ION);
  const free = soap - scum;
  const mix = 1 - Math.exp(-t.shakes / SHAKE_K);
  const x = v > 0 ? free / v : 0;
  const raw = v > 0 ? LATHER_MAX * (1 - Math.exp(-x / SOAP_HALF)) * mix : 0;
  return {
    volume: v,
    ions,
    soap,
    scum,
    free,
    mix,
    // To the nearest half-millimetre: a froth line is never sharper than that.
    lather: Math.round(raw * 20) / 20,
    waterCm: v / ML_PER_CM,
    scumCm: Math.min(0.3, scum * 0.04),
    scumSeen: scum >= 0.4,
  };
}

/** A tube has lathered when a real froth column stands above the water. */
export function lathered(m: Lather): boolean {
  return m.lather >= LATHERS;
}

/**
 * HOW LONG THE TUBE TAKES TO SETTLE, in seconds of real bench time.
 *
 * Not rates, and nothing the marking ever reads. This practical has no clock at
 * all: `model()` is a pure function of what is in the tube and how often it has
 * been shaken, and a froth height is the same height whether it took an instant
 * or a minute to get there. What these two say is only that the height is not
 * REACHED instantly — put a shaken tube down and the froth climbs out of the
 * water over about half a second while the bubbles find their level, and the
 * curdy scum gathers more slowly still.
 *
 * They live here rather than beside the drawing because they are a property of
 * soap and of hard water, not of an SVG, and because a settling time invented in
 * a component is a number nobody can check against anything.
 */
export const LATHER_RISE_SECONDS = 0.55;
export const SCUM_SETTLE_SECONDS = 0.9;

/**
 * How many bubbles the froth column is drawn with, out of the `max` the drawing
 * has room for.
 *
 * A taller column is a column with more bubbles in it — froth is the bubbles —
 * so the count follows `lather` against the tallest column this much soap could
 * ever hold up. One bubble is the least a visible froth can be made of.
 */
export function frothBubbles(m: Lather, max: number): number {
  if (m.lather <= 0.02) return 0;
  return Math.max(1, Math.min(max, Math.round((max * m.lather) / LATHER_MAX)));
}

/** The least soap, in whole drops, that would lather this tube as it is shaken now. */
export function threshold(t: TubeContents, hardness: Hardness): number | null {
  for (let d = DROPS; d <= 400; d += DROPS) {
    if (lathered(model({ liq: t.liq, drops: d, shakes: t.shakes }, hardness))) return d;
  }
  return null;
}

/** What the tube is showing, in the words the assistant uses. */
export function frothWord(m: Lather): string {
  if (lathered(m)) return 'a froth column has formed';
  return m.lather > 0.05 ? 'only a trace of froth' : 'no froth at all';
}
