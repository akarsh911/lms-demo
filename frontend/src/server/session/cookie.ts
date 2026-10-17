import 'server-only';

import { createHash } from 'node:crypto';

import { EncryptJWT, jwtDecrypt, base64url } from 'jose';

import { SESSION_MAX_AGE_SECONDS } from '@/constants/session';

/**
 * The sealed session cookie.
 *
 * Contains the CAS token pair. It is encrypted AND authenticated with
 * AES-256-GCM using a secret that exists only on the server, so the browser
 * holds an opaque blob it can neither read nor forge.
 *
 * This is the load-bearing difference from the "encrypt the cache with a key in
 * frontend constants" approach that was considered and rejected: a key shipped
 * in the bundle is available to whoever would tamper with the payload, so it
 * proves nothing. A key that never leaves the server means a modified cookie
 * fails authentication and is discarded — the verifier is somewhere the
 * attacker cannot reach.
 *
 * Note this does NOT stop a user editing their own cookie in DevTools. Nothing
 * client-side can. What it does is guarantee the edit is *detected*, so the
 * result is a signed-out user rather than a forged session.
 */
export interface SessionPayload {
  /** CAS user id. */
  uid: string;
  /** CAS session id, from the access token's `sid` claim. */
  sid: string;
  accessToken: string;
  refreshToken: string;
  /** Access-token expiry as ms since epoch. */
  accessExpiresAt: number;
  // Remember me was unticked: the cookie ends with the browser, refreshes included.
  browserOnly?: boolean;
  origin?: SessionOrigin;
}

export type SessionOrigin = 'password' | 'sso';

let cachedKey: Uint8Array | null = null;

function secretKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const raw = process.env.SESSION_SECRET;
  if (!raw) {
    throw new Error(
      'SESSION_SECRET is not set. Generate one with `openssl rand -base64 32` ' +
        'and put it in .env.local. It must never be sent to the browser.',
    );
  }
  if (raw.length < 32) {
    throw new Error(
      `SESSION_SECRET is too short (${raw.length} chars). ` +
        'Generate one with `openssl rand -base64 32`.',
    );
  }
  // SHA-256 of the secret, rather than decode-and-truncate.
  //
  // Truncation was subtly wrong in both directions: `openssl rand -base64 32`
  // (the generator this project documents) frequently contains `+` or `/` and
  // so is not valid base64url, silently falling through to raw UTF-8 bytes;
  // and `openssl rand -hex 32` decodes to 48 unrelated bytes of which 32 were
  // kept. Hashing accepts any encoding, always yields exactly 32 bytes, and
  // depends on the whole secret rather than its first half.
  cachedKey = new Uint8Array(
    createHash('sha256').update(raw, 'utf8').digest(),
  );
  return cachedKey;
}

export async function seal(payload: SessionPayload): Promise<string> {
  return sealValue({ ...payload }, SESSION_MAX_AGE_SECONDS);
}

export async function sealValue(payload: Record<string, unknown>, maxAgeSeconds: number): Promise<string> {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .encrypt(secretKey());
}

export async function unsealValue(token: string | undefined): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  const key = secretKey();
  try {
    const { payload } = await jwtDecrypt(token, key);
    return payload;
  } catch {
    return null;
  }
}

/**
 * Open a sealed cookie. Returns null for anything that is not exactly a cookie
 * this server sealed: tampered, truncated, expired, or encrypted under a
 * different secret. Callers treat null as "no session" — never as an error to
 * retry, because retrying a forged cookie is pointless and a corrupted one will
 * never become valid.
 */
export async function unseal(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  // Resolved OUTSIDE the try below. A misconfigured secret is an operator
  // error, not a bad cookie, and swallowing it here would present every user
  // with a silent sign-out loop and no diagnostic anywhere.
  const key = secretKey();
  try {
    const { payload } = await jwtDecrypt(token, key);
    const { uid, sid, accessToken, refreshToken, accessExpiresAt, browserOnly, origin } =
      payload as unknown as SessionPayload;
    if (
      typeof uid !== 'string' ||
      typeof sid !== 'string' ||
      typeof accessToken !== 'string' ||
      typeof refreshToken !== 'string' ||
      typeof accessExpiresAt !== 'number' ||
      !Number.isFinite(accessExpiresAt)
    ) {
      return null;
    }
    return {
      uid,
      sid,
      accessToken,
      refreshToken,
      accessExpiresAt,
      browserOnly: browserOnly === true,
      origin: origin === 'sso' ? 'sso' : 'password',
    };
  } catch {
    return null;
  }
}

/**
 * Read the `sid` and `sub` claims from a CAS access token WITHOUT verifying it.
 *
 * Safe here, and only here, because the token was just received over TLS
 * directly from CAS in response to our own request — it is not attacker-supplied
 * input. It is used purely to label our own session bookkeeping. Nothing is
 * authorized on the basis of these values; CAS re-verifies the token on every
 * call it is presented to.
 */
export function readTokenClaims(accessToken: string): { sub: string; sid: string } | null {
  const parts = accessToken.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = new TextDecoder().decode(base64url.decode(parts[1]));
    const claims = JSON.parse(json) as { sub?: string; sid?: string };
    if (!claims.sub) return null;
    return { sub: claims.sub, sid: claims.sid ?? '' };
  } catch {
    return null;
  }
}

/**
 * `tokens.expires_at` is an RFC3339 STRING, not epoch seconds.
 *
 * Copying it into a number field yields NaN, every skew comparison against NaN
 * is false, and the app then refreshes on literally every request — which,
 * given refresh sits inside CAS's per-IP throttle, is an outage rather than an
 * inefficiency.
 */
export function expiryFromSeconds(expiresIn: number, now = Date.now()): number {
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error(`CAS returned an unusable expires_in: ${JSON.stringify(expiresIn)}.`);
  }
  return now + expiresIn * 1000;
}

export function parseExpiry(expiresAt: string): number {
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) {
    throw new Error(
      `CAS returned an unparseable expires_at: ${JSON.stringify(expiresAt)}. ` +
        'It is expected to be an RFC3339 string.',
    );
  }
  return ms;
}
