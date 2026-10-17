import type { RichText } from '../types';

/**
 * The practical's steps, marks and viva.
 *
 * Marks, basis strings and deductions are the standalone bench's, unchanged: a
 * grade taken here has to mean the same thing as a grade taken there.
 */

export interface ProcedureStep {
  title: string;
  prompt: string;
}

export const STEPS: readonly ProcedureStep[] = [
  { title: 'Reaction (i)', prompt: 'Water on quicklime — feel the heat, test with litmus' },
  { title: 'Reaction (ii)', prompt: 'Heat the ferrous sulphate crystals over the burner' },
  { title: 'Reaction (iii)', prompt: 'Nails in CuSO₄ and a control tube — then let the clock run' },
  { title: 'Reaction (iv)', prompt: 'Sodium sulphate into barium chloride' },
  { title: 'Observation table', prompt: 'What each vessel actually showed' },
  { title: 'Classify', prompt: 'Name the type of each reaction' },
  { title: 'Viva voce', prompt: 'Five questions' },
];

/** Step indexes, named so nothing in the engine reads as `step === 4`. */
export const STEP = {
  lime: 0,
  fs: 1,
  nails: 2,
  dd: 3,
  record: 4,
  classify: 5,
  viva: 6,
} as const;

/** The four setup steps advance themselves from the state of the vessels. */
export const SETUP_STEPS = 4;

export type PartKey = 'setup' | 'heating' | 'tests' | 'observe' | 'classify' | 'viva';

export const PART_KEYS: readonly PartKey[] = ['setup', 'heating', 'tests', 'observe', 'classify', 'viva'];

export const MAX: Readonly<Record<PartKey, number>> = {
  setup: 12,
  heating: 10,
  tests: 6,
  observe: 28,
  classify: 24,
  viva: 20,
};

export const PART_NAMES: Readonly<Record<PartKey, string>> = {
  setup: 'Four reactions set up',
  heating: 'Heating (ii) safely',
  tests: 'Thermometer and litmus',
  observe: 'Observation table (4 reactions)',
  classify: 'Classifying the reactions',
  viva: 'Viva voce',
};

export const BASIS: Readonly<Record<PartKey, string>> = {
  setup:
    '3 per reaction set up with the right reagents in the right vessel — (iii) needs its control tube too — minus 3 for every vessel that received a reagent that does not belong in it',
  heating:
    '10 once the burner has stood under the ferrous sulphate tube: −5 for heating any other vessel, −5 for heating a stoppered tube, −5 for heating on until the tube cracked',
  tests:
    '3 for reading a thermometer in the quicklime tube while it was still hot, 3 for testing the lime water with red litmus paper',
  observe:
    '7 per reaction, marked tick by tick against what that vessel actually showed when you submitted: 7 × (matching ticks ÷ 6)',
  classify: '6 per reaction for the correct type of reaction',
  viva: '4 per question, first answer counts',
};

/** Marks that turn on one event, kept here so the basis and the rule sit together. */
export const PER_REACTION_SETUP = 3;
export const BAD_VESSEL_PENALTY = 3;
export const WRONG_HEAT_PENALTY = 5;
export const STOPPER_HEAT_PENALTY = 5;
export const CRACKED_PENALTY = 5;
export const THERMO_MARKS = 3;
export const LITMUS_MARKS = 3;
/** The burner has to have really stood under the tube, not been waved at it. */
export const HEAT_MINUTES_REQUIRED = 0.5;
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
    q: 'Quicklime is added to water and the beaker becomes too hot to hold. This reaction is…',
    a: 2,
    o: [
      'decomposition, and endothermic',
      'displacement, and exothermic',
      'combination, and exothermic',
      'double displacement, and exothermic',
    ],
    why: 'CaO + H₂O → Ca(OH)₂: two substances join to make one, so it is a **combination** reaction, and it gives out so much heat that the water can start to boil — **exothermic**.',
    textbookQuery: 'calcium oxide reacts vigorously with water quicklime slaked lime combination exothermic',
  },
  {
    q: 'Green ferrous sulphate crystals are heated. They first turn white because…',
    a: 1,
    o: [
      'iron(III) oxide has formed',
      'the crystals have lost their water of crystallisation',
      'sulphur dioxide has escaped',
      'the crystals have melted',
    ],
    why: 'FeSO₄·7H₂O is green because of the **water of crystallisation**. Driving that water off leaves anhydrous FeSO₄, which is white. Only stronger heating breaks the salt itself.',
    textbookQuery: 'ferrous sulphate crystals lose water of crystallisation on heating green colour',
  },
  {
    q: 'On stronger heating the white solid leaves a brown residue and a choking smell. The brown residue is…',
    a: 3,
    o: ['sulphur', 'iron(II) sulphate', 'iron filings', 'ferric oxide, Fe₂O₃'],
    why: '2FeSO₄ → Fe₂O₃ + SO₂ + SO₃. The brown residue is **ferric oxide**; the choking smell is the sulphur dioxide and sulphur trioxide burning off. One substance has broken into several, so this is **decomposition**.',
    textbookQuery: 'thermal decomposition ferrous sulphate ferric oxide sulphur dioxide sulphur trioxide',
  },
  {
    q: 'Iron nails are left in blue copper sulphate. Why is this called a displacement reaction?',
    a: 0,
    o: [
      'Iron is more reactive, so it takes copper’s place in the salt',
      'The two solutions exchange their ions',
      'One compound breaks into two',
      'Two elements combine into one compound',
    ],
    why: 'Fe + CuSO₄ → FeSO₄ + Cu. A free element (iron) pushes out a less reactive element (copper) from its compound, so exactly one element is displaced — that is **displacement**. The control tube, with no nail, stays blue.',
    textbookQuery: 'iron nail copper sulphate solution displacement more reactive metal displaces',
  },
  {
    q: 'Sodium sulphate and barium chloride give a white precipitate at once. That precipitate is…',
    a: 1,
    o: [
      'sodium chloride, and this is displacement',
      'barium sulphate, and this is double displacement',
      'barium hydroxide, and this is combination',
      'sulphur, and this is decomposition',
    ],
    why: 'Na₂SO₄ + BaCl₂ → BaSO₄↓ + 2NaCl. The two compounds swap their ions; **barium sulphate is insoluble**, so it drops out as a white precipitate. Sodium chloride stays dissolved.',
    textbookQuery: 'sodium sulphate barium chloride white precipitate barium sulphate double displacement',
  },
];

/** What the Aim and Theory card grounds itself on in the NCERT chapter. */
export const THEORY_QUERY =
  'types of chemical reactions combination decomposition displacement double displacement';
