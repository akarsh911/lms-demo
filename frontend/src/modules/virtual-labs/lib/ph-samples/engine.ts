import type { BenchEngine } from '@labs/types/lab-bench';

import type { Message } from '../types';
import { vivaPaperFor } from '../viva';

import { BASIS, MAX, PART_KEYS, PART_NAMES, STEP, STEPS, THEORY_QUERY } from './marking';
import { phReducer, type PhAction } from './reducer';
import { buildPhAttempt, phSummary, scorePhParts } from './score';
import { newPhState, type PhState } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * pH of Everyday Samples (CBSE 1A) as a bench the shared workspace can run.
 *
 * The chemistry, the marking and the attempt record are the modules beside
 * this one; this is only the description the workspace reads: what the steps
 * are, what the marks are worth, what the assistant is saying, and when the
 * practical is over. Nothing here draws anything.
 */
export const phSamplesEngine: BenchEngine<PhState, PhAction> = {
  meta: {
    id: 'ph-samples',
    cbse: '1A',
    title: 'pH of Everyday Samples',
    subtitle: 'Six solutions, one colour chart',
    subject: 'Chemistry',
    blurb:
      'Pour six samples, test each with pH paper or universal indicator, read the colours off the chart and put them in order from most acidic to most basic.',
    aim:
      'To find the pH of dilute hydrochloric acid, dilute sodium hydroxide, dilute ethanoic acid, lemon juice, water and dilute sodium hydrogen carbonate solution, using pH paper or universal indicator.',
    theory:
      'pH measures how acidic or basic a solution is, from 0 to 14. Below 7 is acidic, 7 is neutral, above 7 is basic. Universal indicator takes a different colour at each pH, so a colour matched against the chart gives the pH.',
    textbook: { subject: 'Science', grade: 10, chapter: 'Acids, Bases and Salts' },
    theoryQuery: THEORY_QUERY,
  },

  steps: STEPS.map((s) => ({ title: s.title, prompt: s.prompt })),

  marks: PART_KEYS.map((key) => ({ key, label: PART_NAMES[key], max: MAX[key], basis: BASIS[key] })),

  viva: VIVA_BANK,
  /** The paper this attempt sits: drawn from the bank, seeded by the bench. */
  vivaFor: (state) => vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled),

  init: (seed, now, message, options) => newPhState(seed, now, message, options),
  reducer: phReducer,

  step: (s) => s.step,
  done: (s) => s.done,
  message: (s): Message => s.message,
  score: (s) => scorePhParts(s),
  log: (s) => s.log,
  summary: phSummary,
  attempt: (s) => ({ ...buildPhAttempt(s) }),

  vivaPicks: (s) => s.viva.map((v) => (v ? v.pick : null)),
  answerViva: (question, option, now) => ({ type: 'answerViva', question, option, now }),

  // Nothing is poured or tested yet, so re-rolling the rack costs the student
  // nothing. Once a tube is filled the arrangement is part of their work.
  restartable: (s) => s.step === STEP.pour && s.tubes.every((t) => t.added.length === 0),
};
