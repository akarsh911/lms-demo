import type { BenchEngine } from '@labs/types/lab-bench';

import { formatClock } from '../numbers';
import { vivaPaperFor } from '../viva';
import type { Message } from '../types';

import { solutionVol, tubeVol } from './chemistry';
import {
  BASIS,
  CONCLUSIONS,
  MAX,
  PART_KEYS,
  PART_NAMES,
  STEP,
  STEPS,
  THEORY_QUERY,
  } from './marking';
import { acidBaseReducer, type AcidBaseAction } from './reducer';
import { buildAttemptRecord, scoreParts } from './score';
import { newAcidBaseState, type AcidBaseState } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * Properties of acids and bases (CBSE 1B) as a bench the shared workspace runs.
 *
 * The chemistry, the marking and the attempt record are the modules beside this
 * one; this is only the description the workspace reads: what the steps are,
 * what the marks are worth, what the assistant is saying, and when the
 * practical is over. Nothing here draws anything.
 */
export const acidBaseEngine: BenchEngine<AcidBaseState, AcidBaseAction> = {
  meta: {
    id: 'acid-base',
    cbse: '1B',
    title: 'Properties of Acids and Bases',
    subtitle: 'litmus, zinc and sodium carbonate',
    subject: 'Chemistry',
    blurb:
      'Two colourless solutions and eight tubes to tell them apart: litmus, zinc granules and solid sodium carbonate, with the gas identified rather than assumed.',
    aim: 'To study the properties of dilute hydrochloric acid and dilute sodium hydroxide solution by their reaction with (a) litmus solution, (b) zinc metal and (c) solid sodium carbonate.',
    theory:
      'An acid turns blue litmus red; a base turns red litmus blue. Both HCl and NaOH give hydrogen with zinc, so effervescence alone proves nothing — the gas has to be identified. Only the acid attacks sodium carbonate, and the carbon dioxide it gives turns lime water milky.',
    textbook: { subject: 'Science', grade: 10, chapter: 'Acids, Bases and Salts' },
    theoryQuery: THEORY_QUERY,
  },

  steps: STEPS.map((s) => ({ title: s.title, prompt: s.prompt })),

  marks: PART_KEYS.map((key) => ({ key, label: PART_NAMES[key], max: MAX[key], basis: BASIS[key] })),

  viva: VIVA_BANK,
  /** The paper this attempt sits: drawn from the bank, seeded by the bench. */
  vivaFor: (state) => vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled),

  init: (seed, now, message, options) => newAcidBaseState(seed, now, message, options),
  reducer: acidBaseReducer,

  step: (s) => s.step,
  done: (s) => s.done,
  message: (s): Message => s.message,
  score: (s) => scoreParts(s),
  log: (s) => s.log,

  summary: (s) => {
    const exact = s.graded ? s.graded.filter((g) => g.pts === 4).length : 0;
    return `${formatClock((s.tEnd || s.t0) - s.t0)} on bench #${s.seed} · ${exact}/8 rows of the table exactly right`;
  },

  attempt: (s) => ({ ...buildAttemptRecord(s, CONCLUSIONS) }),

  vivaPicks: (s) => s.viva.map((v) => (v ? v.pick : null)),
  answerViva: (question, option, now) => ({ type: 'answerViva', question, option, now }),
  tick: (dt, now) => ({ type: 'tick', dt, now }),

  // A bench may be re-rolled while the rack is still empty: nothing has been
  // observed yet, so nothing is lost.
  restartable: (s) => s.step === STEP.pour && s.tubes.every((t) => !tubeVol(t) && !solutionVol(t)),
};
