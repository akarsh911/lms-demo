/**
 * The instrument.
 *
 * A compound microscope has state — which slide is clipped to the stage, where
 * the stage sits under the objective, which objective is swung in, how far the
 * body tube is racked down, how bright the lamp is — and everything the student
 * sees through the eyepiece is computed from it: sharpness from the distance to
 * the focal plane, what is in the field from the geometry of the field of view,
 * and the crack from the objective actually reaching the coverslip.
 *
 * Nothing here knows what is ON a slide. That is `specimens.ts`.
 */

export type Objective = 10 | 40;

/** Tube-up clearance, in focus units. One unit is one click of the fine knob. */
export const G0 = 152;

export interface ObjectiveSpec {
  mag: Objective;
  /** How far the barrel hangs below the nosepiece. */
  barrel: number;
  /** Working distance: objective tip to coverslip, at focus. */
  wd: number;
  /** Depth of field. The 40× is four times shallower, so it needs the fine knob. */
  dof: number;
  /** Radius of the field of view, in mm on the slide. */
  R: number;
  /** How well each lamp setting suits this objective, indexed by lamp position. */
  light: readonly [number, number, number, number];
}

/**
 * The two objectives are nearly parfocal — the planes of best focus are 58 and
 * 62 — so a slide focused at 10× is close at 40× but not sharp: a few clicks of
 * the FINE adjustment, never the coarse knob, which reaches the coverslip 14
 * units further down.
 */
export const OBJECTIVES: Readonly<Record<Objective, ObjectiveSpec>> = {
  10: { mag: 10, barrel: 44, wd: 50, dof: 8, R: 2.2, light: [0, 0.8, 1, 0.92] },
  40: { mag: 40, barrel: 76, wd: 14, dof: 2.2, R: 0.55, light: [0, 0.6, 0.92, 1] },
};

export const OBJECTIVE_VALUES: readonly Objective[] = [10, 40];

/** One click of each knob, and how far the tube can be racked at all. */
export const COARSE = 8;
export const FINE = 1;
export const H_MAX = 100;
/** One press of a mechanical-stage arrow, in mm on the slide. */
export const MOVE_STEP = 0.12;

export const LAMPS = ['off', 'low', 'medium', 'bright'] as const;
export type LampSetting = (typeof LAMPS)[number];

/** Tube height at which this objective is in focus on a nominally mounted slide. */
export function focalPlane(o: Objective): number {
  return G0 - OBJECTIVES[o].wd - OBJECTIVES[o].barrel;
}

/**
 * Tube height at which this objective touches the coverslip. For the 10× it is
 * 108, past the end of the rack: low power genuinely cannot break a slide.
 */
export function crashHeight(o: Objective): number {
  return G0 - OBJECTIVES[o].barrel;
}

/** Objective-to-slide clearance. Below 8 there is no room to slide one in. */
export function clearance(o: Objective, h: number): number {
  return G0 - h - OBJECTIVES[o].barrel;
}

/**
 * How sharp the image is, 0 to 1. A Gaussian in units of the depth of field, so
 * the 40× falls out of focus in a fraction of the travel the 10× tolerates.
 *
 * `dz` is the slide's own offset: prepared slides are not all mounted at the
 * same thickness, so each has to be focused for itself.
 */
export function sharpnessAt(h: number, o: Objective, dz: number): number {
  const d = (h - (focalPlane(o) + dz)) / OBJECTIVES[o].dof;
  return Math.exp(-d * d);
}

/**
 * How much of the specimen is inside the field of view, 0 to 1, from the
 * distance between the specimen and the centre of the field.
 */
export function fieldFactor(distance: number, rS: number, o: Objective): number {
  const R = OBJECTIVES[o].R;
  if (distance <= R - rS) return 1;
  if (distance >= R + rS) return 0;
  return (R + rS - distance) / (2 * rS);
}

/** How bright the field is with this lamp setting under this objective. */
export function lightAt(o: Objective, lamp: number): number {
  return OBJECTIVES[o].light[lamp] ?? 0;
}

/** Total magnification: the objective times the 10× eyepiece. */
export function totalMagnification(o: Objective): number {
  return o * 10;
}
