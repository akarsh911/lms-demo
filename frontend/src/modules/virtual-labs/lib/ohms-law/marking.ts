import type { LabMethod } from './method';

/**
 * The practical's steps, marks and viva. Marks follow the CBSE-style split of
 * the reference bench's Experiment 4 scheme and every part carries its basis,
 * which travels with the attempt record.
 */

export interface ProcedureStep {
  title: string;
  prompt: string;
}

/**
 * The rail. Two of its prompts name the control that varies the current, and
 * that control is different under the two methods, so the rail is built per
 * method — and memoised, because the strip is re-read on every render.
 */
function buildSteps(method: LabMethod): readonly ProcedureStep[] {
  const cells = method === 'cells';
  return Object.freeze([
    { title: 'Know your meters', prompt: 'Find both least counts' },
    { title: 'Clean the wire ends', prompt: 'Sand paper, before anything is joined' },
    { title: 'Set up the circuit', prompt: 'Wire it, then have it checked' },
    {
      title: 'Close the circuit safely',
      prompt: cells ? 'One cell first, then insert key' : 'Maximum resistance, then insert key',
    },
    {
      title: 'Take four readings',
      prompt: cells ? 'One, two, three and four cells' : 'Vary the current, read both meters',
    },
    { title: 'Find R from the graph', prompt: 'Slope of the V–I line' },
    { title: 'Viva voce', prompt: 'Five questions from the examiner' },
  ]);
}

const STEPS_BY_METHOD: Readonly<Record<LabMethod, readonly ProcedureStep[]>> = {
  cells: buildSteps('cells'),
  rheostat: buildSteps('rheostat'),
};

export function stepsFor(method: LabMethod): readonly ProcedureStep[] {
  return STEPS_BY_METHOD[method];
}

/** Step indexes, named so the engine never reads as `step === 3`. */
export const STEP = {
  leastCounts: 0,
  sand: 1,
  circuit: 2,
  closeSafely: 3,
  readings: 4,
  result: 5,
  viva: 6,
} as const;

/** Four readings, one per cell count. */
export const READINGS_REQUIRED = 4;

/** Marks for one reading: 3 per meter read within a least count, 6 in all. */
export const READING_POINTS = 6;

export type PartKey = 'lc' | 'circuit' | 'procedure' | 'readings' | 'result' | 'viva';

export const PART_KEYS: readonly PartKey[] = ['lc', 'circuit', 'procedure', 'readings', 'result', 'viva'];

export const MAX: Readonly<Record<PartKey, number>> = {
  lc: 10,
  circuit: 25,
  procedure: 16,
  readings: 24,
  result: 10,
  viva: 15,
};

export const PART_NAMES: Readonly<Record<PartKey, string>> = {
  lc: 'Least counts',
  circuit: 'Circuit',
  procedure: 'Procedure',
  readings: 'Readings (4)',
  result: 'Result from graph',
  viva: 'Viva voce',
};

/** Marks for the one circuit: 25, less what a failed check or a hint costs. */
export const CIRCUIT = { max: 25, perFail: 5, perHint: 3, min: 5 } as const;

/** Procedure deductions, each the cost of one habit going wrong. */
export const DEDUCTION = {
  /** Key inserted with more than one cell / below maximum resistance. */
  belowMax: 4,
  /** Key not removed between readings. */
  gaps: 4,
  /** Key left in long enough to warm the wire. */
  heat: 3,
  short: 5,
  over: 3,
} as const;

/**
 * The rule each part was marked by, in the words a student can check their own
 * work against. The procedure line names the deduction by the control that was
 * actually on the bench, so no student is told they lost marks over a rheostat
 * they never had.
 */
export function basisFor(method: LabMethod): Readonly<Record<PartKey, string>> {
  const cells = method === 'cells';
  return {
    lc: '5 per meter, −2 per wrong attempt (minimum 1)',
    circuit: '25 − 5 per failed check − 3 per hint (minimum 5)',
    procedure:
      '16 − deductions: ' +
      (cells ? 'key inserted at more than one cell 4' : 'key in below max resistance 4') +
      ', key left in 3, short 5, over-range 3, key not removed between readings 4',
    readings: '6 per reading, four readings: each meter within 1 least count = 3, within 2 = 1.5',
    result: 'Your R vs the best-fit slope of your own points: within 5% = 10, 10% = 6, else 2',
    viva: '3 per question, first answer counts',
  };
}

export const VIVA_POINTS = 3;

/** What the Aim and Theory card grounds itself on in the NCERT chapter. */
export const THEORY_QUERY =
  'Ohm’s law potential difference across a metallic wire is directly proportional to the current';

/** Stars on the result card. */
export function starsFor(total: number): 0 | 1 | 2 | 3 {
  if (total >= 85) return 3;
  if (total >= 65) return 2;
  if (total >= 40) return 1;
  return 0;
}
