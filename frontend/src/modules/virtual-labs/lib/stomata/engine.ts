import type { BenchEngine } from '@labs/types/lab-bench';

import { formatClock } from '../numbers';
import { vivaPaperFor } from '../viva';
import type { Message } from '../types';

import { BASIS, MAX, PART_KEYS, PART_NAMES, STEPS, THEORY_QUERY } from './marking';
import { stomataReducer, type StomataAction } from './reducer';
import { buildAttemptRecord, scoreParts } from './score';
import { newStomataState, type StomataState } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * Temporary mount of a leaf peel, to show stomata (CBSE 6), as a bench the
 * shared workspace can run.
 *
 * The peel, the mount, the optics, the marking and the attempt record are the
 * modules beside this one. This is only the description the workspace reads:
 * what the steps are, what the marks are worth, what the assistant is saying,
 * and when the practical is finished. Nothing here draws anything.
 */
export const stomataEngine: BenchEngine<StomataState, StomataAction> = {
  meta: {
    id: 'stomata',
    cbse: '6',
    title: 'Stomata in a Leaf Peel',
    subtitle: 'Temporary mount of a leaf peel',
    subject: 'Biology',
    blurb:
      'Peel the epidermis off a leaf, stain it and mount it properly, then focus a real microscope on it and count the stomata you can actually see.',
    aim: 'To prepare a temporary mount of a leaf peel and to show the stomata under a compound microscope.',
    theory:
      'The epidermis of a leaf is one cell thick, so a peel of it is transparent enough to look through. Scattered among the irregular epidermal cells are stomata: each is a pore between two bean-shaped guard cells. The guard cells carry chloroplasts; the ordinary epidermal cells do not. On a dorsiventral (dicot) leaf the lower epidermis carries far more stomata than the upper.',
    textbook: { subject: 'Science', grade: 10, chapter: 'Life Processes' },
    theoryQuery: THEORY_QUERY,
  },

  steps: STEPS.map((s) => ({ title: s.title, prompt: s.prompt })),

  marks: PART_KEYS.map((key) => ({ key, label: PART_NAMES[key], max: MAX[key], basis: BASIS[key] })),

  viva: VIVA_BANK,
  /** The paper this attempt sits: drawn from the bank, seeded by the bench. */
  vivaFor: (state) => vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled),

  init: (seed, now, message, options) => newStomataState(seed, now, message, options),
  reducer: stomataReducer,

  step: (s) => s.step,
  done: (s) => s.done,
  message: (s): Message => s.message,
  score: (s) => scoreParts(s),
  log: (s) => s.log,

  summary: (s) => {
    const g = s.graded;
    const surface = s.slide.peel ? `${s.slide.peel.surface} epidermis` : 'no peel';
    return `${formatClock((s.tEnd || s.t0) - s.t0)} on bench #${s.seed} · ${surface} · ${
      g ? `you counted ${g.said}, the field held ${g.trueCount}` : 'nothing recorded'
    }`;
  },

  attempt: (s) => ({ ...buildAttemptRecord(s) }),

  vivaPicks: (s) => s.viva.map((v) => (v ? v.pick : null)),
  answerViva: (question, option, now) => ({ type: 'answerViva', question, option, now }),

  /** Nothing is marked until a peel is taken, so the seed may still be re-rolled. */
  restartable: (s) => s.step === 0 && !s.slide.peel && !s.dish && s.peelN === 0,
};
