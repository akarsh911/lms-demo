import type { BenchEngine } from '@labs/types/lab-bench';

import { markedParts } from '../marking';
import { vivaPaperFor } from '../viva';
import { formatClock } from '../numbers';
import type { Message } from '../types';

import { BASIS, MAX, PART_KEYS, PART_NAMES, STEPS, THEORY_QUERY } from './marking';
import { cm1, cm2 } from './optics';
import { focalLengthReducer, type FocalLengthAction } from './reducer';
import { buildAttemptRecord, scoreParts } from './score';
import { newFocalLengthState, type FocalLengthState } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * Focal length from a distant object (CBSE 10) as a bench the shared workspace
 * can run.
 *
 * The optics, the marking and the attempt record are the modules beside this
 * one; this is only the description the workspace reads. Nothing here draws
 * anything, and nothing here reads a clock.
 */
export const focalLengthEngine: BenchEngine<FocalLengthState, FocalLengthAction> = {
  meta: {
    id: 'focal-length',
    cbse: '10',
    title: 'Focal Length from a Distant Object',
    subtitle: 'a concave mirror and a convex lens',
    subject: 'Physics',
    blurb:
      'Aim a concave mirror and then a convex lens at something far away, hunt for the sharp image on a screen, and read two focal lengths off a metre scale.',
    aim: 'To determine the focal length of (i) a concave mirror and (ii) a convex lens, by obtaining the image of a distant object on a screen.',
    theory:
      'Rays reaching the mirror or lens from a distant object are, for all practical purposes, parallel to the principal axis. Parallel rays converge at the principal focus, so the sharp image of a distant object forms in the focal plane and the distance from the screen to the pole of the mirror — or to the optical centre of the lens — is the focal length f.',
    textbook: { subject: 'Science', grade: 10, chapter: 'Light' },
    theoryQuery: THEORY_QUERY,
  },

  steps: STEPS.map((s) => ({ title: s.title, prompt: s.prompt })),

  marks: PART_KEYS.map((key) => ({ key, label: PART_NAMES[key], max: MAX[key], basis: BASIS[key] })),

  viva: VIVA_BANK,
  /** The paper this attempt sits: drawn from the bank, seeded by the bench. */
  vivaFor: (state) => vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled),

  init: (seed, now, message, options) => newFocalLengthState(seed, now, message, options),
  reducer: focalLengthReducer,

  step: (s) => s.step,
  done: (s) => s.done,
  message: (s): Message => s.message,
  score: (s) => scoreParts(s),
  log: (s) => s.log,

  summary: (s) =>
    `${formatClock(Math.max(0, s.tEnd - s.t0))} on bench #${s.seed} · mirror f = ${
      s.means.mirror === null ? '—' : cm2(s.means.mirror)
    } cm (true ${cm1(s.fM)}), lens f = ${s.means.lens === null ? '—' : cm2(s.means.lens)} cm (true ${cm1(s.fL)})`,

  attempt: (s) => ({ ...buildAttemptRecord(s) }),

  vivaPicks: (s) => s.viva.map((v) => (v ? v.pick : null)),
  answerViva: (question, option, now) => ({ type: 'answerViva', question, option, now }),
  /** The seed may be re-rolled while nothing has been aimed at or measured yet. */
  restartable: (s) => s.step === 0 && s.objChoices === 0,
};

/** Marks + basis for the attempt record, in the shared shape. */
export function focalLengthMarkedParts(s: FocalLengthState): ReturnType<typeof markedParts> {
  return markedParts(
    PART_KEYS.map((key) => ({ key, max: MAX[key], basis: BASIS[key] })),
    scoreParts(s),
  );
}
