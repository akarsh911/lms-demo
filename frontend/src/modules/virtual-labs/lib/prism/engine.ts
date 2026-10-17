import type { BenchEngine } from '@labs/types/lab-bench';

import { markedParts } from '../marking';
import { vivaPaperFor } from '../viva';
import { formatClock } from '../numbers';
import type { Message } from '../types';

import { BASIS, MAX, PART_KEYS, PART_NAMES, STEP, STEPS, THEORY_QUERY } from './marking';
import { prismReducer, type PrismAction } from './reducer';
import { buildAttemptRecord, scoreParts } from './score';
import { newPrismState, type PrismState } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * Tracing a ray through a glass prism (CBSE 13) as a bench the shared workspace
 * can run.
 *
 * The optics, the marking and the attempt record are the modules beside this
 * one; this is only the description the workspace reads: what the steps are,
 * what the marks are worth, what the assistant is saying, and when the
 * practical is over. Nothing here draws anything and nothing here reads a
 * clock.
 */
export const prismEngine: BenchEngine<PrismState, PrismAction> = {
  meta: {
    id: 'prism',
    cbse: '13',
    title: 'Path of a Ray Through a Glass Prism',
    subtitle: 'four pins, one protractor, three angles',
    subject: 'Physics',
    blurb:
      'Pin a ray through a 60° prism, sight the emergent ray through the glass, and measure the angle of incidence, the angle of emergence and the angle of deviation on three rays.',
    aim: 'To trace the path of a ray of light passing through a glass prism, and to measure the angle of incidence, the angle of emergence and the angle of deviation for three different angles of incidence.',
    theory:
      'A ray entering a prism is refracted at both faces. Because the two faces are inclined at the angle of the prism A (60° here), the two bendings add instead of cancelling, so the ray leaves deviated towards the base. The angle of deviation D = i + e − A. As i is increased D first falls, reaches a minimum Dm when i = e, then rises again; at that point n = sin((A + Dm)/2) ÷ sin(A/2).',
    textbook: { subject: 'Science', grade: 10, chapter: 'Light' },
    theoryQuery: THEORY_QUERY,
  },

  steps: STEPS.map((s) => ({ title: s.title, prompt: s.prompt })),

  marks: PART_KEYS.map((key) => ({ key, label: PART_NAMES[key], max: MAX[key], basis: BASIS[key] })),

  viva: VIVA_BANK,
  /** The paper this attempt sits: drawn from the bank, seeded by the bench. */
  vivaFor: (state) => vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled),

  init: (seed, now, message, options) => newPrismState(seed, now, message, options),
  reducer: prismReducer,

  step: (s) => s.step,
  done: (s) => s.done,
  message: (s): Message => s.message,
  score: (s) => scoreParts(s),
  log: (s) => s.log,

  summary: (s) => {
    const angles = s.trials.map((t) => (t.meas.i === null ? '—' : `${t.meas.i}°`)).join(', ');
    const dm = s.result ? `${s.result.Dm}° on ray ${s.result.least + 1}` : '—';
    const found = s.result ? s.result.nFromDm.toFixed(2) : '—';
    return `${formatClock(Math.max(0, s.tEnd - s.t0))} on bench #${s.seed} · i = ${angles} · least deviation ${dm} · n = ${found} against the glass’s ${s.n}`;
  },

  attempt: (s) => ({ ...buildAttemptRecord(s) }),

  vivaPicks: (s) => s.viva.map((v) => (v ? v.pick : null)),
  answerViva: (question, option, now) => ({ type: 'answerViva', question, option, now }),

  /**
   * The only thing on this bench that moves by itself: the demonstration ray
   * box, while it is sweeping. Nothing in the marked practical is timed, so a
   * tick with no sweep running returns the state it was given and nothing
   * re-renders.
   */
  tick: (dt, now) => ({ type: 'tick', dt, now }),

  /** The seed may be re-rolled while the outline has not even been traced. */
  restartable: (s) => s.step === STEP.fix && !s.outline,
};

/** Marks + basis for the attempt record, in the shared shape. */
export function prismMarkedParts(s: PrismState): ReturnType<typeof markedParts> {
  return markedParts(
    PART_KEYS.map((key) => ({ key, max: MAX[key], basis: BASIS[key] })),
    scoreParts(s),
  );
}
