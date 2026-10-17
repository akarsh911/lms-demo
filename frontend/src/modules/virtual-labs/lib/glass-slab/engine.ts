import type { BenchEngine } from '@labs/types/lab-bench';

import type { Message } from '../types';
import { vivaPaperFor } from '../viva';

import { BASIS, MAX, PART_KEYS, PART_NAMES, STEPS, THEORY_QUERY } from './marking';
import { glassSlabReducer, type GlassSlabAction } from './reducer';
import { buildAttemptRecord, glassSlabSummary, scoreParts } from './score';
import { newGlassSlabState, stepIndex, type GlassSlabState } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * Ray Through a Glass Slab (CBSE 11) as a bench the shared workspace can run.
 *
 * The optics, the marking and the attempt record are the modules beside this
 * one; this is only the description the workspace reads: what the steps are,
 * what the marks are worth, what the assistant is saying, and when the
 * practical is over. Nothing here draws anything, and nothing here reads a
 * clock.
 */
export const glassSlabEngine: BenchEngine<GlassSlabState, GlassSlabAction> = {
  meta: {
    id: 'glass-slab',
    cbse: '11',
    title: 'Ray Through a Glass Slab',
    subtitle: 'four pins, one straight line',
    subject: 'Physics',
    blurb:
      'Trace a ray through a rectangular glass slab with four pins at three angles of incidence, read ∠i, ∠r and ∠e off your own drawing, and measure how far the light comes out sideways.',
    aim:
      'To trace the path of a ray of light passing through a rectangular glass slab for three different angles of incidence, and to measure the angle of incidence, the angle of refraction and the angle of emergence.',
    theory:
      'Light travels more slowly in glass than in air, so at the first face it bends towards the normal: sin i / sin r = n, about 1.5 for glass. The second face is parallel to the first, so leaving the glass bends the ray away from the normal by exactly as much and ∠e = ∠i. The emergent ray is therefore parallel to the incident ray, shifted sideways by the lateral displacement d = t·sin(i − r)/cos r.',
    textbook: { subject: 'Science', grade: 10, chapter: 'Light' },
    theoryQuery: THEORY_QUERY,
  },

  steps: STEPS.map((s) => ({ title: s.title, prompt: s.prompt })),

  marks: PART_KEYS.map((key) => ({ key, label: PART_NAMES[key], max: MAX[key], basis: BASIS[key] })),

  viva: VIVA_BANK,
  /** The paper this attempt sits: drawn from the bank, seeded by the bench. */
  vivaFor: (state) => vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled),

  init: (seed, now, message, options) => newGlassSlabState(seed, now, message, options),
  reducer: glassSlabReducer,

  step: stepIndex,
  done: (s) => s.done,
  message: (s): Message => s.message,
  score: (s) => scoreParts(s),
  log: (s) => s.log,
  summary: glassSlabSummary,
  attempt: (s) => ({ ...buildAttemptRecord(s) }),

  vivaPicks: (s) => s.viva.map((v) => (v ? v.pick : null)),
  answerViva: (question, option, now) => ({ type: 'answerViva', question, option, now }),

  // Nothing is drawn yet, so re-rolling the slab costs the student nothing.
  // Once the outline is traced the thickness is part of their work.
  restartable: (s) => !s.slabOn && s.trials.every((t) => t.pins.length === 0),
};
