import { formatClock } from '../numbers';
import { deduct } from '../marking';
import type { MarkedPart, Mistake } from '../types';

import { analyse, liquidsFor, MLGAS, type LiquidId } from './chemistry';
import { BASIS, MAX, PART_KEYS, PENALTY, STEP, TEST_POINTS, type PartKey } from './marking';
import { CONCLUSIONS, ROWS, testList, testsDone } from './observations';
import { tubeSpoiled } from './rack';
import type { AceticAcidState } from './state';

export type ScoreParts = Record<PartKey, number> & { total: number };

/** Tubes holding a liquid their label does not mention. */
export function spoiledTubes(s: AceticAcidState): number {
  return s.tubes.filter((t, i) => tubeSpoiled(i, t)).length;
}

/**
 * Marks earned so far, per part.
 *
 * Setup is only awarded once the rack is finished, technique only once
 * something has actually been smelled: neither is a mark for doing nothing.
 */
export function scoreParts(s: AceticAcidState): ScoreParts {
  const parts: Record<PartKey, number> = {
    setup: s.step > STEP.setup ? deduct(MAX.setup, PENALTY.spoiled * spoiledTubes(s)) : 0,
    technique: s.tubes.some((t) => t.smelled) ? deduct(MAX.technique, PENALTY.sniff * s.sniffs) : 0,
    tests: TEST_POINTS * testsDone(s),
    obs: s.graded ? s.graded.pts : 0,
    concl: s.conclPts ?? 0,
    viva: s.viva.reduce((a, v) => a + (v ? v.pts : 0), 0),
  };
  return { ...parts, total: Math.round(PART_KEYS.reduce((a, k) => a + parts[k], 0)) };
}

/**
 * The record of one completed attempt.
 *
 * The same shape the standalone bench posts to its parent frame, so a backend
 * written against that one accepts this unchanged: every tube as it finished,
 * every row against what the tube actually showed, and the rule each part was
 * marked by.
 */
export interface AceticAcidAttemptRecord {
  practical: 'properties-of-acetic-acid';
  experiment: '8';
  bench_seed: number;
  acid_conc_mol_per_l: number;
  score: number;
  max: 100;
  time: string;
  parts: Record<PartKey, MarkedPart>;
  tubes: {
    tube: number;
    contents: Partial<Record<LiquidId, number>>;
    nahco3_mmol: number;
    pH: number | null;
    smelled: string | null;
    smell: string | null;
    layers: string | null;
    blue_litmus: string | null;
    red_litmus: string | null;
    ph_paper: number | null;
    gas_ml: number;
    gas_in_ml: number;
    lime_water_milky: number;
    splinter: string | null;
  }[];
  observations: {
    row: string;
    question: string;
    recorded: string | null;
    tube_showed: string | null;
    marks: number;
  }[];
  conclusion: { id: string; picked: string | null; correct: string }[];
  tests_done: string[];
  mistakes: Mistake[];
}

export function buildAttemptRecord(s: AceticAcidState): AceticAcidAttemptRecord {
  const p = scoreParts(s);
  const L = liquidsFor(s.acidConc);
  return {
    practical: 'properties-of-acetic-acid',
    experiment: '8',
    bench_seed: s.seed,
    acid_conc_mol_per_l: s.acidConc,
    score: p.total,
    max: 100,
    time: formatClock((s.tEnd || s.t0) - s.t0),
    parts: Object.fromEntries(
      PART_KEYS.map((k) => [k, { earned: +p[k].toFixed(2), max: MAX[k], basis: BASIS[k] }]),
    ) as Record<PartKey, MarkedPart>,
    tubes: s.tubes.map((t, i) => {
      const ph = analyse(t, L).ph;
      return {
        tube: i + 1,
        contents: { ...t.liq },
        nahco3_mmol: +t.solidAdded.toFixed(2),
        pH: ph === null ? null : +ph.toFixed(2),
        smelled: t.smelled,
        smell: t.smellSeen,
        layers: t.layersSeen,
        blue_litmus: t.strips.blue?.hue ?? null,
        red_litmus: t.strips.red?.hue ?? null,
        ph_paper: t.phPaper === null ? null : +t.phPaper.toFixed(2),
        gas_ml: +(t.gasMade * MLGAS).toFixed(1),
        gas_in_ml: +(t.gasIn * MLGAS).toFixed(1),
        lime_water_milky: +t.milkyMax.toFixed(2),
        splinter: t.splinter,
      };
    }),
    observations: ROWS.map((r) => ({
      row: r.id,
      question: r.q,
      recorded: s.rec[r.id] ?? null,
      tube_showed: s.graded ? (s.graded.cells[r.id]?.truth ?? null) : null,
      marks: s.graded ? (s.graded.cells[r.id]?.pts ?? 0) : 0,
    })),
    conclusion: CONCLUSIONS.map((c) => ({ id: c.id, picked: s.concl[c.id] ?? null, correct: c.truth(s) })),
    tests_done: testList(s)
      .filter(([, ok]) => ok)
      .map(([name]) => name),
    mistakes: s.log,
  };
}
