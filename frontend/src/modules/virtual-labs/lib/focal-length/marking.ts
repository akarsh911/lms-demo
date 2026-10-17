import type { RichText } from '../types';

/**
 * The procedure, the marks and the viva. Marks total exactly 100, and every
 * part carries the rule it was marked by, which travels into the attempt
 * record so a grade can be audited without reading this code.
 */

export interface ProcedureStep {
  title: string;
  prompt: string;
}

export const STEPS: readonly ProcedureStep[] = [
  { title: 'Set up the mirror', prompt: 'Aim it at a distant object' },
  { title: 'Focal length of the mirror', prompt: 'Focus and measure, three trials' },
  { title: 'Set up the lens', prompt: 'Convex lens in the stand' },
  { title: 'Focal length of the lens', prompt: 'Focus and measure, three trials' },
  { title: 'Observation table', prompt: 'Mean of your three trials' },
  { title: 'Conclusion', prompt: 'Compare the two' },
  { title: 'Viva voce', prompt: 'Five questions' },
];

/** Step indexes, named so nothing in the engine reads as `step === 3`. */
export const STEP = {
  setupM: 0,
  mirror: 1,
  setupL: 2,
  lens: 3,
  mean: 4,
  concl: 5,
  viva: 6,
} as const;

/** Trials per component, as the board practical asks for. */
export const TRIALS = 3;

export type PartKey = 'setupM' | 'mirror' | 'setupL' | 'lens' | 'mean' | 'concl' | 'viva';

export const PART_KEYS: readonly PartKey[] = ['setupM', 'mirror', 'setupL', 'lens', 'mean', 'concl', 'viva'];

export const MAX: Readonly<Record<PartKey, number>> = {
  setupM: 8,
  mirror: 24,
  setupL: 8,
  lens: 24,
  mean: 8,
  concl: 8,
  viva: 20,
};

export const PART_NAMES: Readonly<Record<PartKey, string>> = {
  setupM: 'Mirror set-up',
  mirror: 'Concave mirror — 3 trials',
  setupL: 'Lens set-up',
  lens: 'Convex lens — 3 trials',
  mean: 'Mean focal lengths',
  concl: 'Conclusion',
  viva: 'Viva voce',
};

export const BASIS: Readonly<Record<PartKey, string>> = {
  setupM: '8 for aiming the mirror at a distant object; −4 for each unsafe or near object chosen',
  mirror:
    '8 per trial: 4 if the blur circle on the screen is ≤ 1.0 mm (2 if ≤ 2.5 mm), then 2 for the mirror position and 2 for the screen position, each read within one least count of the metre scale, 0.1 cm (1 if within 0.2 cm)',
  setupL: '8 for mounting the lens and aiming it at a distant object; −4 for each unsafe or near object chosen',
  lens: '8 per trial: 4 if the blur circle on the screen is ≤ 1.0 mm (2 if ≤ 2.5 mm), then 2 for the lens position and 2 for the screen position, each read within one least count of the metre scale, 0.1 cm (1 if within 0.2 cm)',
  mean: '4 per part: the mean must follow from your own three values of f, within 0.2 cm (2 if within 0.5 cm)',
  concl:
    '2 per part if your mean f is within 1.0 cm of this bench’s true focal length, 4 for the comparison that follows from your own two means',
  viva: '4 per question, first answer counts',
};

/** Marks for one trial, split as BASIS describes. */
export const TRIAL_MAX = 8;
export const VIVA_POINTS = 4;

/**
 * The three statements the conclusion chooses between. Which one is right is
 * decided by the student's OWN two means, not by the bench's true values: a
 * student who measured badly but read their own table correctly still earns
 * the comparison marks, and loses the accuracy marks instead.
 */
export const CONCLUSIONS: readonly string[] = [
  'The concave mirror has the shorter focal length, so it brings rays from a distant object to a focus in a shorter distance.',
  'The convex lens has the shorter focal length, so it brings rays from a distant object to a focus in a shorter distance.',
  'Both have the same focal length, because both were used with a distant object.',
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
    q: 'Light from a tree 120 m away is treated as a beam of rays parallel to the principal axis. Why?',
    a: 1,
    o: [
      'Because light from any source travels in parallel lines',
      'Because the tree is so far away that the cone of rays reaching the small mirror spreads over a negligible angle',
      'Because the concave mirror makes the incoming rays parallel before reflecting them',
      'Because a distant object is brighter than a near one',
    ],
    why: 'At 120 m, the rays that fall on a 5 cm mirror differ in direction by about two hundredths of a degree — parallel for this purpose. Parallel rays converge at the **principal focus**, which is why the sharp image lands in the focal plane.',
    textbookQuery: 'parallel rays parallel to the principal axis converge at the principal focus concave mirror',
  },
  {
    q: 'The image of the distant tree caught on the screen is…',
    a: 1,
    o: [
      'virtual, erect and enlarged',
      'real, inverted and very much smaller than the tree',
      'real, erect and the same size as the tree',
      'virtual, inverted and smaller',
    ],
    why: 'The rays really meet on the card — that is what makes it **real**, and only a real image can be caught on a screen. They cross on the way, so it is **inverted**, and its height is the object height × v/u, which for a distant object is a centimetre or so.',
    textbookQuery: 'real inverted image formed at the focus object at infinity highly diminished point sized',
  },
  {
    q: 'Why must the screen be moved back and forth instead of simply being placed in front of the mirror?',
    a: 2,
    o: [
      'To keep the screen out of the light falling on the mirror',
      'To make the image larger before it is measured',
      'Because only at one position do the rays actually meet; there the image is sharpest, and that distance from the pole is f',
      'Because the screen has to be at half the radius of curvature of the screen itself',
    ],
    why: 'Away from the image plane every point of the object spreads into a blur circle whose size grows with the defocus. The position of sharpest image marks where the rays converge, so screen-to-pole distance = **f**.',
    textbookQuery: 'focal length distance between pole and principal focus sharp image on screen',
  },
  {
    q: 'The tree is replaced by a candle 40 cm in front of the same concave mirror. The sharp image now forms…',
    a: 1,
    o: [
      'at the same place — at the focus, as before',
      'farther from the mirror than the focus',
      'nearer the mirror than the focus',
      'nowhere: a concave mirror cannot image a near object on a screen',
    ],
    why: '1/v = 1/f − 1/u. Bringing the object in from infinity pushes the image out **beyond F**, so the distance you would measure is v, not f. That is exactly why the object has to be distant.',
    textbookQuery: 'mirror formula 1/v + 1/u = 1/f object between infinity and centre of curvature',
  },
  {
    q: 'A classmate suggests using the Sun as the distant object and looking at it through the convex lens. You should…',
    a: 2,
    o: [
      'agree — the Sun is the most distant object available',
      'agree, but look for only a second or two',
      'refuse: never look at the Sun through a lens or a mirror — use a distant tree or window instead',
      'agree, and just squint while looking',
    ],
    why: 'A lens or mirror concentrates sunlight enough to char paper, and focused on the retina it burns it permanently, with **no pain to warn you**. The standard object for this experiment is a distant tree or window.',
    textbookQuery: 'convex lens converging sunlight at focus burning paper caution',
  },
];

/** What the Aim and Theory card grounds itself on in the NCERT chapter. */
export const THEORY_QUERY =
  'focal length of a concave mirror distance between the pole and the principal focus image of a distant object';
