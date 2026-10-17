import { deduct, markedParts } from '../marking';
import { formatClock } from '../numbers';
import type { MarkedPart, Mistake } from '../types';

import {
  BASIS,
  FREE_MISSES,
  LABELS,
  MAX,
  MISS_PENALTY,
  PART_KEYS,
  PREP_FULL,
  PREP_HALF,
  RUIN_PENALTY,
  TABLE_ROWS,
  TEAR_PENALTY,
  CONCL,
  type PartKey,
} from './marking';
import { SPECIES, exposed, softness, swellFrac, swollenPercent, type PartId } from './seed-model';
import type { DicotSeedState } from './state';

export type DicotSeedScore = Record<PartKey, number> & { total: number };

/**
 * Marks earned so far.
 *
 * Every mark is recomputed from the state rather than frozen when a step ended,
 * so a ruined seed or a mis-dropped label keeps costing what it should. The
 * soaking and the dissection are marked on the seed that was actually opened —
 * a student who wrecked three and then soaked a fourth properly is marked on
 * the fourth for its swelling and pays for the three in the dissection.
 */
export function scoreDicotParts(s: DicotSeedState): DicotSeedScore {
  const sd = s.dissected;
  const swell = sd ? swellFrac(sd.h) : 0;

  const parts: Record<PartKey, number> = {
    prep: !sd ? 0 : swell >= PREP_FULL ? MAX.prep : swell >= PREP_HALF ? MAX.prep / 2 : 0,
    external: deduct(
      (s.found.hilum ? MAX.external / 2 : 0) + (s.found.micropyle ? MAX.external / 2 : 0),
      MISS_PENALTY * Math.max(0, s.misses - FREE_MISSES),
    ),
    dissect: sd ? deduct(MAX.dissect, RUIN_PENALTY * s.ruinedCount + TEAR_PENALTY * s.tornCount) : 0,
    label: s.pts.label,
    table: s.pts.table,
    concl: s.pts.concl,
    viva: s.viva.reduce((a, v) => a + (v ? v.pts : 0), 0),
  };

  return { ...parts, total: Math.round(PART_KEYS.reduce((a, k) => a + parts[k], 0) * 10) / 10 };
}

/**
 * The record of one completed attempt.
 *
 * The same shape the standalone bench posts to its parent frame, plus the bench
 * seed, so a backend written against that one accepts this unchanged. The
 * grading basis travels with the marks, so a grade can be audited without this
 * code — and the seed's own history travels with it, because "10 for soaking"
 * means nothing without "soaked 12 h, swollen to 156%".
 */
export interface DicotSeedAttemptRecord {
  practical: 'dicot-seed-embryo';
  experiment: '14';
  bench_seed: number;
  score: number;
  max: 100;
  time: string;
  parts: Record<string, MarkedPart>;
  seed: {
    species: string;
    name: string;
    soaked_hours: number;
    swollen_to_percent: number;
    coat_softness: number;
    coat_removed: boolean;
    split_plane: string | null;
    exposed: PartId[];
  } | null;
  seeds_ruined: number;
  coats_torn: number;
  lens_stray_taps: number;
  labels: {
    label: string;
    placed: boolean;
    figure: string | null;
    at: [number, number] | null;
    landed_on: PartId | null;
    correct: boolean | null;
  }[];
  table: { part: PartId; is: string | null; does: string | null; marks: number }[];
  conclusion: { id: string; a: string | null; b: string | null; correct: boolean | null }[];
  germination: { species: string; hours: number; radicle_out: boolean; plumule_out: boolean } | null;
  lab_clock_hours: number;
  mistakes: Mistake[];
}

export function buildDicotSeedAttempt(s: DicotSeedState): DicotSeedAttemptRecord {
  const score = scoreDicotParts(s);
  const sd = s.dissected;
  const lg = s.labelGrade;
  const tg = s.tableGrade;
  const cg = s.conclGrade;
  const shown = sd ? exposed(sd) : null;

  return {
    practical: 'dicot-seed-embryo',
    experiment: '14',
    bench_seed: s.seed,
    score: score.total,
    max: 100,
    time: formatClock((s.tEnd || s.t0) - s.t0),
    parts: markedParts(
      PART_KEYS.map((key) => ({ key, max: MAX[key], basis: BASIS[key] })),
      score,
    ),
    seed: sd
      ? {
          species: sd.sp,
          name: SPECIES[sd.sp].name,
          soaked_hours: sd.h,
          swollen_to_percent: swollenPercent(sd),
          coat_softness: +softness(sd.h).toFixed(3),
          coat_removed: !sd.coat,
          split_plane: sd.split,
          exposed: shown ? (Object.keys(shown) as PartId[]).filter((k) => shown[k]) : [],
        }
      : null,
    seeds_ruined: s.ruinedCount,
    coats_torn: s.tornCount,
    lens_stray_taps: s.misses,
    labels: LABELS.map((k) => {
      const pin = s.labels[k];
      const g = lg?.[k];
      return {
        label: k,
        placed: Boolean(pin),
        figure: pin ? pin.fig : null,
        at: pin ? ([pin.x, pin.y] as [number, number]) : null,
        landed_on: g ? g.got : null,
        correct: g ? g.ok : null,
      };
    }),
    table: TABLE_ROWS.map((r) => ({
      part: r.id,
      is: s.rec[r.id]?.is || null,
      does: s.rec[r.id]?.does || null,
      marks: tg?.[r.id]?.pts ?? 0,
    })),
    conclusion: CONCL.map((c) => {
      const g = cg?.[c.id];
      return {
        id: c.id,
        a: s.concl[c.id]?.a || null,
        b: s.concl[c.id]?.b || null,
        correct: g ? g.a && g.b : null,
      };
    }),
    germination: s.germ
      ? {
          species: s.germ.sp,
          hours: s.germ.g,
          radicle_out: s.germ.g > 18,
          plumule_out: s.germ.g > 42,
        }
      : null,
    lab_clock_hours: s.clock,
    mistakes: s.log,
  };
}

/** The one line above the marks: how long it took, and what was on the tile. */
export function dicotSeedSummary(s: DicotSeedState): string {
  const sd = s.dissected;
  const right = s.labelGrade ? LABELS.filter((k) => s.labelGrade?.[k].ok).length : 0;
  const specimen = sd ? `${SPECIES[sd.sp].name}, soaked ${sd.h} h` : 'no seed dissected';
  return `${formatClock((s.tEnd || s.t0) - s.t0)} on bench #${s.seed} · ${specimen} · ${right}/6 parts correctly labelled`;
}
