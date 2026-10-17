import type { RichText } from '../types';

/**
 * The procedure, the marks, the conclusion and the viva for practical 12.
 *
 * The marks split and every basis string are the standalone bench's, unchanged:
 * a grade a teacher can audit has to be the same grade wherever it was earned.
 */

export interface ProcedureStep {
  title: string;
  prompt: string;
}

export const STEPS: readonly ProcedureStep[] = [
  { title: 'Set up the microscope', prompt: 'Lamp on, 10× objective swung in' },
  { title: 'Work through the slides', prompt: 'Mount, focus, centre, 40×, identify, label' },
  { title: 'Record the observations', prompt: 'Organism, process, what you saw' },
  { title: 'Conclude', prompt: 'Fission compared with budding' },
  { title: 'Viva voce', prompt: 'Five questions' },
];

/** Step indexes, named so nothing in the bench reads as `step === 2`. */
export const STEP = {
  setup: 0,
  slides: 1,
  record: 2,
  conclude: 3,
  viva: 4,
} as const;

/** Slides in the box. Six is what makes ident 24 and label 18. */
export const TRAY_SIZE = 6;

export type PartKey = 'setup' | 'focus' | 'care' | 'ident' | 'label' | 'seen' | 'concl' | 'viva';

export const PART_KEYS: readonly PartKey[] = [
  'setup',
  'focus',
  'care',
  'ident',
  'label',
  'seen',
  'concl',
  'viva',
];

export const MAX: Readonly<Record<PartKey, number>> = {
  setup: 6,
  focus: 12,
  care: 8,
  ident: 24,
  label: 18,
  seen: 6,
  concl: 6,
  viva: 20,
};

export const PART_NAMES: Readonly<Record<PartKey, string>> = {
  setup: 'Microscope set up',
  focus: 'Focus at high power (6 slides)',
  care: 'Care of the slides',
  ident: 'Organism and process (6 slides)',
  label: 'Labelling (18 pointers)',
  seen: 'What you saw (6 slides)',
  concl: 'Conclusion',
  viva: 'Viva voce',
};

export const BASIS: Readonly<Record<PartKey, string>> = {
  setup: '3 for the lamp on and 3 for the 10× objective in place when the first slide goes on the stage',
  focus: '2 per slide for a sharp, centred image at 40×; 1 if the best you managed was only half-focused',
  care: '8 − 4 for each slide cracked by racking the objective down onto it',
  ident: '4 per slide — 2 for the organism, 2 for the process — against what that slide really carries',
  label: '1 per pointer, against the structure the pointer actually sits on',
  seen: '1 per slide for the feature you recorded, against what was in the field',
  concl: '3 for what binary fission leaves behind, 3 for what budding leaves behind',
  viva: '4 per question, first answer counts',
};

// --- the thresholds the marks turn on ---------------------------------------

/** A view this good at 40× is a sharp, centred image: both focus marks. */
export const FOCUS_FULL = 0.8;
/** Half-focused, or half in the field: one mark. */
export const FOCUS_HALF = 0.4;
/** Below this you cannot make out what the organism is, so you cannot name it. */
export const IDENT_MIN_Q = 0.25;
/** Below this the parts are not resolved, so the pointers do not appear. */
export const LABEL_MIN_Q = 0.45;

export const FOCUS_MARKS_FULL = 2;
export const FOCUS_MARKS_HALF = 1;
/** Per slide: 2 for the organism, 2 for the process. */
export const ORGANISM_MARKS = 2;
export const PROCESS_MARKS = 2;
export const LABEL_MARKS = 1;
export const SEEN_MARKS = 1;

/** Off the setup marks: a slide mounted in the dark, or under high power. */
export const DARK_MOUNT_PENALTY = 3;
export const HIGH_MOUNT_PENALTY = 3;
/** Off the care marks, per coverslip put through by the objective. */
export const CRACK_PENALTY = 4;

export const CONCL_POINTS = MAX.concl / 2;
export const VIVA_POINTS = MAX.viva / 5;

/** Everything a slide can earn once the table is marked: 2 + 2 + 1. */
export const PER_SLIDE_TABLE_MARKS = ORGANISM_MARKS + PROCESS_MARKS + SEEN_MARKS;

export interface MultipleChoice {
  q: string;
  /** Index of the correct option. */
  a: number;
  o: readonly string[];
  why: RichText;
  /** What to look up in the NCERT chapter beside the explanation. */
  textbookQuery: string;
}

/** The examinable contrast between the two processes. First answer counts. */
export const CONCLUSION: readonly MultipleChoice[] = [
  {
    q: 'Binary fission in Amoeba ends with…',
    a: 1,
    o: [
      'one large parent and one small daughter cell',
      'two daughter cells of equal size, and no parent left over',
      'a chain of four cells still joined together',
      'a parent that keeps its nucleus and grows a new one',
    ],
    why:
      'The nucleus divides first, the cytoplasm then constricts at the middle, and the parent becomes **two equal ' +
      'daughters**. The parent as such stops existing.',
    textbookQuery: 'binary fission amoeba nucleus divides two daughter cells equal',
  },
  {
    q: 'After a bud separates from a yeast cell or a Hydra…',
    a: 2,
    o: [
      'the parent splits into two equal halves',
      'the parent dies once the bud leaves',
      'the parent stays as it was and can bud again',
      'the parent becomes the bud',
    ],
    why:
      'Budding is an **unequal** division: the outgrowth leaves and the parent carries on, which is exactly what ' +
      'separates it from binary fission.',
    textbookQuery: 'budding yeast hydra bud detaches parent survives asexual reproduction',
  },
];

export const VIVA: readonly MultipleChoice[] = [
  {
    q: 'What separates binary fission from budding?',
    a: 2,
    o: [
      'Fission needs two parents, budding needs one',
      'Fission happens only in animals, budding only in plants',
      'In fission the parent divides into two equal daughters; in budding an unequal outgrowth leaves a parent that carries on',
      'Fission produces different offspring, budding produces identical ones',
    ],
    why:
      'Fission splits the parent into **equal halves** and the parent is gone; a bud is a small **unequal** outgrowth ' +
      'that detaches from a parent which survives.',
    textbookQuery: 'binary fission budding difference equal daughter cells outgrowth parent',
  },
  {
    q: 'Why are both binary fission and budding called asexual reproduction?',
    a: 0,
    o: [
      'One parent is involved and no gametes fuse, so the offspring are genetically identical to it',
      'Because they happen only in single-celled organisms',
      'Because they need no water',
      'Because the offspring are always smaller than the parent',
    ],
    why:
      'Asexual reproduction means **one parent and no fusion of gametes**, so the new individual carries a copy of the ' +
      'parent’s DNA.',
    textbookQuery: 'asexual reproduction single parent no gametes offspring identical DNA copy',
  },
  {
    q: 'In the binary fission of Amoeba, what divides first?',
    a: 1,
    o: ['The contractile vacuole', 'The nucleus', 'The pseudopodia', 'The cell membrane at the waist'],
    why:
      'Karyokinesis comes before cytokinesis: the **nucleus** divides into two, and only then does the cytoplasm ' +
      'constrict at the middle.',
    textbookQuery: 'amoeba binary fission nucleus divides first cytoplasm constriction',
  },
  {
    q: 'Why do yeast buds sometimes appear as a chain of cells?',
    a: 3,
    o: [
      'The cells are dividing by fission at the same time',
      'The slide has been squashed under the coverslip',
      'Two parents have fused end to end',
      'A bud can start budding itself before it has pinched off from the parent',
    ],
    why:
      'When food is plentiful a bud grows its own bud before separating, so three or four cells stay attached in a ' +
      'short **chain**.',
    textbookQuery: 'yeast budding chain of cells bud grows own bud food plentiful',
  },
  {
    q: 'Why is a bud on Hydra described as a miniature adult?',
    a: 1,
    o: [
      'It is a single cell that will grow into an adult later',
      'It grows a hypostome, a mouth and tentacles of its own before it detaches',
      'It is exactly half the size of the parent',
      'It stays attached to the parent for life',
    ],
    why:
      'The bud develops the full body plan — **hypostome, mouth and a ring of tentacles** — while still on the parent, ' +
      'then drops off and feeds on its own.',
    textbookQuery: 'hydra bud hypostome tentacles miniature adult detaches regeneration budding',
  },
];

/** What the Aim and Theory card grounds itself on in the NCERT chapter. */
export const THEORY_QUERY =
  'asexual reproduction binary fission amoeba budding yeast hydra single parent prepared slide';
