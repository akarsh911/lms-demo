import { markedParts } from '../marking';
import { formatClock } from '../numbers';
import type { MarkedPart, Mistake } from '../types';

import {
  BASIS,
  CONCL,
  MAX,
  PART_KEYS,
  PIN_SPREAD_CM,
  angleMarksFor,
  indexMarksFor,
  pinMarksFor,
  type PartKey,
} from './marking';
import {
  NG,
  OX,
  PX_CM,
  indexFrom,
  mm,
  perp,
  sightOff,
  slabThicknessCm,
  sub,
  traceOf,
  vlen,
  type SlabSpec,
  type Vec,
} from './optics';
import {
  setupDone,
  traceOfTrial,
  type GlassSlabState,
  type PinMarks,
  type Trial,
} from './state';

export type GlassSlabScore = Record<PartKey, number> & { total: number };

/**
 * What one trace's four pins were worth.
 *
 * The incident pair is marked against the ray the student DREW; the emergent
 * pair against the ray the light really leaves along, which is what their eye
 * was lining up with through the glass. A pair closer than 2 cm is halved:
 * two pins together fix a direction very poorly, and the marking has to say so
 * or the method degenerates into two dots and a guess.
 */
export function scorePins(tr: Trial, slab: SlabSpec): PinMarks {
  const o = traceOf(tr, slab);
  const O: Vec = { x: OX, y: slab.y };
  const spread = (a: Vec | undefined, b: Vec | undefined): number =>
    a && b && vlen(sub(b, a)) >= PIN_SPREAD_CM * PX_CM ? 1 : 0.5;

  const offInc = [0, 1].map((k) => {
    const p = tr.pins[k];
    return p && o.drawDir ? Math.abs(perp(p, O, o.drawDir)) / mm(1) : Number.POSITIVE_INFINITY;
  });
  const offEmg = [2, 3].map((k) => {
    const p = tr.pins[k];
    const off = p ? sightOff(tr, slab, p) : null;
    return off === null ? Number.POSITIVE_INFINITY : Math.abs(off) / mm(1);
  });

  const worstInc = Math.max(...offInc);
  const worstEmg = Math.max(...offEmg);
  const inc = pinMarksFor(worstInc, 2) * spread(tr.pins[0], tr.pins[1]);
  const emg = pinMarksFor(worstEmg, 3) * spread(tr.pins[2], tr.pins[3]);

  return {
    inc,
    emg,
    offInc: +worstInc.toFixed(2),
    offEmg: +worstEmg.toFixed(2),
    total: inc + emg,
  };
}

/** The mean of sin i / sin r over the three traces, once all three are measured. */
export function meanIndex(s: GlassSlabState): number | null {
  const v = s.trials
    .filter((t) => t.meas.i !== null && t.meas.r !== null && (t.meas.r ?? 0) > 0)
    .map((t) => indexFrom(t.meas.i ?? 0, t.meas.r ?? 0));
  return v.length === s.trials.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/**
 * Marks earned so far, per part.
 *
 * Every angle is marked against the angle the STUDENT'S OWN TRACE makes, not
 * against the textbook value: a student whose pins were a little out but who
 * then read their own drawing honestly keeps the reading marks and loses the
 * pin marks, which is exactly where the error was.
 */
export function scoreParts(s: GlassSlabState): GlassSlabScore {
  const parts: Record<PartKey, number> = {
    setup: setupDone(s) ? Math.max(0, MAX.setup - s.setupDed) : 0,
    pins: s.trials.reduce((a, t) => a + (t.pinPts ? t.pinPts.total : 0), 0),
    angles: 0,
    index: 0,
    concl: s.concl.reduce((a, c) => a + (c ? c.pts : 0), 0),
    viva: s.viva.reduce((a, v) => a + (v ? v.pts : 0), 0),
  };

  s.trials.forEach((t, k) => {
    if (!t.joined) return;
    const ang = traceOfTrial(s, k).ang;
    if (!ang) return;
    (['i', 'r', 'e'] as const).forEach((key) => {
      const wrote = t.meas[key];
      if (wrote === null) return;
      parts.angles += angleMarksFor(Math.abs(wrote - ang[key]));
    });
  });

  const n = meanIndex(s);
  if (n !== null) parts.index = indexMarksFor(Math.abs(n - NG));

  const total = Math.round(PART_KEYS.reduce((a, k) => a + parts[k], 0) * 10) / 10;
  return { ...parts, total };
}

/**
 * The record of one completed attempt.
 *
 * The same shape `lms-lab-engine` posts to its parent frame, plus the bench
 * seed, so a backend written against the standalone bench accepts this one
 * unchanged. The grading basis travels with the marks, so a grade can be
 * audited without this code.
 */
export interface GlassSlabAttemptRecord {
  practical: 'glass-slab-refraction';
  experiment: '11';
  bench_seed: number;
  score: number;
  max: 100;
  time: string;
  slab: { n: number; thickness_cm: number };
  parts: Record<string, MarkedPart>;
  trials: {
    target_deg: number;
    drawn_deg: number | null;
    recorded: { i: number | null; r: number | null; e: number | null };
    from_your_trace: { i: number; r: number; e: number } | null;
    n_from_your_readings: number | null;
    lateral_cm: number | null;
    pin_offsets_mm: { incident: number; emergent: number } | null;
  }[];
  mean_index: number | null;
  conclusions: { q: string; picked: string | null; correct: boolean | null }[];
  mistakes: Mistake[];
}

export function buildAttemptRecord(s: GlassSlabState): GlassSlabAttemptRecord {
  const score = scoreParts(s);
  const n = meanIndex(s);
  return {
    practical: 'glass-slab-refraction',
    experiment: '11',
    bench_seed: s.seed,
    score: score.total,
    max: 100,
    time: formatClock((s.tEnd || s.t0) - s.t0),
    slab: { n: NG, thickness_cm: slabThicknessCm(s.slab) },
    parts: markedParts(
      PART_KEYS.map((key) => ({ key, max: MAX[key], basis: BASIS[key] })),
      score,
    ),
    trials: s.trials.map((t, k) => {
      const ang = t.joined ? traceOfTrial(s, k).ang : null;
      return {
        target_deg: t.target,
        drawn_deg: t.drawn === null ? null : Math.abs(90 - t.drawn),
        recorded: { i: t.meas.i, r: t.meas.r, e: t.meas.e },
        from_your_trace: ang
          ? { i: +ang.i.toFixed(1), r: +ang.r.toFixed(1), e: +ang.e.toFixed(1) }
          : null,
        n_from_your_readings:
          t.meas.i !== null && t.meas.r ? +indexFrom(t.meas.i, t.meas.r).toFixed(3) : null,
        lateral_cm: t.lat,
        pin_offsets_mm: t.pinPts ? { incident: t.pinPts.offInc, emergent: t.pinPts.offEmg } : null,
      };
    }),
    mean_index: n === null ? null : +n.toFixed(3),
    conclusions: s.concl.map((c, i) => ({
      q: CONCL[i]?.q ?? '',
      picked: c ? (CONCL[i]?.o[c.pick] ?? null) : null,
      correct: c ? c.pick === c.a : null,
    })),
    mistakes: s.log,
  };
}

/** The one line above the marks: how long it took, and what the trace gave. */
export function glassSlabSummary(s: GlassSlabState): string {
  const n = meanIndex(s);
  return `${formatClock((s.tEnd || s.t0) - s.t0)} on bench #${s.seed} · a ${slabThicknessCm(
    s.slab,
  ).toFixed(1)} cm slab, and your traces give sin i / sin r = ${
    n === null ? '—' : n.toFixed(2)
  } against n = 1.50`;
}
