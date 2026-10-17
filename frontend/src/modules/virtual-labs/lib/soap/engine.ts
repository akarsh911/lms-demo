import type { BenchEngine } from '@labs/types/lab-bench';

import type { Message } from '../types';
import { vivaPaperFor } from '../viva';

import { BASIS, MAX, PART_KEYS, PART_NAMES, STEP, STEPS, THEORY_QUERY } from './marking';
import { soapReducer, type SoapAction } from './reducer';
import { buildSoapAttempt, scoreSoapParts, soapSummary } from './score';
import { newSoapState, type SoapState } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * Cleaning capacity of soap in soft and hard water (CBSE 9) as a bench the
 * shared workspace can run.
 *
 * The chemistry, the marking and the attempt record are the modules beside this
 * one; this is only the description the workspace reads: what the steps are,
 * what the marks are worth, what the assistant is saying, and when the
 * practical is over. Nothing here draws anything.
 */
export const soapEngine: BenchEngine<SoapState, SoapAction> = {
  meta: {
    id: 'soap',
    cbse: '9',
    title: 'Soap in Soft and Hard Water',
    subtitle: 'Two tubes, one fair test',
    subject: 'Chemistry',
    blurb:
      'Shake the same soap with distilled water and with hard water, measure both froth columns against a ' +
      'millimetre scale, then keep soaping the hard water until even that lathers.',
    aim: 'To study the comparative cleaning capacity of a sample of soap in soft and hard water.',
    theory:
      'Soap is the sodium salt of a long-chain fatty acid. Hard water carries dissolved calcium and magnesium ions. ' +
      'These ions throw the soap out of solution as an insoluble scum — the calcium or magnesium salt of the fatty ' +
      'acid — so the soap is used up before any lather can form. Only the soap left over once the ions are finished ' +
      'can make lather, which is why hard water needs far more soap for the same froth.',
    textbook: { subject: 'Science', grade: 10, chapter: 'Carbon and its Compounds' },
    theoryQuery: THEORY_QUERY,
  },

  steps: STEPS.map((s) => ({ title: s.title, prompt: s.prompt })),

  marks: PART_KEYS.map((key) => ({ key, label: PART_NAMES[key], max: MAX[key], basis: BASIS[key] })),

  viva: VIVA_BANK,
  /** The paper this attempt sits: drawn from the bank, seeded by the bench. */
  vivaFor: (state) => vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled),

  init: (seed, now, message, options) => newSoapState(seed, now, message, options),
  reducer: soapReducer,

  step: (s) => s.step,
  done: (s) => s.done,
  message: (s): Message => s.message,
  score: (s) => scoreSoapParts(s),
  log: (s) => s.log,
  summary: soapSummary,
  attempt: (s) => ({ ...buildSoapAttempt(s) }),

  vivaPicks: (s) => s.viva.map((v) => (v ? v.pick : null)),
  answerViva: (question, option, now) => ({ type: 'answerViva', question, option, now }),

  // Nothing is poured yet, so dealing a fresh sample of hard water costs the
  // student nothing. Once a tube is filled the sample is part of their work.
  restartable: (s) => s.step === STEP.fill && s.tubes.every((t) => t.added.length === 0),
};
