/**
 * Wire types for the labs service: where a completed practical's attempt
 * record is persisted.
 *
 * The backend does not exist yet. This is the contract the front end is built
 * against, and the dev bypass (`src/fixtures/daily.ts`) answers it. The
 * `record` is carried verbatim: for the Ohm's law bench it is exactly what
 * `lms-lab-engine` posts to its parent frame as `lab-bench:attempt`, so a
 * backend written for the standalone bench accepts it unchanged.
 */

/**
 * Which practical an attempt belongs to: the bench's `meta.id`.
 *
 * A string rather than a union of the benches built so far — the syllabus has
 * fourteen and they arrive one at a time, and the service stores whatever it is
 * told. `@labs/lib/benches.ts` is the list that actually exists.
 */
export type LabBenchId = string;

export interface SubmitLabAttemptInput<R = unknown> {
  bench: LabBenchId;
  record: R;
}

/** What the service returns for a stored attempt, and lists. */
export interface LabAttemptSummary {
  id: string;
  bench: LabBenchId;
  /** ISO 8601. */
  submittedAt: string;
  score: number;
  max: number;
  /** Time on the bench, `m:ss`. */
  time: string;
  benchSeed: number;
}

export interface LabAttemptsResponse {
  /** Newest first. */
  attempts: LabAttemptSummary[];
}

/**
 * WHICH TEACHING LAYERS A BENCH RUNS WITH.
 *
 * Administrator side only: there is no student-facing control for any of these,
 * and a student must not be able to tell a flag exists. A flag that is off
 * removes the feature — its control is never rendered, its state is never
 * built, and its code path is never entered.
 *
 * Not to be confused with a CAS feature key. CAS decides whether the labs
 * WIDGET exists at all; these decide what is inside one, and they come from the
 * lab engine's own service alongside the attempt records.
 *
 * The server may send flags this build has never heard of, and a build may ask
 * for flags the server has never heard of. Both are normal — read every flag
 * through `labFeature`, which treats anything it does not recognise as ON, so a
 * bench is never silently stripped of a layer by a deployment skew.
 */
export interface LabFeatureFlags {
  /** The hands-on "How to play" tour. */
  tutorial?: boolean;
  /** The one-off full-setup walkthrough, where a bench has one. */
  guidedBuild?: boolean;
  /** The per-step "Show me this step" demonstration. */
  trainer?: boolean;
  /** The "What's happening" panel, and the optics benches' light path. */
  teach?: boolean;
  /** Live motion. Off settles the apparatus exactly as reduced motion does. */
  animation?: boolean;
  /** Buyable hints, where a bench has them. */
  hints?: boolean;
  /** The viva stage. Off rescales the remaining parts to total 100. */
  viva?: boolean;
  /** A fresh shuffled draw each attempt; off asks the bank's first five in order. */
  vivaShuffle?: boolean;
  /** Whether a finished attempt is posted at all. */
  attemptPost?: boolean;
}

export type LabFeatureName = keyof LabFeatureFlags;

export interface LabFeaturesResponse {
  features: LabFeatureFlags;
}

/**
 * Read one flag. Unknown and absent both mean ON, so neither a new build
 * against an old service nor an old build against a new one loses a feature it
 * should have had.
 */
export function labFeature(flags: LabFeatureFlags | undefined, name: LabFeatureName): boolean {
  return flags?.[name] !== false;
}
