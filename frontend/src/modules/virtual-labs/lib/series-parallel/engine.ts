import type { BenchEngine, BenchVivaQuestion, MarkPartSpec } from '@labs/types/lab-bench';

import { markedParts } from '../marking';
import { vivaPaperFor } from '../viva';
import { formatClock } from '../numbers';
import type { Message } from '../types';

import { P } from './apparatus';
import { MAX, PART_KEYS, PART_NAMES, STEPS, THEORY_QUERY, basisFor, stepOfStage } from './marking';
import { currentMethod, type LabMethod } from './method';
import { labReducer, type LabAction } from './reducer';
import { buildAttemptRecord, scoreParts } from './score';
import { meanResistance, newLabState, type LabState } from './state';
import { vivaBankFor } from './viva-bank';

/**
 * TWO OF THE ENGINE'S FIELDS ARE GETTERS. `marks` and `viva` describe the
 * apparatus rather than the attempt, and the apparatus depends on the method
 * the student chose — which the workspace reads without a state in its hand.
 * Each returns one of two frozen values, so identity is stable and nothing
 * re-renders for being asked twice. Everything that decides a MARK (`score`,
 * `vivaFor`, `attempt`) reads `state.method` instead and stays a pure function
 * of the state. The rail is the same either way, so `steps` is not one.
 */
function marksFor(method: LabMethod): readonly MarkPartSpec[] {
  const basis = basisFor(method);
  return Object.freeze(
    PART_KEYS.map((key) => ({ key, label: PART_NAMES[key], max: MAX[key], basis: basis[key] })),
  );
}

const MARKS = { cells: marksFor('cells'), rheostat: marksFor('rheostat') } as const;

/**
 * Equivalent resistance in series and in parallel (CBSE 5) as a bench the
 * shared workspace can run.
 *
 * The physics, the diagnosis, the marking and the attempt record are the
 * modules beside this one; this is only the description the workspace reads:
 * what the steps are, what the marks are worth, what to say, and how to
 * advance. Nothing here draws anything.
 */
export const seriesParallelEngine: BenchEngine<LabState, LabAction> = {
  meta: {
    id: 'series-parallel',
    cbse: '5',
    title: 'Equivalent Resistance',
    subtitle: 'two resistors in series and in parallel',
    subject: 'Physics',
    blurb:
      'Measure two unknown resistors, then measure them joined in series and in parallel, and check both combinations against the formulae.',
    aim: 'To determine the equivalent resistance of two resistors when connected in series and in parallel.',
    theory:
      'In series the same current passes through both, and Rs = R₁ + R₂. In parallel both have the same potential difference, and 1/Rp = 1/R₁ + 1/R₂, so Rp = R₁R₂ / (R₁ + R₂).',
    textbook: { subject: 'Science', grade: 10, chapter: 'Electricity' },
    theoryQuery: THEORY_QUERY,
    newBenchHint: 'A different pair of unknown resistors',
  },

  steps: STEPS.map((s) => ({ title: s.title, prompt: s.prompt })),

  get marks(): readonly MarkPartSpec[] {
    return MARKS[currentMethod()];
  },

  get viva(): readonly BenchVivaQuestion[] {
    return vivaBankFor(currentMethod());
  },

  /** The paper this attempt sits: drawn from ITS OWN method's bank, seeded by the bench. */
  vivaFor: (state) => vivaPaperFor(vivaBankFor(state.method), state.seed, state.vivaShuffled),

  init: (seed, now, message, options) => newLabState(seed, now, message, options),
  reducer: labReducer,

  // Fifteen stages, seven rail steps: the strip shows "measure R₁ alone", not
  // "wire it", "switch it on", "read it".
  step: (s) => stepOfStage(s.stage),
  done: (s) => s.done,
  message: (s): Message => s.message,
  score: (s) => scoreParts(s),
  log: (s) => s.log,

  summary: (s) => {
    const shown = (n: number): string => (Number.isFinite(n) ? n.toFixed(2) : '—');
    return (
      `${formatClock(s.tEnd - s.t0)} on bench #${s.seed} · ${
        s.method === 'cells' ? 'current varied by cells' : 'current varied by rheostat'
      } · R₁ = ${s.R.r1} Ω, R₂ = ${s.R.r2} Ω · ` +
      `you measured Rs = ${shown(meanResistance(s.cfg.series))} Ω and Rp = ${shown(meanResistance(s.cfg.parallel))} Ω`
    );
  },

  attempt: (s) => ({ ...buildAttemptRecord(s) }),

  vivaPicks: (s) => s.viva.map((v) => (v ? v.pick : null)),
  answerViva: (question, option, now) => ({ type: 'answerViva', question, option, now }),
  tick: (dt, now) => ({ type: 'tick', dt, now }),
  restartable: (s) => s.stage === 0 && s.wires.length === 0 && s.log.length === 0,
};

/** The meters, for the magnified close-up beside the readings. */
export const SERIES_PARALLEL_METERS = {
  am: { label: 'Ammeter', fullScale: P.amFS, divs: P.amDivs, letter: 'A' },
  vm: { label: 'Voltmeter', fullScale: P.vmFS, divs: P.vmDivs, letter: 'V' },
} as const;

/** Marks + basis for the attempt record, in the shared shape. */
export function seriesParallelMarkedParts(s: LabState): ReturnType<typeof markedParts> {
  const basis = basisFor(s.method);
  return markedParts(
    PART_KEYS.map((key) => ({ key, max: MAX[key], basis: basis[key] })),
    scoreParts(s),
  );
}
