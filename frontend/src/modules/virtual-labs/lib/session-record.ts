/**
 * AN UNFINISHED PRACTICAL, WRITTEN DOWN.
 *
 * A completed attempt goes to the labs service and is the school's record of
 * it. This is the other half: the bench a student walked away from, kept on
 * their own machine so that closing the tab, following a link or coming back
 * tomorrow does not throw away forty minutes of work.
 *
 * WHY IT IS LOCAL AND NOT A SAVE ENDPOINT. An unfinished attempt is nobody's
 * business but the student's — it is a desk left as it was, not a submission —
 * and it changes on every click, which is not a thing to put on the network. It
 * is also the only design that keeps working when the service is down, which is
 * exactly when a student most needs not to lose their readings.
 *
 * WHY A STORED STATE IS NEVER TRUSTED. What comes back out of storage is
 * whatever was there: written by an older build whose reducer expected
 * different fields, half-written by a tab that was killed, or edited by hand. A
 * reducer handed a state it did not build is a crash at best. So a record is
 * admitted only if it passes three gates, in order —
 *
 *   1. the FORMAT version matches this build's,
 *   2. the SHAPE fingerprint matches a bench freshly built by this build,
 *   3. the engine can actually read it (`probe` below runs the four pure
 *      accessors the workspace calls on every render and catches anything).
 *
 * Any failure discards the record rather than repairing it. A lost resume costs
 * a student one practical; a restored-but-wrong state corrupts their marks and
 * tells them nothing is wrong.
 *
 * This module is pure: it never touches storage, a clock or the DOM, so the
 * whole of the above can be driven from plain Node.
 */

/**
 * The stored format. BUMP THIS whenever a field below changes meaning, which
 * retires every record written by an older build in one move.
 */
export const SESSION_VERSION = 1;

export interface LabSessionRecord {
  v: number;
  /** `BenchMeta.id`. */
  bench: string;
  /** What this build's fresh bench for this practical looks like. See `shapeOf`. */
  shape: string;
  seed: number | null;
  /** When it was written, epoch ms. Also how long the student has been away. */
  savedAt: number;
  /**
   * Enough to draw a row without rehydrating the state or loading the engine —
   * which is what lets the dock and the history list stay cheap, and lets them
   * render for a practical whose code has not been downloaded.
   */
  title: string;
  subtitle: string;
  step: number;
  steps: number;
  score: number;
  max: number;
  /** Time on the bench when it was saved, ms. */
  elapsedMs: number;
  done: boolean;
  /** When the student dismissed the dock for this session. */
  dismissedAt?: number;
  /** The bench's own state. Opaque here, and opaque to everything but its engine. */
  state: unknown;
}

function kindOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * A cheap fingerprint of a state's top-level shape: its keys, sorted, each with
 * the kind of value it holds.
 *
 * Taken from a FRESH bench at both ends, never from the saved state itself.
 * Fingerprinting the saved state would compare a half-finished bench against a
 * new one and reject every resume the moment a practical added a key partway
 * through; fingerprinting two fresh benches compares like with like, and moves
 * only when the build does.
 *
 * It is not a checksum and does not try to be. It catches the change that
 * actually happens between deployments — a field renamed, added, removed or
 * changed from a number to an array — which is the class of change that makes
 * an old state dangerous to a new reducer.
 */
export function shapeOf(state: unknown): string {
  if (state === null || typeof state !== 'object') return kindOf(state);
  const row = state as Record<string, unknown>;
  return Object.keys(row)
    .sort()
    .map((key) => `${key}:${kindOf(row[key])}`)
    .join(',');
}

/** Whether a parsed blob is a record this build wrote for this bench. */
export function isCurrent(record: unknown, bench: string, shape: string): record is LabSessionRecord {
  if (record === null || typeof record !== 'object') return false;
  const r = record as Partial<LabSessionRecord>;
  return (
    r.v === SESSION_VERSION &&
    r.bench === bench &&
    r.shape === shape &&
    typeof r.savedAt === 'number' &&
    r.state !== undefined
  );
}

/** Loose enough to draw a row from, for a list that spans several practicals. */
export function isDrawable(record: unknown): record is LabSessionRecord {
  if (record === null || typeof record !== 'object') return false;
  const r = record as Partial<LabSessionRecord>;
  return (
    r.v === SESSION_VERSION &&
    typeof r.bench === 'string' &&
    typeof r.title === 'string' &&
    typeof r.savedAt === 'number' &&
    typeof r.step === 'number' &&
    typeof r.steps === 'number'
  );
}

/**
 * Is there anything here worth offering back? A bench that was opened and shut
 * is not an unfinished practical, and a dock for it is clutter that teaches the
 * student to ignore the dock.
 */
export function isResumable(record: LabSessionRecord): boolean {
  return !record.done && (record.step > 0 || record.score > 0);
}

/**
 * The last gate: can the engine READ this state?
 *
 * The four accessors are the ones the workspace calls on its first render, so
 * anything that would crash the bench crashes here instead — in a try, before
 * the state has been committed, where the answer is simply "no".
 */
export function probe<S, A>(
  engine: {
    step: (s: S) => number;
    done: (s: S) => boolean;
    score: (s: S) => Record<string, number> & { total: number };
    message: (s: S) => unknown;
    reducer?: (s: S, a: A) => S;
  },
  state: unknown,
): state is S {
  try {
    const s = state as S;
    const step = engine.step(s);
    const total = engine.score(s).total;
    engine.done(s);
    engine.message(s);
    return Number.isFinite(step) && Number.isFinite(total);
  } catch {
    return false;
  }
}

/**
 * Move a restored bench's clock forward by the time the student was away.
 *
 * `t0` is an absolute timestamp, so a bench resumed the next morning would
 * otherwise read fourteen hours on a practical that took twenty minutes. The
 * clock is meant to measure time AT THE BENCH, and a closed tab is not that.
 * A finished bench has a `tEnd` and is left exactly as it was.
 */
export function shiftClock<S>(state: S, awayMs: number): S {
  const s = state as { t0?: number; tEnd?: number } | null;
  if (!s || typeof s.t0 !== 'number' || s.tEnd) return state;
  return { ...(state as object), t0: s.t0 + Math.max(0, awayMs) } as S;
}
