import 'server-only';

import { isFeatureKey, type FeatureKey } from '@/constants/features';
import type { FeatureReason } from '@/constants/cas';
import { uiStateFor } from '@/lib/entitlement/decide';
import { logger } from '@/lib/logger';
import type { FeatureDecision } from '@/types/cas';
import type { EntitlementEntry } from '@/types/entitlement';

/**
 * CAS evaluate decisions -> the entries of a snapshot.
 *
 * Split out of `resolve.ts` so that every source of decisions goes through the
 * SAME mapping and the same tripwires: the live CAS answer, and the dev-bypass
 * fixture in `server/dev/fixtures.ts`. A fixture that built entries its own way
 * would let the reason mapping drift from CAS without anything noticing.
 */
export function entriesFromDecisions(
  decisions: readonly FeatureDecision[],
): Map<FeatureKey, EntitlementEntry> {
  const entries = new Map<FeatureKey, EntitlementEntry>();

  for (const decision of decisions) {
    if (!isFeatureKey(decision.feature)) {
      // CAS answered about a key this build does not know. Harmless, but it
      // means the registry and CAS have drifted.
      logger.warn('Evaluate returned an unknown feature key', decision.feature);
      continue;
    }

    if (decision.reason === 'retired' || decision.reason === 'kill_switch') {
      // Should be unreachable: `/v1/me.features` filters BOTH `is_active` and
      // `kill_switch`, so neither kind of key survives the intersection in
      // `resolveEntitlements`. Arrival means one of two things, and both are
      // worth a line in a log: the feature was retired or killed in the window
      // between the `/v1/me` call and this evaluate (harmless, and the mapping
      // handles it), or `EffectiveFeatureKeys` has changed shape and the
      // superset relationship that makes the intersection safe no longer holds,
      // at which point held features may be being hidden silently.
      logger.error(
        `Entitlement invariant broken: "${decision.feature}" evaluated as ` +
          `"${decision.reason}" but survived the /v1/me intersection. Either it ` +
          'changed mid-request, or EffectiveFeatureKeys has changed its filters and ' +
          'features may now be silently hidden. See docs/DECISIONS.md.',
      );
    }

    const state = uiStateFor(decision.reason, decision.enabled);

    /**
     * Cross-check the reason mapping against CAS's own conclusion.
     *
     * CAS returns `visible` (`state !== "off"`) beside the reason. This side
     * derives visibility from the reason instead, because the reason is the
     * only field that can say WHY, and why is what the user reads. Deriving it
     * twice is worth something only if the two are compared: a disagreement
     * means `uiStateFor` has fallen behind CAS, which is exactly the drift that
     * left `grant_off`, `feature_group_off` and `disabled` out of the reason
     * union for as long as they were.
     *
     * `visible` may be absent against an older CAS build, so the comparison is
     * guarded rather than assumed.
     */
    if (
      typeof decision.visible === 'boolean' &&
      !DELIBERATE_VISIBILITY_DIVERGENCE.has(decision.reason) &&
      decision.visible !== (state !== 'hidden')
    ) {
      logger.error(
        `Entitlement mapping drift on "${decision.feature}": CAS says visible=` +
          `${decision.visible} (state "${decision.state}", reason "${decision.reason}") ` +
          `but uiStateFor produced "${state}". Reconcile lib/entitlement/decide.ts ` +
          'with CAS/internal/service/entitlement.go, or add the reason to ' +
          'DELIBERATE_VISIBILITY_DIVERGENCE with the reason it differs.',
      );
    }

    entries.set(decision.feature, {
      key: decision.feature,
      state,
      reason: decision.reason,
      matchedScope: decision.matched_scope,
    });
  }

  return entries;
}

/**
 * Reasons where this front end deliberately disagrees with CAS's `visible`.
 *
 * Both are conscious product decisions, written down here so the drift check
 * above stays a real tripwire instead of a permanently noisy one:
 *
 *   scoped_grant_needs_context  CAS reports OFF, because a scoped entitlement
 *                               that turns on when nobody says where is not
 *                               scoped. It is right to answer that way. But the
 *                               user genuinely HOLDS the feature. What is
 *                               missing is which class they mean, and that is a
 *                               question the destination screen asks. Hiding
 *                               the row would deny access CAS granted.
 *
 *   kill_switch                 CAS reports OFF. Shown disabled instead: a
 *                               kill switch is an incident, not a product
 *                               decision, and a feature silently vanishing
 *                               mid-session is worse than one that says it is
 *                               temporarily unavailable.
 *
 * Anything NOT in this set must agree with CAS. Adding to it is a decision to
 * be argued for in a comment, not a way to quiet a warning.
 */
const DELIBERATE_VISIBILITY_DIVERGENCE: ReadonlySet<FeatureReason> = new Set([
  'scoped_grant_needs_context',
  'kill_switch',
]);
