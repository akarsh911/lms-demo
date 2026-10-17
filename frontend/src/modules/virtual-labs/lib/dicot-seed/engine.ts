import type { BenchEngine } from '@labs/types/lab-bench';

import type { Message } from '../types';
import { vivaPaperFor } from '../viva';

import { BASIS, MAX, PART_KEYS, PART_NAMES, STEP, STEPS, THEORY_QUERY } from './marking';
import { dicotSeedReducer, type DicotSeedAction } from './reducer';
import { buildDicotSeedAttempt, dicotSeedSummary, scoreDicotParts } from './score';
import { newDicotSeedState, type DicotSeedState } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * Parts of an Embryo of a Dicot Seed (CBSE 14) as a bench the shared workspace
 * can run.
 *
 * The seed model, the marking and the attempt record are the modules beside
 * this one; this is only the description the workspace reads: what the steps
 * are, what the marks are worth, what the assistant is saying, and when the
 * practical is over. Nothing here draws anything.
 */
export const dicotSeedEngine: BenchEngine<DicotSeedState, DicotSeedAction> = {
  meta: {
    id: 'dicot-seed',
    cbse: '14',
    title: 'Parts of a Dicot Seed Embryo',
    subtitle: 'Soak it, split it, name what you see',
    subject: 'Biology',
    blurb:
      'Soak a gram, pea or kidney bean seed overnight, find the hilum and micropyle on its coat, peel the testa, part ' +
      'the two cotyledons along the natural plane and label the plumule and the radicle on the embryo axis.',
    aim: 'To identify the different parts of an embryo of a dicot seed (pea, gram or red kidney bean).',
    theory:
      'A dicot seed is covered by a tough seed coat (testa), marked by the hilum, the scar where it was attached to ' +
      'the pod, and beside it the micropyle, a tiny pore through which water enters. Inside are two fleshy cotyledons ' +
      'that store the food — so the seed is non-endospermic — and, attached between them, the embryo axis, carrying ' +
      'the plumule (future shoot) at one end and the radicle (future root) at the other. Soaking softens the coat and ' +
      'swells the cotyledons so the seed opens along its natural plane.',
    textbook: { subject: 'Science', grade: 10, chapter: 'How do Organisms Reproduce?' },
    theoryQuery: THEORY_QUERY,
  },

  steps: STEPS.map((s) => ({ title: s.title, prompt: s.prompt })),

  marks: PART_KEYS.map((key) => ({ key, label: PART_NAMES[key], max: MAX[key], basis: BASIS[key] })),

  viva: VIVA_BANK,
  /** The paper this attempt sits: drawn from the bank, seeded by the bench. */
  vivaFor: (state) => vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled),

  init: (seed, now, message, options) => newDicotSeedState(seed, now, message, options),
  reducer: dicotSeedReducer,

  step: (s) => s.step,
  done: (s) => s.done,
  message: (s): Message => s.message,
  score: (s) => scoreDicotParts(s),
  log: (s) => s.log,
  summary: dicotSeedSummary,
  attempt: (s) => ({ ...buildDicotSeedAttempt(s) }),

  vivaPicks: (s) => s.viva.map((v) => (v ? v.pick : null)),
  answerViva: (question, option, now) => ({ type: 'answerViva', question, option, now }),

  // Soaking is the practical's own clock: water goes in on a curve that
  // flattens off after about eight hours, and the seed has to be SEEN to swell.
  tick: (dt, now) => ({ type: 'tick', dt, now }),

  // Nothing has been taken from a dish yet, so re-rolling the bench costs the
  // student nothing. Once a seed is in their fingers it is their specimen.
  restartable: (s) => s.step === STEP.soak && s.specimen === null,
};
