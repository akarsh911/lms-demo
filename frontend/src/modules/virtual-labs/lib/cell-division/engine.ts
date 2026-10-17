import type { BenchEngine } from '@labs/types/lab-bench';

import type { Message } from '../types';
import { vivaPaperFor } from '../viva';

import { BASIS, MAX, PART_KEYS, PART_NAMES, STEP, STEPS, THEORY_QUERY } from './marking';
import { cellDivisionReducer, type CellDivisionAction } from './reducer';
import { buildCellDivisionAttempt, cellDivisionSummary, scoreCellDivision } from './score';
import { newCellDivisionState, type CellDivisionState } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * Binary fission and budding (CBSE 12) as a bench the shared workspace can run.
 *
 * The optics, the biology, the marking and the attempt record are the modules
 * beside this one; this is only the description the workspace reads: what the
 * steps are, what the marks are worth, what the assistant is saying, and when
 * the practical is over. Nothing here draws anything.
 */
export const cellDivisionEngine: BenchEngine<CellDivisionState, CellDivisionAction> = {
  meta: {
    id: 'cell-division',
    cbse: '12',
    title: 'Binary Fission and Budding',
    subtitle: 'Six prepared slides, one microscope',
    subject: 'Biology',
    blurb:
      'Six numbered slides and a compound microscope. Focus each one at high power, decide which organism it carries ' +
      'and whether it is reproducing, and name the structures the pointers sit on.',
    aim:
      'To study (a) binary fission in Amoeba and (b) budding in yeast and Hydra, with the help of prepared slides.',
    theory:
      'Both are asexual: one parent, no gametes, offspring identical to it. In binary fission the nucleus of Amoeba ' +
      'divides first, the cytoplasm then constricts at the middle, and the parent becomes two daughters of equal size ' +
      '— the parent as such no longer exists. In budding a small outgrowth appears on the parent: in yeast a bud may ' +
      'itself bud, forming a short chain before it pinches off; in Hydra the bud grows a hypostome and tentacles of ' +
      'its own and drops off as a miniature adult. The parent survives and buds again.',
    textbook: { subject: 'Science', grade: 10, chapter: 'How do Organisms Reproduce?' },
    theoryQuery: THEORY_QUERY,
  },

  steps: STEPS.map((s) => ({ title: s.title, prompt: s.prompt })),

  marks: PART_KEYS.map((key) => ({ key, label: PART_NAMES[key], max: MAX[key], basis: BASIS[key] })),

  viva: VIVA_BANK,
  /** The paper this attempt sits: drawn from the bank, seeded by the bench. */
  vivaFor: (state) => vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled),

  init: (seed, now, message, options) => newCellDivisionState(seed, now, message, options),
  reducer: cellDivisionReducer,

  step: (s) => s.step,
  done: (s) => s.done,
  message: (s): Message => s.message,
  score: (s) => scoreCellDivision(s),
  log: (s) => s.log,
  summary: cellDivisionSummary,
  attempt: (s) => ({ ...buildCellDivisionAttempt(s) }),

  vivaPicks: (s) => s.viva.map((v) => (v ? v.pick : null)),
  answerViva: (question, option, now) => ({ type: 'answerViva', question, option, now }),

  // Nothing has been looked at yet, so re-rolling the box costs the student
  // nothing. Once a slide has been on the stage the arrangement is their work.
  restartable: (s) => s.step === STEP.setup && s.mounts === 0,
};
