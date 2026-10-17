import 'server-only';

import { bandForGroupKeys, DEFAULT_BAND, type GradeBandId } from '@/styles/theme';
import { getSession } from '@/server/dal';
import { getEntitlements } from '@/server/entitlement/resolve';
import { logger } from '@/lib/logger';

/**
 * Which grade band this request should be rendered in.
 *
 * Derived from the user's CAS class groups — `emerge-class-06` puts them in
 * `middle`, `emerge-class-10` in `senior`. A user in several class groups takes
 * the highest.
 *
 * This is presentation only. It decides how round the corners are, not what the
 * user may see, and nothing downstream may treat it as an authorization input.
 *
 * Signed-out and unknown both fall back to the default band. A sign-in screen
 * has no audience yet, and guessing wrong there costs nothing.
 */
export async function resolveBand(): Promise<GradeBandId> {
  try {
    const session = await getSession();
    if (!session) return DEFAULT_BAND;

    const snapshot = await getEntitlements(session);
    return bandForGroupKeys(snapshot.groups.map((g) => g.key));
  } catch (cause) {
    // A theming decision must never be able to fail a page render. If CAS is
    // unreachable the app still has to draw something.
    logger.warn('Could not resolve grade band; using the default', { cause });
    return DEFAULT_BAND;
  }
}
