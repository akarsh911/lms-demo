import { analyse, BRISK, liquidsFor } from './chemistry';
import { TUBE } from './rack';
import type { AceticAcidState } from './state';

/**
 * The observation table and the conclusion.
 *
 * Each row is marked against **what that tube actually showed**, never against
 * the textbook: the truth functions below read the student's own bench. A row
 * for a test that was never carried out is "not tested", and that is the right
 * answer for it — recording effervescence in a tube that never fizzed is the
 * mistake this practical exists to catch.
 */

/** `[value, label]`, exactly as it appears in the table. */
export type Option = readonly [value: string, label: string];

export const OPT_SMELL: readonly Option[] = [
  ['strong', 'A strong, pungent vinegar-like smell'],
  ['clear', 'A clear vinegar smell'],
  ['faint', 'A faint vinegar smell'],
  ['none', 'No smell at all'],
  ['untested', 'Not tested'],
];

export const OPT_SOL: readonly Option[] = [
  ['one', 'One clear layer — it mixes completely'],
  ['two', 'Two separate layers'],
  ['untested', 'Not tested'],
];

export const OPT_BLUE: readonly Option[] = [
  ['red', 'Turned red'],
  ['purple', 'Turned purple'],
  ['blue', 'Stayed blue'],
  ['untested', 'Not tested'],
];

export const OPT_RED: readonly Option[] = [
  ['red', 'Stayed red'],
  ['purple', 'Turned purple'],
  ['blue', 'Turned blue'],
  ['untested', 'Not tested'],
];

export const OPT_FIZZ: readonly Option[] = [
  ['brisk', 'Brisk effervescence'],
  ['slow', 'A few slow bubbles'],
  ['none', 'No change at all'],
  ['untested', 'Not tested'],
];

export const OPT_LIME: readonly Option[] = [
  ['milky', 'The lime water turned milky'],
  ['clear', 'The lime water stayed clear'],
  ['untested', 'No gas was passed through it'],
];

export interface ObservationRow {
  id: string;
  /** The question, as it stands in the table. */
  q: string;
  /** Short form, for the console's one-row-at-a-time view. */
  short: string;
  /** Which tube to magnify beside the answer. */
  tube: number;
  o: readonly Option[];
  truth: (s: AceticAcidState) => string;
}

export const ROWS: readonly ObservationRow[] = [
  {
    id: 'odourA',
    q: '(a) Odour of dilute acetic acid — tube 1',
    short: 'What did tube 1 smell of?',
    tube: TUBE.sample,
    o: OPT_SMELL,
    truth: (s) => s.tubes[TUBE.sample]!.smellSeen ?? 'untested',
  },
  {
    id: 'odourB',
    q: '(a) Odour of the diluted sample — tube 2',
    short: 'What did tube 2 smell of?',
    tube: TUBE.diluted,
    o: OPT_SMELL,
    truth: (s) => s.tubes[TUBE.diluted]!.smellSeen ?? 'untested',
  },
  {
    id: 'solB',
    q: '(b) Tube 2 after shaking — acetic acid with water',
    short: 'What did tube 2 settle into after shaking?',
    tube: TUBE.diluted,
    o: OPT_SOL,
    truth: (s) => s.tubes[TUBE.diluted]!.layersSeen ?? 'untested',
  },
  {
    id: 'solC',
    q: '(b) Tube 3 after shaking — oil with water',
    short: 'What did tube 3 settle into after shaking?',
    tube: TUBE.oil,
    o: OPT_SOL,
    truth: (s) => s.tubes[TUBE.oil]!.layersSeen ?? 'untested',
  },
  {
    id: 'blue',
    q: '(c) Blue litmus in dilute acetic acid — tube 1',
    short: 'What did the blue strip in tube 1 do?',
    tube: TUBE.sample,
    o: OPT_BLUE,
    truth: (s) => s.tubes[TUBE.sample]!.strips.blue?.hue ?? 'untested',
  },
  {
    id: 'red',
    q: '(c) Red litmus in dilute acetic acid — tube 1',
    short: 'What did the red strip in tube 1 do?',
    tube: TUBE.sample,
    o: OPT_RED,
    truth: (s) => s.tubes[TUBE.sample]!.strips.red?.hue ?? 'untested',
  },
  {
    id: 'fizz',
    q: '(d) Solid NaHCO₃ added to the acid — tube 4',
    short: 'What happened when the NaHCO₃ went into tube 4?',
    tube: TUBE.carbonate,
    o: OPT_FIZZ,
    truth: (s) => {
      const t = s.tubes[TUBE.carbonate]!;
      if (!t.solidAdded) return 'untested';
      if (t.peakRate >= BRISK) return 'brisk';
      return t.gasMade > 1e-4 ? 'slow' : 'none';
    },
  },
  {
    id: 'lime',
    q: '(d) The gas passed through lime water — tube 5',
    short: 'What did the lime water in tube 5 do?',
    tube: TUBE.lime,
    o: OPT_LIME,
    truth: (s) => {
      const t = s.tubes[TUBE.lime]!;
      if (t.gasIn <= 0) return 'untested';
      return t.milkyMax > 0.25 ? 'milky' : 'clear';
    },
  },
];

export interface ConclusionQuestion {
  id: string;
  q: string;
  o: readonly Option[];
  truth: (s: AceticAcidState) => string;
  why: string;
}

export const CONCLUSIONS: readonly ConclusionQuestion[] = [
  {
    id: 'nature',
    q: 'From your own litmus strips and pH paper, dilute acetic acid is…',
    o: [
      ['strong', 'A strong acid — blue litmus red, pH about 1'],
      ['weak', 'An acid, but a weak one — blue litmus red, pH about 3'],
      ['neutral', 'Neutral — litmus stayed purple'],
      ['base', 'A base — red litmus turned blue'],
    ],
    truth: (s) => {
      const t = s.tubes[TUBE.sample]!;
      const ph =
        t.strips.blue?.ph ?? t.strips.red?.ph ?? t.phPaper ?? analyse(t, liquidsFor(s.acidConc)).ph;
      if (ph === null) return 'neutral';
      if (ph <= 2) return 'strong';
      if (ph <= 6) return 'weak';
      return ph < 8 ? 'neutral' : 'base';
    },
    why: 'Acetic acid turns blue litmus red, so it is an acid; but the pH paper reads about 3, not 1, because only a small fraction of its molecules ionise. That is what **weak acid** means.',
  },
  {
    id: 'gas',
    q: 'The gas given off in tube 4 was…',
    o: [
      ['h2', 'Hydrogen — it would pop with a burning splinter'],
      ['o2', 'Oxygen — it would relight a glowing splinter'],
      ['co2', 'Carbon dioxide — it turned lime water milky and put the splinter out'],
      ['none', 'No gas was given off at all'],
    ],
    truth: (s) => (s.tubes[TUBE.carbonate]!.gasMade > 1e-4 ? 'co2' : 'none'),
    why: 'An acid on a carbonate or hydrogencarbonate always gives carbon dioxide. Lime water going milky and a burning splinter going out are the two tests that prove it.',
  },
];

/** The eight tests, and whether each was actually carried out. */
export function testList(s: AceticAcidState): readonly [name: string, done: boolean][] {
  const t = s.tubes;
  return [
    ['Odour of tube 1', Boolean(t[TUBE.sample]!.smelled)],
    ['Odour of tube 2', Boolean(t[TUBE.diluted]!.smelled)],
    ['Tube 2 shaken', t[TUBE.diluted]!.stirs > 0],
    ['Tube 3 shaken', t[TUBE.oil]!.stirs > 0],
    ['Blue litmus in tube 1', Boolean(t[TUBE.sample]!.strips.blue)],
    ['Red litmus in tube 1', Boolean(t[TUBE.sample]!.strips.red)],
    ['NaHCO₃ added to tube 4', t[TUBE.carbonate]!.solidAdded > 0],
    ['Gas passed into the lime water', t[TUBE.lime]!.gasIn > 0],
  ];
}

export function testsDone(s: AceticAcidState): number {
  return testList(s).filter(([, ok]) => ok).length;
}

export function labelOf(options: readonly Option[], value: string | null): string {
  return options.find(([v]) => v === value)?.[1] ?? '—';
}
