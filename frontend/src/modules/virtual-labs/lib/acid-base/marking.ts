import type { RichText } from '../types';

import type { FizzLevel, GasClaim, LitmusObs } from './chemistry';

/**
 * The procedure, the marks and the questions.
 *
 * Every part carries the one-line rule it is marked by, and that rule travels
 * with the marks into the attempt record, so a teacher can check a grade
 * without reading any of this.
 */

export interface ProcedureStep {
  title: string;
  prompt: string;
}

export const STEPS: readonly ProcedureStep[] = [
  { title: 'Fill the eight tubes', prompt: '5 mL of the solution on each label' },
  { title: 'The litmus tests', prompt: 'Tubes A–D, blue and red litmus' },
  { title: 'Zinc with both', prompt: 'The two zinc tubes, then test the gas' },
  { title: 'Sodium carbonate', prompt: 'The two carbonate tubes, then lime water' },
  { title: 'Observation table', prompt: 'Write down what each tube showed' },
  { title: 'Conclusions', prompt: 'What identifies an acid, a base' },
  { title: 'Viva voce', prompt: 'Five questions' },
];

/** Step indexes, named so nothing in the engine reads as `step === 3`. */
export const STEP = {
  pour: 0,
  litmus: 1,
  zinc: 2,
  carbonate: 3,
  record: 4,
  conclusions: 5,
  viva: 6,
} as const;

export type PartKey = 'setup' | 'tests' | 'gas' | 'obs' | 'concl' | 'viva';

export const PART_KEYS: readonly PartKey[] = ['setup', 'tests', 'gas', 'obs', 'concl', 'viva'];

export const MAX: Readonly<Record<PartKey, number>> = {
  setup: 10,
  tests: 16,
  gas: 10,
  obs: 32,
  concl: 12,
  viva: 20,
};

export const PART_NAMES: Readonly<Record<PartKey, string>> = {
  setup: 'Tubes filled',
  tests: 'Eight tests set up',
  gas: 'Gases identified',
  obs: 'Observation table (8 rows)',
  concl: 'Conclusions',
  viva: 'Viva voce',
};

export const BASIS: Readonly<Record<PartKey, string>> = {
  setup: '10 − 2 for every tube that was given a solution its label does not call for',
  tests:
    '2 for each of the 8 tests set up as its tube calls for: 4 litmus, zinc in two tubes, sodium carbonate in two',
  gas: '5 for identifying H₂ in the zinc + acid tube with a burning splinter, 5 for identifying CO₂ in the carbonate + acid tube with lime water',
  obs: '4 per row against what that tube actually showed — litmus rows 4 for the colour, gas rows 2 for the effervescence and 2 for the gas you identified; “not tested” is right only if you did not test',
  concl: '4 per conclusion',
  viva: '4 per question, first answer counts',
};

/** Marks per correct answer, from the totals above. */
export const CONCL_POINTS = 4;
export const VIVA_POINTS = 4;

// ---------------------------------------------------------------------------
// How every observation reads, in the student's own words
// ---------------------------------------------------------------------------

export const LITMUS_WORDS: Readonly<Record<LitmusObs, string>> = {
  none: 'no litmus added',
  mixed: 'both litmus solutions in one tube',
  purple: 'litmus went purple',
  'blue-blue': 'blue litmus stayed blue',
  'blue-red': 'blue litmus turned red',
  'red-red': 'red litmus stayed red',
  'red-blue': 'red litmus turned blue',
};

export const FIZZ_WORDS: Readonly<Record<FizzLevel, string>> = {
  none: 'no bubbles',
  slow: 'a few slow bubbles',
  brisk: 'brisk effervescence',
};

export const GAS_WORDS: Readonly<Record<GasClaim, string>> = {
  H2: 'hydrogen — it burned with a pop',
  CO2: 'carbon dioxide — lime water went milky',
  none: 'tested, but no gas was found',
  untested: 'I did not test the gas',
};

/** What a student may write in a litmus row. */
export const LITMUS_OPTIONS: readonly LitmusObs[] = [
  'none',
  'blue-blue',
  'blue-red',
  'red-red',
  'red-blue',
  'purple',
];
export const FIZZ_OPTIONS: readonly FizzLevel[] = ['none', 'slow', 'brisk'];
export const GAS_OPTIONS: readonly GasClaim[] = ['untested', 'H2', 'CO2', 'none'];

export const SPLINTER_WORDS = {
  pop: 'the gas burned with a sharp **pop**',
  out: 'the flame **went out**',
  burns: 'the splinter went on burning — nothing happened',
} as const;

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export interface Question {
  q: string;
  /** Index of the correct option. */
  a: number;
  o: readonly string[];
  why: RichText;
  /** What to look up in the NCERT chapter beside the explanation. */
  textbookQuery: string;
}

/** The three conclusions, drawn from the eight tests the student has just done. */
export const CONCLUSIONS: readonly Question[] = [
  {
    q: 'Which single observation shows that a solution is an acid?',
    a: 1,
    o: [
      'It gives a gas with zinc',
      'It turns blue litmus red',
      'It is colourless',
      'It gives a gas with sodium carbonate and no gas with zinc',
    ],
    why: 'Only the litmus change is decisive. Zinc gave a gas with the acid _and_ with the alkali, so effervescence with zinc tells you nothing on its own.',
    textbookQuery: 'acids turn blue litmus red indicator test for acids',
  },
  {
    q: 'Which single observation shows that a solution is a base?',
    a: 2,
    o: [
      'It gives no gas with zinc',
      'It turns blue litmus red',
      'It turns red litmus blue',
      'It gives no gas with sodium carbonate',
    ],
    why: 'Red litmus turning blue is the test for a base. Giving no gas with sodium carbonate only rules an acid out — water would behave the same way.',
    textbookQuery: 'bases turn red litmus blue indicator test for bases',
  },
  {
    q: 'Zinc gave a gas with dilute HCl and with dilute NaOH. Those two gases were…',
    a: 0,
    o: [
      'hydrogen in both tubes — zinc reacts with acids and with alkalis',
      'hydrogen from the acid and carbon dioxide from the alkali',
      'carbon dioxide in both tubes',
      'hydrogen from the acid; the alkali gave no gas at all',
    ],
    why: 'Zn + 2HCl → ZnCl₂ + H₂ and Zn + 2NaOH → Na₂ZnO₂ + H₂. Both pop with a burning splinter; the alkali is simply slower.',
    textbookQuery: 'metals react with acids and with sodium hydroxide to give hydrogen gas',
  },
];

export const VIVA: readonly Question[] = [
  {
    q: 'Zinc gives hydrogen with dilute HCl and also with dilute NaOH. Why does that matter in this experiment?',
    a: 2,
    o: [
      'It shows zinc is a very reactive metal',
      'It proves NaOH is really an acid',
      'Effervescence with zinc alone cannot tell you whether the solution is an acid or a base',
      'It means the zinc was impure',
    ],
    why: 'Zinc is amphoteric — it reacts with acids and with alkalis, giving hydrogen both times. Only the litmus test separates the two solutions.',
    textbookQuery: 'metal reacts with sodium hydroxide hydrogen gas zinc',
  },
  {
    q: 'A gas burns with a sharp pop when a burning splinter is held at the mouth of the tube. The gas is…',
    a: 1,
    o: ['carbon dioxide', 'hydrogen', 'oxygen', 'nitrogen'],
    why: 'Hydrogen burns explosively in air: 2H₂ + O₂ → 2H₂O. That small explosion is the pop. Oxygen would make the splinter burn more brightly instead.',
    textbookQuery: 'hydrogen gas burns with a pop sound test candle',
  },
  {
    q: 'Carbon dioxide turns lime water milky because…',
    a: 3,
    o: [
      'it bleaches the lime water',
      'it dissolves the calcium hydroxide',
      'it makes the lime water boil',
      'insoluble calcium carbonate is formed: Ca(OH)₂ + CO₂ → CaCO₃ + H₂O',
    ],
    why: 'The milkiness is a white precipitate of calcium carbonate. Passing excess CO₂ through it dissolves the precipitate again as calcium hydrogen carbonate.',
    textbookQuery: 'carbon dioxide turns lime water milky calcium carbonate',
  },
  {
    q: 'Red litmus solution is added to a solution and stays red. What can you conclude?',
    a: 1,
    o: [
      'The solution is definitely an acid',
      'The solution is not basic — it could be acidic or neutral',
      'The solution is definitely neutral',
      'Nothing at all can be concluded',
    ],
    why: 'Red litmus only reports bases. To show the solution is an acid you need blue litmus to turn red as well.',
    textbookQuery: 'litmus indicator acidic basic neutral solution',
  },
  {
    q: 'You add a solid to dilute HCl and see brisk effervescence. Before you write “carbon dioxide” in your table you must…',
    a: 0,
    o: [
      'test the gas — pass it through lime water or hold a burning splinter at the mouth',
      'weigh the solid',
      'wait for the fizzing to stop',
      'nothing: fizzing with an acid always means carbon dioxide',
    ],
    why: 'Zinc, magnesium and iron all fizz with dilute acid and give hydrogen, not carbon dioxide. Effervescence says a gas is coming off; only a test says which gas.',
    textbookQuery: 'metal carbonate with acid carbon dioxide effervescence test',
  },
];

/** What the Aim and Theory card grounds itself on in the NCERT chapter. */
export const THEORY_QUERY =
  'acids and bases react with metals and metal carbonates litmus indicator hydrogen carbon dioxide';
