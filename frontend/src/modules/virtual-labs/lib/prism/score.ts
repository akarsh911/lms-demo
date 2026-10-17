import { formatClock } from '../numbers';
import type { MarkedPart, Mistake } from '../types';

import { BASIS, CONCL_POINTS, MAX, PART_KEYS, type PartKey } from './marking';
import { APEX, SCALE, criticalAngle, vlen, vsub } from './optics';
import type { PrismState } from './state';

export type ScoreParts = Record<PartKey, number> & { total: number };

/**
 * Marks earned so far, per part.
 *
 * Everything here is earned rather than deducted, and every angle is marked
 * against the student's OWN trace: a ray sighted 3° off the images loses its
 * trace marks once, and the readings taken from it can still be full marks if
 * they are honest readings of the line that was actually drawn.
 */
export function scoreParts(s: PrismState): ScoreParts {
  const parts: Record<PartKey, number> = {
    outline: s.outline ? MAX.outline : 0,
    pins: 0,
    trace: 0,
    measure: 0,
    consist: 0,
    concl:
      (s.result && s.result.picked === s.result.least ? CONCL_POINTS.least : 0) +
      s.concl.reduce((a, c) => a + (c ? c.pts : 0), 0),
    viva: s.viva.reduce((a, v) => a + (v ? v.pts : 0), 0),
  };
  for (const t of s.trials) {
    parts.pins += t.pinPts;
    parts.trace += t.tracePts;
    parts.measure += t.mp.i + t.mp.e + t.mp.D;
    parts.consist += t.consist;
  }
  const total = Math.round(PART_KEYS.reduce((a, k) => a + parts[k], 0));
  return { ...parts, total };
}

/**
 * The record of one completed attempt.
 *
 * The same shape the standalone bench posts to its parent frame, so a backend
 * written against that one accepts this unchanged, plus the bench seed this
 * workspace runs on. Both the reading and the angle the student's own trace
 * carried are kept: a teacher can see whether a wrong answer came from a bad
 * sighting or from a bad reading of a good trace.
 */
export interface PrismAttemptRecord {
  practical: 'prism-ray-path';
  experiment: '13';
  bench_seed: number;
  score: number;
  max: 100;
  time: string;
  apparatus: { prism_angle_deg: number; refractive_index: number; critical_angle_deg: number };
  parts: Record<PartKey, MarkedPart>;
  rays: {
    ray: number;
    i_recorded: number | null;
    i_traced: number | null;
    e_recorded: number | null;
    e_traced: number | null;
    D_recorded: number | null;
    D_traced: number | null;
    sighting_error_deg: number | null;
    pin_gap_cm: [number, number] | null;
    total_internal_reflection: boolean;
  }[];
  conclusion: {
    leastRay: number;
    picked: number;
    Dm: number;
    n_from_Dm: number;
    answers: (number | null)[];
  } | null;
  mistakes: Mistake[];
}

const two = (v: number | null): number | null => (v === null ? null : +v.toFixed(2));

export function buildAttemptRecord(s: PrismState): PrismAttemptRecord {
  const p = scoreParts(s);
  return {
    practical: 'prism-ray-path',
    experiment: '13',
    bench_seed: s.seed,
    score: p.total,
    max: 100,
    time: formatClock(Math.max(0, s.tEnd - s.t0)),
    apparatus: {
      prism_angle_deg: APEX,
      refractive_index: s.n,
      critical_angle_deg: +criticalAngle(s.n).toFixed(2),
    },
    parts: Object.fromEntries(
      PART_KEYS.map((k) => [k, { earned: +p[k].toFixed(2), max: MAX[k], basis: BASIS[k] }]),
    ) as Record<PartKey, MarkedPart>,
    rays: s.trials.map((t) => ({
      ray: t.k + 1,
      i_recorded: t.meas.i,
      i_traced: two(t.i),
      e_recorded: t.meas.e,
      e_traced: two(t.e),
      D_recorded: t.meas.D,
      D_traced: two(t.D),
      sighting_error_deg: two(t.err),
      pin_gap_cm:
        t.pins.length === 4
          ? [
              +(vlen(vsub(t.pins[0]!, t.pins[1]!)) / SCALE).toFixed(1),
              +(vlen(vsub(t.pins[2]!, t.pins[3]!)) / SCALE).toFixed(1),
            ]
          : null,
      total_internal_reflection: t.tir,
    })),
    conclusion: s.result
      ? {
          leastRay: s.result.least + 1,
          picked: s.result.picked + 1,
          Dm: s.result.Dm,
          n_from_Dm: s.result.nFromDm,
          answers: s.concl.map((c) => (c ? c.pick : null)),
        }
      : null,
    mistakes: s.log,
  };
}
