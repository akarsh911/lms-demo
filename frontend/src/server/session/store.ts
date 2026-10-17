import 'server-only';

import { REFRESH_SKEW_MS } from '@/constants/session';
import { casClient } from '@/server/cas/client';
import { CasError } from '@/server/cas/errors';
import { logger } from '@/lib/logger';
import type { EntitlementSnapshot } from '@/types/entitlement';

import { ssoClientId } from '@/server/sso/config';

import { expiryFromSeconds, parseExpiry, type SessionPayload } from './cookie';

/**
 * Per-process session bookkeeping.
 *
 * Deliberately NOT the source of truth for the session — the sealed cookie is.
 * A process restart therefore signs nobody out; this map simply repopulates.
 * It exists for two things that a cookie cannot do:
 *
 *   1. Single-flight refresh. Two concurrent server-side requests (a page
 *      render and a `next/link` prefetch, say) would otherwise both refresh,
 *      and the second would present an already-rotated token. CAS treats that
 *      as theft and revokes the entire session — a silent sign-out with nothing
 *      in any log.
 *
 *   2. Caching the entitlement snapshot so navigation does not re-resolve.
 *
 * DEPLOYMENT CONSTRAINT: single-flight is per-process, so this assumes ONE
 * instance, or a load balancer with session affinity. Running several instances
 * without affinity reintroduces exactly the refresh race described above. A
 * shared store fixes the data but NOT the latch — a Promise is not
 * serialisable — so sticky routing is required either way.
 */

interface SessionEntry {
  refreshInFlight: Promise<SessionPayload | null> | null;
  snapshot: EntitlementSnapshot | null;
  /**
   * The most recent pair this process obtained for the session.
   *
   * This is what closes the replay window. The single-flight latch only
   * serialises requests that overlap IN TIME; it does nothing for a request
   * that arrives afterwards still carrying the pre-rotation cookie. That window
   * is one browser round-trip wide and, because refresh fires up to
   * REFRESH_SKEW_MS early, ordinary traffic walks into it without an attacker.
   * Spending an already-spent token is what CAS treats as theft, and it revokes
   * the entire session — a silent sign-out with nothing in any log.
   */
  rotated: SessionPayload | null;
}

// Survives hot-reload in dev, where module state is otherwise discarded.
const globalStore = globalThis as unknown as {
  __emergeSessions?: Map<string, SessionEntry>;
};

const sessions: Map<string, SessionEntry> =
  globalStore.__emergeSessions ?? (globalStore.__emergeSessions = new Map());

function entryFor(sid: string): SessionEntry {
  let entry = sessions.get(sid);
  if (!entry) {
    entry = { refreshInFlight: null, snapshot: null, rotated: null };
    sessions.set(sid, entry);
    evictIfNeeded();
  }
  return entry;
}

export function getSnapshot(sid: string): EntitlementSnapshot | null {
  return sessions.get(sid)?.snapshot ?? null;
}

export function setSnapshot(sid: string, snapshot: EntitlementSnapshot): void {
  entryFor(sid).snapshot = snapshot;
}

export function dropSession(sid: string): void {
  sessions.delete(sid);
}

/**
 * Bound the map. Without this a long-lived process accumulates one entry per
 * session forever — a slow leak that only shows up in production.
 */
const MAX_TRACKED_SESSIONS = 5000;
function evictIfNeeded(): void {
  if (sessions.size <= MAX_TRACKED_SESSIONS) return;
  // Map preserves insertion order, so the oldest entries come first. Dropping
  // one costs a re-resolve, never a sign-out: the cookie remains the source of
  // truth for the session itself.
  const excess = sessions.size - MAX_TRACKED_SESSIONS;
  let dropped = 0;
  for (const key of sessions.keys()) {
    if (dropped++ >= excess) break;
    sessions.delete(key);
  }
}

/** True when the access token is close enough to expiry to warrant refreshing. */
export function needsRefresh(session: SessionPayload, now = Date.now()): boolean {
  return session.accessExpiresAt - now <= REFRESH_SKEW_MS;
}

/**
 * The outcome of an attempted refresh.
 *
 * `throttled` is separated from `failed` on purpose. When CAS returns 429 the
 * throttle check ran BEFORE the refresh token was looked up, so the token was
 * never spent and is still valid. Signing the user out on a 429 would convert a
 * transient rate limit into a mass logout — behind a BFF every user shares one
 * source IP, so one noisy client can trip the limit for everyone.
 */
export type RefreshOutcome =
  | { status: 'refreshed'; session: SessionPayload }
  | { status: 'unchanged'; session: SessionPayload }
  | { status: 'throttled'; session: SessionPayload }
  | { status: 'failed' };

/**
 * Refresh the access token, at most once per session at a time.
 *
 * The latch is cleared in `finally`. Clearing it after the `await` instead — as
 * the sibling console app does — leaks the latch permanently if the refresh
 * throws, and every later request then believes a refresh is still in flight.
 */
export async function refreshSession(
  session: SessionPayload,
  clientIp?: string,
): Promise<RefreshOutcome> {
  if (!needsRefresh(session)) return { status: 'unchanged', session };

  const entry = entryFor(session.sid);

  // Someone already rotated this session and the caller is holding a stale
  // cookie. Hand back what we obtained rather than spending their dead token.
  // Without this the latch alone is not enough: it only covers requests that
  // overlap in time, and the dangerous case is the one that arrives just after.
  if (entry.rotated && entry.rotated.accessExpiresAt > session.accessExpiresAt) {
    return needsRefresh(entry.rotated)
      ? { status: 'unchanged', session: entry.rotated }
      : { status: 'refreshed', session: entry.rotated };
  }

  if (!entry.refreshInFlight) {
    entry.refreshInFlight = (async () => {
      try {
        const next = await rotate(session, clientIp);
        // Recorded BEFORE the latch clears, so a request arriving one moment
        // later finds the rotation instead of replaying the spent token.
        entry.rotated = next;
        return next;
      } finally {
        entry.refreshInFlight = null;
      }
    })();
  }

  try {
    const next = await entry.refreshInFlight;
    if (!next) return { status: 'failed' };
    return { status: 'refreshed', session: next };
  } catch (cause) {
    if (cause instanceof CasError && cause.failure.kind === 'throttled') {
      // Keep the existing session. The refresh token is unspent, the access
      // token may still have life in it, and the next attempt may well succeed.
      logger.warn(
        'CAS throttled a refresh. The session is intact and was NOT rotated. ' +
          'If this is frequent, CAS_TRUSTED_PROXIES is unset and the per-IP ' +
          'throttle is being applied to this server rather than to real clients.',
      );
      return { status: 'throttled', session };
    }
    logger.warn('Refresh failed; signing out', { cause });
    dropSession(session.sid);
    return { status: 'failed' };
  }
}

async function rotate(session: SessionPayload, clientIp?: string): Promise<SessionPayload> {
  if (session.origin === 'sso') {
    const pair = await casClient.refreshOAuth(session.refreshToken, ssoClientId());
    return {
      ...session,
      accessToken: pair.access_token,
      refreshToken: pair.refresh_token ?? session.refreshToken,
      accessExpiresAt: expiryFromSeconds(pair.expires_in),
    };
  }
  const pair = await casClient.refresh(session.refreshToken, clientIp);
  return {
    ...session,
    accessToken: pair.access_token,
    refreshToken: pair.refresh_token,
    accessExpiresAt: parseExpiry(pair.expires_at),
  };
}
