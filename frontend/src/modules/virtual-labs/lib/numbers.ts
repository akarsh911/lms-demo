/**
 * Number handling shared by every bench: parsing what a student typed, and
 * formatting what a meter or a clock shows.
 */

/** Parses a typed decimal, accepting a comma as the decimal separator. NaN when empty. */
export function parseDecimal(raw: string): number {
  const text = raw.trim().replace(',', '.');
  return text === '' ? Number.NaN : Number.parseFloat(text);
}

/** One decimal place, without a trailing `.0`: 2.5 -> "2.5", 3 -> "3". */
export function oneDecimal(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/** Elapsed milliseconds as `m:ss`. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** True when `value` is within `tolerance` of `truth`, inclusive, with float slack. */
export function within(value: number, truth: number, tolerance: number): boolean {
  return Math.abs(value - truth) <= tolerance + 1e-9;
}
