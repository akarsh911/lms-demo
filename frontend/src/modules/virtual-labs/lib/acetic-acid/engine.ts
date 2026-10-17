import type { BenchEngine } from '@labs/types/lab-bench';

import { formatClock } from '../numbers';
import { vivaPaperFor } from '../viva';
import type { Message } from '../types';

import { BASIS, MAX, PART_KEYS, PART_NAMES, STEP, STEPS, THEORY_QUERY } from './marking';
import { testsDone } from './observations';
import { aceticAcidReducer, type AceticAcidAction } from './reducer';
import { buildAttemptRecord, scoreParts } from './score';
import { newAceticAcidState, type AceticAcidState } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * Properties of acetic acid (CBSE 8) as a bench the shared workspace can run.
 *
 * The chemistry, the observation rules, the marking and the attempt record are
 * the modules beside this one; this is only the description the workspace
 * reads: what the steps are, what the marks are worth, what the assistant is
 * saying, and when the practical is over. Nothing here draws anything.
 */
export const aceticAcidEngine: BenchEngine<AceticAcidState, AceticAcidAction> = {
  meta: {
    id: 'acetic-acid',
    cbse: '8',
    title: 'Properties of Acetic Acid',
    subtitle: 'Odour, solubility, litmus and the carbonate test',
    subject: 'Chemistry',
    blurb:
      'Smell it safely, shake it with water and with oil, dip litmus in it, then fizz it with sodium hydrogen carbonate and catch the gas.',
    aim: 'To study the properties of acetic acid (ethanoic acid): its odour, its solubility in water, its effect on litmus, and its reaction with solid sodium hydrogen carbonate.',
    theory:
      'Ethanoic acid, CH₃COOH, is a weak acid — in water only a small fraction of its molecules ionise, so a dilute solution reads about pH 3 while dilute HCl of the same concentration reads about 1. It still turns blue litmus red, it mixes with water in all proportions, it smells of vinegar, and with a carbonate or hydrogencarbonate it gives carbon dioxide: CH₃COOH + NaHCO₃ → CH₃COONa + H₂O + CO₂↑',
    textbook: { subject: 'Science', grade: 10, chapter: 'Carbon and its Compounds' },
    theoryQuery: THEORY_QUERY,
  },

  steps: STEPS.map((s) => ({ title: s.title, prompt: s.prompt })),

  marks: PART_KEYS.map((key) => ({ key, label: PART_NAMES[key], max: MAX[key], basis: BASIS[key] })),

  viva: VIVA_BANK,
  /** The paper this attempt sits: drawn from the bank, seeded by the bench. */
  vivaFor: (state) => vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled),

  init: (seed, now, message, options) => newAceticAcidState(seed, now, message, options),
  reducer: aceticAcidReducer,

  step: (s) => s.step,
  done: (s) => s.done,
  message: (s): Message => s.message,
  score: (s) => scoreParts(s),
  log: (s) => s.log,

  summary: (s) =>
    `${formatClock((s.tEnd || s.t0) - s.t0)} on bench #${s.seed} · ${testsDone(s)}/8 tests carried out · ` +
    (s.sniffs ? `${s.sniffs} unsafe smell${s.sniffs > 1 ? 's' : ''}` : 'smelled safely throughout'),

  attempt: (s) => ({ ...buildAttemptRecord(s) }),

  vivaPicks: (s) => s.viva.map((v) => (v ? v.pick : null)),
  answerViva: (question, option, now) => ({ type: 'answerViva', question, option, now }),
  tick: (dt, now) => ({ type: 'tick', dt, now }),
  restartable: (s) => s.step === STEP.setup && s.tubes.every((t) => t.added.length === 0),
};
