import type { RichText } from '../types';

/**
 * The procedure, the marks and the viva.
 *
 * The split is the standalone bench's own, kept exactly: four property tests
 * carried out, an honest observation table, a conclusion that follows from the
 * student's own tubes, and five questions. Every part carries the rule it was
 * marked by, and that rule travels with the attempt record.
 */
export interface ProcedureStep {
  title: string;
  prompt: string;
}

export const STEPS: readonly ProcedureStep[] = [
  { title: 'Set up the tubes', prompt: 'Each tube is labelled with what belongs in it' },
  { title: '(a) Odour', prompt: 'Waft tubes 1 and 2 — never sniff them' },
  { title: '(b) Solubility', prompt: 'Shake tubes 2 and 3 and watch the layers' },
  { title: '(c) Effect on litmus', prompt: 'Blue and red strips in tube 1' },
  { title: '(d) Sodium hydrogen carbonate', prompt: 'Effervescence, then test the gas' },
  { title: 'Observation table', prompt: 'Eight rows — what you actually saw' },
  { title: 'Conclusion', prompt: 'What the acid is, and what the gas was' },
  { title: 'Viva voce', prompt: 'Five questions' },
];

/** Step indexes, named so nothing below reads as `step === 4`. */
export const STEP = {
  setup: 0,
  odour: 1,
  solubility: 2,
  litmus: 3,
  carbonate: 4,
  record: 5,
  conclusion: 6,
  viva: 7,
} as const;

export type PartKey = 'setup' | 'technique' | 'tests' | 'obs' | 'concl' | 'viva';

export const PART_KEYS: readonly PartKey[] = ['setup', 'technique', 'tests', 'obs', 'concl', 'viva'];

export const MAX: Readonly<Record<PartKey, number>> = {
  setup: 10,
  technique: 8,
  tests: 16,
  obs: 32,
  concl: 14,
  viva: 20,
};

export const PART_NAMES: Readonly<Record<PartKey, string>> = {
  setup: 'Tubes set up',
  technique: 'Safe technique',
  tests: 'Tests carried out (8)',
  obs: 'Observation table (8 rows)',
  concl: 'Conclusion',
  viva: 'Viva voce',
};

export const BASIS: Readonly<Record<PartKey, string>> = {
  setup: '10 − 2 for every tube holding a liquid that does not belong in it',
  technique: '8 for smelling by wafting only; −4 each time you put your nose to the mouth of a tube',
  tests: '2 for each of the 8 tests actually carried out',
  obs: '4 per row, marked against what that tube actually showed — not against the textbook',
  concl:
    '7 for the nature of the acid following from your own litmus and pH, 7 for naming the gas from your own gas test',
  viva: '4 per question, first answer counts',
};

/** Marks a single wrong entry costs, by part. Used by the log and by the marks. */
export const PENALTY = {
  /** Per tube spoiled by the wrong liquid. */
  spoiled: 2,
  /** Per direct sniff. */
  sniff: 4,
  /** Per observation row that disagrees with the tube. */
  row: 4,
  /** Per conclusion. */
  conclusion: 7,
} as const;

export const ROW_POINTS = 4;
export const CONCLUSION_POINTS = 7;
export const TEST_POINTS = 2;
export const VIVA_POINTS = 4;

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
    q: 'Acetic acid is called a weak acid. What does that actually mean?',
    a: 2,
    o: [
      'It is always used dilute',
      'It contains less hydrogen than hydrochloric acid',
      'Only a small fraction of its molecules ionise in water, so the same concentration gives far fewer H⁺ ions and a higher pH',
      'It reacts only with weak bases',
    ],
    why: 'Strength is about how completely an acid ionises, not how concentrated it is. 0.1 M HCl ionises fully and reads pH 1; 0.1 M acetic acid barely ionises and reads about 3.',
    textbookQuery: 'ethanoic acid weak acid does not ionise completely compared with hydrochloric acid',
  },
  {
    q: 'What is the correct way to find out how a chemical in a test tube smells?',
    a: 1,
    o: [
      'Put your nose over the mouth of the tube and breathe in',
      'Hold the tube away from you and waft the vapour towards your nose with your hand',
      'Warm the tube first so more vapour comes off',
      'Pour a little on your hand and smell that',
    ],
    why: 'Wafting brings a trace of vapour to you. Putting your nose to the tube means a full lungful of whatever is in there, which with a concentrated acid can burn the airway.',
    textbookQuery: 'smell of ethanoic acid vinegar odour laboratory precaution',
  },
  {
    q: 'You added NaHCO₃ to acetic acid and a gas came off. Which pair of results identifies it?',
    a: 3,
    o: [
      'It is colourless and odourless',
      'It burns with a blue flame and pops',
      'It relights a glowing splinter and smells sharp',
      'It turns lime water milky and puts out a burning splinter',
    ],
    why: 'Both tests together name carbon dioxide: the milkiness is CaCO₃, and CO₂ does not support combustion so the splinter goes out.',
    textbookQuery: 'ethanoic acid sodium hydrogen carbonate carbon dioxide lime water milky',
  },
  {
    q: 'Why is the vinegar smell of the acid worth recording as an observation?',
    a: 0,
    o: [
      'It is a physical property that helps identify ethanoic acid — household vinegar is 5–8% of it',
      'Because the smell shows how strong an acid it is',
      'Because acids all smell the same',
      'Because the smell tells you the exact pH',
    ],
    why: 'Smell is a property of the substance, not of its acidity. Dilute HCl in the same rack has no such smell, and the sharp vinegar odour is a clue to ethanoic acid.',
    textbookQuery: 'ethanoic acid commonly called acetic acid vinegar 5-8 per cent solution',
  },
  {
    q: 'Effervescence with sodium hydrogen carbonate is a standard test for…',
    a: 1,
    o: ['any liquid', 'an acid', 'a base', 'an alcohol'],
    why: 'Carbonates and hydrogencarbonates give CO₂ with acids and with nothing else on the bench. Fizzing with NaHCO₃ is therefore a test for the acidic nature of a substance.',
    textbookQuery: 'acids react with carbonates and hydrogencarbonates to give carbon dioxide',
  },
];

/** What the Aim and Theory card grounds itself on in the NCERT chapter. */
export const THEORY_QUERY =
  'properties of ethanoic acid acetic acid smell solubility litmus reaction with sodium hydrogencarbonate';
