/**
 * Session and entitlement-cache constants.
 *
 * Note what is NOT here: any key used to encrypt something in the browser. The
 * session is sealed with a SERVER-side secret the browser never receives. A key
 * shipped in a client bundle protects nothing, because the attacker who would
 * forge the payload also controls the code that checks it.
 */

export const SESSION_COOKIE = 'emerge_session';
export const PERSONA_HINT_COOKIE = 'emerge_persona';
export const PENDING_SESSION_COOKIE = 'emerge_pending';

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  // Secure is required in production but breaks plain-HTTP localhost dev.
  secure: process.env.NODE_ENV === 'production',
} as const;

/** Refresh token TTL in CAS is 30 days; the cookie should not outlive it. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const PENDING_SESSION_MAX_AGE_SECONDS = 15 * 60;

/**
 * Entitlement snapshot freshness.
 *
 * Soft: revalidate in the background past this age. Cheap — the BFF talks to
 * CAS over the LAN, so nobody waits on it.
 *
 * Hard: refuse to serve past this age.
 *
 * Both are additionally bounded by the access token's own expiry: a snapshot
 * may never outlive the credential it was resolved with. Whichever comes first
 * wins.
 */
export const SNAPSHOT_SOFT_TTL_MS = 60 * 1000;
export const SNAPSHOT_HARD_TTL_MS = 300 * 1000;

/** Refresh this many ms before the access token actually expires. */
export const REFRESH_SKEW_MS = 60 * 1000;
