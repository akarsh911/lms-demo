import type { RichText } from '../types';

import type { PartId } from './seed-model';

/**
 * The procedure, the marks and the viva for practical 14.
 *
 * The marks split, every basis string and the viva are the standalone bench's,
 * unchanged: a grade a teacher can audit has to be the same grade wherever it
 * was earned.
 */

export interface ProcedureStep {
  title: string;
  prompt: string;
}

export const STEPS: readonly ProcedureStep[] = [
  { title: 'Soak a seed', prompt: 'Overnight in water — the clock does it' },
  { title: 'Examine the outside', prompt: 'Under the lens: hilum and micropyle' },
  { title: 'Remove the seed coat', prompt: 'Forceps, on a swollen seed' },
  { title: 'Split it open', prompt: 'Needle, along the natural plane' },
  { title: 'Label the parts', prompt: 'Six labels on the magnified view' },
  { title: 'Observation table', prompt: 'What each part is and becomes' },
  { title: 'Conclusion', prompt: 'Dicot, non-endospermic, radicle first' },
  { title: 'Viva voce', prompt: 'Five questions' },
];

/** Step indexes, named so nothing in the bench reads as `step === 3`. */
export const STEP = {
  soak: 0,
  outside: 1,
  coat: 2,
  split: 3,
  label: 4,
  table: 5,
  concl: 6,
  viva: 7,
} as const;

export type PartKey = 'prep' | 'external' | 'dissect' | 'label' | 'table' | 'concl' | 'viva';

export const PART_KEYS: readonly PartKey[] = ['prep', 'external', 'dissect', 'label', 'table', 'concl', 'viva'];

export const MAX: Readonly<Record<PartKey, number>> = {
  prep: 10,
  external: 10,
  dissect: 10,
  label: 30,
  table: 14,
  concl: 6,
  viva: 20,
};

export const PART_NAMES: Readonly<Record<PartKey, string>> = {
  prep: 'Soaking the seed',
  external: 'Hilum and micropyle found',
  dissect: 'Dissection',
  label: 'Parts labelled (6)',
  table: 'Observation table',
  concl: 'Conclusion',
  viva: 'Viva voce',
};

export const BASIS: Readonly<Record<PartKey, string>> = {
  prep: '10 if the seed you dissected had swollen fully (about 8 h in water or more), 5 if it was half swollen, 0 if it was dissected dry',
  external: '5 each for finding the hilum and the micropyle on the intact coat with the lens, −2 for every stray tap after the first two',
  dissect: '5 for peeling the testa off a properly soaked seed and 5 for splitting it along its natural plane, −3 for every seed ruined and −1 for every coat torn',
  label: '5 per label dropped on the part itself — testa, hilum, micropyle, cotyledon, plumule, radicle — marked against where that part actually is on your seed',
  table: '1 per cell: what each of the seven parts is, and what it does or becomes',
  concl: '1 per blank in the three conclusion sentences',
  viva: '4 per question, first answer counts',
};

/** Marks off the dissection for each seed ruined, and for each coat torn. */
export const RUIN_PENALTY = 3;
export const TEAR_PENALTY = 1;
/** Stray taps with the lens allowed before they start costing. */
export const FREE_MISSES = 2;
export const MISS_PENALTY = 2;
export const LABEL_MARKS = 5;
export const VIVA_POINTS = MAX.viva / 5;

/** Swelling at which the soaking is fully credited, and half credited. */
export const PREP_FULL = 0.88;
export const PREP_HALF = 0.6;

/** The six labels, in the order the chips are shown. The embryo axis is table-only. */
export type LabelId = Extract<PartId, 'testa' | 'hilum' | 'micropyle' | 'cotyledon' | 'plumule' | 'radicle'>;

export const LABELS: readonly LabelId[] = ['testa', 'hilum', 'micropyle', 'cotyledon', 'plumule', 'radicle'];

export const PART_NAME: Readonly<Record<PartId, string>> = {
  testa: 'seed coat (testa)',
  hilum: 'hilum',
  micropyle: 'micropyle',
  cotyledon: 'cotyledon',
  axis: 'embryo axis',
  plumule: 'plumule',
  radicle: 'radicle',
};

export interface TableRow {
  id: PartId;
  part: string;
  is: string;
  does: string;
}

export const TABLE_ROWS: readonly TableRow[] = [
  { id: 'testa', part: 'Seed coat (testa)', is: 'tough outer covering', does: 'protects the embryo inside' },
  { id: 'hilum', part: 'Hilum', is: 'oval scar on the flat edge', does: 'where the seed was joined to the pod' },
  { id: 'micropyle', part: 'Micropyle', is: 'tiny pore beside the hilum', does: 'lets water and air into the seed' },
  { id: 'cotyledon', part: 'Cotyledons (two)', is: 'two fleshy halves', does: 'store the food for the seedling' },
  { id: 'axis', part: 'Embryo axis', is: 'short axis of the embryo', does: 'joins the plumule to the radicle' },
  { id: 'plumule', part: 'Plumule', is: 'feathery tip of the axis', does: 'grows into the shoot' },
  { id: 'radicle', part: 'Radicle', is: 'pointed tip of the axis', does: 'grows into the root' },
];

/** The two option lists, deliberately out of row order so the table is not a diagonal. */
export const POOL_IS: readonly string[] = [3, 6, 0, 4, 2, 5, 1].map((i) => TABLE_ROWS[i]!.is);
export const POOL_DOES: readonly string[] = [5, 2, 6, 0, 3, 1, 4].map((i) => TABLE_ROWS[i]!.does);

export type ConclId = 'c1' | 'c2' | 'c3';
export type ConclSide = 'a' | 'b';

export interface ConclSentence {
  id: ConclId;
  pre: string;
  mid: string;
  post: string;
  a: { o: readonly string[]; k: string };
  b: { o: readonly string[]; k: string };
}

export const CONCL: readonly ConclSentence[] = [
  {
    id: 'c1',
    pre: 'The embryo has',
    mid: 'cotyledons, so this seed is a',
    post: 'seed.',
    a: { o: ['one', 'two', 'three'], k: 'two' },
    b: { o: ['monocot', 'dicot'], k: 'dicot' },
  },
  {
    id: 'c2',
    pre: 'The food for the seedling is stored in the',
    mid: ', so the seed is',
    post: '.',
    a: { o: ['endosperm', 'cotyledons', 'seed coat'], k: 'cotyledons' },
    b: { o: ['endospermic', 'non-endospermic'], k: 'non-endospermic' },
  },
  {
    id: 'c3',
    pre: 'On germination the',
    mid: 'comes out first, through the',
    post: '.',
    a: { o: ['plumule', 'radicle'], k: 'radicle' },
    b: { o: ['hilum', 'micropyle'], k: 'micropyle' },
  },
];

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
    q: 'Why is the seed soaked in water overnight before this experiment?',
    a: 1,
    o: [
      'To kill the embryo so it stops growing',
      'To soften the seed coat and swell the cotyledons, so the seed opens without breaking the embryo',
      'To wash the hilum off the seed',
      'To dissolve the food stored in the cotyledons',
    ],
    why:
      'Water enters through the **micropyle**, softens the testa and swells the cotyledons, so the coat peels and the ' +
      'seed parts along its natural plane instead of shattering.',
    textbookQuery: 'seed germination water absorbed micropyle seed coat cotyledons embryo',
  },
  {
    q: 'What are the two cotyledons of a gram or bean seed for?',
    a: 2,
    o: [
      'They are the first true leaves of the plant',
      'They protect the seed like a second coat',
      'They store food and feed the young seedling until it can make its own',
      'They become the root system',
    ],
    why:
      'In a dicot the food is stored in the **cotyledons** themselves, which is why such a seed is called ' +
      '**non-endospermic**.',
    textbookQuery: 'cotyledons store food seedling dicot seed embryo',
  },
  {
    q: 'The plumule and the radicle grow into…',
    a: 0,
    o: [
      'the shoot and the root respectively',
      'the root and the shoot respectively',
      'two cotyledons',
      'the seed coat and the hilum',
    ],
    why:
      'The **plumule** is the feathery upper end of the embryo axis and becomes the shoot; the **radicle** is the ' +
      'pointed lower end and becomes the root.',
    textbookQuery: 'plumule radicle embryo shoot root seed germination',
  },
  {
    q: 'What is the function of the micropyle?',
    a: 3,
    o: [
      'It attaches the seed to the pod',
      'It stores food for the embryo',
      'It is the scar left when the seed coat is peeled',
      'It is a tiny pore that lets water and air in, and the radicle out',
    ],
    why:
      'Press a soaked seed and a drop of water is forced out of the micropyle — the same pore the water went in ' +
      'through, and the one the radicle emerges from.',
    textbookQuery: 'micropyle pore water entry seed germination radicle emerges',
  },
  {
    q: 'Why is a pea, gram or kidney bean seed called a dicot seed?',
    a: 1,
    o: [
      'Because it has two seed coats',
      'Because its embryo has two cotyledons',
      'Because it germinates in two days',
      'Because it has two micropyles',
    ],
    why: 'Di- means two: the embryo carries **two cotyledons**. A maize grain has one, so it is a monocot.',
    textbookQuery: 'dicot monocot two cotyledons seed embryo classification',
  },
];

/**
 * What the Aim and Theory card grounds itself on in the NCERT chapter.
 *
 * Worded after the book's own Activity 7.6 rather than after the anatomy, which
 * Class 10 hardly names: asking for the parts ranks the activity third, asking
 * the way the activity asks brings it to second, behind a long chunk on
 * pollination that carries seed formation in its tail and so outscores
 * everything here whatever it is asked. That ranking is the engine's to make.
 */
export const THEORY_QUERY = 'soaked seed cut open different parts';
