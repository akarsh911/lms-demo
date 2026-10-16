import type { FeatureKey } from '@/constants/features';
import type { FeatureReason } from '@/constants/cas';

/**
 * How a feature should be presented. Derived from a CAS reason by a pure total
 * function (`lib/entitlement/decide.ts`) so the mapping is in exactly one place.
 */
export type UiState =
  /** Absent from the DOM entirely. The user does not hold this. */
  | 'hidden'
  /** Rendered and usable. */
  | 'enabled'
  /** Rendered, visibly disabled, with a reason the user can read. */
  | 'disabled'
  /** Held, but only inside a scope the request has not named yet. */
  | 'needs_scope';

export interface EntitlementEntry {
  key: FeatureKey;
  state: UiState;
  reason: FeatureReason;
  matchedScope?: string;
}

/**
 * The resolved entitlement picture for one user at one moment.
 *
 * This object lives ONLY on the server. It is never serialised into a client
 * component's props, never put in a cookie the browser can read, and never
 * placed in localStorage. What crosses to the browser is finished markup and,
 * where a client component genuinely needs it, the narrow already-filtered
 * result — never the set of keys the user does *not* hold.
 */
export interface EntitlementSnapshot {
  userId: string;
  sessionId: string;
  entries: Map<FeatureKey, EntitlementEntry>;
  superAdmin: boolean;
  groups: { id: string; key: string | null; name: string }[];
  epoch: number;
  /** When this snapshot was resolved (ms since epoch). */
  resolvedAt: number;
  /** The access-token expiry it was resolved under. A snapshot never outlives it. */
  credentialExpiresAt: number;
}

export function entitlementState(
  snapshot: EntitlementSnapshot,
  key: FeatureKey,
): UiState {
  return snapshot.entries.get(key)?.state ?? 'hidden';
}

/** True only for a state that may actually be navigated to. */
export function isReachable(state: UiState): boolean {
  return state === 'enabled' || state === 'needs_scope';
}
