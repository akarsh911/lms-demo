import type { RichText } from '../types';

/**
 * The procedure, the marks, the interpretation and the viva for practical 11.
 *
 * The split, every tolerance and every basis string are the standalone bench's,
 * unchanged: a grade a teacher can audit has to be the same grade wherever it
 * was earned.
 */

export interface ProcedureStep {
  title: string;
  prompt: string;
}

/** The three angles of incidence the practical asks for. */
export const TARGETS = [30, 45, 60] as const;

export const STEPS: readonly ProcedureStep[] = [
  { title: 'Fix the paper and slab', prompt: 'Outline, point O and the normal' },
  { title: 'Trace at 30°', prompt: 'Four pins, then join the points' },
  { title: 'Trace at 45°', prompt: 'Four pins, then join the points' },
  { title: 'Trace at 60°', prompt: 'Four pins, then join the points' },
  { title: 'Interpret', prompt: 'What the three rows show' },
  { title: 'Viva voce', prompt: 'Five questions' },
];

/** Step indexes, named so nothing in the bench reads as `step === 4`. */
export const STEP = {
  setup: 0,
  firstTrial: 1,
  conclusions: 4,
  viva: 5,
} as const;

export type PartKey = 'setup' | 'pins' | 'angles' | 'index' | 'concl' | 'viva';

export const PART_KEYS: readonly PartKey[] = ['setup', 'pins', 'angles', 'index', 'concl', 'viva'];

export const MAX: Readonly<Record<PartKey, number>> = {
  setup: 8,
  pins: 15,
  angles: 27,
  index: 10,
  concl: 20,
  viva: 20,
};

export const PART_NAMES: Readonly<Record<PartKey, string>> = {
  setup: 'Setup and outline',
  pins: 'Pin method (3 traces)',
  angles: 'Angles read (9)',
  index: 'Refractive index from your trace',
  concl: 'Interpretation',
  viva: 'Viva voce',
};

export const BASIS: Readonly<Record<PartKey, string>> = {
  setup:
    '4 for the slab squared on the paper, 4 for its outline, the point of incidence and the normal drawn before the first pin goes in',
  pins:
    '5 per trace: 2 for both incident pins on the ray you drew, 3 for both emergent pins on the ray the light really leaves along — within 2 mm full, within 4 mm half, halved again if a pair is closer than 2 cm',
  angles:
    '3 per angle read with the protractor, against your own trace: within 2° = 3, within 4° = 1.5 (a protractor reads to 1°)',
  index:
    'sin i / sin r averaged over your three traces against the slab’s n = 1.50: within 0.05 = 10, within 0.10 = 6, within 0.20 = 3',
  concl: '5 per statement; the first is marked against your own three rows, not the textbook',
  viva: '4 per question, first answer counts',
};

/** Deducted from the setup marks for tracing the outline after the pins went in. */
export const LATE_OUTLINE_PENALTY = 4;

/** Marks one angle earns, by how far the reading is from the student's own trace. */
export function angleMarksFor(error: number): number {
  return error <= 2 + 1e-9 ? 3 : error <= 4 + 1e-9 ? 1.5 : 0;
}

/** Marks the mean refractive index earns, by how far it is from n = 1.50. */
export function indexMarksFor(error: number): number {
  return error <= 0.05 ? MAX.index : error <= 0.1 ? 6 : error <= 0.2 ? 3 : 0;
}

/** Marks a pair of pins earns: `worst` is their distance from the line, in mm. */
export function pinMarksFor(worstMm: number, full: number): number {
  return worstMm <= 2 ? full : worstMm <= 4 ? full / 2 : 0;
}

/** Two pins closer than 2 cm fix a direction poorly, so the pair is halved. */
export const PIN_SPREAD_CM = 2;

export const CONCL_POINTS = MAX.concl / 4;
export const VIVA_POINTS = MAX.viva / 5;

export interface ConclusionQuestion {
  q: string;
  /** Index of the correct option, when the textbook decides it. */
  a?: number;
  /** Marked against the student's OWN three rows rather than the textbook. */
  own?: boolean;
  o: readonly string[];
  why: RichText;
}

export const CONCL: readonly ConclusionQuestion[] = [
  {
    q: 'Comparing your three rows, the angle of emergence is…',
    own: true,
    o: [
      'always several degrees larger than the angle of incidence',
      'equal to the angle of incidence, within the error of a protractor',
      'always several degrees smaller than the angle of incidence',
      'not related to the angle of incidence',
    ],
    why:
      'The two faces are parallel, so the bending at the second face exactly undoes the bending at the first: ∠e = ∠i. If your own rows say otherwise, the pins were not in line.',
  },
  {
    q: 'Going in and coming out, the ray bends…',
    a: 0,
    o: [
      'towards the normal on entering the glass, away from the normal on leaving it',
      'away from the normal on entering, towards the normal on leaving',
      'towards the normal at both faces',
      'not at all at either face',
    ],
    why:
      'Air → glass is rarer → denser, so the light slows and turns **towards** the normal. Glass → air is the other way round.',
  },
  {
    q: 'The emergent ray is…',
    a: 1,
    o: [
      'along the same straight line as the incident ray',
      'parallel to the incident ray but shifted sideways',
      'perpendicular to the incident ray',
      'bent permanently towards the normal',
    ],
    why:
      'Equal angles at parallel faces leave the direction unchanged; what is left is the sideways shift — the **lateral displacement**. The slab displaces the ray, it does not deviate it.',
  },
  {
    q: 'The lateral displacement gets larger when…',
    a: 2,
    o: [
      'the angle of incidence is made smaller',
      'a thinner slab is used',
      'the angle of incidence is increased, or a thicker slab is used',
      'the pins are pushed further apart',
    ],
    why:
      'd = t·sin(i − r)/cos r. It grows with the thickness t and with the angle of incidence, and it is **zero at normal incidence**.',
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
    q: 'Why is the emergent ray parallel to the incident ray?',
    a: 2,
    o: [
      'Because glass does not bend light at all',
      'Because the ray reflects twice inside the slab',
      'Because the two faces are parallel, so the second refraction undoes the first and ∠e = ∠i',
      'Because the slab is thin',
    ],
    why:
      'The normals at the two parallel faces are parallel, so the angle inside is the angle of refraction at one face and the angle of incidence at the other — the bending cancels exactly.',
    textbookQuery: 'refraction through a rectangular glass slab emergent ray parallel to incident ray',
  },
  {
    q: 'The lateral displacement of the ray depends on…',
    a: 1,
    o: [
      'only the length of the slab',
      'the thickness of the slab, the angle of incidence and the refractive index',
      'only the colour of the paper',
      'the distance between the two pins',
    ],
    why:
      'd = t·sin(i − r)/cos r, and r comes from n. A thicker slab, a larger angle of incidence or a denser glass all shift the ray further.',
    textbookQuery: 'lateral displacement glass slab thickness angle of incidence refractive index',
  },
  {
    q: 'Why does the ray bend towards the normal on entering the glass?',
    a: 3,
    o: [
      'Glass is heavier than air',
      'The ray is attracted to the glass surface',
      'Light speeds up in glass',
      'Light travels more slowly in glass, so going from a rarer to a denser medium turns it towards the normal',
    ],
    why:
      'Refraction is a change of speed. Entering the optically denser medium, sin i / sin r = n > 1, so r < i.',
    textbookQuery: 'light travels from rarer to denser medium bends towards the normal speed of light',
  },
  {
    q: 'What are the four pins for?',
    a: 0,
    o: [
      'Two pins fix the direction of the incident ray; the other two are placed in line with their images to fix the emergent ray',
      'They hold the glass slab down',
      'They hold the paper on the drawing board',
      'They mark the corners of the slab',
    ],
    why:
      'Two points define a straight line. You see P₁ and P₂ through the glass along the emergent ray, so pins put in line with those images lie on the emergent ray.',
    textbookQuery: 'pins method tracing path of ray of light through glass slab activity',
  },
  {
    q: 'A ray falls on the slab at 0°, along the normal. What happens?',
    a: 1,
    o: [
      'It bends towards the normal and comes out displaced',
      'It goes straight through undeviated and undisplaced',
      'It is totally internally reflected',
      'It comes out at 90°',
    ],
    why:
      'With i = 0, sin i = 0, so sin r = 0 and r = 0. Nothing bends and d = 0 — the only ray a slab leaves completely alone.',
    textbookQuery: 'ray incident normally on glass slab no refraction angle of incidence zero',
  },
];

/** What the Aim and Theory card grounds itself on in the NCERT chapter. */
export const THEORY_QUERY =
  'refraction of light through a rectangular glass slab angle of incidence refraction emergence Snell’s law';
