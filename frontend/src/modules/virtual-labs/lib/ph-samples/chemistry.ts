import { clamp } from '../numbers';

/**
 * The chemistry of CBSE practical 1A: the pH of six everyday samples.
 *
 * Every sample carries an effective H⁺ or OH⁻ concentration, and a tube's pH is
 * COMPUTED from what is actually in it. Nothing looks up "which bottle was
 * poured", so a mixture behaves like a mixture: equal dilute HCl and dilute
 * NaOH neutralise to exactly 7, and diluting an acid tenfold moves its pH by 1
 * — halving it, by 0.3.
 *
 * The indicator colour then follows that pH across the fifteen-colour chart, so
 * the chart drawn on the bench is a real reference rather than a decoration.
 *
 * Ported from `lms-lab-engine/web/acids.html`, which stays the reference.
 */

export type SampleId = 'HCl' | 'CH3COOH' | 'Lemon' | 'Water' | 'NaHCO3' | 'NaOH';

export type Nature = 'acidic' | 'neutral' | 'basic';

export interface Sample {
  id: SampleId;
  /** On the bottle's label. */
  label: string;
  /** Under the tube, and on the ordering chips: room for six across. */
  short: string;
  /** Said in full by the assistant and read out by a screen reader. */
  name: string;
  /** Effective H⁺ concentration, mol/L. */
  H?: number;
  /** Effective OH⁻ concentration, mol/L. */
  OH?: number;
  /** The liquid's own colour before any indicator, and how strongly it tints. */
  rgb: readonly [number, number, number];
  a: number;
}

export const SAMPLES: readonly Sample[] = [
  { id: 'HCl', label: 'dil. HCl', short: 'HCl', name: 'dilute hydrochloric acid', H: 1e-1, rgb: [236, 241, 246], a: 0.07 },
  { id: 'CH3COOH', label: 'dil. CH₃COOH', short: 'CH₃COOH', name: 'dilute ethanoic acid', H: 1e-3, rgb: [236, 241, 246], a: 0.07 },
  { id: 'Lemon', label: 'lemon juice', short: 'lemon', name: 'lemon juice', H: 1e-2, rgb: [238, 224, 124], a: 0.38 },
  { id: 'Water', label: 'water', short: 'water', name: 'distilled water', H: 1e-7, OH: 1e-7, rgb: [236, 241, 246], a: 0.05 },
  { id: 'NaHCO3', label: 'dil. NaHCO₃', short: 'NaHCO₃', name: 'dilute sodium hydrogen carbonate', OH: 1e-5, rgb: [236, 241, 246], a: 0.07 },
  { id: 'NaOH', label: 'dil. NaOH', short: 'NaOH', name: 'dilute sodium hydroxide', OH: 1e-1, rgb: [236, 241, 246], a: 0.07 },
];

export const SAMPLE_BY_ID: Readonly<Record<SampleId, Sample>> = Object.fromEntries(
  SAMPLES.map((s) => [s.id, s]),
) as Record<SampleId, Sample>;

export const SAMPLE_IDS: readonly SampleId[] = SAMPLES.map((s) => s.id);

/** One pour from a bottle, and how much a test tube holds. */
export const POUR = 5;
export const CAP = 12;

/**
 * Universal indicator / pH paper, pH 0 to 14. Fifteen printed colours; anything
 * between them is interpolated, because a real strip lands between two squares.
 */
export const UI_CHART: readonly string[] = [
  '#e2231a',
  '#e8442a',
  '#ef6a25',
  '#f4892a',
  '#f7ab2f',
  '#e9c531',
  '#c3d436',
  '#55bb4a',
  '#2fb69c',
  '#2f92c8',
  '#2a67bb',
  '#3b48ab',
  '#5a33a0',
  '#6d2596',
  '#7c2086',
];

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** The chart colour at a pH, interpolated between the two printed squares. */
export function uiRgb(ph: number): [number, number, number] {
  const x = clamp(ph, 0, 14);
  const lo = Math.floor(x);
  const hi = Math.min(14, lo + 1);
  const f = x - lo;
  const a = hexToRgb(UI_CHART[lo] ?? UI_CHART[0]!);
  const b = hexToRgb(UI_CHART[hi] ?? UI_CHART[14]!);
  return [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * f)) as [number, number, number];
}

export function uiColour(ph: number): string {
  return `rgb(${uiRgb(ph).join(',')})`;
}

/** What is in a tube: how many mL of each sample, and whether indicator was added. */
export interface TubeContents {
  liq: Partial<Record<SampleId, number>>;
  indicator?: boolean;
}

function poured(t: TubeContents): [SampleId, number][] {
  return Object.entries(t.liq).filter(([, ml]) => (ml ?? 0) > 0) as [SampleId, number][];
}

export function volume(t: TubeContents): number {
  return poured(t).reduce((a, [, ml]) => a + ml, 0);
}

/**
 * The pH of whatever is in the tube. Strong and weak species alike are carried
 * as an EFFECTIVE concentration, so the arithmetic is the one a Class 10
 * student is taught: dilute, and pH moves by log₁₀ of the dilution; add an
 * equal amount of the opposite, and H⁺ and OH⁻ cancel.
 */
export function pHof(t: TubeContents): number | null {
  const v = volume(t);
  if (!v) return null;
  let cH = 0;
  let cOH = 0;
  for (const [id, ml] of poured(t)) {
    const s = SAMPLE_BY_ID[id];
    cH += (s.H ?? 0) * ml;
    cOH += (s.OH ?? 0) * ml;
  }
  cH /= v;
  cOH /= v;
  const net = cH - cOH;
  // Neutral water itself sits at 1e-7 either way: anything inside that is 7.
  if (Math.abs(net) < 1e-7) return 7;
  return clamp(net > 0 ? -Math.log10(net) : 14 + Math.log10(-net), 0, 14);
}

/**
 * What the tube LOOKS like. With indicator in it the solution takes the chart
 * colour for its pH; without, it is only as coloured as the samples themselves,
 * which is why five of the six are indistinguishable until they are tested.
 */
export function liquidColour(t: TubeContents): string {
  if (t.indicator) {
    const ph = pHof(t);
    return ph === null ? 'transparent' : `rgba(${uiRgb(ph).join(',')},.62)`;
  }
  const v = volume(t);
  if (!v) return 'transparent';
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (const [id, ml] of poured(t)) {
    const s = SAMPLE_BY_ID[id];
    const wt = (s.a * ml) / v;
    r += s.rgb[0] * wt;
    g += s.rgb[1] * wt;
    b += s.rgb[2] * wt;
    w += wt;
  }
  if (!w) return 'transparent';
  return `rgba(${Math.round(r / w)},${Math.round(g / w)},${Math.round(b / w)},${Math.max(w, 0.09).toFixed(3)})`;
}

/**
 * HOW LONG THE COLOUR TAKES TO COME UP, in seconds of real bench time.
 *
 * Development times, not rates, and nothing the marking ever reads: `pHof` and
 * the frozen `strip` are the same numbers whether the colour arrived in an
 * instant or over a second, and they are what a student is marked against.
 *
 * The two differ because the chemistry does. Universal indicator dropped into a
 * SOLUTION is already mixed through it, so a swirl of the tube is all it takes;
 * a strip of indicator PAPER has to wet through its fibres before the dye sees
 * the solution at all, which is the second or two a student is told to wait
 * before matching it against the chart — and matching too early is one of the
 * ways this practical is got wrong.
 */
export const SOLUTION_DEVELOP_SECONDS = 0.45;
export const PAPER_DEVELOP_SECONDS = 1.6;

/** Which of the two a tube is developing on right now. */
export function developSeconds(t: TubeContents): number {
  return t.indicator ? SOLUTION_DEVELOP_SECONDS : 0;
}

/** Acidic below 6.5, basic above 7.5: the band a colour can honestly be read to. */
export function natureOf(ph: number): Nature {
  return ph < 6.5 ? 'acidic' : ph <= 7.5 ? 'neutral' : 'basic';
}

/** The pH of a clean 5 mL of one sample — what a careful student should find. */
export function truePhOf(id: SampleId): number {
  return pHof({ liq: { [id]: POUR } }) ?? 7;
}

/** The six samples, most acidic first. Derived, never typed out. */
export const TRUE_ORDER: readonly SampleId[] = [...SAMPLE_IDS].sort((a, b) => truePhOf(a) - truePhOf(b));
