import { formatClock } from '../numbers';
import { deduct, markedParts } from '../marking';
import type { MarkedPart, Mistake } from '../types';

import { isLitmusTest, pHof, REAGENTS, tubeWith } from './chemistry';
import { BASIS, MAX, PART_KEYS, type PartKey } from './marking';
import type { AcidBaseState } from './state';

export type ScoreParts = Record<PartKey, number> & { total: number };

/** The tube a gas mark is about: the acid one, since only the acid names a gas. */
export const zincAcidTube = (s: AcidBaseState): number => tubeWith(s.layout, 'HCl', 'Zn');
export const carbonateAcidTube = (s: AcidBaseState): number => tubeWith(s.layout, 'HCl', 'Na2CO3');

/** 2 for each of the eight tests actually set up as its tube calls for. */
export function testsSetUp(s: AcidBaseState): number {
  return s.layout.reduce((n, spec, i) => {
    const t = s.tubes[i]!;
    const ok = isLitmusTest(spec)
      ? t.drops[spec.test as 'blue' | 'red'] > 0
      : t.put[spec.test as 'Zn' | 'Na2CO3'] > 0;
    return n + (ok ? 1 : 0);
  }, 0);
}

export function scoreParts(s: AcidBaseState): ScoreParts {
  const parts: Record<PartKey, number> = {
    // Filling is only marked once the stage has been left: before that the
    // student is still pouring and a half-filled rack is not a bad one.
    setup: s.step > 0 ? deduct(MAX.setup, 2 * s.contam) : 0,
    tests: testsSetUp(s) * 2,
    gas:
      (s.tubes[zincAcidTube(s)]?.ident.H2 ? 5 : 0) + (s.tubes[carbonateAcidTube(s)]?.ident.CO2 ? 5 : 0),
    obs: s.obsPts,
    concl: s.concl.reduce((a, c) => a + (c ? c.pts : 0), 0),
    viva: s.viva.reduce((a, v) => a + (v ? v.pts : 0), 0),
  };
  return { ...parts, total: Math.round(PART_KEYS.reduce((a, k) => a + parts[k], 0)) };
}

export interface AcidBaseObservation {
  tube: string;
  contents: string;
  pH: number | null;
  recorded: string | null;
  tube_showed: string | null;
  marks: number;
  gas_tests: { splinter: string | null; lime_water: string | null };
}

/**
 * The record of one completed attempt.
 *
 * Same shape the standalone bench posts as `{type: 'lab-bench:attempt'}`, plus
 * the bench seed, which is what makes this attempt reproducible: the seed
 * decides which tube of each pair held the acid.
 */
export interface AcidBaseAttemptRecord {
  practical: 'acids-bases-properties';
  experiment: '1B';
  bench_seed: number;
  score: number;
  max: 100;
  time: string;
  parts: Record<PartKey, MarkedPart>;
  observations: AcidBaseObservation[];
  conclusions: { q: string; correct: boolean }[];
  mistakes: Mistake[];
}

export function buildAttemptRecord(
  s: AcidBaseState,
  conclusions: readonly { q: string; a: number }[],
): AcidBaseAttemptRecord {
  const p = scoreParts(s);
  return {
    practical: 'acids-bases-properties',
    experiment: '1B',
    bench_seed: s.seed,
    score: p.total,
    max: 100,
    time: formatClock((s.tEnd || s.t0) - s.t0),
    parts: markedParts(
      PART_KEYS.map((key) => ({ key, max: MAX[key], basis: BASIS[key] })),
      p,
    ) as Record<PartKey, MarkedPart>,
    observations: s.layout.map((spec, i) => {
      const t = s.tubes[i]!;
      const graded = s.graded?.[i] ?? null;
      const ph = pHof(t);
      return {
        tube: spec.id,
        contents: `${REAGENTS[spec.reagent].label} + ${spec.what}`,
        pH: ph === null ? null : +ph.toFixed(2),
        recorded: graded ? graded.recorded : null,
        tube_showed: graded ? graded.truth : null,
        marks: graded ? graded.pts : 0,
        gas_tests: { splinter: t.tests.splinter, lime_water: t.tests.lime },
      };
    }),
    conclusions: conclusions.map((c, i) => ({ q: c.q, correct: s.concl[i]?.pick === c.a })),
    mistakes: s.log,
  };
}
