import { markedParts } from '../marking';
import { formatClock } from '../numbers';
import type { MarkedPart, Mistake } from '../types';

import {
  RISE_CAP,
  SETUPS,
  SETUP_KOH,
  dips,
  look,
  milkiness,
  type Appearance,
  type Flask,
} from './biology';
import {
  AIRTIGHT_PER_FLASK,
  BASIS,
  MAX,
  PART_KEYS,
  SETUP_PER_ITEM,
  type PartKey,
} from './marking';
import { controlOk, entryAt, markedFlasks, type Conclusion, type RespirationState } from './state';

export type RespirationScore = Record<PartKey, number> & { total: number };

/**
 * Marks earned so far.
 *
 * Setup, control and airtight are recomputed from the apparatus every time
 * rather than frozen when a step ended: a cork sealed late still counts, and a
 * control taken apart stops counting. Only what the student wrote down —
 * observations, conclusion, viva — is fixed at the moment it was submitted.
 */
export function setupPoints(s: RespirationState): number {
  let p = 0;
  markedFlasks(s).forEach((f, i) => {
    if (f.seeds && f.seeds.g > 0 && f.seeds.kind === SETUPS[i]?.want) p += SETUP_PER_ITEM;
    if (f.lime.ml > 0) p += SETUP_PER_ITEM;
    if (f.cork) p += SETUP_PER_ITEM;
    if (f.cork && dips(f)) p += SETUP_PER_ITEM;
  });
  return p;
}

/** 5 per flask sealed with vaseline that never leaked while the clock ran. */
export function airtightPoints(s: RespirationState): number {
  return markedFlasks(s).reduce(
    (a, f) => a + (f.seeds && f.cork && f.sealed && f.leakMin < 0.01 ? AIRTIGHT_PER_FLASK : 0),
    0,
  );
}

export function scoreRespirationParts(s: RespirationState): RespirationScore {
  const parts: Record<PartKey, number> = {
    setup: setupPoints(s),
    control: controlOk(s) ? MAX.control : 0,
    airtight: airtightPoints(s),
    observe: s.pts.observe,
    conclude: s.pts.conclude,
    viva: s.viva.reduce((a, v) => a + (v ? v.pts : 0), 0),
  };
  return { ...parts, total: Math.round(PART_KEYS.reduce((a, k) => a + parts[k], 0)) };
}

/**
 * The record of one completed attempt.
 *
 * The same shape `lms-lab-engine` posts to its parent frame, plus the bench
 * seed, so a backend written against the standalone bench accepts this one
 * unchanged. Every flask carries both what the student wrote and what really
 * happened in it, which is what makes the grade auditable.
 */
export interface RespirationSetupRecord {
  setup: string;
  seeds: string | null;
  seed_grams: number;
  lime_water_mL: number;
  delivery_tube_dips: boolean;
  corked: boolean;
  airtight: boolean;
  koh_inside: boolean;
  minutes_standing: number;
  co2_produced_mmol: number;
  co2_through_lime_water_mmol: number;
  milkiness: number;
  lime_water_showed: Appearance | null;
  water_rise: number | null;
  recorded: { app: string; det: string } | null;
}

export interface RespirationAttemptRecord {
  practical: 'co2-in-respiration';
  experiment: 7;
  bench_seed: number;
  score: number;
  max: 100;
  time: string;
  lab_minutes: number;
  room_temp_C: number;
  bath_temp_C: number;
  control_run: boolean;
  parts: Record<string, MarkedPart>;
  setups: RespirationSetupRecord[];
  conclusion: Conclusion | null;
  mistakes: Mistake[];
}

function setupRecord(f: Flask, i: number, s: RespirationState): RespirationSetupRecord {
  const marked = i < SETUPS.length;
  const entry = marked ? s.rec[i] : undefined;
  return {
    setup: SETUPS[i]?.id ?? 'KOH',
    seeds: f.seeds ? f.seeds.kind : null,
    seed_grams: f.seeds ? f.seeds.g : 0,
    lime_water_mL: f.lime.ml,
    delivery_tube_dips: dips(f),
    corked: f.cork,
    airtight: f.sealed,
    koh_inside: f.koh,
    minutes_standing: Math.round(f.runMin),
    co2_produced_mmol: +f.co2Made.toFixed(3),
    co2_through_lime_water_mmol: +f.co2Through.toFixed(3),
    milkiness: +milkiness(f).toFixed(3),
    lime_water_showed: marked ? look(f) : null,
    water_rise: i === SETUP_KOH ? Math.round(f.rise) : null,
    recorded: entry ? { app: entry.app, det: entry.det } : null,
  };
}

export function buildRespirationAttempt(s: RespirationState): RespirationAttemptRecord {
  const score = scoreRespirationParts(s);
  return {
    practical: 'co2-in-respiration',
    experiment: 7,
    bench_seed: s.seed,
    score: score.total,
    max: 100,
    time: formatClock((s.tEnd || s.t0) - s.t0),
    lab_minutes: Math.round(s.graded ? s.graded.min : s.min),
    room_temp_C: s.roomC,
    bath_temp_C: s.tempC,
    control_run: controlOk(s),
    parts: markedParts(
      PART_KEYS.map((key) => ({ key, max: MAX[key], basis: BASIS[key] })),
      score,
    ),
    setups: s.flasks.map((f, i) => setupRecord(f, i, s)),
    conclusion: s.concl,
    mistakes: s.log,
  };
}

/** The one line above the marks: how long it took, and what the tubes showed. */
export function respirationSummary(s: RespirationState): string {
  const minutes = Math.round(s.graded ? s.graded.min : s.min);
  const shown = markedFlasks(s)
    .map((f, i) => `${SETUPS[i]?.id ?? '?'} ${look(f)}`)
    .join(', ');
  return (
    `${formatClock((s.tEnd || s.t0) - s.t0)} on bench #${s.seed} · recorded after ${minutes} lab minutes at ` +
    `${s.tempC} °C · control ${controlOk(s) ? 'run' : 'not run'} · ${shown}`
  );
}

/** The method 2 line under the observation table. Never marked. */
export function methodTwoLine(s: RespirationState): string {
  const k = s.flasks[SETUP_KOH];
  if (!k || !k.cork || !k.seeds) return 'not set up';
  return `water rose ${Math.round(k.rise)} / ${RISE_CAP}`;
}

/** Whether the student's own row for a flask says CO₂ was given out. */
export function recordedDetection(s: RespirationState, index: number): string {
  return entryAt(s, index).det || '—';
}
