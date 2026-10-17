import { formatClock } from '../numbers';
import type { MarkedPart, Mistake } from '../types';

import { BASIS, MAX, PART_KEYS, STEP, type PartKey } from './marking';
import { cm1, cm2, meanOf, type PartId } from './optics';
import type { FocalLengthState, Trial } from './state';

export type ScoreParts = Record<PartKey, number> & { total: number };

/**
 * Marks earned so far, per part.
 *
 * A set-up is worth nothing until it has been LEFT: while a student is still
 * choosing what to aim at, another unsafe choice can still cost them, so the
 * marks are only banked once the step is behind them.
 */
export function scoreParts(s: FocalLengthState): ScoreParts {
  const setup = (part: PartId, max: number, past: boolean): number =>
    past ? Math.max(0, max - 4 * s.badObj[part]) : 0;

  const parts: Record<PartKey, number> = {
    setupM: setup('mirror', MAX.setupM, s.step > STEP.setupM),
    mirror: s.trials.mirror.reduce((a, t) => a + t.pts, 0),
    setupL: setup('lens', MAX.setupL, s.step > STEP.setupL),
    lens: s.trials.lens.reduce((a, t) => a + t.pts, 0),
    mean: s.meanPts.mirror + s.meanPts.lens,
    concl: s.concl ? s.concl.pts : 0,
    viva: s.viva.reduce((a, v) => a + (v ? v.pts : 0), 0),
  };
  return { ...parts, total: Math.round(PART_KEYS.reduce((a, k) => a + parts[k], 0) * 10) / 10 };
}

/** One row of the observation table, as it travels in the record. */
export interface TrialRecord {
  comp_cm: number;
  screen_cm: number;
  comp_actual: number;
  screen_actual: number;
  f_cm: number;
  blur_mm: number;
  defocus_cm: number;
  marks: number;
}

/**
 * The record of one completed attempt.
 *
 * The same shape `lms-lab-engine` posts to its parent frame as
 * `{type: 'lab-bench:attempt', record}`, so a backend written against the
 * standalone bench accepts this one unchanged. Both what the student wrote and
 * where the stands actually were are kept, which is the only way a teacher can
 * tell a misread scale from a badly focused screen.
 */
export interface FocalLengthAttemptRecord {
  practical: 'focal-length-distant-object';
  experiment: '10';
  bench_seed: number;
  bench_true: { concave_mirror_f_cm: number; convex_lens_f_cm: number };
  score: number;
  max: 100;
  time: string;
  parts: Record<PartKey, MarkedPart>;
  objects: {
    mirror: string | null;
    lens: string | null;
    unsafe_or_near_choices: number;
  };
  trials: Record<PartId, TrialRecord[]>;
  trial_means_cm: Record<PartId, number | null>;
  means_cm: Record<PartId, number | null>;
  conclusion: FocalLengthState['concl'];
  mistakes: Mistake[];
}

const trialRecord = (t: Trial): TrialRecord => ({
  comp_cm: +cm2(t.comp),
  screen_cm: +cm2(t.scr),
  comp_actual: +cm2(t.trueComp),
  screen_actual: +cm2(t.trueScr),
  f_cm: +cm2(t.f),
  blur_mm: +cm1(t.blur * 10),
  defocus_cm: +cm2(t.defocus),
  marks: t.pts,
});

const trialMean = (trials: readonly Trial[]): number | null =>
  trials.length ? +cm2(meanOf(trials.map((t) => t.f))) : null;

export function buildAttemptRecord(s: FocalLengthState): FocalLengthAttemptRecord {
  const p = scoreParts(s);
  return {
    practical: 'focal-length-distant-object',
    experiment: '10',
    bench_seed: s.seed,
    bench_true: { concave_mirror_f_cm: s.fM, convex_lens_f_cm: s.fL },
    score: p.total,
    max: 100,
    time: formatClock(Math.max(0, (s.tEnd || s.t0) - s.t0)),
    parts: Object.fromEntries(
      PART_KEYS.map((k) => [k, { earned: +p[k].toFixed(2), max: MAX[k], basis: BASIS[k] }]),
    ) as Record<PartKey, MarkedPart>,
    objects: {
      mirror: s.obj.mirror,
      lens: s.obj.lens,
      unsafe_or_near_choices: s.badObj.mirror + s.badObj.lens,
    },
    trials: { mirror: s.trials.mirror.map(trialRecord), lens: s.trials.lens.map(trialRecord) },
    trial_means_cm: { mirror: trialMean(s.trials.mirror), lens: trialMean(s.trials.lens) },
    means_cm: { mirror: s.means.mirror, lens: s.means.lens },
    conclusion: s.concl,
    mistakes: s.log,
  };
}
