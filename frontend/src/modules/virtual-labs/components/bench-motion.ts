import type * as React from 'react';
import { keyframes } from '@mui/system';

import { apparatus } from './apparatus-palette';
import { useLabFeature } from './lab-features';

/**
 * MOTION ON A BENCH: the things that move on apparatus, in one place.
 *
 * A bench draws itself as one SVG, so its animation is a handful of CSS rules
 * on the wrapper rather than per-element style. Every rule here was written
 * out again in each bench that needed it; they are the same rules, so they
 * live here and each bench spreads `benchMotionSx` into its wrapper.
 *
 * 1. The HINT RING, which breathes around whatever a tour is pointing at.
 * 2. TRAVELLING LIGHT, for the optics benches: a ray drawn as a dashed stroke
 *    whose offset runs along it, so light is seen to move rather than to sit
 *    there. It is the difference between a diagram of a ray and a ray.
 * 3. DRIFTING CARRIERS, the same dashes on a conductor, at a period the
 *    circuit's own solution sets — so a parallel junction is watched dividing.
 * 4. A RISING TRAIN of bubbles, at a spacing and a beat the flask's own gas
 *    rate sets.
 * 5. TRACKING, for whatever follows a model value continuously — lime water
 *    clouding, a precipitate thickening, an indicator developing — so a
 *    quantity integrated at 10 Hz is not seen to step.
 * 6. A MOUNT THAT RIDES, for the microscopes: a specimen on a film of liquid is
 *    never still, and a field of view that is is a photograph of a microscope.
 *
 * NOTHING HERE SCHEDULES A FRAME LOOP. Every one of the six is a CSS rule, so
 * the model's own clock is the only clock on a bench and the marking and the
 * animation read the same number. It is also why stopping is total rather than
 * best-effort: `animation: none` leaves no loop running anywhere.
 *
 * Everything stops under `prefers-reduced-motion`, and everything stops in
 * exactly the same way when an administrator turns the `animation` flag off —
 * one set of rules, applied for either reason. That is not a courtesy: a dash
 * pattern that has stopped is still a perfectly good dashed ray, a stopped
 * train of bubbles is still a column of gas leaving a tube at a spacing that
 * says how fast, and a hint ring that has stopped is still drawn in the hint
 * colour. Nothing a student needs is carried by the motion alone.
 */

/** The ring a guided tour breathes around the control it is naming. */
export const pulseRing = keyframes`50% { stroke: ${apparatus.hintRing}; stroke-width: 5; }`;

/**
 * Ready to assign to `animation`. Each bench keeps its OWN selector for this —
 * one names `.term.pulse .ring`, another `[data-pulse="true"] .focus-ring` —
 * because what a bench calls its hit targets is the bench's own business. What
 * was worth sharing is the beat, so every tour on every bench breathes at the
 * same rate.
 */
export const pulseAnimation = `${pulseRing} 1s ease-in-out infinite`;

/**
 * THE SETTLED BENCH: every rule that stops motion, with nothing that starts it.
 *
 * Spread into the `sx` of whatever wraps a bench's SVG and the apparatus holds
 * still. Because each of the five kinds of motion above is a CSS animation or
 * a transition, `animation: none` and `transition: none` settle all of them at
 * once and at the instant they are applied: a dashed ray keeps its dashes, a
 * bubble train keeps its spacing, and anything that was easing towards a model
 * value simply IS that value. There is nothing left to wind down and no loop
 * left running.
 *
 * Stopping the hint ring is not enough on its own: a ring that is only visible
 * while it breathes leaves a guided tour pointing at nothing at all. So the
 * ring is also painted on, in the hint colour, for every spelling of "this is
 * the thing being pointed at" the benches use. The tour still works; it just
 * holds still.
 */
export const stillSx = {
  '& *': { animation: 'none !important', transition: 'none !important' },
  [[
    '& .pulse .focus',
    '& .pulse .ring',
    '& .pulse .focus-ring',
    '& [data-pulse="true"] .focus',
    '& [data-pulse="true"] .ring',
    '& [data-pulse="true"] .focus-ring',
  ].join(', ')]: { stroke: apparatus.hintRing, strokeWidth: 3 },
} as const;

/** Settle the bench for a student who has asked their system for less motion. */
export const reducedMotionSx = {
  '@media (prefers-reduced-motion: reduce)': stillSx,
} as const;

/**
 * Whether this bench is running with live motion.
 *
 * `animation: false` and `prefers-reduced-motion: reduce` are THE SAME CODE
 * PATH, as the feature-flag spec requires: both end at `stillSx`, one through a
 * media query and one through this. So there is no second settled state to keep
 * in step, and no bench can settle correctly for one and not the other.
 *
 * Spread `motionSx(useBenchMotion())` into the wrapper's `sx` after
 * `benchMotionSx` and that is the whole of a bench's obligation.
 */
export function useBenchMotion(): boolean {
  return useLabFeature('animation');
}

/** `benchMotionSx`'s partner: nothing while motion is on, `stillSx` while it is off. */
export function motionSx(moving: boolean): typeof stillSx | null {
  return moving ? null : stillSx;
}

/**
 * One dash period. The stroke is 11 on, 15 off, so shifting the offset by
 * exactly 26 lands the pattern back on itself and the loop cannot be seen.
 */
const FLOW_DASH = '11 15';
const FLOW_SHIFT = 26;

/** Light running the way the ray is drawn, from its start towards its end. */
const lightFlow = keyframes`to { stroke-dashoffset: -${FLOW_SHIFT}px; }`;
/** …and back the other way, for a ray that travels against how it was drawn. */
const lightFlowBack = keyframes`to { stroke-dashoffset: ${FLOW_SHIFT}px; }`;

/**
 * How fast the dashes run. One rhythm for every optics bench, so light moves at
 * the same apparent speed whether the student is at the prism, the slab or the
 * optical bench — three practicals about the same light.
 */
const FLOW_DURATION = '1.05s';

/** Put on a stroke that light travels along. */
export const FLOW_CLASS = 'flow';
/** With this as well when the light runs from the end of the stroke to its start. */
export const FLOW_BACK_CLASS = 'back';

/**
 * `className` for one ray. `direction` is +1 when the light travels the way the
 * stroke is drawn (x1,y1 → x2,y2) and −1 when it travels against it — a ray
 * reflected back off a concave mirror is drawn towards the mirror but travels
 * away from it, and a ray whose dashes crawl the wrong way is worse than one
 * that does not move at all.
 */
export function flowClass(direction: 1 | -1 = 1, extra?: string): string {
  const base = direction < 0 ? `${FLOW_CLASS} ${FLOW_BACK_CLASS}` : FLOW_CLASS;
  return extra ? `${base} ${extra}` : base;
}

// ---------------------------------------------------------------------------
// Drifting carriers
// ---------------------------------------------------------------------------

/**
 * The same dashes as travelling light, on a conductor rather than a ray, and at
 * a period the CIRCUIT sets rather than a rhythm this file picks. Light has one
 * speed and so gets one duration; charge does not, and the whole point of
 * drawing it is that the difference can be seen.
 *
 * A shorter period than the rays', because carriers are drawn small and close
 * together — a 26-unit period on a coil reads as a rope rather than as charge.
 */
const DRIFT_DASH = '4 7';
const DRIFT_SHIFT = 11;

const driftOn = keyframes`to { stroke-dashoffset: -${DRIFT_SHIFT}px; }`;
const driftBack = keyframes`to { stroke-dashoffset: ${DRIFT_SHIFT}px; }`;

/** Put on a stroke that charge drifts along. */
export const DRIFT_CLASS = 'drift';

/**
 * `className` for one conductor. `direction` is the sign of the current through
 * it: +1 when charge moves the way the stroke is drawn, −1 when it moves
 * against it. A branch whose carriers crawl backwards is worse than one that
 * does not move at all, and on a bench a student may wire either way round.
 */
export function driftClass(direction: 1 | -1 = 1, extra?: string): string {
  const base = direction < 0 ? `${DRIFT_CLASS} ${FLOW_BACK_CLASS}` : DRIFT_CLASS;
  return extra ? `${base} ${extra}` : base;
}

/**
 * How long one dash period takes, from the drift speed the bench's own solver
 * computed. `perSecond` is dash periods per second: the bench converts its
 * physical drift speed into that with one scale constant of its own, so the
 * RATIO between two conductors is the model's and only the overall pace is
 * this file's.
 *
 * Clamped at both ends for honest reasons. Below the floor a conductor carrying
 * almost nothing would take minutes to shift one dash and read as broken rather
 * than as nearly idle; above the ceiling the dashes alias and a faster branch
 * stops looking faster, which would destroy the one thing the drawing is for.
 * Both bounds sit well outside the range any of these circuits reaches.
 */
const DRIFT_SLOWEST = 0.06;
const DRIFT_FASTEST = 12;

export function driftStyle(perSecond: number): React.CSSProperties {
  const r = Math.min(DRIFT_FASTEST, Math.max(DRIFT_SLOWEST, Math.abs(perSecond)));
  return { animationDuration: `${(1 / r).toFixed(3)}s` };
}

// ---------------------------------------------------------------------------
// A rising train of bubbles
// ---------------------------------------------------------------------------

/**
 * Gas leaving a tube is drawn as a train of bubbles evenly spaced up a column,
 * every one of them rising exactly ONE GAP per cycle — so bubble k arrives
 * where bubble k−1 started, and the loop has no seam and needs no fade to hide
 * one. They move in step because that is what evenly spaced bubbles rising at
 * the same speed DO; the life in it comes from where across the tube each one
 * sits and how big it is, which is the bench's business, not this file's.
 *
 * That construction is what makes the drawing honest. THE PERIOD IS 1/q: at q
 * bubbles a second one whole bubble crosses any point on the column every 1/q
 * seconds, which is the rate the flask is making gas at and nothing else. The
 * COUNT then says how full the column is, from the same q against the speed a
 * bubble actually rises through water at — sparse and lazy for slow chemistry,
 * crowded for brisk. Both remain true when the animation is stopped, because
 * what carries the rate is the SPACING, and the spacing survives.
 */
export const RISE_CLASS = 'rise';

/** How fast a bubble rises through a tube of liquid, in bench units per second. */
const RISE_SPEED = 46;
/** A tube is not a fizzing beaker: past this the eye reads a stream, not bubbles. */
const RISE_MAX = 9;
/**
 * The band a beat can be read in. Slower than one bubble every two and a half
 * seconds and a student watching cannot tell it from a stopped bench; faster
 * than fourteen a second and nobody can count them anyway, so more speed buys
 * nothing and only blurs. The COUNT goes on growing past the top of the band,
 * which is what keeps a violent reaction looking more violent than a brisk one.
 */
const RISE_SLOWEST = 0.4;
const RISE_FASTEST = 14;

export interface BubbleTrain {
  /** How many bubbles are in the column at once. */
  count: number;
  /** The spacing between them, in bench units. */
  gap: number;
  /** Seconds between bubbles: one crosses any point every `period`. */
  period: number;
}

/**
 * The train for a column `height` units tall fed at `perSecond` bubbles a
 * second. Pure geometry over a rate the MODEL computed; it invents no rate of
 * its own. `perSecond` at or below zero means no gas is coming through, and the
 * answer is an empty train rather than a slow one.
 *
 * `max` is how many bubbles this particular vessel can hold before it reads as
 * a stream: a narrow test tube takes fewer than a wide beaker in full fizz.
 */
export function bubbleTrain(perSecond: number, height: number, max = RISE_MAX): BubbleTrain {
  if (!(perSecond > 0) || height <= 0) return { count: 0, gap: 0, period: 0 };
  const count = Math.max(1, Math.min(max, Math.round((height * perSecond) / RISE_SPEED)));
  const beat = Math.min(RISE_FASTEST, Math.max(RISE_SLOWEST, perSecond));
  return { count, gap: height / count, period: 1 / beat };
}

/**
 * Where bubble `k` of the train sits when nothing is moving, measured up from
 * the bottom of the column. Draw every bubble here and the train is correct
 * standing still; the animation only slides the whole of it up by one gap.
 */
export function riseOffset(train: BubbleTrain, k: number): number {
  return train.gap * (k % Math.max(1, train.count));
}

/** One bubble's rule: how far to climb, and how long it takes. */
export function riseStyle(train: BubbleTrain): React.CSSProperties {
  return {
    ['--rise' as string]: `${train.gap.toFixed(2)}px`,
    animationDuration: `${train.period.toFixed(3)}s`,
  };
}

const riseUp = keyframes`to { transform: translateY(calc(-1 * var(--rise))); }`;

// ---------------------------------------------------------------------------
// Liquid that reads as liquid
// ---------------------------------------------------------------------------

/**
 * A column of liquid standing still is a coloured rectangle. Two rules make it
 * a liquid, and every bench that draws one wanted them: the MENISCUS breathes at
 * the surface, and a SHEEN drifts down the glass.
 *
 * Alone among the five above, these two carry NOTHING. The level says how much,
 * the colour says what; a surface that is a pixel higher than it was two seconds
 * ago says only that the thing in the tube is a liquid. That is precisely why
 * they are safe to run forever and why losing them costs a student nothing: a
 * stopped meniscus is still a meniscus, drawn where the surface is.
 *
 * The keyframes move geometry and touch no colour or opacity, so a bench sets
 * how bright its own highlight is and this file never argues with it.
 */
export const MENISCUS_CLASS = 'men';
export const SHEEN_CLASS = 'sheen';

/** Barely a pixel: at the surface of a test tube that is a whole meniscus. */
const meniscusBreath = keyframes`50% { transform: translateY(-0.9px); }`;
/** The light moving across the glass as the bench's lamp is not quite still. */
const sheenDrift = keyframes`50% { transform: translateX(3px); }`;

// ---------------------------------------------------------------------------
// A mount that rides
// ---------------------------------------------------------------------------

/**
 * A SPECIMEN UNDER AN OBJECTIVE IS NEVER STILL.
 *
 * A wet mount rides on the film of liquid beneath its coverslip and a prepared
 * slide rides on its mountant: over a few seconds the whole field wanders, and
 * that wander is most of the difference between a microscope and a photograph
 * of one. Two of these benches tell the student in so many words that the mount
 * is drifting; a frozen field then contradicts the sentence.
 *
 * ONE RULE, TWO GEOMETRIES, because the two fields that need it cannot afford
 * the same one. `--ride-x` and `--ride-y` translate, `--ride-deg` turns about
 * whatever `transform-origin` the bench gives it, and anything left unset is
 * zero — so each bench asks for exactly the motion its own marking can afford.
 *
 * - TRANSLATION, where nothing in the field is counted. What is marked on the
 *   cell-division field is which organism and which process, and neither can be
 *   changed by a specimen that sits two pixels to the left of where it sat.
 * - ROTATION ABOUT THE OPTICAL AXIS, where something is. The leaf-peel field is
 *   marked on a count of the stomata in it. A rotation about the centre of the
 *   field carries every cell along a circle of constant radius: nothing crosses
 *   the edge of the field in either direction, and a bubble drawn in the same
 *   turning group goes on hiding exactly the cells it was hiding before. The
 *   count on the screen is the count the marking computes, at every instant of
 *   the animation rather than on average over it. No other rigid motion of a
 *   round field has that property, which is why the amplitude is not what makes
 *   this safe and why it is not a translation kept small enough to get away
 *   with.
 *
 * THE AMPLITUDE IS THE MODEL'S AND THE PERIOD IS THIS FILE'S. Whether a mount
 * rides at all, and how far, is something the bench's own model knows — a
 * coverslip floating on excess that was never blotted, a lamp that is on — and
 * it arrives here as a number that the marking reads from the same function.
 * How long one wander takes is not a thing any of these models has an opinion
 * about, so it is one slow beat, shared. That also means nothing a bench does
 * can restart the animation while it is running, which is what keeps two
 * elements riding the SAME mount — a field of view, and the pointers labelling
 * what is in it — in step with each other for as long as the bench is open.
 */
export const RIDE_CLASS = 'ride';

/** One wander, there and back: slow enough to read as a drift, not a wobble. */
const RIDE_SECONDS = 13;

/**
 * Four corners of a wander rather than two, so the path is a slow loop instead
 * of a shuttle running back down its own line. The fractions are nothing but
 * shape; the size of the whole thing is the bench's.
 */
const ride = keyframes`
  0%, 100% { transform: translate(0px, 0px) rotate(0deg); }
  25% { transform: translate(var(--ride-x), calc(var(--ride-y) * 0.4)) rotate(var(--ride-deg)); }
  50% { transform: translate(calc(var(--ride-x) * 0.25), var(--ride-y)) rotate(0deg); }
  75% { transform: translate(calc(var(--ride-x) * -0.85), calc(var(--ride-y) * -0.55)) rotate(calc(-1 * var(--ride-deg))); }
`;

export interface Ride {
  /** Peak wander across and down, in the units the bench draws in. */
  x?: number;
  y?: number;
  /** Peak swing either way, in degrees, about `about`. */
  deg?: number;
  /** The point to turn about. For a field of view that is the optical axis. */
  about?: readonly [number, number];
}

/**
 * One mount's rule. Everything omitted is zero, so a mount the model says is
 * not riding is drawn still rather than slowly — there is no amplitude at which
 * a stopped mount is "nearly" stopped.
 */
export function rideStyle(r: Ride): React.CSSProperties {
  const style: React.CSSProperties = {
    ['--ride-x' as string]: `${(r.x ?? 0).toFixed(2)}px`,
    ['--ride-y' as string]: `${(r.y ?? 0).toFixed(2)}px`,
    ['--ride-deg' as string]: `${(r.deg ?? 0).toFixed(3)}deg`,
  };
  if (r.about) {
    // An SVG element turns about the origin of its viewport unless it is told
    // otherwise, and the origin of a field of view is its top-left corner.
    style.transformBox = 'view-box';
    style.transformOrigin = `${r.about[0]}px ${r.about[1]}px`;
  }
  return style;
}

// ---------------------------------------------------------------------------
// Tracking a model value
// ---------------------------------------------------------------------------

/**
 * For anything drawn straight from a quantity the engine integrates: how milky
 * the lime water is, how much precipitate has come down, how far an indicator
 * has developed.
 *
 * The motion is already the model's — the value moves because the chemistry
 * does, on the chemistry's own time constant — and all this adds is that the
 * value is not seen to STEP. The bench clock runs at 10 Hz, so without it a
 * slow change arrives as ten visible jumps a second; with it each jump is
 * carried across to the next, and a tube clouds. Slightly longer than the tick
 * so the eye never catches the join, and linear so no easing is added to a
 * curve the model already has.
 */
export const TRACK_CLASS = 'track';
/**
 * Only the properties a bench actually draws a model value with. SVG's `x1`,
 * `y1`, `x2` and `y2` are deliberately absent: they are attributes rather than
 * CSS geometry properties, so a line cannot be tracked by moving its ends —
 * rotate or translate the group it is in instead, which `transform` covers.
 * `background-color` is here for the HTML swatches beside the apparatus, which
 * are read against it and so have to agree with it.
 */
const TRACK_PROPS =
  'fill, fill-opacity, stroke, stroke-opacity, opacity, x, y, width, height, r, cx, cy, transform, background-color';
/** Long enough that a 10 Hz step is never seen, short enough to add no lag. */
const TRACK_SECONDS = 0.14;

/**
 * Override how long the carry takes, for a quantity whose own settling is
 * SLOWER than the bench clock: froth climbing a tube after a shake, an
 * indicator paper developing. The seconds come from the bench's model, which is
 * where a physical settling time belongs; this only spends them.
 */
export function trackStyle(seconds: number): React.CSSProperties {
  return { transitionDuration: `${Math.max(0, seconds).toFixed(3)}s` };
}

/**
 * The rules themselves, to spread into the `sx` of the element wrapping a
 * bench's SVG. Scoped with `&` so they only reach that bench's own strokes.
 *
 * Pair it with `motionSx(useBenchMotion())` spread AFTER it, which settles
 * everything below when an administrator has turned motion off.
 */
/**
 * A STROKE THAT LAYS ITSELF DOWN, for a wire being connected or a line being
 * drawn: it runs from one end to the other instead of appearing whole.
 *
 * Give the path `pathLength={1}` and this class. Normalising the length that
 * way is what makes one rule work for a 30 px lead and a 300 px one.
 *
 * THE RESTING STATE IS FULLY DRAWN, and the animation only runs BACKWARDS from
 * hidden to that. Written the other way round — resting hidden, animating into
 * view — `animation: none` would leave every wire on the bench invisible, so
 * reduced motion or an administrator's flag would empty the circuit. A bench
 * that stops moving must still be a bench.
 *
 * It plays once, on mount, because a wire is only laid once: React keeps the
 * element for a wire that is already there, so nothing replays on re-render.
 */
const layDown = keyframes`from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; }`;

/** Put on a stroke that should be seen being drawn. Needs `pathLength={1}`. */
export const LAY_CLASS = 'lay';

/** How long a connection takes to make. One beat, the same on every bench. */
const LAY_DURATION = '.42s';

export const benchMotionSx = {
  '& .pulse .focus': { animation: pulseAnimation },
  [`& .${LAY_CLASS}`]: {
    strokeDasharray: 1,
    strokeDashoffset: 0,
    animation: `${layDown} ${LAY_DURATION} ease-out`,
  },
  [`& .${FLOW_CLASS}`]: {
    strokeDasharray: FLOW_DASH,
    animation: `${lightFlow} ${FLOW_DURATION} linear infinite`,
  },
  [`& .${FLOW_CLASS}.${FLOW_BACK_CLASS}`]: {
    animation: `${lightFlowBack} ${FLOW_DURATION} linear infinite`,
  },
  [`& .${DRIFT_CLASS}`]: {
    strokeDasharray: DRIFT_DASH,
    animation: `${driftOn} 1s linear infinite`,
  },
  [`& .${DRIFT_CLASS}.${FLOW_BACK_CLASS}`]: { animation: `${driftBack} 1s linear infinite` },
  [`& .${RISE_CLASS}`]: { animation: `${riseUp} 1s linear infinite` },
  [`& .${RIDE_CLASS}`]: {
    // Declared here rather than left to the bench, so a mount whose style says
    // nothing rides nowhere instead of falling back to an invalid transform.
    '--ride-x': '0px',
    '--ride-y': '0px',
    '--ride-deg': '0deg',
    animation: `${ride} ${RIDE_SECONDS}s ease-in-out infinite`,
  },
  [`& .${MENISCUS_CLASS}`]: { animation: `${meniscusBreath} 3.6s ease-in-out infinite` },
  [`& .${SHEEN_CLASS}`]: { animation: `${sheenDrift} 4.4s ease-in-out infinite` },
  [`& .${TRACK_CLASS}`]: { transition: `${TRACK_PROPS} ${TRACK_SECONDS}s linear` },
  ...reducedMotionSx,
} as const;
