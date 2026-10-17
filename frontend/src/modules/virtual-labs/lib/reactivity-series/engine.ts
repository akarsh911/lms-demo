import type { BenchEngine } from '@labs/types/lab-bench';

import { formatClock } from '../numbers';
import { vivaPaperFor } from '../viva';
import type { Message } from '../types';

import { BASIS, MAX, PART_KEYS, PART_NAMES, STEPS, THEORY_QUERY } from './marking';
import { rxReducer, type RxAction } from './reducer';
import { buildAttemptRecord, scoreParts } from './score';
import { newRxState, type RxState } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * The reactivity series (CBSE 3) as a bench the shared workspace can run.
 *
 * The chemistry, the marking and the attempt record are the modules beside this
 * one; this is only the description the workspace reads: what the steps are,
 * what the marks are worth, what the assistant is saying, and when the
 * practical is over. Nothing here draws anything.
 *
 * It is the one bench in the set with a CLOCK that is part of the science:
 * `tick` runs the displacement reactions forward while a wait plays out, which
 * is why a student who records after five minutes genuinely sees aluminium
 * having displaced nothing.
 */
export const reactivitySeriesEngine: BenchEngine<RxState, RxAction> = {
  meta: {
    id: 'reactivity-series',
    cbse: '3',
    title: 'The Reactivity Series',
    subtitle: 'Zn, Fe, Cu and Al in each other’s salt solutions',
    subject: 'Chemistry',
    blurb:
      'Set up sixteen tubes, wait while the displacements happen, record what each one really shows, and rank the four metals from your own table.',
    aim: 'To observe the action of Zn, Fe, Cu and Al on ZnSO₄, FeSO₄, CuSO₄ and Al₂(SO₄)₃ solutions, and to arrange the four metals in decreasing order of reactivity.',
    theory:
      'A more reactive metal displaces a less reactive metal from a solution of its salt. A metal that displaces more of the others is higher in the reactivity series.',
    textbook: { subject: 'Science', grade: 10, chapter: 'Metals and Non-metals' },
    theoryQuery: THEORY_QUERY,
  },

  steps: STEPS.map((s) => ({ title: s.title, prompt: s.prompt })),

  marks: PART_KEYS.map((key) => ({ key, label: PART_NAMES[key], max: MAX[key], basis: BASIS[key] })),

  viva: VIVA_BANK,
  /** The paper this attempt sits: drawn from the bank, seeded by the bench. */
  vivaFor: (state) => vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled),

  init: (seed, now, message, options) => newRxState(seed, now, message, options),
  reducer: rxReducer,

  step: (s) => s.step,
  done: (s) => s.done,
  message: (s): Message => s.message,
  score: (s) => scoreParts(s),
  log: (s) => s.log,

  summary: (s) =>
    `${formatClock((s.tEnd || s.t0) - s.t0)} on bench #${s.seed} · recorded after ${
      s.graded ? s.graded.min : s.min
    } lab minutes · your order ${s.concl ? s.concl.order.join(' > ') : '—'}`,

  attempt: (s) => ({ ...buildAttemptRecord(s) }),

  vivaPicks: (s) => s.viva.map((v) => (v ? v.pick : null)),
  answerViva: (question, option, now) => ({ type: 'answerViva', question, option, now }),
  tick: (dt, now) => ({ type: 'tick', dt, now }),
  restartable: (s) => s.tubes.every((t) => !t.added.length && !t.strip) && s.min === 0,
};
