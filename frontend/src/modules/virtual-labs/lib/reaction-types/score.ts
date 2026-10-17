import { deduct, markedParts } from '../marking';
import { formatClock } from '../numbers';
import type { MarkedPart, Mistake } from '../types';

import { RX, VDEF, classify, showsAs, type RxId, type TagKey, type TypeKey } from './chemistry';
import {
  BAD_VESSEL_PENALTY,
  BASIS,
  CRACKED_PENALTY,
  HEAT_MINUTES_REQUIRED,
  LITMUS_MARKS,
  MAX,
  PART_KEYS,
  PER_REACTION_SETUP,
  STOPPER_HEAT_PENALTY,
  THERMO_MARKS,
  WRONG_HEAT_PENALTY,
  type PartKey,
} from './marking';
import { SETUP } from './reducer';
import type { ReactionTypesState } from './state';

export type ScoreParts = Record<PartKey, number> & { total: number };

/**
 * Marks earned so far.
 *
 * Setup, heating and the two tests are recomputed from the bench every time, so
 * spoiling a vessel costs at once and putting it right earns the marks back.
 * The observation table and the classification are frozen at the moment they
 * were submitted, because they were marked against the vessels as they stood
 * then — a tube that goes on reacting afterwards must not change a grade.
 */
export function scoreParts(s: ReactionTypesState): ScoreParts {
  const fs = s.vessels[VDEF.findIndex((v) => v.id === 'fs')]!;
  const setUp = (['i', 'ii', 'iii', 'iv'] as const).filter((r) => SETUP[r](s)).length;

  const parts: Record<PartKey, number> = {
    setup: Math.max(0, Math.min(MAX.setup, PER_REACTION_SETUP * setUp - BAD_VESSEL_PENALTY * s.badSetup)),
    heating:
      s.fsHeatMin >= HEAT_MINUTES_REQUIRED
        ? deduct(
            MAX.heating,
            (s.wrongHeat ? WRONG_HEAT_PENALTY : 0) +
              (s.stopperHeat ? STOPPER_HEAT_PENALTY : 0) +
              (fs.cracked ? CRACKED_PENALTY : 0),
          )
        : 0,
    tests: (s.thermoSeen ? THERMO_MARKS : 0) + (s.litmusSeen ? LITMUS_MARKS : 0),
    observe: s.pts.observe,
    classify: s.pts.classify,
    viva: s.viva.reduce((a, v) => a + (v ? v.pts : 0), 0),
  };
  const total = Math.round(PART_KEYS.reduce((a, k) => a + parts[k], 0));
  return { ...parts, total };
}

export function reactionMarkedParts(s: ReactionTypesState): Record<string, MarkedPart> {
  return markedParts(
    PART_KEYS.map((key) => ({ key, max: MAX[key], basis: BASIS[key] })),
    scoreParts(s),
  );
}

/**
 * The record of one completed attempt.
 *
 * The same shape the standalone bench posts to its parent frame, with the bench
 * seed added: what each vessel was showing when the table was submitted travels
 * beside what the student wrote down, so a teacher can see the difference
 * without re-running anything.
 */
export interface ReactionAttemptRecord {
  practical: 'types-of-reaction';
  experiment: 2;
  bench_seed: number;
  score: number;
  max: 100;
  time: string;
  lab_minutes: number;
  parts: Record<string, MarkedPart>;
  reactions: Record<
    RxId,
    {
      equation: string;
      recorded: TagKey[];
      vessel_showed: string | null;
      observation_marks: number;
      classified_as: TypeKey | '' | null;
      true_type: TypeKey | null;
      classify_marks: number;
    }
  >;
  control_tube: string;
  safety: {
    heated_wrong_vessel: boolean;
    heated_stoppered_tube: boolean;
    tube_cracked: boolean;
    tube_burst: boolean;
    thermometer_broken: boolean;
  };
  mistakes: Mistake[];
}

export function buildAttemptRecord(s: ReactionTypesState): ReactionAttemptRecord {
  const p = scoreParts(s);
  const fs = s.vessels[VDEF.findIndex((v) => v.id === 'fs')]!;
  const ctrl = s.vessels[VDEF.findIndex((v) => v.id === 'ctrl')]!;
  return {
    practical: 'types-of-reaction',
    experiment: 2,
    bench_seed: s.seed,
    score: p.total,
    max: 100,
    time: formatClock((s.tEnd || s.t0) - s.t0),
    lab_minutes: s.graded ? s.graded.min : s.min,
    parts: reactionMarkedParts(s),
    reactions: Object.fromEntries(
      RX.map((r) => {
        const g = s.graded?.rows[r.id];
        const c = s.clsGraded?.[r.id];
        return [
          r.id,
          {
            equation: r.eq,
            recorded: g ? g.picked : [],
            vessel_showed: g ? g.shown : null,
            observation_marks: g ? +g.pts.toFixed(2) : 0,
            classified_as: c ? c.picked : null,
            true_type: classify(r),
            classify_marks: c ? c.pts : 0,
          },
        ];
      }),
    ) as ReactionAttemptRecord['reactions'],
    control_tube: showsAs(ctrl),
    safety: {
      heated_wrong_vessel: s.wrongHeat,
      heated_stoppered_tube: s.stopperHeat,
      tube_cracked: fs.cracked,
      tube_burst: s.vessels.some((v) => v.burst),
      thermometer_broken: s.thermoBroken,
    },
    mistakes: s.log,
  };
}
