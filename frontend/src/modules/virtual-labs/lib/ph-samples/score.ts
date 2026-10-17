import { markedParts } from '../marking';
import { formatClock } from '../numbers';
import type { MarkedPart, Mistake } from '../types';

import { SAMPLE_BY_ID, pHof, type SampleId } from './chemistry';
import { BASIS, CONTAMINATION_PENALTY, MAX, PART_KEYS, STEP, type PartKey } from './marking';
import type { PhState } from './state';

export type PhScore = Record<PartKey, number> & { total: number };

/**
 * Marks earned so far.
 *
 * Setup is recomputed live rather than frozen when the pour step ended: a tube
 * spoiled at the test step still costs, which is what makes the penalty mean
 * "you contaminated a sample" rather than "you were slow to be caught".
 */
export function scorePhParts(s: PhState): PhScore {
  const parts: Record<PartKey, number> = {
    setup: s.step > STEP.pour ? Math.max(0, MAX.setup - CONTAMINATION_PENALTY * s.contam) : s.pts.setup,
    testing: s.pts.testing,
    ph: s.pts.ph,
    nature: s.pts.nature,
    order: s.pts.order,
    viva: s.viva.reduce((a, v) => a + (v ? v.pts : 0), 0),
  };
  return { ...parts, total: Math.round(PART_KEYS.reduce((a, k) => a + parts[k], 0)) };
}

/**
 * The record of one completed attempt.
 *
 * The same shape `lms-lab-engine` posts to its parent frame, plus the bench
 * seed, so a backend written against the standalone bench accepts this one
 * unchanged. The grading basis travels with the marks, so a grade can be
 * audited without this code.
 */
export interface PhAttemptRecord {
  practical: 'ph-of-samples';
  experiment: '1A';
  bench_seed: number;
  score: number;
  max: 100;
  time: string;
  parts: Record<string, MarkedPart>;
  readings: {
    sample: SampleId;
    tube: number;
    method: 'paper' | 'ui' | null;
    pH_recorded: string;
    pH_actual: number | null;
    nature_recorded: string;
  }[];
  conclusion: { order: SampleId[]; consistent: boolean; truth: boolean } | null;
  mistakes: Mistake[];
}

export function buildPhAttempt(s: PhState): PhAttemptRecord {
  const score = scorePhParts(s);
  return {
    practical: 'ph-of-samples',
    experiment: '1A',
    bench_seed: s.seed,
    score: score.total,
    max: 100,
    time: formatClock((s.tEnd || s.t0) - s.t0),
    parts: markedParts(
      PART_KEYS.map((key) => ({ key, max: MAX[key], basis: BASIS[key] })),
      score,
    ),
    readings: s.tubes.map((t, i) => {
      const truePh = pHof(t);
      return {
        sample: t.sample,
        tube: i + 1,
        method: t.tested,
        pH_recorded: s.rec[i]?.ph ?? '',
        pH_actual: truePh === null ? null : +truePh.toFixed(2),
        nature_recorded: s.rec[i]?.nature ?? '',
      };
    }),
    conclusion: s.concl,
    mistakes: s.log,
  };
}

/** The one line above the marks: how long it took, and the order submitted. */
export function phSummary(s: PhState): string {
  const order = s.concl ? s.concl.order.map((id) => SAMPLE_BY_ID[id].short).join(' → ') : '—';
  return `${formatClock((s.tEnd || s.t0) - s.t0)} on bench #${s.seed} · your order ${order}`;
}
