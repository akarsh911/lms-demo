import { POUR } from './chemistry';

/**
 * HOW LONG EACH GESTURE AT THIS BENCH TAKES, in seconds.
 *
 * A hand is not chemistry, which is why these are not in `chemistry.ts` beside
 * `developSeconds`: how fast a colour comes up is a property of the dye, and how
 * long it takes to tip a bottle is a property of the arm holding it. Both are
 * here rather than in the drawing for the same reason, though — the level that
 * rises, the stream that runs and the swirl that settles are three parts of ONE
 * pour, and if each picked its own number out of the air they would drift apart
 * and the liquid would arrive before the bottle had finished tilting.
 *
 * Nothing the marking reads. `pHof` and the frozen `strip` are the same numbers
 * whether a pour took a second or no time at all, which is what lets the whole
 * of this file be switched off — under `prefers-reduced-motion`, or when an
 * administrator turns the `animation` flag off — without changing a single mark.
 *
 * The numbers are the reference bench's (`lms-lab-engine/web/acids.html`), which
 * settled them by eye against a real one.
 */

// ---------------------------------------------------------------------------
// Pouring
// ---------------------------------------------------------------------------

/** The bottle tilting in over the mouth of the tube, before anything runs out. */
export const POUR_LEAD_SECONDS = 0.26;
/** …and lifting away again once the last of it has gone in. */
export const POUR_TAIL_SECONDS = 0.3;
/**
 * How long a millilitre takes to run out of the bottle. A rate rather than a
 * duration, so a bench that pours a different measure gets a proportionally
 * longer pour rather than the same one hurried.
 */
export const POUR_SECONDS_PER_ML = 0.164;

/** How long `ml` takes to actually run into the tube. */
export function pourRiseSeconds(ml: number): number {
  return Math.max(0, ml) * POUR_SECONDS_PER_ML;
}

/** The whole gesture: tilt in, pour, lift away. */
export function pourSeconds(ml: number): number {
  return POUR_LEAD_SECONDS + pourRiseSeconds(ml) + POUR_TAIL_SECONDS;
}

/**
 * HOW LONG THE LEVEL IN THE TUBE TAKES TO MOVE.
 *
 * One pour is one pour, so this is the rise for a single measure and not for
 * whatever happens to be in the tube: a second pour into a half-full tube takes
 * exactly as long as the first did, because the same bottle was tipped for the
 * same count. Emptying uses it too — a tube tipped into the waste beaker takes
 * about as long to run out as it took to fill.
 */
export const LEVEL_SECONDS = pourRiseSeconds(POUR);

/** The liquid settling after a pour: it starts as the level nears its mark. */
export const SWIRL_SECONDS = 1.2;
export const SWIRL_DELAY_SECONDS = Math.max(0, POUR_LEAD_SECONDS + LEVEL_SECONDS - 0.26);

// ---------------------------------------------------------------------------
// Universal indicator
// ---------------------------------------------------------------------------

/** Two drops falling from the nozzle to the surface. */
export const DROP_SECONDS = 0.43;
/**
 * The dye spreading down through the solution once the drops are in. The colour
 * the tube arrives at is the chemistry's (`liquidColour`); this is only how long
 * the eye is given to watch it get there, and it is why an indicator tube is
 * seen to bloom rather than to change.
 */
export const BLOOM_SECONDS = 1.4;

// ---------------------------------------------------------------------------
// pH paper
// ---------------------------------------------------------------------------

/** The strip going into the tube, wetting, and coming back out. */
export const DIP_SECONDS = 1.25;
/**
 * When on that journey the strip is put down on the tile. Before this the strip
 * is still in the tube, so a square that appeared on the tile the instant a tube
 * was tapped would be a second strip.
 */
export const LAY_ON_TILE_SECONDS = DIP_SECONDS * 0.62;
