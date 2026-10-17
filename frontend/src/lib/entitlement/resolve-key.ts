import { isCasRegistered, type FeatureKey } from '@/constants/features';
import { logger } from '@/lib/logger';
import type { EntitlementEntry, EntitlementSnapshot, UiState } from '@/types/entitlement';

/**
 * Resolve any feature key — including one CAS does not know yet — to a UI state.
 *
 * ## The rule
 *
 *   registered in CAS  -> CAS's answer, full stop. No inheritance, ever.
 *   not registered     -> inherit the nearest registered ANCESTOR's answer.
 *
 * `emerge.attendance.summary` with no CAS row inherits `emerge.attendance`.
 * The day someone creates that row in CAS and adds it to `CAS_REGISTERED_KEYS`,
 * inheritance stops for it and CAS decides — including deciding to deny it,
 * which inheritance must never be able to override.
 *
 * ## Why inheritance is permissive, and why that is the right default here
 *
 * An unregistered widget is visible whenever its section is. That is
 * deliberate: it lets a section be built out widget by widget without a CAS
 * round-trip per panel, and it fails toward "the user sees a panel of a section
 * they already have", never toward "the user sees a section they do not have".
 * The section itself is always CAS-gated.
 *
 * It is still a real trade. A widget that must be independently deniable needs
 * its own CAS key — that is what registration is for, and it is two lines.
 */
export interface ResolvedFeature {
  state: UiState;
  entry: EntitlementEntry | undefined;
  /** The key whose decision was actually used. Differs when inherited. */
  matchedKey: string;
  inherited: boolean;
}

export function resolveFeature(
  snapshot: EntitlementSnapshot,
  key: FeatureKey,
): ResolvedFeature {
  // Registered: CAS is authoritative and there is nothing to inherit.
  if (isCasRegistered(key)) {
    const entry = snapshot.entries.get(key);
    return {
      state: entry?.state ?? 'hidden',
      entry,
      matchedKey: key,
      inherited: false,
    };
  }

  // Unregistered: walk up to the nearest registered ancestor.
  const parts = key.split('.');
  for (let i = parts.length - 1; i >= 2; i -= 1) {
    const ancestor = parts.slice(0, i).join('.');
    if (!isCasRegistered(ancestor)) continue;

    const entry = snapshot.entries.get(ancestor as FeatureKey);
    if (process.env.NODE_ENV === 'development') {
      logger.debug(
        `"${key}" has no CAS row; inheriting "${ancestor}" (${entry?.state ?? 'hidden'}). ` +
          'Register it in CAS and add it to CAS_REGISTERED_KEYS to gate it independently.',
      );
    }
    return {
      state: entry?.state ?? 'hidden',
      entry,
      matchedKey: ancestor,
      inherited: true,
    };
  }

  // No registered ancestor at all: nothing vouches for this key.
  return { state: 'hidden', entry: undefined, matchedKey: key, inherited: false };
}
