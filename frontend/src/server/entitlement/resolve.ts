import 'server-only';

import { isFeatureKey, type FeatureKey } from '@/constants/features';
import { SNAPSHOT_HARD_TTL_MS, SNAPSHOT_SOFT_TTL_MS } from '@/constants/session';
import { chunkKeys } from '@/lib/entitlement/chunk';
import { logger } from '@/lib/logger';
import { REGISTRY_FEATURE_KEYS } from '@/routes/registry';
import { WIDGET_FEATURE_KEYS } from '@/components/widgets/registry';
import { casClient } from '@/server/cas/client';
import { resolveScopeContext } from '@/server/entitlement/context';
import { isDevBypass } from '@/server/dev/bypass';
import { devSnapshot } from '@/server/dev/fixtures';
import { getSnapshot, setSnapshot } from '@/server/session/store';
import type { SessionPayload } from '@/server/session/cookie';
import type { FeatureDecision } from '@/types/cas';
import type { EntitlementSnapshot } from '@/types/entitlement';

import { entriesFromDecisions } from './entries';

/**
 * Resolve what this user may be shown.
 *
 * Two calls, and the difference between them matters:
 *
 *   `GET /v1/me`                -> the CANDIDATE set
 *   `POST /v1/features/evaluate` -> the AUTHORITY
 *
 * `/v1/me.features` comes from `EffectiveFeatureKeys`, which ends in
 * `WHERE f.is_active = TRUE AND f.kill_switch = FALSE`. It applies two of a
 * feature's three axes and not the third: `is_enabled = false` still appears
 * there, which is deliberate: a disabled feature is meant to be drawn and
 * inert, so it must reach the client. The list is also scope-blind, treating a
 * Grade-10-only grant as global. So it is used for exactly one purpose here:
 * narrowing which keys we bother to ask about.
 */
export async function resolveEntitlements(
  session: SessionPayload,
): Promise<EntitlementSnapshot> {
  const identity = await casClient.me(session.accessToken);

  const held = new Set(identity.features.filter(isFeatureKey));

  /**
   * Ask only about keys that are BOTH in our registry and in the candidate set.
   *
   * This keeps the request small — bounded by what one person holds rather than
   * by the size of the product — which is what keeps us clear of the 64-key cap
   * without relying on the registry staying small.
   *
   * WHY IT IS SAFE: `/v1/me.features` is a strict superset of what evaluate
   * could return as enabled, because evaluate can only ever subtract
   * (kill_switch, scope). Narrowing by a superset cannot hide a held feature.
   *
   * WHAT WOULD BREAK IT: if CAS ever adds a filter to `EffectiveFeatureKeys`
   * beyond `is_active`, that superset relationship fails and this silently
   * hides features the user genuinely holds. The `retired` tripwire in
   * `entries.ts` is the cheap detector for exactly that.
   */
  //
  // Widget keys are unioned in explicitly. Today every widget reuses a key that
  // a route already declares, so routes alone would happen to cover them — but
  // only by coincidence. The moment a widget gets its own `emerge.home.*` key,
  // route-only evaluation would return no decision for it and the widget would
  // vanish silently, which is precisely the migration the widget registry
  // documents as a one-line change.
  const wanted = new Set<FeatureKey>([...REGISTRY_FEATURE_KEYS, ...WIDGET_FEATURE_KEYS]);
  const toEvaluate = [...wanted].filter((key) => held.has(key));

  /**
   * CONTEXT IS SENT, and every entry of it is server-resolved.
   *
   * The estate CAS now runs is scoped: measured against the deployed server,
   * every `emerge.*` grant is a SCOPED grant, so an evaluate that names no
   * context answers `scoped_grant_needs_context` for all of them and CAS
   * reports `enabled:false, state:off` — "a scoped entitlement that turns on
   * when nobody says where is not scoped". Supplying where is the missing
   * input, and it is the only thing supplied: the reason mapping downstream is
   * untouched.
   *
   * ORDERED MOST SPECIFIC FIRST — section, grade, branch, then the rest of the
   * user's memberships, then the tenant. CAS scans the array in order and
   * reports the FIRST element that matches as `matched_scope`, so the ordering
   * decides whether a grant is attributed to a section or to the whole school.
   * It does not change which features come back: a grant covers every
   * descendant of the group it was made on, so naming a section already matches
   * a tenant-wide grant.
   *
   * WHY IT MUST NEVER COME FROM THE CLIENT. CAS does not check that the caller
   * belongs to a context group; it only checks that a grant's scope covers it.
   * Measured: a teacher who is a member of neither `grade-g6` nor `grade-g7`
   * gets `scope_match` for a `grade-g6`-scoped feature by naming `grade-g6`.
   * So context is a claim CAS trusts, and a `?classId=` a browser could type
   * would be an escalation. Every key here comes from `GET /v1/me` or from
   * emerge-core under the session's own token.
   *
   * WHAT THE OLD COMMENT HERE GOT RIGHT, and where it still applies: scope runs
   * DOWNWARD from the granted group and membership is a different set, so a
   * parent granted their child's class without belonging to it is NOT covered
   * by their own memberships. That is why emerge-core's academic edges are
   * unioned in rather than the CAS closure being used alone, and why an
   * unresolved context sends an EMPTY array instead of a tenant-wide guess: an
   * empty context returns `scoped_grant_needs_context`, which this application
   * renders as reachable-and-asking, not as denied.
   */
  const context = await resolveScopeContext(session, identity.groups);
  if (context.keys.length === 0) {
    logger.warn(
      'No scope context could be resolved for this session, so every scoped grant ' +
        'will answer scoped_grant_needs_context. Features stay reachable and ask ' +
        'for a class rather than switching on school-wide.',
    );
  }

  const decisions: FeatureDecision[] = [];
  for (const batch of chunkKeys(toEvaluate)) {
    const res = await casClient.evaluate(session.accessToken, batch, context.keys);
    decisions.push(...res.decisions);
  }

  // The reason mapping, the invariant tripwires and the drift cross-check all
  // live in `entries.ts`, shared with the dev fixture so the two cannot differ.
  const snapshot: EntitlementSnapshot = {
    userId: identity.user.id,
    sessionId: session.sid,
    entries: entriesFromDecisions(decisions),
    superAdmin: identity.super_admin,
    groups: identity.groups.map((g) => ({ id: g.id, key: g.key, name: g.name })),
    epoch: identity.policy_epoch,
    resolvedAt: Date.now(),
    credentialExpiresAt: session.accessExpiresAt,
  };

  setSnapshot(session.sid, snapshot);
  return snapshot;
}

/**
 * A snapshot's hard deadline.
 *
 * Bounded by the access token it was resolved under, so an entitlement picture
 * can never outlive the credential that produced it — even if the TTL would
 * otherwise allow it.
 */
function hardDeadline(snapshot: EntitlementSnapshot): number {
  return Math.min(
    snapshot.resolvedAt + SNAPSHOT_HARD_TTL_MS,
    snapshot.credentialExpiresAt,
  );
}

/**
 * Get a usable snapshot, resolving or revalidating as needed.
 *
 * Past the soft TTL it is revalidated; past the hard deadline it is refused.
 * There is no "integrity failed, refetch" path, because there is no client-held
 * copy whose integrity could fail — the snapshot lives only in this process.
 * That removes the retry-storm risk at the root rather than rate-limiting it.
 */
export async function getEntitlements(
  session: SessionPayload,
  now = Date.now(),
): Promise<EntitlementSnapshot> {
  // Dev bypass: a fixture shaped like a CAS answer, run through the same
  // mapping. Never reached in a production build; see `server/dev/bypass.ts`.
  if (isDevBypass()) return devSnapshot(session);

  const cached = getSnapshot(session.sid);

  // `cached.userId === session.uid` is the load-bearing half of this condition.
  // Keying on `sid` alone would be one absent claim away from serving one
  // user's entitlements to another: `readTokenClaims` defaults a missing `sid`
  // to the empty string, and every such session would collide on one cache key.
  if (cached && cached.userId === session.uid && now < hardDeadline(cached)) {
    if (now - cached.resolvedAt < SNAPSHOT_SOFT_TTL_MS) return cached;
    try {
      return await resolveEntitlements(session);
    } catch (cause) {
      // Still inside the hard deadline: a stale-but-valid picture beats an
      // error page, and the API enforces authorization regardless.
      logger.warn('Revalidation failed; serving a still-valid snapshot', { cause });
      return cached;
    }
  }

  return resolveEntitlements(session);
}
