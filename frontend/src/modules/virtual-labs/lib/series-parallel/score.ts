import { formatClock } from '../numbers';
import type { MarkedPart, Mistake } from '../types';

import { CONFIGS, CONFIG_IDS, type ConfigId } from './apparatus';
import { LAST_READ_STAGE, MAX, PART_KEYS, basisFor, type PartKey } from './marking';
import type { LabMethod } from './method';
import { meanResistance, type LabState } from './state';

export type ScoreParts = Record<PartKey, number> & { total: number };

/** Marks earned so far, per part. Procedure marks count once all four circuits are read. */
export function scoreParts(s: LabState): ScoreParts {
  const circuits = CONFIG_IDS.map((id) => s.cfg[id]);
  const parts: Record<PartKey, number> = {
    lc: s.lc.A.pts + s.lc.V.pts,
    circuit: circuits.reduce((a, c) => a + c.pts, 0),
    procedure: s.stage > LAST_READ_STAGE ? Math.max(0, MAX.procedure - s.procDed) : 0,
    readings: circuits.reduce(
      (a, c, i) =>
        a + c.readings.slice(0, CONFIGS[CONFIG_IDS[i]!].readings).reduce((b, r) => b + r.pts, 0),
      0,
    ),
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
 * the marks, so a grade can be audited without this code.
 */
export interface CircuitRecord {
  mean_R: number;
  failed_checks: number;
  hints: number;
  readings: {
    /** How many cells drove this reading, under the cells method. */
    cells: number | null;
    I_entered: number;
    V_entered: number;
    I_meter: number;
    V_meter: number;
    pts: number;
  }[];
}

export interface SeriesParallelAttemptRecord {
  bench_seed: number;
  method: LabMethod;
  true_ohms: { r1: number; r2: number };
  score: number;
  max: 100;
  time: string;
  parts: Record<PartKey, MarkedPart>;
  circuits: Record<ConfigId, CircuitRecord>;
  result: {
    Rs_entered: number;
    Rp_entered: number;
    Rs_theory: number;
    Rp_theory: number;
    Rs_measured: number;
    Rp_measured: number;
    pts: number;
  } | null;
  mistakes: Mistake[];
}

export function buildAttemptRecord(s: LabState): SeriesParallelAttemptRecord {
  const p = scoreParts(s);
  const basis = basisFor(s.method);
  const round4 = (n: number): number => (Number.isFinite(n) ? +n.toFixed(4) : 0);

  return {
    bench_seed: s.seed,
    method: s.method,
    true_ohms: { r1: s.R.r1, r2: s.R.r2 },
    score: p.total,
    max: 100,
    time: formatClock(s.tEnd - s.t0),
    parts: Object.fromEntries(
      PART_KEYS.map((k) => [k, { earned: +p[k].toFixed(2), max: MAX[k], basis: basis[k] }]),
    ) as Record<PartKey, MarkedPart>,
    circuits: Object.fromEntries(
      CONFIG_IDS.map((id) => {
        const c = s.cfg[id];
        return [
          id,
          {
            mean_R: round4(meanResistance(c)),
            failed_checks: c.fails,
            hints: c.hints,
            readings: c.readings.map((r) => ({
              cells: r.cells,
              I_entered: r.I,
              V_entered: r.V,
              I_meter: +Math.abs(r.trueI).toFixed(4),
              V_meter: +Math.abs(r.trueV).toFixed(4),
              pts: r.pts,
            })),
          } satisfies CircuitRecord,
        ];
      }),
    ) as Record<ConfigId, CircuitRecord>,
    result: s.result
      ? {
          Rs_entered: s.result.rsIn,
          Rp_entered: s.result.rpIn,
          Rs_theory: round4(s.result.ts),
          Rp_theory: round4(s.result.tp),
          Rs_measured: round4(s.result.ms),
          Rp_measured: round4(s.result.mp),
          pts: s.result.pts,
        }
      : null,
    mistakes: s.log,
  };
}
