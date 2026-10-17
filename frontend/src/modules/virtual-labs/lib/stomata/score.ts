import { markedParts } from '../marking';
import { formatClock } from '../numbers';
import type { MarkedPart, Mistake } from '../types';

import { BASIS, MAX, OBS, PART_KEYS, PINS, type PartKey } from './marking';
import type { StomataState } from './state';

/**
 * Marking.
 *
 * The peel and the mount are marked from the slide that was actually looked at;
 * the focusing from what the microscope actually did; the observations and the
 * count from the field of view at the moment they were submitted.
 */

/** 4 for the right surface, 4 for a thin unbroken sheet, 2 for floating it. */
export function peelPts(s: StomataState): number {
  const pl = s.slide.peel;
  if (!pl) return 0;
  return (pl.surface === 'lower' ? 4 : 0) + (!pl.thick && !pl.torn ? 4 : 0) + (pl.floated ? 2 : 0);
}

/** Water first, a drop or two of safranin, the coverslip at an angle, blotted. */
export function mountPts(s: StomataState): number {
  const sl = s.slide;
  if (!sl.peel || !sl.cover) return 0;
  let p = 0;
  if (sl.waterFirst) p += 4;
  if (sl.stain >= 1 && sl.stain <= 3) p += 4;
  else if (sl.stain >= 4) p += 2;
  if (sl.cover.angle) p += 4;
  if (sl.blotted) p += 4;
  return Math.max(0, p - 2 * s.wasted);
}

/**
 * The habit, not the luck: found on low power FIRST, centred before switching,
 * then however sharp the high-power field ever got. A cracked slide costs 6.
 */
export function focusPts(s: StomataState): number {
  const m = s.mic;
  const lf = m.switched ? m.lowFirst : m.foundLow;
  const cf = m.switched ? m.centredFirst : m.centredLow;
  const b = m.bestHigh;
  const p = (lf ? 4 : 0) + (cf ? 4 : 0) + (b >= 0.85 ? 6 : b >= 0.6 ? 4 : b >= 0.35 ? 2 : 0);
  return Math.max(0, p - 6 * s.broken);
}

/** Exact, one out, two out. Counted against the stomata visible in that field. */
export function countPts(said: number, truth: number): number {
  const e = Math.abs(said - truth);
  return e === 0 ? MAX.count : e === 1 ? 5 : e === 2 ? 2 : 0;
}

export type ScoreParts = Record<PartKey, number> & { total: number };

export function scoreParts(s: StomataState): ScoreParts {
  const f = s.frozen;
  const parts: Record<PartKey, number> = {
    peel: f ? f.peel : peelPts(s),
    mount: f ? f.mount : mountPts(s),
    focus: f ? f.focus : focusPts(s),
    obs: s.graded ? s.graded.obs : 0,
    count: s.graded ? s.graded.count : 0,
    label: s.graded ? s.graded.label : 0,
    concl: s.conclDone ? s.conclDone.pts : 0,
    viva: s.viva.reduce((a, v) => a + (v ? v.pts : 0), 0),
  };
  return { ...parts, total: Math.round(PART_KEYS.reduce((a, k) => a + parts[k], 0)) };
}

export function stomataMarkedParts(s: StomataState): Record<string, MarkedPart> {
  return markedParts(
    PART_KEYS.map((key) => ({ key, max: MAX[key], basis: BASIS[key] })),
    scoreParts(s),
  );
}

// ---------------------------------------------------------------------------
// The attempt record
// ---------------------------------------------------------------------------

export interface StomataAttemptRecord {
  bench_seed: number;
  score: number;
  max: 100;
  time: string;
  parts: Record<string, MarkedPart>;
  mount: {
    surface: string | null;
    thick: boolean;
    torn: boolean;
    floated: boolean;
    curled: boolean;
    water_drops: number;
    safranin_drops: number;
    glycerine: boolean;
    coverslip: string | null;
    bubbles: number;
    blotted: boolean;
    dry: boolean;
    broken_slides: number;
    discarded_mounts: number;
  };
  focusing: {
    found_on_low_power_first: boolean;
    centred_before_switching: boolean;
    best_high_power_sharpness: number;
    final_objective: string;
  };
  observations: { line: string; recorded: string; field_showed: string }[];
  stomata: { counted: number; visible_in_field: number; hidden_under_bubbles: number } | null;
  labels: { pin: string; named: string; actually: string }[];
  conclusion: {
    surface_named: string;
    matches_what_was_peeled: boolean;
    more_stomata_on: string;
    correct: boolean;
  } | null;
  mistakes: Mistake[];
}

export function buildAttemptRecord(s: StomataState): StomataAttemptRecord {
  const sl = s.slide;
  const g = s.graded;

  return {
    bench_seed: s.seed,
    score: scoreParts(s).total,
    max: 100,
    time: formatClock((s.tEnd || s.t0) - s.t0),
    parts: stomataMarkedParts(s),
    mount: {
      surface: sl.peel ? sl.peel.surface : null,
      thick: !!sl.peel?.thick,
      torn: !!sl.peel?.torn,
      floated: !!sl.peel?.floated,
      curled: !!sl.peel?.curled,
      water_drops: sl.water,
      safranin_drops: sl.stain,
      glycerine: sl.glyc,
      coverslip: sl.cover ? (sl.cover.angle ? 'lowered at an angle' : 'dropped flat') : null,
      bubbles: sl.bubbles.length,
      blotted: sl.blotted,
      dry: sl.dry,
      broken_slides: s.broken,
      discarded_mounts: s.wasted,
    },
    focusing: {
      found_on_low_power_first: s.mic.switched ? s.mic.lowFirst : s.mic.foundLow,
      centred_before_switching: s.mic.switched ? s.mic.centredFirst : s.mic.centredLow,
      best_high_power_sharpness: +s.mic.bestHigh.toFixed(2),
      final_objective: `${s.mic.obj}×`,
    },
    observations: g
      ? OBS.map((o) => ({
          line: o.q,
          recorded: g.obsCells[o.id]?.mine ?? '',
          field_showed: g.obsCells[o.id]?.truth ?? '',
        }))
      : [],
    stomata: g
      ? { counted: g.said, visible_in_field: g.trueCount, hidden_under_bubbles: g.hidden }
      : null,
    labels: g
      ? PINS.map((p) => ({
          pin: p,
          named: s.labels[p] ?? '',
          actually: g.labelCells[p]?.truth ?? s.labelMap[p] ?? '',
        }))
      : [],
    conclusion: s.conclDone
      ? {
          surface_named: s.conclDone.mine,
          matches_what_was_peeled: s.conclDone.consistent,
          more_stomata_on: s.conclDone.truth,
          correct: s.conclDone.truthOk,
        }
      : null,
    mistakes: s.log,
  };
}
