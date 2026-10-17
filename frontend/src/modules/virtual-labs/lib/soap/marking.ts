import type { RichText } from '../types';

import { DROPS, LEAST_COUNT, POUR, SHAKES_MIN, type WaterId } from './chemistry';

/**
 * The procedure, the marks and the viva for practical 9.
 *
 * The marks split, every basis string and every viva question are the
 * standalone bench's, unchanged: a grade a teacher can audit has to be the same
 * grade wherever it was earned.
 */

/** The three tubes in the rack, left to right. C is optional and unmarked. */
export interface TubeSpec {
  /** Printed under the rack. */
  id: string;
  /** The water that belongs in it. */
  water: WaterId;
  title: string;
  marked: boolean;
}

export const TUBES: readonly TubeSpec[] = [
  { id: 'A', water: 'soft', title: 'Tube A — distilled water (soft)', marked: true },
  { id: 'B', water: 'hard', title: 'Tube B — hard water', marked: true },
  { id: 'C', water: 'boiled', title: 'Tube C — boiled hard water', marked: false },
];

/** The two tubes the comparison is made between, and everything is marked on. */
export const TUBE_A = 0;
export const TUBE_B = 1;
export const MARKED_TUBES: readonly number[] = [TUBE_A, TUBE_B];

export interface ProcedureStep {
  title: string;
  prompt: string;
}

export const STEPS: readonly ProcedureStep[] = [
  { title: 'Fill the two tubes', prompt: `Equal volumes — ${POUR} mL of each water` },
  { title: 'Add the soap', prompt: 'The same amount in each tube' },
  { title: 'Shake both equally', prompt: 'Cork and shake, same number of times' },
  { title: 'Measure the lather', prompt: 'Hold the scale against each tube' },
  { title: 'Record the table', prompt: 'Froth height in cm, scum or none' },
  { title: 'Extension', prompt: 'Soap the hard water until it lathers' },
  { title: 'Conclusion', prompt: 'Which water cleans better, and why' },
  { title: 'Viva voce', prompt: 'Five questions' },
];

/** Step indexes, named so nothing in the bench reads as `step === 3`. */
export const STEP = {
  fill: 0,
  soap: 1,
  shake: 2,
  measure: 3,
  record: 4,
  extend: 5,
  conclude: 6,
  viva: 7,
} as const;

export type PartKey = 'setup' | 'fair' | 'heights' | 'scum' | 'extension' | 'conclusion' | 'viva';

export const PART_KEYS: readonly PartKey[] = [
  'setup',
  'fair',
  'heights',
  'scum',
  'extension',
  'conclusion',
  'viva',
];

export const MAX: Readonly<Record<PartKey, number>> = {
  setup: 10,
  fair: 14,
  heights: 24,
  scum: 10,
  extension: 8,
  conclusion: 14,
  viva: 20,
};

export const PART_NAMES: Readonly<Record<PartKey, string>> = {
  setup: 'Tubes set up',
  fair: 'Fair test',
  heights: 'Lather heights (2)',
  scum: 'Scum observed (2)',
  extension: 'Extension — soaping the hard water',
  conclusion: 'Conclusion',
  viva: 'Viva voce',
};

export const BASIS: Readonly<Record<PartKey, string>> = {
  setup: '5 per tube for the correct water in it, −4 if tubes A and B do not hold equal volumes',
  fair: '7 for equal soap in both tubes and 7 for equal shaking, judged at the moment you submit the table',
  heights:
    '12 per tube against the froth that tube actually showed: within 0.1 cm = 12, within 0.2 cm = 6, further out = 0',
  scum: '5 per tube for scum / no scum, against what that tube actually showed',
  extension: '4 for making the hard-water tube lather with more soap, 4 for the number of drops it took (within 2)',
  conclusion: '7 if the conclusion follows from your own lather heights, 7 for the correct reason',
  viva: '4 per question, first answer counts',
};

/** 5 of the setup marks per tube filled with the water it is labelled for. */
export const SETUP_PER_TUBE = 5;
/** Taken off the setup marks when A and B do not hold the same volume. */
export const UNEQUAL_VOLUME_PENALTY = 4;
export const FAIR_SOAP = 7;
export const FAIR_SHAKING = 7;
export const SCUM_MARKS = 5;
export const EXTENSION_LATHERED = 4;
export const EXTENSION_COUNT = 4;
/** How far out the extension's drop count may be and still earn its marks. */
export const EXTENSION_TOLERANCE = 2;
export const CONCLUSION_CONSISTENT = 7;
export const CONCLUSION_REASON = 7;
export const VIVA_POINTS = MAX.viva / 5;

/** Marks a froth height can earn, by how far off it is. Full marks at the least count. */
export function heightMarksFor(error: number): number {
  if (error <= LEAST_COUNT + 1e-9) return 12;
  return error <= 2 * LEAST_COUNT + 1e-9 ? 6 : 0;
}

/** Which water the student says washed better. Index into `WHICH_OPTIONS`. */
export const WHICH_OPTIONS: readonly string[] = ['Distilled (soft) water', 'Hard water', 'Both the same'];
export const WHICH_SOFT = 0;

export const REASONS: readonly string[] = [
  'Hard water is thicker than soft water, so soap cannot mix into it',
  'The Ca²⁺ and Mg²⁺ ions of hard water precipitate the soap as an insoluble scum, so little soap is left to lather',
  'Soap only dissolves in water that contains no dissolved substance at all',
  'Hard water neutralises the soap and turns it back into a fatty acid gas',
];
export const REASON_OK = 1;

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
    q: 'What makes a sample of water “hard”?',
    a: 2,
    o: [
      'Dissolved carbon dioxide',
      'Suspended clay and sand',
      'Dissolved calcium and magnesium salts',
      'A pH below 7',
    ],
    why:
      'Hardness is caused by dissolved salts of **calcium and magnesium** — their bicarbonates give temporary hardness, ' +
      'their chlorides and sulphates permanent hardness.',
    textbookQuery: 'hard water calcium magnesium salts soap scum',
  },
  {
    q: 'The white curdy solid that forms when soap is shaken with hard water is…',
    a: 1,
    o: [
      'unreacted soap that failed to dissolve',
      'the insoluble calcium or magnesium salt of the fatty acid — scum',
      'calcium carbonate precipitated from the water',
      'sodium chloride crystallising out',
    ],
    why:
      'Scum is calcium (or magnesium) stearate: 2C₁₇H₃₅COONa + Ca²⁺ → (C₁₇H₃₅COO)₂Ca↓ + 2Na⁺. It is **insoluble**, ' +
      'so it settles out instead of lathering.',
    textbookQuery: 'soap sodium stearate calcium magnesium insoluble scum precipitate',
  },
  {
    q: 'Why does soap give so little lather in hard water?',
    a: 3,
    o: [
      'Hard water destroys the froth as fast as it forms',
      'Soap reacts with water itself in the presence of ions',
      'The lather sinks because hard water is denser',
      'The soap is precipitated as scum, so hardly any soap is left in solution to foam',
    ],
    why:
      'The soap is consumed before it can foam. Once enough soap has been added to use up every Ca²⁺ and Mg²⁺ ion, ' +
      'the **extra soap stays in solution** and hard water lathers too.',
    textbookQuery: 'soap lather hard water micelle cleansing action',
  },
  {
    q: 'Why must both tubes get equal volumes of water, equal soap and equal shaking?',
    a: 0,
    o: [
      'So that the only difference between the tubes is the water, and the froth can be blamed on the hardness',
      'Because the syllabus says so',
      'To save soap solution',
      'So that both tubes weigh the same in the rack',
    ],
    why:
      'This is a **controlled comparison**. If one tube got more soap or more shaking, a difference in froth proves ' +
      'nothing about the water — the experiment is spoiled even if the numbers look neat.',
    textbookQuery: 'soap cleaning capacity soft hard water experiment comparison',
  },
  {
    q: 'Detergents lather well even in hard water because…',
    a: 2,
    o: [
      'they soften the water before they clean',
      'they are much stronger alkalis than soap',
      'their calcium and magnesium salts are soluble, so no scum is precipitated',
      'they contain no long hydrocarbon chain',
    ],
    why:
      'Detergents are ammonium or sulphonate salts of long-chain hydrocarbons. Their calcium and magnesium salts ' +
      '**dissolve**, so the ions never take the detergent out of solution.',
    textbookQuery: 'detergents ammonium sulphonate salts hard water lather soap difference',
  },
];

/** What the Aim and Theory card grounds itself on in the NCERT chapter. */
export const THEORY_QUERY =
  'soap sodium salt fatty acid hard water calcium magnesium scum lather detergent cleansing action';

/** The reminder the shake step keeps repeating, in one place. */
export const SHAKE_PROMPT = `at least ${SHAKES_MIN} each, the same number in both`;
/** One squeeze of the dropper, in words. */
export const SQUEEZE = `${DROPS} drops`;
