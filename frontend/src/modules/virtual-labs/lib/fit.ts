/**
 * Ordinary least-squares line through a set of points.
 *
 * Used to grade a result against the student's OWN readings rather than against
 * the true value: a student who read the meters honestly and found the slope
 * correctly earns the marks even if their points carry real experimental error.
 */
export interface Point {
  x: number;
  y: number;
}

export interface Line {
  /** Slope. */
  m: number;
  /** Intercept on the y axis. */
  c: number;
}

export function fitLine(points: readonly Point[]): Line {
  const n = points.length;
  if (n === 0) return { m: 0, c: 0 };
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
  }
  const m = sxx ? sxy / sxx : 0;
  return { m, c: my - m * mx };
}

/** Relative error of `value` against `truth`, as a fraction. Infinite when truth is zero. */
export function relativeError(value: number, truth: number): number {
  return truth === 0 ? Number.POSITIVE_INFINITY : Math.abs(value - truth) / Math.abs(truth);
}
