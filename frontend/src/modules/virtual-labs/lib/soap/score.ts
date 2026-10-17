import { markedParts } from '../marking';
import { formatClock } from '../numbers';
import type { MarkedPart, Mistake } from '../types';

import { WATER_BY_ID } from './chemistry';
import {
  BASIS,
  MAX,
  PART_KEYS,
  SETUP_PER_TUBE,
  STEP,
  TUBES,
  TUBE_A,
  TUBE_B,
  UNEQUAL_VOLUME_PENALTY,
  type PartKey,
} from './marking';
import {
  entryAt,
  filledCorrectly,
  latherIn,
  tubeAt,
  volumeIn,
  type Conclusion,
  type Extension,
  type FairTest,
  type SoapState,
} from './state';

export type SoapScore = Record<PartKey, number> & { total: number };

/**
 * The setup marks, recomputed live rather than frozen when the fill step ended.
 *
 * Emptying a spoiled tube and refilling it earns them back — which is the point
 * of having "Empty and rinse" on the bench at all — and topping one tube up
 * after the other costs the equal-volumes marks the moment it happens.
 */
export function setupMarks(s: SoapState): number {
  let p = 0;
  for (const k of [TUBE_A, TUBE_B]) if (filledCorrectly(s, k)) p += SETUP_PER_TUBE;
  if (volumeIn(s, TUBE_A) !== volumeIn(s, TUBE_B)) p = Math.max(0, p - UNEQUAL_VOLUME_PENALTY);
  return p;
}

export function scoreSoapParts(s: SoapState): SoapScore {
  const parts: Record<PartKey, number> = {
    setup: s.step > STEP.fill ? setupMarks(s) : s.pts.setup,
    fair: s.pts.fair,
    heights: s.pts.heights,
    scum: s.pts.scum,
    extension: s.pts.extension,
    conclusion: s.pts.conclusion,
    viva: s.viva.reduce((a, v) => a + (v ? v.pts : 0), 0),
  };
  return { ...parts, total: Math.round(PART_KEYS.reduce((a, k) => a + parts[k], 0)) };
}

/**
 * The record of one completed attempt.
 *
 * The same shape `lms-lab-engine` posts to its parent frame, plus the bench
 * seed and the hardness it was dealt, so a teacher can reproduce the tubes
 * exactly. The grading basis travels with the marks, so a grade can be audited
 * without this code.
 */
export interface SoapAttemptRecord {
  practical: 'soap-soft-hard-water';
  experiment: '9';
  bench_seed: number;
  /** Ca²⁺/Mg²⁺ per mL in each bottle on this bench. */
  hardness: Record<string, number>;
  score: number;
  max: 100;
  time: string;
  parts: Record<string, MarkedPart>;
  tubes: {
    tube: string;
    water: string;
    poured: string[];
    mL_at_end: number;
    soap_drops_at_end: number;
    shakes_at_end: number;
    marked: boolean;
    lather_cm_recorded: number | null;
    lather_cm_when_marked: number | null;
    scum_recorded: string | null;
    scum_when_marked: boolean | null;
  }[];
  fair_test: FairTest | null;
  extension: Extension | null;
  conclusion: Conclusion | null;
  mistakes: Mistake[];
}

export function buildSoapAttempt(s: SoapState): SoapAttemptRecord {
  const score = scoreSoapParts(s);
  return {
    practical: 'soap-soft-hard-water',
    experiment: '9',
    bench_seed: s.seed,
    hardness: { ...s.hardness },
    score: score.total,
    max: 100,
    time: formatClock((s.tEnd || s.t0) - s.t0),
    parts: markedParts(
      PART_KEYS.map((key) => ({ key, max: MAX[key], basis: BASIS[key] })),
      score,
    ),
    tubes: TUBES.map((spec, k) => {
      const t = tubeAt(s, k);
      const cell = s.graded?.cells[k];
      const r = entryAt(s, k);
      const wrote = r.height.trim() === '' ? null : Number.parseFloat(r.height.replace(',', '.'));
      return {
        tube: spec.id,
        water: WATER_BY_ID[spec.water].name,
        poured: t.added.map((a) => WATER_BY_ID[a].label),
        mL_at_end: volumeIn(s, k),
        soap_drops_at_end: t.drops,
        shakes_at_end: t.shakes,
        marked: spec.marked,
        lather_cm_recorded: wrote !== null && Number.isNaN(wrote) ? null : wrote,
        lather_cm_when_marked: cell ? +cell.trueHeight.toFixed(2) : null,
        scum_recorded: r.scum === '' ? null : r.scum,
        scum_when_marked: cell ? cell.trueScum : null,
      };
    }),
    fair_test: s.fair,
    extension: s.ext,
    conclusion: s.concl,
    mistakes: s.log,
  };
}

/** The one line above the marks: how long it took, and the comparison itself. */
export function soapSummary(s: SoapState): string {
  const cells = s.graded?.cells;
  const froth = cells
    ? `froth A ${(cells[TUBE_A]?.trueHeight ?? 0).toFixed(2)} cm vs B ${(cells[TUBE_B]?.trueHeight ?? 0).toFixed(2)} cm`
    : `froth A ${latherIn(s, TUBE_A).lather.toFixed(2)} cm vs B ${latherIn(s, TUBE_B).lather.toFixed(2)} cm`;
  const ext = s.ext?.dropsNeeded ? ` · hard water lathered at ${s.ext.dropsNeeded} drops` : '';
  return `${formatClock((s.tEnd || s.t0) - s.t0)} on bench #${s.seed} · ${froth}${ext}`;
}
