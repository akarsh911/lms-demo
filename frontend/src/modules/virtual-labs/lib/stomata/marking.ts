import type { RichText } from '../types';

import { bubblesInField, overStained, visibleStomata, type OpticsView } from './peel';

/**
 * The procedure, the marks, the observation lines and the viva.
 *
 * The marks follow a CBSE-style split and every part carries the rule it is
 * awarded by, which travels with the attempt record so a grade can be audited
 * without reading this code.
 */

export interface ProcedureStep {
  id: StepId;
  title: string;
  prompt: string;
}

export type StepId = 'peel' | 'mount' | 'check' | 'low' | 'high' | 'record' | 'concl' | 'viva';

export const STEPS: readonly ProcedureStep[] = [
  { id: 'peel', title: 'Peel the epidermis', prompt: 'Forceps on the torn edge, then float it' },
  { id: 'mount', title: 'Mount the peel', prompt: 'Water, safranin, coverslip at an angle, blot' },
  { id: 'check', title: 'Check the mount', prompt: 'Bubbles and thickness, then onto the stage' },
  { id: 'low', title: 'Low power', prompt: 'Find it at 10× and centre it' },
  { id: 'high', title: 'High power', prompt: 'Switch to 40×, fine adjustment only' },
  { id: 'record', title: 'Record and label', prompt: 'What the field shows, how many, the parts' },
  { id: 'concl', title: 'Conclusion', prompt: 'Which surface, and why' },
  { id: 'viva', title: 'Viva voce', prompt: 'Five questions' },
];

/** Step indexes, named so nothing in the engine reads as `step === 4`. */
export const STEP = {
  peel: 0,
  mount: 1,
  check: 2,
  low: 3,
  high: 4,
  record: 5,
  concl: 6,
  viva: 7,
} as const;

export type PartKey = 'peel' | 'mount' | 'focus' | 'obs' | 'count' | 'label' | 'concl' | 'viva';

export const PART_KEYS: readonly PartKey[] = [
  'peel',
  'mount',
  'focus',
  'obs',
  'count',
  'label',
  'concl',
  'viva',
];

export const MAX: Readonly<Record<PartKey, number>> = {
  peel: 10,
  mount: 16,
  focus: 14,
  obs: 12,
  count: 8,
  label: 12,
  concl: 8,
  viva: 20,
};

export const PART_NAMES: Readonly<Record<PartKey, string>> = {
  peel: 'The peel',
  mount: 'Mounting',
  focus: 'Focusing',
  obs: 'Observation table',
  count: 'Stomata counted',
  label: 'Labelling the parts',
  concl: 'Conclusion',
  viva: 'Viva voce',
};

export const BASIS: Readonly<Record<PartKey, string>> = {
  peel: '4 for the lower epidermis, 4 for a thin unbroken peel, 2 for floating it in water before mounting',
  mount:
    '4 for water on the slide before the peel, 4 for safranin (2 if flooded with it), 4 for lowering the coverslip at an angle, 4 for blotting the excess; 2 off per mount discarded or broken',
  focus:
    '4 for finding it on low power first, 4 for centring before switching; 6 for a sharp high-power field, 4 if usable, 2 if poor; 6 off each time the objective is racked into the slide',
  obs: '2 per line, marked against what the field of view actually showed at the moment you submitted',
  count: '8 if the count is exact, 5 within 1, 2 within 2, against the stomata visible in that field',
  label: '3 per part correctly named on the magnified view',
  concl:
    '4 for naming the surface you actually peeled, 4 for the surface that really bears more stomata on a dicot leaf',
  viva: '4 per question, first answer counts',
};

export const VIVA_POINTS = MAX.viva / 5;
export const LABEL_POINTS = MAX.label / 4;

// ---------------------------------------------------------------------------
// The observation table
// ---------------------------------------------------------------------------

/**
 * One line of the record. The truth is read off the slide AS IT STANDS, never
 * from the textbook: claiming stomata on a peel that had none, or counting ones
 * that sit under a bubble, is marked wrong.
 */
export interface ObsOption {
  /** What is stored and marked, and what goes into the attempt record. */
  value: string;
  /** What the picker shows, where the full sentence will not fit. */
  short: string;
}

export interface ObsLine {
  id: string;
  q: string;
  o: readonly ObsOption[];
  truth: (v: OpticsView) => string;
}

const opt = (value: string, short = value): ObsOption => ({ value, short });

export const OBS: readonly ObsLine[] = [
  {
    id: 'stomata',
    q: 'Stomata in the field',
    o: [opt('seen'), opt('not seen')],
    truth: (v) => (visibleStomata(v).length > 0 ? 'seen' : 'not seen'),
  },
  {
    id: 'guard',
    q: 'The pore is bounded by',
    o: [
      opt('two bean-shaped guard cells', 'two guard cells'),
      opt('a ring of square cells', 'square cells'),
      opt('nothing — no pores seen', 'no pores'),
    ],
    truth: (v) => (visibleStomata(v).length > 0 ? 'two bean-shaped guard cells' : 'nothing — no pores seen'),
  },
  {
    id: 'chlG',
    q: 'Chloroplasts in the guard cells',
    o: [opt('present'), opt('absent')],
    truth: (v) =>
      visibleStomata(v).length > 0 && v.mic.bestHigh >= 0.55 && !overStained(v) ? 'present' : 'absent',
  },
  {
    id: 'chlE',
    q: 'Chloroplasts in the ordinary epidermal cells',
    o: [opt('present'), opt('absent')],
    truth: () => 'absent',
  },
  {
    id: 'bub',
    q: 'Air bubbles in the field',
    o: [opt('present'), opt('absent')],
    truth: (v) => (bubblesInField(v) ? 'present' : 'absent'),
  },
  {
    id: 'img',
    q: 'The high-power image was',
    o: [opt('sharp'), opt('blurred')],
    truth: (v) => (v.mic.bestHigh >= 0.6 ? 'sharp' : 'blurred'),
  },
];

// ---------------------------------------------------------------------------
// The labelled drawing
// ---------------------------------------------------------------------------

export type LabelId = 'guard' | 'pore' | 'epi' | 'chl' | 'wall';

export interface LabelOption {
  id: LabelId;
  t: string;
}

/** Five names for four pins: one of them is always a distractor. */
export const LABEL_OPTS: readonly LabelOption[] = [
  { id: 'guard', t: 'Guard cell' },
  { id: 'pore', t: 'Stoma (the pore)' },
  { id: 'epi', t: 'Epidermal cell' },
  { id: 'chl', t: 'Chloroplast' },
  { id: 'wall', t: 'Cell wall' },
];

export const PINS: readonly string[] = ['A', 'B', 'C', 'D'];

/** The four parts that are really pinned, shuffled per bench. */
export const PINNED: readonly LabelId[] = ['guard', 'pore', 'epi', 'chl'];

export function labelName(id: string | null | undefined): string {
  return LABEL_OPTS.find((o) => o.id === id)?.t ?? '—';
}

// ---------------------------------------------------------------------------
// The viva
// ---------------------------------------------------------------------------

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
    q: 'What is the main job of a stoma?',
    a: 1,
    o: [
      'To absorb water from the soil',
      'To let gases in and out of the leaf, and to let water vapour out in transpiration',
      'To give the leaf its green colour',
      'To carry food to the rest of the plant',
    ],
    why: 'A stoma is a pore for gas exchange — carbon dioxide in, oxygen out during photosynthesis — and almost all transpiration happens through it.',
    textbookQuery: 'stomata pores gaseous exchange transpiration leaf',
  },
  {
    q: 'Guard cells contain chloroplasts, but the epidermal cells around them do not. Why does that matter?',
    a: 2,
    o: [
      'Chloroplasts give the guard cells their bean shape',
      'The epidermal cells lost theirs as the leaf matured',
      'The guard cells photosynthesise; the sugar they make draws water in, they swell, and the pore opens',
      'It only makes them easier to see',
    ],
    why: 'Guard cells are the only epidermal cells that photosynthesise. The sugar made there pulls water in by osmosis, and because the inner wall is thicker the swollen cells bend apart and open the pore.',
    textbookQuery: 'guard cells swell water opening closing of stomatal pore',
  },
  {
    q: 'Why is the peel stained with safranin?',
    a: 0,
    o: [
      'The cells are almost colourless, and safranin dyes the walls and nuclei red so they can be seen',
      'It kills the cells so they stop moving',
      'It sticks the peel down to the slide',
      'It dissolves the chloroplasts',
    ],
    why: 'An unstained epidermal peel has almost no contrast under the microscope. Safranin reddens the cell walls and nuclei so the outlines — and the guard cells — stand out.',
    textbookQuery: 'temporary mount leaf peel stain safranin microscope',
  },
  {
    q: 'Why is the coverslip lowered at an angle with a needle?',
    a: 3,
    o: [
      'To spread the stain evenly',
      'To squeeze the water out from underneath',
      'To stop the coverslip cracking',
      'So the liquid spreads across and drives the air out ahead of it instead of trapping bubbles',
    ],
    why: 'Letting one edge touch first means the liquid creeps across and pushes the air out. Dropped flat, the coverslip traps air, and every bubble is a thick dark-rimmed circle hiding the cells beneath it.',
    textbookQuery: 'coverslip mounting needle air bubbles temporary mount',
  },
  {
    q: 'Why is the lower epidermis peeled when the leaf is a dicot?',
    a: 2,
    o: [
      'It is the only surface that takes a stain',
      'It has no chloroplasts anywhere',
      'It carries far more stomata than the upper epidermis, so one field of view shows many',
      'It is the only surface thin enough to peel',
    ],
    why: 'In a dorsiventral dicot leaf most stomata sit on the shaded lower surface, which cuts water loss. A peel of the upper epidermis shows almost none — which is itself worth recording.',
    textbookQuery: 'stomata more numerous lower surface of leaf transpiration water loss',
  },
];

/** What the Aim and Theory card grounds itself on in the NCERT chapter. */
export const THEORY_QUERY =
  'stomata guard cells epidermis of leaf gaseous exchange transpiration';
