import type { BenchEngine } from '@labs/types/lab-bench';

import { formatClock } from '../numbers';
import { vivaPaperFor } from '../viva';
import type { Message } from '../types';

import { RX, fmtMin } from './chemistry';
import { BASIS, MAX, PART_KEYS, PART_NAMES, STEPS, THEORY_QUERY } from './marking';
import { reactionReducer, type ReactionAction } from './reducer';
import { buildAttemptRecord, scoreParts } from './score';
import { newReactionState, type ReactionTypesState } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * Types of Chemical Reaction (CBSE 2) as a bench the shared workspace can run.
 *
 * The chemistry, the marking and the attempt record are the modules beside
 * this one; this is only the description the workspace reads: what the steps
 * are, what the marks are worth, what the assistant is saying, and how the
 * practical advances. Nothing here draws anything.
 */
export const reactionTypesEngine: BenchEngine<ReactionTypesState, ReactionAction> = {
  meta: {
    id: 'reaction-types',
    cbse: '2',
    title: 'Types of Chemical Reaction',
    subtitle: 'Four reactions, four names',
    subject: 'Chemistry',
    blurb:
      'Slake quicklime, roast ferrous sulphate, stand iron nails in copper sulphate and mix two clear solutions — then work out what kind of reaction each one was.',
    aim:
      'To perform and observe the action of water on quicklime, the action of heat on ferrous sulphate crystals, iron nails kept in copper sulphate solution, and the reaction between sodium sulphate and barium chloride solutions, and to classify each of them as combination, decomposition, displacement or double displacement.',
    theory:
      'In a combination reaction two or more substances join to make one. In a decomposition reaction one substance breaks into two or more. In a displacement reaction a more reactive element takes the place of a less reactive one in a compound. In a double displacement reaction two compounds exchange their ions, often leaving an insoluble precipitate.',
    textbook: { subject: 'Science', grade: 10, chapter: 'Chemical Reactions and Equations' },
    theoryQuery: THEORY_QUERY,
  },

  steps: STEPS.map((s) => ({ title: s.title, prompt: s.prompt })),

  marks: PART_KEYS.map((key) => ({ key, label: PART_NAMES[key], max: MAX[key], basis: BASIS[key] })),

  viva: VIVA_BANK,
  /** The paper this attempt sits: drawn from the bank, seeded by the bench. */
  vivaFor: (state) => vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled),

  init: (seed, now, message, options) => newReactionState(seed, now, message, options),
  reducer: reactionReducer,

  step: (s) => s.step,
  done: (s) => s.done,
  message: (s): Message => s.message,
  score: (s) => scoreParts(s),
  log: (s) => s.log,

  summary: (s) => {
    const right = s.clsGraded ? RX.filter((r) => s.clsGraded![r.id]!.pts > 0).length : 0;
    return `${formatClock((s.tEnd || s.t0) - s.t0)} at the bench · ${fmtMin(
      s.graded ? s.graded.min : s.min,
    )} on the lab clock · ${right} of ${RX.length} reactions named correctly`;
  },

  attempt: (s) => ({ ...buildAttemptRecord(s) }),

  vivaPicks: (s) => s.viva.map((v) => (v ? v.pick : null)),
  answerViva: (question, option, now) => ({ type: 'answerViva', question, option, now }),
  tick: (dt, now) => ({ type: 'tick', dt, now }),
  restartable: (s) => s.min === 0 && s.log.length === 0 && !s.vessels.some((v) => v.added.length > 0),
};
