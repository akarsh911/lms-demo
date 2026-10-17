import type { BenchEngine } from '@labs/types/lab-bench';

import type { Message } from '../types';
import { vivaPaperFor } from '../viva';

import { BASIS, MAX, PART_KEYS, PART_NAMES, STEP, STEPS, THEORY_QUERY } from './marking';
import { respirationReducer, type RespirationAction } from './reducer';
import { buildRespirationAttempt, respirationSummary, scoreRespirationParts } from './score';
import { newRespirationState, type RespirationState } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * CO₂ Given Out During Respiration (CBSE 7) as a bench the shared workspace can
 * run.
 *
 * The biology, the marking and the attempt record are the modules beside this
 * one; this is only the description the workspace reads: what the steps are,
 * what the marks are worth, what the assistant is saying, and when the
 * practical is over. Nothing here draws anything.
 *
 * This bench has a clock, and it is the lesson: germinating seeds make about
 * 0.02 mmol of CO₂ a minute, so a tube of lime water takes twenty simulated
 * minutes to go plainly milky. `tick` integrates that minute by minute through
 * every flask, which is why a leaking cork shows up as a tube that never
 * changes rather than as a rule that says so.
 */
export const respirationEngine: BenchEngine<RespirationState, RespirationAction> = {
  meta: {
    id: 'respiration',
    cbse: '7',
    title: 'CO₂ Given Out During Respiration',
    subtitle: 'Germinating seeds against a boiled-seed control',
    subject: 'Biology',
    blurb:
      'Build two flasks — living seeds and dead ones — seal the corks, let the clock run, and see which tube of lime water turns milky.',
    aim: 'To show experimentally that carbon dioxide is given out during respiration.',
    theory:
      'Respiring cells oxidise glucose: C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + energy. Oxygen is used up and carbon dioxide is ' +
      'released. Carbon dioxide passed into lime water — a solution of calcium hydroxide — throws down insoluble calcium ' +
      'carbonate: Ca(OH)₂ + CO₂ → CaCO₃↓ + H₂O, so the lime water turns milky. Germinating seeds respire fast; boiled ' +
      'seeds are dead and respire not at all, so an identical flask of boiled seeds is the control that shows the gas came ' +
      'from the living seeds and not from the air in the apparatus.',
    textbook: { subject: 'Science', grade: 10, chapter: 'Life Processes' },
    theoryQuery: THEORY_QUERY,
  },

  steps: STEPS.map((s) => ({ title: s.title, prompt: s.prompt })),

  marks: PART_KEYS.map((key) => ({ key, label: PART_NAMES[key], max: MAX[key], basis: BASIS[key] })),

  viva: VIVA_BANK,
  /** The paper this attempt sits: drawn from the bank, seeded by the bench. */
  vivaFor: (state) => vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled),

  init: (seed, now, message, options) => newRespirationState(seed, now, message, options),
  reducer: respirationReducer,

  step: (s) => s.step,
  done: (s) => s.done,
  message: (s): Message => s.message,
  score: (s) => scoreRespirationParts(s),
  log: (s) => s.log,
  summary: respirationSummary,
  attempt: (s) => ({ ...buildRespirationAttempt(s) }),

  vivaPicks: (s) => s.viva.map((v) => (v ? v.pick : null)),
  answerViva: (question, option, now) => ({ type: 'answerViva', question, option, now }),

  /** The lab clock: 10 Hz, and a paused bench returns the same state. */
  tick: (dt, now) => ({ type: 'tick', dt, now }),

  // Nothing is in a flask yet, so re-rolling the bench costs the student
  // nothing. Once seeds are in, the room temperature is part of their work.
  restartable: (s) => s.step === STEP.build && s.flasks.every((f) => !f.seeds && f.lime.ml === 0),
};
