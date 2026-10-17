import { markedParts } from '../marking';
import { formatClock } from '../numbers';
import type { MarkedPart, Mistake } from '../types';

import { SALT, tubeKey, type Metal } from './chemistry';
import { BASIS, MAX, PART_KEYS, describe, type PartKey } from './marking';
import type { Conclusion, RxState } from './state';

export type ScoreParts = Record<PartKey, number> & { total: number };

/** Marks earned so far, per part. Each stage banks its own as it completes. */
export function scoreParts(s: RxState): ScoreParts {
  const parts: Record<PartKey, number> = {
    setup: s.pts.setup,
    metals: s.pts.metals,
    observe: s.pts.observe,
    conclude: s.pts.conclude,
    viva: s.viva.reduce((a, v) => a + (v ? v.pts : 0), 0),
  };
  return { ...parts, total: Math.round(PART_KEYS.reduce((a, k) => a + parts[k], 0)) };
}

/**
 * The record of one completed attempt, handed to the labs service.
 *
 * The same shape the standalone bench posts to its parent frame, so a backend
 * written against it accepts this one unchanged. Every tube travels with what
 * the student wrote AND what the tube actually showed, and every part with the
 * rule that marked it, so a grade can be audited without this code.
 */
export interface ReactivityAttemptRecord {
  bench_seed: number;
  score: number;
  max: 100;
  time: string;
  lab_minutes_waited: number;
  parts: Record<string, MarkedPart>;
  strips_cleaned_before_use: Partial<Record<Metal, boolean>>;
  observations: Record<string, { recorded: string; tube_showed: string; pts: number }>;
  conclusion: Conclusion | null;
  mistakes: Mistake[];
}

export function buildAttemptRecord(s: RxState): ReactivityAttemptRecord {
  const p = scoreParts(s);
  return {
    bench_seed: s.seed,
    score: p.total,
    max: 100,
    time: formatClock((s.tEnd || s.t0) - s.t0),
    lab_minutes_waited: s.graded ? s.graded.min : s.min,
    parts: markedParts(
      PART_KEYS.map((k) => ({ key: k, max: MAX[k], basis: BASIS[k] })),
      p,
    ),
    strips_cleaned_before_use: s.cleanAtFirstUse,
    observations: Object.fromEntries(
      s.tubes.map((t) => {
        const key = tubeKey(t.metal, t.salt);
        const cell = s.graded?.cells[key];
        return [
          `${t.metal} in ${SALT[t.salt].label}`,
          {
            recorded: describe(s.rec[key]),
            tube_showed: cell ? describe(cell.truth) : '—',
            pts: cell ? cell.pts : 0,
          },
        ];
      }),
    ),
    conclusion: s.concl,
    mistakes: s.log,
  };
}
