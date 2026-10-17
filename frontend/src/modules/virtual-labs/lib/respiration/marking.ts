import type { RichText } from '../types';

import { DIP_ML, type Appearance } from './biology';

/**
 * The procedure, the marks and the viva for practical 7.
 *
 * The marks split and every basis string are the standalone bench's, unchanged:
 * a grade a teacher can audit has to be the same grade wherever it was earned.
 */

export interface ProcedureStep {
  title: string;
  prompt: string;
}

export const STEPS: readonly ProcedureStep[] = [
  { title: 'Set up the flasks', prompt: 'Seeds, lime water, cork and delivery tube' },
  { title: 'Check the seals', prompt: 'A loose cork lets the gas escape' },
  { title: 'Let the clock run', prompt: 'Respiration is slow — watch the lime water' },
  { title: 'Record what you saw', prompt: 'Both flasks, at the same moment' },
  { title: 'Conclusion', prompt: 'What the control lets you say' },
  { title: 'Viva voce', prompt: 'Five questions' },
];

/** Step indexes, named so nothing in the bench reads as `step === 2`. */
export const STEP = {
  build: 0,
  seal: 1,
  watch: 2,
  record: 3,
  concl: 4,
  viva: 5,
} as const;

export type PartKey = 'setup' | 'control' | 'airtight' | 'observe' | 'conclude' | 'viva';

export const PART_KEYS: readonly PartKey[] = ['setup', 'control', 'airtight', 'observe', 'conclude', 'viva'];

export const MAX: Readonly<Record<PartKey, number>> = {
  setup: 16,
  control: 14,
  airtight: 10,
  observe: 24,
  conclude: 16,
  viva: 20,
};

export const PART_NAMES: Readonly<Record<PartKey, string>> = {
  setup: 'Apparatus set up',
  control: 'Control with boiled seeds',
  airtight: 'Airtight seals',
  observe: 'Observations (2 flasks)',
  conclude: 'Conclusion',
  viva: 'Viva voce',
};

export const BASIS: Readonly<Record<PartKey, string>> = {
  setup:
    '2 per item across the two set-ups — the right seeds, lime water in the test tube, the cork with its delivery tube, and enough lime water for the tube to dip under (8 per flask)',
  control:
    '14 only if a second flask of boiled seeds ran alongside the first with its own lime water; 0 if no control was run',
  airtight: '5 per flask whose cork was made airtight with vaseline and never leaked while the clock ran',
  observe:
    '12 per flask against what its lime water actually showed when you submitted: 8 for the appearance (4 if one shade out), 4 for whether CO₂ was detected',
  conclude: '8 if the conclusion follows from your own table, 8 if it is the true conclusion',
  viva: '4 per question, first answer counts',
};

/** Marks one row of the observation table can earn. */
export const APPEARANCE_MARKS = 8;
export const DETECTION_MARKS = 4;
export const ROW_MARKS = APPEARANCE_MARKS + DETECTION_MARKS;
/** 5 per flask, both corks vaselined and neither leaking while the clock ran. */
export const AIRTIGHT_PER_FLASK = 5;
/** 2 per item, four items per set-up. */
export const SETUP_PER_ITEM = 2;
export const VIVA_POINTS = MAX.viva / 5;
/** Half the conclusion marks for following from the table, half for being true. */
export const CONCLUSION_HALF = MAX.conclude / 2;

/** Marks for an appearance that is `shades` steps away from what the tube showed. */
export function appearanceMarksFor(shades: number): number {
  return shades === 0 ? APPEARANCE_MARKS : shades === 1 ? APPEARANCE_MARKS / 2 : 0;
}

/**
 * Below this many simulated minutes the assistant warns before a student
 * records: too little gas has bubbled through for calcium carbonate to show.
 */
export const EARLY_MIN = 15;

export const APP_OPTS: readonly { value: Appearance; label: string }[] = [
  { value: 'clear', label: 'Stays clear' },
  { value: 'faint', label: 'Just turning milky' },
  { value: 'milky', label: 'Turns milky — white precipitate' },
];

export const DET_OPTS: readonly { value: 'yes' | 'no'; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

export function appearanceLabel(app: Appearance | ''): string {
  return APP_OPTS.find((o) => o.value === app)?.label ?? '—';
}

/** The same three states in the words the assistant speaks them in. */
export const APPEARANCE_WORD: Readonly<Record<Appearance, string>> = {
  clear: 'still clear',
  faint: 'just clouding',
  milky: 'plainly milky',
};

/** The five conclusions offered. The first is the one this experiment supports. */
export const CONCL: readonly string[] = [
  'Germinating seeds give out carbon dioxide during respiration. The boiled seeds gave out none, so the gas came from the living seeds and not from the air in the flask.',
  'Both flasks gave out carbon dioxide, so seeds release it whether they are alive or dead.',
  'Neither flask gave out carbon dioxide.',
  'The boiled seeds gave out carbon dioxide and the germinating seeds did not.',
  'The carbon dioxide came from the air already inside the flask, not from the seeds.',
];

export const TRUE_CONCLUSION = 0;

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
    q: 'Lime water turns milky because…',
    a: 1,
    o: [
      'carbon dioxide dissolves and simply clouds the water',
      'carbon dioxide reacts with calcium hydroxide to form insoluble calcium carbonate',
      'oxygen reacts with calcium hydroxide to form calcium oxide',
      'water vapour from the flask condenses in the test tube',
    ],
    why: 'Ca(OH)₂ + CO₂ → CaCO₃↓ + H₂O. Calcium carbonate will not dissolve, so it hangs in the liquid as a white precipitate — **that is the milkiness**.',
    textbookQuery: 'lime water turns milky carbon dioxide calcium hydroxide test respiration',
  },
  {
    q: 'Why is a second flask of boiled seeds set up alongside the first?',
    a: 2,
    o: [
      'To use up the spare lime water',
      'Boiled seeds keep the first flask warm',
      'Boiled seeds are dead, so milkiness there could not come from respiration — it is the control',
      'Boiled seeds respire faster, so the result comes sooner',
    ],
    why: 'Dead seeds cannot respire. Its lime water staying clear is what shows the CO₂ in the other flask came from **living seeds** and not from the air already inside the apparatus.',
    textbookQuery: 'germinating seeds respiration experiment control boiled dead seeds',
  },
  {
    q: 'The cork is pushed in but not sealed, so the joint leaks. What happens?',
    a: 1,
    o: [
      'The lime water turns milky faster',
      'Most of the carbon dioxide escapes at the neck instead of going down the delivery tube, so the lime water stays clear or barely changes',
      'The seeds stop respiring',
      'Lime water is sucked back into the flask',
    ],
    why: 'Gas takes the easiest way out. The seeds go on respiring, but too little CO₂ reaches the lime water to precipitate visible calcium carbonate — the experiment fails for a reason that has **nothing to do with the biology**.',
    textbookQuery: 'airtight apparatus delivery tube carbon dioxide collected respiration experiment',
  },
  {
    q: 'During respiration, germinating seeds…',
    a: 1,
    o: [
      'take in carbon dioxide and give out oxygen',
      'take in oxygen and give out carbon dioxide',
      'take in nitrogen and give out carbon dioxide',
      'neither take in nor give out any gas',
    ],
    why: 'C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + energy. Oxygen is consumed and carbon dioxide released — the **reverse of photosynthesis**.',
    textbookQuery: 'aerobic respiration glucose oxygen carbon dioxide water energy equation',
  },
  {
    q: 'Why are germinating seeds used rather than dry ones?',
    a: 2,
    o: [
      'Dry seeds are too hard to fit through the neck of the flask',
      'Dry seeds turn lime water blue instead of milky',
      'Germination switches on the seed’s metabolism, so it respires fast; a dry seed is dormant and gives off almost no CO₂ in the time available',
      'Dry seeds absorb carbon dioxide instead of releasing it',
    ],
    why: 'Soaking and germinating raise the respiration rate many times over. A dormant dry seed would need **days** to turn lime water milky.',
    textbookQuery: 'germination seed respiration rate dormant dry seed metabolism',
  },
];

/** What the Aim and Theory card grounds itself on in the NCERT chapter. */
export const THEORY_QUERY =
  'respiration in plants germinating seeds carbon dioxide released lime water test aerobic respiration';

/** The one line about the delivery tube, used in more than one place. */
export const DIP_LINE = `enough lime water for the bent tube to dip under the surface (${DIP_ML} mL)`;
