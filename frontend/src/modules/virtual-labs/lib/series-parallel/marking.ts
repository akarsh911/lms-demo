import { CONFIGS, type ConfigId } from './apparatus';
import type { LabMethod } from './method';

/**
 * The procedure, the marks and the viva.
 *
 * The practical is sixteen STAGES grouped into eight rail STEPS: the meters,
 * the sand paper, then each of the four circuits wired, switched on and read —
 * each of those a stage of its own so the assistant always knows exactly what
 * is being asked for. The strip above the bench shows the eight, because
 * "measure R₁ alone" is one thing a student does, not three.
 */

export type StageType = 'lc' | 'sand' | 'wire' | 'start' | 'read' | 'calc' | 'viva';

export type Stage =
  | { type: 'lc' }
  | { type: 'sand' }
  | { type: 'wire'; cfg: ConfigId }
  | { type: 'start'; cfg: ConfigId }
  | { type: 'read'; cfg: ConfigId }
  | { type: 'calc' }
  | { type: 'viva' };

export const STAGES: readonly Stage[] = [
  { type: 'lc' },
  { type: 'sand' },
  { type: 'wire', cfg: 'r1' },
  { type: 'start', cfg: 'r1' },
  { type: 'read', cfg: 'r1' },
  { type: 'wire', cfg: 'r2' },
  { type: 'start', cfg: 'r2' },
  { type: 'read', cfg: 'r2' },
  { type: 'wire', cfg: 'series' },
  { type: 'start', cfg: 'series' },
  { type: 'read', cfg: 'series' },
  { type: 'wire', cfg: 'parallel' },
  { type: 'start', cfg: 'parallel' },
  { type: 'read', cfg: 'parallel' },
  { type: 'calc' },
  { type: 'viva' },
];

/** The last stage at which a procedure deduction can still be earned. */
export const LAST_READ_STAGE = STAGES.map((s) => s.type).lastIndexOf('read');

export interface ProcedureStep {
  title: string;
  prompt: string;
  /** The stages this rail step covers. */
  stages: readonly number[];
}

export const STEPS: readonly ProcedureStep[] = [
  { title: 'Know your meters', prompt: 'Find both least counts', stages: [0] },
  { title: 'Clean the wire ends', prompt: 'Sand paper, before anything is joined', stages: [1] },
  { title: 'Measure R₁ alone', prompt: 'Wire · switch on · 3 readings', stages: [2, 3, 4] },
  { title: 'Measure R₂ alone', prompt: 'Wire · switch on · 3 readings', stages: [5, 6, 7] },
  { title: 'R₁ and R₂ in series', prompt: 'Wire · switch on · 3 readings', stages: [8, 9, 10] },
  { title: 'R₁ and R₂ in parallel', prompt: 'Wire · switch on · 3 readings', stages: [11, 12, 13] },
  { title: 'Calculate and compare', prompt: 'Theory vs experiment', stages: [14] },
  { title: 'Viva voce', prompt: 'Five questions from the examiner', stages: [15] },
];

/** Rail step for each stage, so the strip and the console agree. */
const STEP_OF_STAGE: readonly number[] = STAGES.map((_, stage) =>
  STEPS.findIndex((s) => s.stages.includes(stage)),
);

export function stepOfStage(stage: number): number {
  return STEP_OF_STAGE[stage] ?? STEPS.length;
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

export type PartKey = 'lc' | 'circuit' | 'procedure' | 'readings' | 'result' | 'viva';

export const PART_KEYS: readonly PartKey[] = ['lc', 'circuit', 'procedure', 'readings', 'result', 'viva'];

export const MAX: Readonly<Record<PartKey, number>> = {
  lc: 10,
  circuit: 24,
  procedure: 12,
  readings: 24,
  result: 10,
  viva: 20,
};

export const PART_NAMES: Readonly<Record<PartKey, string>> = {
  lc: 'Least counts',
  circuit: 'Circuits (4)',
  procedure: 'Procedure',
  readings: 'Readings (12)',
  result: 'Calculation',
  viva: 'Viva voce',
};

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
    circuit: 'Per circuit: 6 − 2 per failed check − 2 per hint (minimum 2)',
    procedure:
      '12 − deductions: ' +
      (cells ? 'key inserted at more than one cell 2 each' : 'key in below max resistance 2 each') +
      ', key left in 3, short 5, over-range 3, key not removed between readings 1 per circuit',
    readings: '2 per reading: each meter within 1 least count = 1, within 2 = 0.5',
    result: 'R₁ + R₂ and R₁R₂/(R₁ + R₂) from your own means: each within 2% = 5, within 5% = 2.5',
    viva: '4 per question, first answer counts',
  };
}

/** Marks for one circuit: 6 each, four circuits, 24 in all. */
export const CIRCUIT = { max: 6, perFail: 2, perHint: 2, min: 2 } as const;

/** Marks for one reading: 1 per meter read within a least count. */
export const READING_POINTS = 2;

/** Procedure deductions, each the cost of one habit going wrong. */
export const DEDUCTION = {
  /** Key inserted below maximum resistance, per circuit. */
  belowMax: 2,
  /** Key not removed between readings, per circuit. */
  gaps: 1,
  /** Key left in long enough to warm the coils. */
  heat: 3,
  short: 5,
  over: 3,
} as const;

/** Each half of the calculation, graded against the student's OWN means. */
export const RESULT_POINTS = { exact: 5, close: 2.5 } as const;

export const VIVA_POINTS = 4;

/** What the Aim and Theory card grounds itself on in the NCERT chapter. */
export const THEORY_QUERY =
  'equivalent resistance of resistors combined in series and in parallel';

/** How many readings each circuit needs, summed. */
export const TOTAL_READINGS = (Object.keys(CONFIGS) as ConfigId[]).reduce(
  (a, id) => a + CONFIGS[id].readings,
  0,
);
