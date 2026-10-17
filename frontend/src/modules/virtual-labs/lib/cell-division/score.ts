import { deduct, markedParts } from '../marking';
import { formatClock } from '../numbers';
import type { MarkedPart, Mistake } from '../types';

import {
  BASIS,
  CONCLUSION,
  CRACK_PENALTY,
  DARK_MOUNT_PENALTY,
  FOCUS_FULL,
  FOCUS_HALF,
  FOCUS_MARKS_FULL,
  FOCUS_MARKS_HALF,
  HIGH_MOUNT_PENALTY,
  MAX,
  PART_KEYS,
  PER_SLIDE_TABLE_MARKS,
  STEP,
  type PartKey,
} from './marking';
import { FEATURE_TEXT } from './specimens';
import { specimenOf, type CellDivisionState } from './state';

export type CellDivisionScore = Record<PartKey, number> & { total: number };

/**
 * Marks earned so far.
 *
 * Focus and care are recomputed live rather than frozen at the end of a step: a
 * slide cracked after it was identified still costs, and a student who goes
 * back to a slide and finally gets a sharp 40× view of it still earns the mark.
 */
export function scoreCellDivision(s: CellDivisionState): CellDivisionScore {
  const parts: Record<PartKey, number> = {
    setup:
      s.step > STEP.setup
        ? deduct(
            MAX.setup,
            (s.flags.darkMount ? DARK_MOUNT_PENALTY : 0) + (s.flags.highMount ? HIGH_MOUNT_PENALTY : 0),
          )
        : 0,
    focus: s.tray.reduce(
      (a, slide) =>
        a + (slide.best >= FOCUS_FULL ? FOCUS_MARKS_FULL : slide.best >= FOCUS_HALF ? FOCUS_MARKS_HALF : 0),
      0,
    ),
    care: deduct(MAX.care, CRACK_PENALTY * s.tray.filter((slide) => slide.broken).length),
    ident: s.graded?.ident ?? 0,
    label: s.graded?.label ?? 0,
    seen: s.graded?.seen ?? 0,
    concl: s.concl.reduce((a, c) => a + (c ? c.pts : 0), 0),
    viva: s.viva.reduce((a, v) => a + (v ? v.pts : 0), 0),
  };
  return { ...parts, total: Math.round(PART_KEYS.reduce((a, k) => a + parts[k], 0)) };
}

/**
 * The record of one completed attempt.
 *
 * The same shape `lms-lab-engine` posts to its parent frame, plus the bench
 * seed, so a backend written against the standalone bench accepts this one
 * unchanged. What each slide really carried travels beside what the student
 * recorded, so a grade can be audited without this code.
 */
export interface CellDivisionAttemptRecord {
  practical: 'fission-and-budding';
  experiment: '12';
  bench_seed: number;
  score: number;
  max: 100;
  time: string;
  parts: Record<string, MarkedPart>;
  slides: {
    label: number;
    broken: boolean;
    best_view_at_40x: number;
    organism_recorded: string | null;
    organism_actual: string;
    process_recorded: string | null;
    process_actual: string;
    feature_recorded: string | null;
    feature_actual: string;
    labels: { pointer: number; recorded: string | null; actual: string }[];
  }[];
  conclusion: { q: string; picked: string | null; correct: boolean }[];
  mistakes: Mistake[];
}

export function buildCellDivisionAttempt(s: CellDivisionState): CellDivisionAttemptRecord {
  const score = scoreCellDivision(s);
  return {
    practical: 'fission-and-budding',
    experiment: '12',
    bench_seed: s.seed,
    score: score.total,
    max: 100,
    time: formatClock((s.tEnd || s.t0) - s.t0),
    parts: markedParts(
      PART_KEYS.map((key) => ({ key, max: MAX[key], basis: BASIS[key] })),
      score,
    ),
    slides: s.tray.map((slide) => {
      const spec = specimenOf(slide);
      return {
        label: slide.n,
        broken: slide.broken,
        best_view_at_40x: +slide.best.toFixed(3),
        organism_recorded: slide.org || null,
        organism_actual: spec.organism,
        process_recorded: slide.proc || null,
        process_actual: spec.process,
        feature_recorded: slide.seen ? FEATURE_TEXT[slide.seen] : null,
        feature_actual: FEATURE_TEXT[spec.feature],
        labels: spec.pins.map((pin, k) => ({
          pointer: k + 1,
          recorded: slide.labels[k] ?? null,
          actual: pin.part,
        })),
      };
    }),
    conclusion: CONCLUSION.map((c, i) => {
      const answer = s.concl[i];
      return {
        q: c.q,
        picked: answer ? (c.o[answer.pick] ?? null) : null,
        correct: Boolean(answer) && answer!.pick === c.a,
      };
    }),
    mistakes: s.log,
  };
}

/** The one line above the marks: how long it took, and what state the box is in. */
export function cellDivisionSummary(s: CellDivisionState): string {
  const cracked = s.tray.filter((slide) => slide.broken).length;
  const complete = s.graded
    ? Object.values(s.graded.cells).filter((c) => c.pts === PER_SLIDE_TABLE_MARKS).length
    : 0;
  const glass =
    cracked === 0 ? 'every slide intact' : cracked === 1 ? 'one slide cracked' : `${cracked} slides cracked`;
  return `${formatClock((s.tEnd || s.t0) - s.t0)} on bench #${s.seed} · ${complete}/${s.tray.length} slides fully identified · ${glass}`;
}
