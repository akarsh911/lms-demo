import type { FeatureReason } from '@/constants/cas';
import type { UiState } from '@/types/entitlement';

/**
 * The reason -> UI state mapping. Pure, total, and the ONLY place this decision
 * is made.
 *
 * The `never` assignment in the default branch is deliberate: if CAS ever adds
 * an eleventh reason, this stops compiling. Given there are no tests in this
 * repo by house rule, a compile error is the strongest guarantee available that
 * a new reason cannot silently fall through to a default.
 *
 * It also already earned its keep. Three reasons, `grant_off`,
 * `feature_group_off` and `disabled`, were missing from the union for as long
 * as this file existed, and because of this branch the symptom was a loud throw
 * rather than a feature quietly rendering as if it were live.
 *
 * # The two axes a feature now carries, and where each is answered
 *
 *   active / inactive   product lifecycle    -> `retired`, and `is_active=false`
 *                                              is also why the key never
 *                                              survives the /v1/me intersection
 *   enabled / disabled  works / drawn inert  -> `disabled` (on the feature),
 *                                              `grant_off` (on the grant),
 *                                              `feature_group_off` (on the
 *                                              bundle it arrived through)
 *
 * The third axis, sidebar / widget, is PLACEMENT. It is not an entitlement
 * answer at all and CAS does not return it. See `constants/cas.ts`.
 */
export function uiStateFor(reason: FeatureReason, enabled: boolean): UiState {
  switch (reason) {
    // Held outright, anywhere.
    case 'unscoped_grant':
      return enabled ? 'enabled' : 'disabled';

    // Held here, because the request named a scope inside the grant's boundary.
    case 'scope_match':
      return enabled ? 'enabled' : 'disabled';

    // Held, but only inside scopes this request has not named.
    //
    // Rendered as reachable rather than disabled. The user genuinely holds this
    // feature; what is missing is *which* class or grade they mean, and that is
    // a question the destination screen asks, not a reason to grey out the door.
    // The parent who holds attendance for their child's class must be able to
    // click "Attendance" — hiding or disabling it would deny access CAS granted.
    case 'scoped_grant_needs_context':
      return 'needs_scope';

    // The user holds it, but not anywhere near what the request is about.
    // Not shown: offering a door that leads nowhere is worse than no door.
    case 'out_of_scope':
      return 'hidden';

    // Nothing grants this. Absent from the DOM entirely — not greyed out,
    // because a disabled control still tells the user the feature exists.
    case 'no_grant':
      return 'hidden';

    // The feature was retired at the product level.
    //
    // Also a tripwire: the `registry ∩ me.features` intersection filters on
    // `is_active`, so a retired key should never reach evaluate at all. If one
    // does, the superset relationship that makes the intersection safe has
    // broken, and held features may be being hidden silently. See the caller.
    case 'retired':
      return 'hidden';

    // The emergency switch is pulled. Distinct from retired: this is an
    // incident, not a product decision, and the user should see that the
    // feature exists and is temporarily unavailable rather than watch it
    // vanish mid-session.
    //
    // Rarely reached in practice, and worth knowing why: `/v1/me` already
    // filters `kill_switch = FALSE`, so a killed key does not survive the
    // intersection and is never asked about. What is left is the race, killed
    // between the `/v1/me` call and the evaluate that follows it, plus any
    // future caller that evaluates a key without the intersection. Both deserve
    // the honest answer rather than a throw.
    case 'kill_switch':
      return 'disabled';

    // `is_enabled = false` on the feature itself. CAS's own words: "the front
    // end draws it and refuses to act on it, which is a different message from
    // hiding it". Visible and inert is the whole point of the flag, so hiding
    // it here would throw away the only thing that distinguishes it from
    // `is_active = false`.
    case 'disabled':
      return 'disabled';

    // Every grant that reaches this user carries `feature_enabled = false`.
    // The holder still holds it; an administrator has switched this particular
    // handout off. Same treatment as above, and for the same reason: the user
    // asking "where did it go" is a worse outcome than a greyed row.
    case 'grant_off':
      return 'disabled';

    // It only reaches this user through a feature group that is itself retired
    // or killed. The grant is intact and the feature may well be fine; the
    // bundle in between is not.
    case 'feature_group_off':
      return 'disabled';

    default: {
      const exhaustive: never = reason;
      throw new Error(`Unhandled entitlement reason: ${String(exhaustive)}`);
    }
  }
}

/**
 * A short, honest explanation for a state that is not `enabled`.
 *
 * These are read by a user, so they say what is true without naming CAS
 * internals: "switched off for your account" is actionable, `grant_off` is not.
 */
export function hintFor(reason: FeatureReason): string | undefined {
  switch (reason) {
    case 'kill_switch':
      return 'Temporarily unavailable';
    case 'retired':
      return 'No longer available';
    case 'scoped_grant_needs_context':
      return 'Choose a class to continue';
    case 'disabled':
      return 'Switched off';
    case 'grant_off':
      return 'Switched off for your account';
    case 'feature_group_off':
      return 'Switched off for your school';
    case 'unscoped_grant':
    case 'scope_match':
    case 'out_of_scope':
    case 'no_grant':
      return undefined;
    default: {
      const exhaustive: never = reason;
      throw new Error(`Unhandled entitlement reason: ${String(exhaustive)}`);
    }
  }
}
