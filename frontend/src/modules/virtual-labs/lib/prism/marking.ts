import type { RichText } from '../types';

import { APEX } from './optics';

/**
 * The practical's steps, marks, conclusion and viva.
 *
 * The marks and the wording of every basis are the standalone bench's, kept
 * word for word: a grade is only meaningful with the rule that produced it, and
 * that rule travels into the attempt record.
 */

export interface ProcedureStep {
  title: string;
  prompt: string;
}

export const STEPS: readonly ProcedureStep[] = [
  { title: 'Fix the paper and prism', prompt: 'Trace the outline first' },
  { title: 'Trace three rays', prompt: 'Pin, sight through, join up' },
  { title: 'Measure the angles', prompt: 'i, e and D with the protractor' },
  { title: 'Read the deviation curve', prompt: 'Least deviation, and what it means' },
  { title: 'Viva voce', prompt: 'Five questions' },
];

/** Step indexes, named so nothing in the engine reads as `step === 2`. */
export const STEP = {
  fix: 0,
  trace: 1,
  measure: 2,
  concl: 3,
  viva: 4,
} as const;

/** Three rays, nine readings. */
export const RAYS = 3;
export const READINGS = 9;

export type PartKey = 'outline' | 'pins' | 'trace' | 'measure' | 'consist' | 'concl' | 'viva';

export const PART_KEYS: readonly PartKey[] = [
  'outline',
  'pins',
  'trace',
  'measure',
  'consist',
  'concl',
  'viva',
];

export const MAX: Readonly<Record<PartKey, number>> = {
  outline: 5,
  pins: 9,
  trace: 18,
  measure: 27,
  consist: 9,
  concl: 12,
  viva: 20,
};

export const PART_NAMES: Readonly<Record<PartKey, string>> = {
  outline: 'Outline traced',
  pins: 'Pinning',
  trace: 'Sighting the emergent ray',
  measure: 'Protractor readings (9)',
  consist: 'D = i + e − A',
  concl: 'Conclusion',
  viva: 'Viva voce',
};

export const BASIS: Readonly<Record<PartKey, string>> = {
  outline: '5 for fixing the paper and tracing the prism outline before the first pin goes in',
  pins: '3 per ray: 1.5 if the two incident pins are at least 3 cm apart, 1.5 if the two emergent pins are',
  trace: '6 per ray: your emergent line against the images of the first two pins — within 1° = 6, within 2° = 3',
  measure:
    '3 per angle (i, e and D on three rays), marked against your own trace: within 1° = 3, within 2° = 1.5; first reading counts',
  consist: '3 per ray if your own three readings satisfy D = i + e − 60° to within 2°',
  concl: '6 for the ray of least deviation picked from your own table, 2 for each of the three interpretations',
  viva: '4 per question, first answer counts',
};

/** Marks for one ray, by part, so the reducer never spells out a number twice. */
export const PER_RAY = {
  pinsEach: 1.5,
  trace: { within1: 6, within2: 3 },
  angle: { within1: 3, within2: 1.5 },
  consist: 3,
} as const;

export const CONCL_POINTS = { least: 6, question: 2 } as const;
export const VIVA_POINTS = 4;

// ---------------------------------------------------------------------------
// The conclusion: three readings of the student's OWN table
// ---------------------------------------------------------------------------

/** One ray as the student recorded it. Null until that angle has been read. */
export interface MeasuredRay {
  i: number | null;
  e: number | null;
  D: number | null;
}

export interface ConclusionQuestion {
  q: string;
  o: readonly string[];
  why: RichText;
}

export const CONCLUSIONS: readonly ConclusionQuestion[] = [
  {
    q: 'Compared with the incident ray, the emergent ray is bent…',
    o: ['towards the apex A', 'towards the base BC', 'not at all — it is parallel to the incident ray'],
    why: 'The ray always turns towards the thicker part of the glass wedge, which is the base.',
  },
  {
    q: 'Taking your three rays in order of increasing i, your measured deviation…',
    o: ['rose steadily', 'fell steadily', 'fell and then rose', 'showed no clear trend'],
    why: 'Deviation falls as i is increased, passes through a minimum near the symmetric passage for this prism, and then rises again — a well-spread set of three angles shows the dip.',
  },
  {
    q: 'On the ray where your deviation was least, your i and e were…',
    o: ['nearly equal', 'very different — e much larger than i', 'very different — i much larger than e'],
    why: 'Minimum deviation is the symmetric passage, so at the bottom of the curve i and e are equal; if yours were far apart that ray was not near the minimum.',
  },
];

/** The ray with the smallest recorded deviation, or null when none is read. */
export function leastDeviationRay(rays: readonly MeasuredRay[]): number | null {
  let best: number | null = null;
  rays.forEach((r, k) => {
    if (r.D === null) return;
    if (best === null || r.D < rays[best]!.D!) best = k;
  });
  return best;
}

/**
 * The right answer to a conclusion question, FOR THIS STUDENT'S TABLE.
 *
 * There is no fixed key: "your deviation fell and then rose" is only true of a
 * well-spread set of three angles, and a student who took three similar angles
 * is right to say the trend was unclear. Marking against the truth rather than
 * against their own readings would punish an honest observation.
 */
export function conclusionKey(index: number, rays: readonly MeasuredRay[]): number {
  if (index === 0) return 1;

  if (index === 1) {
    const r = rays
      .filter((x): x is { i: number; e: number | null; D: number } => x.i !== null && x.D !== null)
      .map((x) => ({ i: x.i, D: x.D }))
      .sort((a, b) => a.i - b.i);
    if (r.length < 3) return 3;
    const a = r[0]!.D;
    const b = r[1]!.D;
    const c = r[2]!.D;
    if (b < a - 0.5 && b < c - 0.5) return 2;
    if (a < b && b < c) return 0;
    if (a > b && b > c) return 1;
    return 3;
  }

  const least = leastDeviationRay(rays);
  const t = least === null ? null : rays[least];
  if (!t || t.i === null || t.e === null) return 0;
  const d = t.e - t.i;
  return Math.abs(d) <= 8 ? 0 : d > 0 ? 1 : 2;
}

// ---------------------------------------------------------------------------
// Viva
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
    q: 'A glass slab only shifts a ray sideways, but a prism turns it. Why?',
    a: 2,
    o: [
      'The prism glass is denser than slab glass',
      'A slab is thinner than a prism',
      'The slab’s two faces are parallel, so the two refractions are equal and opposite; the prism’s faces are inclined at 60°, so the two bendings add',
      'Light travels faster inside a prism',
    ],
    why: 'In a slab the emergent ray is parallel to the incident ray and only laterally displaced, because the second refraction exactly undoes the first; the prism’s faces are not parallel, so the bendings add up into a deviation.',
    textbookQuery: 'refraction through a rectangular glass slab emergent ray parallel lateral displacement',
  },
  {
    q: 'In D = i + e − A, what are i, e and A?',
    a: 1,
    o: [
      'The three angles of the glass triangle',
      'Angle of incidence at the first face, angle of emergence at the second face, and the angle of the prism',
      'Angle of incidence, angle of refraction inside the glass, and the critical angle',
      'Three readings of the same angle, averaged',
    ],
    why: 'The two internal angles satisfy r₁ + r₂ = A, and the ray turns by (i − r₁) at the first face and (e − r₂) at the second, so the total turn is D = i + e − A.',
    textbookQuery: 'glass prism angle of incidence angle of emergence angle of deviation refracting angle',
  },
  {
    q: 'At the angle of minimum deviation, the ray inside the prism…',
    a: 0,
    o: [
      'runs parallel to the base, with i = e and r₁ = r₂',
      'grazes along the second face',
      'is totally internally reflected',
      'goes straight through without bending',
    ],
    why: 'Minimum deviation is the symmetric passage: i = e and r₁ = r₂ = A/2, so the internal ray is parallel to the base — which is why each deviation value except the minimum is reached at two different angles of incidence.',
    textbookQuery: 'prism angle of minimum deviation ray parallel to the base refractive index',
  },
  {
    q: 'Why is the emergent ray deviated towards the base of the prism?',
    a: 3,
    o: [
      'Gravity pulls the light down towards the base',
      'The base is silvered',
      'The base is wider, so more light goes that way',
      'The glass is thicker towards the base, and at both inclined faces the ray turns the same way — towards the thicker part',
    ],
    why: 'Entering, the ray bends towards the normal; leaving, away from it — and because the two faces are inclined, both turns are in the same sense, towards the thicker end of the wedge, which is the base.',
    textbookQuery: 'refraction of light through a prism ray bends towards the base denser medium',
  },
  {
    q: 'A narrow beam of white light through the prism gives a band of colours. That is…',
    a: 2,
    o: [
      'deviation — every colour is bent by the same amount',
      'reflection from the second face',
      'dispersion — the glass has a slightly different refractive index for each colour, so each colour is deviated by a different amount',
      'the same thing as total internal reflection',
    ],
    why: 'Deviation is the turning of one ray; dispersion is the splitting of white light, because n is larger for violet than for red, so violet is deviated most and red least.',
    textbookQuery: 'dispersion of white light by a glass prism spectrum violet bends most red least',
  },
];

/** What the Aim and Theory card grounds itself on in the NCERT chapter. */
export const THEORY_QUERY =
  'refraction of light through a glass prism angle of deviation depends on the angle of incidence';

/** How the angles of one ray are worked through, in order. */
export const ANGLE_ORDER: readonly ('i' | 'e' | 'D')[] = ['i', 'e', 'D'];

export const ANGLE_NAMES: Readonly<Record<'i' | 'e' | 'D', string>> = {
  i: 'the angle of incidence i',
  e: 'the angle of emergence e',
  D: 'the angle of deviation D',
};

/** `D = i + e − 60°`, for the consistency column of the table. */
export const sumRule = (i: number, e: number): number => i + e - APEX;
