import type { RichText } from '../types';

import { POUR } from './chemistry';

/**
 * The procedure, the marks and the viva for practical 1A.
 *
 * The marks split and every basis string are the standalone bench's, unchanged:
 * a grade a teacher can audit has to be the same grade wherever it was earned.
 */

export interface ProcedureStep {
  title: string;
  prompt: string;
}

export const STEPS: readonly ProcedureStep[] = [
  { title: 'Pour the samples', prompt: `${POUR} mL of each sample into its own tube` },
  { title: 'Test every sample', prompt: 'pH paper or universal indicator' },
  { title: 'Record the pH', prompt: 'Match each colour against the chart' },
  { title: 'Order by pH', prompt: 'Most acidic to most basic' },
  { title: 'Viva voce', prompt: 'Five questions' },
];

/** Step indexes, named so nothing in the bench reads as `step === 2`. */
export const STEP = {
  pour: 0,
  test: 1,
  record: 2,
  order: 3,
  viva: 4,
} as const;

export type PartKey = 'setup' | 'testing' | 'ph' | 'nature' | 'order' | 'viva';

export const PART_KEYS: readonly PartKey[] = ['setup', 'testing', 'ph', 'nature', 'order', 'viva'];

export const MAX: Readonly<Record<PartKey, number>> = {
  setup: 12,
  testing: 6,
  ph: 36,
  nature: 12,
  order: 14,
  viva: 20,
};

export const PART_NAMES: Readonly<Record<PartKey, string>> = {
  setup: 'Samples poured',
  testing: 'Tests done',
  ph: 'pH values (6)',
  nature: 'Acidic / neutral / basic',
  order: 'Order by pH',
  viva: 'Viva voce',
};

export const BASIS: Readonly<Record<PartKey, string>> = {
  setup: '12 − 3 for each tube filled with the wrong sample',
  testing: '1 per tube tested with pH paper or universal indicator',
  ph: '6 per sample, against the pH of what is actually in that tube: within 0.5 = 6, within 1 = 4, within 2 = 2',
  nature: '2 per sample for acidic / neutral / basic',
  order: '7 if the order follows from your own readings, 7 if it is the true order',
  viva: '4 per question, first answer counts',
};

/** Marks a sample's pH reading can earn, by how far off it is. */
export function phMarksFor(error: number): number {
  return error <= 0.5 ? 6 : error <= 1 ? 4 : error <= 2 ? 2 : 0;
}

export const NATURE_MARKS = 2;
export const VIVA_POINTS = MAX.viva / 5;
/** Deducted from the setup marks for each tube spoiled by the wrong sample. */
export const CONTAMINATION_PENALTY = 3;

export interface VivaQuestion {
  q: string;
  /** Index of the correct option. */
  a: number;
  o: readonly string[];
  why: RichText;
  /** What to look up in the NCERT chapter beside the explanation. */
  textbookQuery: string;
}

export const VIVA: readonly VivaQuestion[] = [
  {
    q: 'Which of these samples has the lowest pH?',
    a: 2,
    o: ['Lemon juice', 'Dilute ethanoic acid', 'Dilute hydrochloric acid', 'Dilute sodium hydrogen carbonate'],
    why: 'HCl is a **strong acid** — it ionises completely, so it gives the highest H⁺ concentration and the lowest pH, about 1. Ethanoic acid is weak and only partly ionises.',
    textbookQuery: 'strong acid weak acid completely ionised hydrogen ion concentration pH',
  },
  {
    q: 'Universal indicator turns green in a solution. Its pH is about…',
    a: 1,
    o: ['1', '7', '11', '14'],
    why: 'Green is the middle of the chart: **pH 7, neutral**. Reds and oranges are acidic, blues and violets are basic.',
    textbookQuery: 'universal indicator pH scale colour neutral seven',
  },
  {
    q: 'Why is distilled water used for this test rather than tap water?',
    a: 3,
    o: [
      'Distilled water is cheaper',
      'Tap water damages pH paper',
      'Tap water is always acidic',
      'Tap water has dissolved salts and gases that shift its pH away from 7',
    ],
    why: 'Distilled water is close to neutral, so it gives the pH 7 reference. Tap water carries dissolved carbon dioxide and salts.',
    textbookQuery: 'distilled water neutral pH 7 dissolved carbon dioxide',
  },
  {
    q: 'Dilute sodium hydrogen carbonate solution is…',
    a: 2,
    o: ['strongly acidic', 'weakly acidic', 'weakly basic, around pH 9', 'strongly basic, around pH 13'],
    why: 'NaHCO₃ is the salt of a **strong base and a weak acid**, so its solution is weakly basic — around pH 9, which reads blue on the chart.',
    textbookQuery: 'sodium hydrogen carbonate salt strong base weak acid basic solution',
  },
  {
    q: 'Why must a fresh strip of pH paper be used for each sample?',
    a: 0,
    o: [
      'A used strip still carries the previous solution and would give a false reading',
      'Strips lose colour after a minute',
      'One strip cannot absorb twice',
      'It makes no difference',
    ],
    why: 'Carrying acid across into a basic sample (or the reverse) changes what you are testing. Same reason the dropper is rinsed between samples.',
    textbookQuery: 'pH paper testing solutions acids bases laboratory procedure',
  },
];

/** What the Aim and Theory card grounds itself on in the NCERT chapter. */
export const THEORY_QUERY = 'pH scale measuring hydrogen ion concentration acidic basic neutral universal indicator';
