import type { MarkedPart, Mistake, Tone } from './types';
import { formatClock } from './numbers';

/**
 * Marking helpers every bench shares.
 *
 * A practical's marks are only meaningful with the rule that produced them, so
 * the rule travels with them into the attempt record. A teacher can then check
 * a grade without reading this code, which is the whole point.
 */

/** Stars from the share of the marks earned. Same thresholds on every bench. */
export function starsForShare(share: number): 0 | 1 | 2 | 3 {
  if (share >= 0.85) return 3;
  if (share >= 0.65) return 2;
  if (share >= 0.4) return 1;
  return 0;
}

export interface PartSpec {
  key: string;
  max: number;
  basis: string;
}

/** Marks + their basis, keyed by part, ready to ship in an attempt record. */
export function markedParts(
  parts: readonly PartSpec[],
  earned: Record<string, number>,
): Record<string, MarkedPart> {
  return Object.fromEntries(
    parts.map((p) => [p.key, { earned: +(earned[p.key] ?? 0).toFixed(2), max: p.max, basis: p.basis }]),
  );
}

/** A deduction that cannot take a part below zero. */
export function deduct(max: number, deductions: number): number {
  return Math.max(0, max - deductions);
}

/**
 * Append to the log of things to work on. The clock stamp is the bench's own,
 * so a student can see the order they happened in.
 */
export function logMistake(
  log: Mistake[],
  { now, t0, what, pts = 0 }: { now: number; t0: number; what: string; pts?: number },
): void {
  log.push({ t: formatClock(now - t0), what, pts });
}

/** The tone an outcome should be announced in, by how well it went. */
export function toneForShare(share: number): Tone {
  if (share >= 0.9) return 'good';
  if (share >= 0.5) return 'warn';
  return 'bad';
}

// ---------------------------------------------------------------------------
// A practical run without its viva
// ---------------------------------------------------------------------------

/**
 * THE SCHEME AS REPORTED, when an administrator has switched the viva off.
 *
 * The practical's own scheme never moves. Every mark a student earns is
 * computed against it exactly as before, so no mark depends on a flag — that
 * is the whole rule. This rescales only what is REPORTED, once, at the end:
 * the viva is dropped and everything that remains is scaled by
 * `100 / (100 − viva)`, so the paper is still out of 100 and each part keeps
 * its share of what is left.
 *
 * The factor is computed rather than assumed because the benches weight the
 * viva differently — 15 on Ohm's law, 20 on most, and a bench added later may
 * choose another.
 *
 * Returns the parts unchanged when the viva is on, so the caller can apply it
 * unconditionally.
 */
export function scaledForNoViva(
  parts: readonly PartSpec[],
  vivaOn: boolean,
  vivaKey = 'viva',
): { parts: readonly PartSpec[]; scale: number } {
  if (vivaOn) return { parts, scale: 1 };

  const viva = parts.find((p) => p.key === vivaKey);
  const total = parts.reduce((sum, p) => sum + p.max, 0);
  const remaining = total - (viva?.max ?? 0);
  // A practical that is nothing but viva cannot be rescaled into anything.
  if (!viva || remaining <= 0) return { parts, scale: 1 };

  const scale = total / remaining;
  const note =
    ` — then rescaled ×${+scale.toFixed(3)}, because this attempt has no viva and the parts` +
    ' that remain still total 100';

  return {
    parts: parts
      .filter((p) => p.key !== vivaKey)
      .map((p) => ({ ...p, max: p.max * scale, basis: p.basis + note })),
    scale,
  };
}
