import type { BenchEngine, BenchVivaQuestion, MarkPartSpec } from '@labs/types/lab-bench';

import { markedParts } from '../marking';
import { formatClock } from '../numbers';
import type { Message } from '../types';
import { vivaPaperFor } from '../viva';

import { P } from './apparatus';
import { MAX, PART_KEYS, PART_NAMES, THEORY_QUERY, basisFor, stepsFor } from './marking';
import { currentMethod } from './method';
import { labReducer, type LabAction } from './reducer';
import { buildAttemptRecord, scoreParts } from './score';
import { newLabState, type LabState } from './state';
import { vivaBankFor } from './viva-bank';

/**
 * Verification of Ohm's Law (CBSE 4) as a bench the shared workspace can run.
 *
 * The physics, the diagnosis, the marking and the attempt record are the
 * modules beside this one; this is only the description the workspace reads:
 * what the steps are, what the marks are worth, what to say, and how to
 * advance. Nothing here draws anything.
 *
 * THREE OF ITS FIELDS ARE GETTERS. `steps`, `marks` and `viva` describe the
 * apparatus rather than the attempt, and the apparatus depends on the method
 * the student chose — which the workspace reads without a state in its hand.
 * Each returns one of two frozen values, so identity is stable and nothing
 * re-renders for being asked twice. Everything that decides a MARK
 * (`score`, `vivaFor`, `attempt`) reads `state.method` instead and stays a pure
 * function of the state.
 */
function marksFor(method: 'cells' | 'rheostat'): readonly MarkPartSpec[] {
  const basis = basisFor(method);
  return Object.freeze(
    PART_KEYS.map((key) => ({ key, label: PART_NAMES[key], max: MAX[key], basis: basis[key] })),
  );
}

const MARKS = { cells: marksFor('cells'), rheostat: marksFor('rheostat') } as const;

const STRIP = {
  cells: Object.freeze(stepsFor('cells').map((s) => ({ title: s.title, prompt: s.prompt }))),
  rheostat: Object.freeze(stepsFor('rheostat').map((s) => ({ title: s.title, prompt: s.prompt }))),
} as const;

export const ohmsLawEngine: BenchEngine<LabState, LabAction> = {
  meta: {
    id: 'ohms-law',
    cbse: '4',
    title: 'Verification of Ohm’s Law',
    subtitle: 'V–I characteristic of a resistor',
    subject: 'Physics',
    blurb:
      'Wire a real circuit, take four readings as you vary the current, and find the resistance from the slope of your own graph.',
    aim: 'To study how the potential difference (V) across a resistor depends on the current (I) through it, and to find its resistance.',
    theory:
      'At constant temperature V ∝ I, so V = IR. The V–I graph is a straight line through the origin whose slope is R.',
    textbook: { subject: 'Science', grade: 10, chapter: 'Electricity' },
    theoryQuery: THEORY_QUERY,
    newBenchHint: 'A different unknown resistor',
  },

  get steps() {
    return STRIP[currentMethod()];
  },

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

  step: (s) => s.step,
  done: (s) => s.done,
  message: (s): Message => s.message,
  score: (s) => scoreParts(s),
  log: (s) => s.log,

  summary: (s) =>
    `${formatClock(s.tEnd - s.t0)} on bench #${s.seed} · ${
      s.method === 'cells' ? 'current varied by cells' : 'current varied by rheostat'
    } · the wire was ${s.R0.toFixed(1)} Ω, you found ${
      s.result ? s.result.fit.m.toFixed(2) : '—'
    } Ω`,

  attempt: (s) => ({ ...buildAttemptRecord(s) }),

  vivaPicks: (s) => s.viva.map((v) => (v ? v.pick : null)),
  answerViva: (question, option, now) => ({ type: 'answerViva', question, option, now }),
  tick: (dt, now) => ({ type: 'tick', dt, now }),
  restartable: (s) => s.step === 0 && s.wires.length === 0 && s.log.length === 0,
};

/**
 * The meters, for the magnified close-up beside the readings. Each carries the
 * division count the Laboratory Manual prescribes for it, which is what makes
 * the close-up's printed least count agree with `P.lcA` / `P.lcV`.
 */
export const OHMS_LAW_METERS = {
  am: { label: 'Ammeter', fullScale: P.amFS, divs: P.amDivs, maj: P.amMaj, mid: P.amMid, letter: 'A' },
  vm: { label: 'Voltmeter', fullScale: P.vmFS, divs: P.vmDivs, maj: P.vmMaj, mid: P.vmMid, letter: 'V' },
} as const;

/** Marks + basis for the attempt record, in the shared shape. */
export function ohmsLawMarkedParts(s: LabState): ReturnType<typeof markedParts> {
  const basis = basisFor(s.method);
  return markedParts(
    PART_KEYS.map((key) => ({ key, max: MAX[key], basis: basis[key] })),
    scoreParts(s),
  );
}
