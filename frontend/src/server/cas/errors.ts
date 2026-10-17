import 'server-only';

import { CAS_ERROR_CODES, HTTP } from '@/constants/cas';
import type { CasErrorBody } from '@/types/cas';

/**
 * How a failed CAS call should be treated.
 *
 * This exists because the obvious approach — branch on the error code — does
 * not work. `invalid_token` is byte-identical for an expired token, a tampered
 * token, an `alg:none` forgery and a token signed by a foreign key. The client
 * cannot distinguish them and must not pretend to.
 */
export type CasFailure =
  /** Credentials are gone or unusable. Sign out. */
  | { kind: 'sign_out'; code: string; message: string }
  /** The access token may simply be stale. Refresh once, then retry. */
  | { kind: 'refresh'; code: string; message: string }
  /**
   * Throttled. Critically: do NOT sign out and do NOT rotate.
   * See `classify` for why this one is special.
   */
  | { kind: 'throttled'; code: string; message: string; retryAfter?: number }
  /** CAS is unreachable or broken. Degrade honestly; do not sign out. */
  | { kind: 'unavailable'; code: string; message: string }
  /** A real application error worth surfacing. */
  | { kind: 'error'; code: string; message: string };

export class CasError extends Error {
  readonly failure: CasFailure;
  constructor(failure: CasFailure) {
    super(failure.message);
    this.name = 'CasError';
    this.failure = failure;
  }
}

/**
 * Classify a CAS response into an action.
 *
 * The 429 branch is the subtle one and it is worth stating plainly.
 *
 * CAS throttles failed attempts per IP at 30 across the whole unauthenticated
 * surface, and `POST /v1/auth/refresh` is inside that throttle
 * (`CAS/internal/service/auth.go:213`). Behind a BFF every request shares one
 * source IP, so once the limit trips, EVERY user's refresh starts returning 429
 * and the entire tenant is signed out at the next 15-minute token boundary.
 *
 * What saves us is where the throttle sits: it returns BEFORE
 * `GetByRefreshHash`, so a throttled refresh never looks the token up and
 * therefore never spends it. The refresh token is still valid.
 *
 * That makes 429 the one and only refresh failure that must neither sign the
 * user out nor rotate the token — treating it like any other failure would
 * convert a temporary throttle into a mass logout, which is precisely the
 * outage this branch exists to prevent.
 *
 * The real fix is server-side (`CAS_TRUSTED_PROXIES` + X-Forwarded-For so CAS
 * throttles the true client IP). Until that lands this is a mitigation, not a
 * solution, and it is recorded as a deployment blocker.
 */
export function classify(status: number, body: CasErrorBody | null): CasFailure {
  const code = body?.code ?? '';
  const message = body?.message ?? `CAS request failed with status ${status}`;

  if (status === HTTP.tooManyRequests || code === CAS_ERROR_CODES.tooManyAttempts) {
    return { kind: 'throttled', code: code || CAS_ERROR_CODES.tooManyAttempts, message };
  }

  // The session itself is gone — revoked, expired, or destroyed by CAS's
  // refresh-replay theft detection. Refreshing cannot help, and attempting it
  // with a spent token is exactly what CAS treats as theft.
  if (code === CAS_ERROR_CODES.sessionInvalid) {
    return { kind: 'sign_out', code, message };
  }

  if (status === HTTP.unauthorized) {
    // Could be expiry, could be tampering — indistinguishable. Treat as stale
    // and let one refresh attempt settle it. A genuinely bad token fails the
    // refresh too and falls through to sign-out there.
    return { kind: 'refresh', code: code || CAS_ERROR_CODES.invalidToken, message };
  }

  if (status === HTTP.forbidden) {
    // `user_inactive` and `password_change_required` are 403 here, not 401.
    if (
      code === CAS_ERROR_CODES.userInactive ||
      code === CAS_ERROR_CODES.passwordChangeRequired
    ) {
      return { kind: 'sign_out', code, message };
    }
    return { kind: 'error', code, message };
  }

  if (status >= 500) {
    return { kind: 'unavailable', code: code || 'cas_unavailable', message };
  }

  return { kind: 'error', code: code || 'cas_error', message };
}

/**
 * Parse a CAS error body defensively.
 *
 * Not every CAS error is the JSON envelope: 404 comes back as plain text and
 * 405 has an empty body. Assuming JSON throws a parse error that masks the real
 * status, so failures here are swallowed on purpose.
 */
export async function readErrorBody(res: Response): Promise<CasErrorBody | null> {
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  try {
    return (await res.json()) as CasErrorBody;
  } catch {
    return null;
  }
}

export async function readOAuthErrorBody(res: Response): Promise<CasErrorBody | null> {
  const body = await readErrorBody(res);
  if (!body) return null;
  const raw = body as CasErrorBody & { error?: unknown; error_description?: unknown };
  return {
    code: raw.code ?? (typeof raw.error === 'string' ? raw.error : undefined),
    message: raw.message ?? (typeof raw.error_description === 'string' ? raw.error_description : undefined),
  };
}
