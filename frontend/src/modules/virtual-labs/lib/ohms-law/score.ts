import { formatClock } from '../numbers';
import type { MarkedPart, Mistake } from '../types';

import { MAX, PART_KEYS, READINGS_REQUIRED, STEP, basisFor, type PartKey } from './marking';
import type { LabMethod } from './method';
import type { LabState } from './state';

export type ScoreParts = Record<PartKey, number> & { total: number };

/** Marks earned so far, per part. Procedure marks count once readings are done. */
export function scoreParts(s: LabState): ScoreParts {
  const parts: Record<PartKey, number> = {
    lc: s.lc.A.pts + s.lc.V.pts,
    circuit: s.circuit.pts,
    procedure: s.step > STEP.readings ? Math.max(0, MAX.procedure - s.procDed) : 0,
    readings: s.readings.slice(0, READINGS_REQUIRED).reduce((a, r) => a + r.pts, 0),
    result: s.result ? s.result.pts : 0,
    viva: s.viva.reduce((a, v) => a + (v ? v.pts : 0), 0),
  };
  const total = Math.round(PART_KEYS.reduce((a, k) => a + parts[k], 0));
  return { ...parts, total };
}

/**
 * The record of one completed attempt, sent to the LMS when the viva ends.
 *
 * The same shape `lms-lab-engine` posts to its parent frame as
 * `{type: 'lab-bench:attempt', record}`, so a backend written against the
 * standalone bench accepts this one unchanged. The grading basis travels with
 * the marks — resolved for the method actually used — so a grade can be audited
 * without this code.
 */
export interface OhmsLawAttemptRecord {
  bench_seed: number;
  method: LabMethod;
  true_R_ohm: number;
  score: number;
  max: 100;
  time: string;
  parts: Record<PartKey, MarkedPart>;
  readings: {
    /** How many cells drove this reading, under the cells method. */
    cells: number | null;
    I_entered: number;
    V_entered: number;
    I_meter: number;
    V_meter: number;
    pts: number;
  }[];
  R_from_graph: number | null;
  best_fit_slope: number | null;
  mistakes: Mistake[];
}

export function buildAttemptRecord(s: LabState): OhmsLawAttemptRecord {
  const p = scoreParts(s);
  const basis = basisFor(s.method);
  return {
    bench_seed: s.seed,
    method: s.method,
    true_R_ohm: s.R0,
    score: p.total,
    max: 100,
    time: formatClock(s.tEnd - s.t0),
    parts: Object.fromEntries(
      PART_KEYS.map((k) => [k, { earned: +p[k].toFixed(2), max: MAX[k], basis: basis[k] }]),
    ) as Record<PartKey, MarkedPart>,
    readings: s.readings.map((r) => ({
      cells: r.cells,
      I_entered: r.I,
      V_entered: r.V,
      I_meter: +Math.abs(r.trueI).toFixed(4),
      V_meter: +Math.abs(r.trueV).toFixed(4),
      pts: r.pts,
    })),
    R_from_graph: s.result ? s.result.r : null,
    best_fit_slope: s.result ? +s.result.fit.m.toFixed(4) : null,
    mistakes: s.log,
  };
}
