import 'server-only';

import { CAS_PATHS } from '@/constants/cas';
import { config } from '@/config';
import { logger } from '@/lib/logger';
import { recordExchange } from '@/server/dev/record';
import type {
  EvaluateResponse,
  LinkedIdentity,
  LoginResult,
  MfaStatus,
  OAuthTokenResponse,
  OtpChallenge,
  RecoveryCodes,
  ResolvedIdentity,
  SessionStatus,
  SsoTicket,
  StepUpChallenge,
  StepUpResult,
  TokenPair,
  TotpEnrollment,
} from '@/types/cas';

import { CasError, classify, readErrorBody, readOAuthErrorBody } from './errors';

/**
 * The CAS client. Server-to-server only.
 *
 * The browser never calls CAS directly — which is why no `:3005` CORS entry is
 * needed for this app, and why the access token never exists in client JS.
 */

interface CallOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  accessToken?: string;
  /**
   * The real client IP, forwarded so CAS attributes throttling and audit rows
   * to the user rather than to this server.
   *
   * MUST be a value this server derived, never one a client sent.
   *
   * CAS honours X-Forwarded-For only from an address in `CAS_TRUSTED_PROXIES`,
   * so that a client cannot rotate the header to dodge the throttle or forge
   * audit IPs. The moment this app is added to that list — which is already
   * scheduled, because the per-IP throttle collapse is a deploy blocker — CAS
   * starts trusting whatever we put here. Passing a client-supplied header
   * through at that point would hand every caller the ability to choose the IP
   * they are throttled and audited as, converting the fix for one problem into
   * a bypass for another.
   *
   * See `trustedClientIp()` in `server/request-ip.ts` for how this is derived.
   */
  clientIp?: string;
}

async function call<T>(path: string, options: CallOptions = {}): Promise<T> {
  const { method = 'GET', body, accessToken, clientIp } = options;

  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (clientIp) headers['x-forwarded-for'] = clientIp;

  let res: Response;
  try {
    res = await fetch(new URL(path, `${config.casUrl}/`), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch (cause) {
    logger.error('CAS unreachable', { path, cause });
    throw new CasError({
      kind: 'unavailable',
      code: 'cas_unreachable',
      message: 'Could not reach the authorization service.',
    });
  }

  // Auth responses carry tokens, so only the read endpoints are captured.
  if (!carriesSecrets(path)) void recordExchange('cas', method, path, '', res.clone());

  if (!res.ok) {
    throw new CasError(classify(res.status, await readErrorBody(res)));
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function carriesSecrets(path: string): boolean {
  return path.startsWith('v1/auth/') || path.startsWith(CAS_PATHS.mfa);
}

async function tokenCall(form: Record<string, string>): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams(form);
  const secret = process.env.CAS_CLIENT_SECRET;
  if (secret) body.set('client_secret', secret);

  let res: Response;
  try {
    res = await fetch(new URL(CAS_PATHS.oauthToken, `${config.casUrl}/`), {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    });
  } catch (cause) {
    logger.error('CAS unreachable', { path: CAS_PATHS.oauthToken, cause });
    throw new CasError({ kind: 'unavailable', code: 'cas_unreachable', message: 'Could not reach the authorization service.' });
  }

  if (!res.ok) throw new CasError(classify(res.status, await readOAuthErrorBody(res)));
  return (await res.json()) as OAuthTokenResponse;
}

export const casClient = {
  login(identifier: string, password: string, clientIp?: string, clientId?: string): Promise<LoginResult> {
    return call<LoginResult>(CAS_PATHS.login, {
      method: 'POST',
      body: clientId ? { identifier, password, client_id: clientId } : { identifier, password },
      clientIp,
    });
  },

  startOtp(identifier: string, clientIp?: string, clientId?: string): Promise<OtpChallenge> {
    // Always answers 200, even for an unknown or non-passwordless account —
    // a decoy, so the response cannot be used to enumerate accounts. The UI
    // must therefore not treat success as proof the account exists.
    return call<OtpChallenge>(CAS_PATHS.otpStart, {
      method: 'POST',
      body: clientId ? { identifier, client_id: clientId } : { identifier },
      clientIp,
    });
  },

  verifyOtp(challengeId: string, code: string, clientIp?: string): Promise<LoginResult> {
    return call<LoginResult>(CAS_PATHS.loginVerify, {
      method: 'POST',
      body: { challenge_id: challengeId, code },
      clientIp,
    });
  },

  alternateLogin(challengeId: string, method: string, clientIp?: string): Promise<OtpChallenge> {
    return call<OtpChallenge>(CAS_PATHS.loginAlternate, {
      method: 'POST',
      body: { challenge_id: challengeId, method },
      clientIp,
    });
  },

  resendOtp(challengeId: string, clientIp?: string): Promise<OtpChallenge> {
    return call<OtpChallenge>(CAS_PATHS.otpResend, {
      method: 'POST',
      body: { challenge_id: challengeId },
      clientIp,
    });
  },

  changePassword(
    accessToken: string,
    oldPassword: string,
    newPassword: string,
    clientIp?: string,
  ): Promise<LoginResult> {
    return call<LoginResult>(CAS_PATHS.passwordChange, {
      method: 'POST',
      body: { old_password: oldPassword, new_password: newPassword },
      accessToken,
      clientIp,
    });
  },

  /** Returns a BARE token pair — not wrapped in `tokens`. Rotates the refresh token. */
  refresh(refreshToken: string, clientIp?: string): Promise<TokenPair> {
    return call<TokenPair>(CAS_PATHS.refresh, {
      method: 'POST',
      body: { refresh_token: refreshToken },
      clientIp,
    });
  },

  ssoTicket(accessToken: string, clientId: string, returnTo: string): Promise<SsoTicket> {
    return call<SsoTicket>(CAS_PATHS.ssoTicket, {
      method: 'POST',
      body: { client_id: clientId, return_to: returnTo },
      accessToken,
    });
  },

  sessionStatus(accessToken: string): Promise<SessionStatus> {
    return call<SessionStatus>(CAS_PATHS.session, { accessToken });
  },

  logout(refreshToken: string): Promise<void> {
    return call<void>(CAS_PATHS.logout, {
      method: 'POST',
      body: { refresh_token: refreshToken },
    });
  },

  me(accessToken: string): Promise<ResolvedIdentity> {
    return call<ResolvedIdentity>(CAS_PATHS.me, { accessToken });
  },

  /**
   * Evaluate feature keys.
   *
   * `context` names the groups the question is being asked about, MOST SPECIFIC
   * FIRST: CAS scans the array in order and reports the first match as
   * `matched_scope`. CAS does not check that the caller belongs to a context
   * group, only that a grant's scope covers it, so every entry must be
   * server-resolved and none of it may originate from a browser. See
   * `server/entitlement/context.ts` for where it is sourced and
   * `resolveEntitlements` for why an unresolved context is sent empty rather
   * than widened to the tenant.
   */
  evaluate(
    accessToken: string,
    features: readonly string[],
    context: readonly string[] = [],
  ): Promise<EvaluateResponse> {
    return call<EvaluateResponse>(CAS_PATHS.evaluateFeatures, {
      method: 'POST',
      body: { features, context },
      accessToken,
    });
  },

  exchangeCode(code: string, redirectUri: string, clientId: string, codeVerifier: string): Promise<OAuthTokenResponse> {
    return tokenCall({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    });
  },

  refreshOAuth(refreshToken: string, clientId: string): Promise<OAuthTokenResponse> {
    return tokenCall({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId });
  },

  startStepUp(accessToken: string, clientIp?: string, method?: string): Promise<StepUpChallenge> {
    return call<StepUpChallenge>(CAS_PATHS.stepUpStart, { method: 'POST', body: method ? { method } : {}, accessToken, clientIp });
  },

  verifyStepUp(accessToken: string, challengeId: string, code: string, clientIp?: string): Promise<StepUpResult> {
    return call<StepUpResult>(CAS_PATHS.stepUpVerify, {
      method: 'POST',
      body: { challenge_id: challengeId, code },
      accessToken,
      clientIp,
    });
  },

  mfaStatus(accessToken: string): Promise<MfaStatus> {
    return call<MfaStatus>(CAS_PATHS.mfa, { accessToken });
  },

  enrollTotp(accessToken: string): Promise<TotpEnrollment> {
    return call<TotpEnrollment>(CAS_PATHS.mfaTotp, { method: 'POST', body: {}, accessToken });
  },

  confirmTotp(accessToken: string, code: string): Promise<RecoveryCodes> {
    return call<RecoveryCodes>(CAS_PATHS.mfaTotpConfirm, { method: 'POST', body: { code }, accessToken });
  },

  disableTotp(accessToken: string): Promise<void> {
    return call<void>(CAS_PATHS.mfaTotp, { method: 'DELETE', accessToken });
  },

  regenerateRecoveryCodes(accessToken: string): Promise<RecoveryCodes> {
    return call<RecoveryCodes>(CAS_PATHS.mfaRecoveryCodes, { method: 'POST', body: {}, accessToken });
  },

  enableEmailMfa(accessToken: string): Promise<OtpChallenge> {
    return call<OtpChallenge>(CAS_PATHS.mfaEmailEnable, { method: 'POST', body: {}, accessToken });
  },

  confirmEmailMfa(accessToken: string, challengeId: string, code: string): Promise<MfaStatus> {
    return call<MfaStatus>(CAS_PATHS.mfaEmailConfirm, { method: 'POST', body: { challenge_id: challengeId, code }, accessToken });
  },

  setPreferredMfa(accessToken: string, method: string): Promise<MfaStatus> {
    return call<MfaStatus>(CAS_PATHS.mfaPreferred, { method: 'PUT', body: { method }, accessToken });
  },

  disableMfaOptIn(accessToken: string): Promise<void> {
    return call<void>(CAS_PATHS.mfaOptIn, { method: 'DELETE', accessToken });
  },

  snoozeMfaPrompt(accessToken: string): Promise<MfaStatus> {
    return call<MfaStatus>(CAS_PATHS.mfaPromptSnooze, { method: 'POST', body: {}, accessToken });
  },

  identities(accessToken: string): Promise<LinkedIdentity[]> {
    return call<LinkedIdentity[]>(CAS_PATHS.identities, { accessToken });
  },

  unlinkIdentity(accessToken: string, provider: string): Promise<void> {
    return call<void>(`${CAS_PATHS.identities}/${encodeURIComponent(provider)}`, { method: 'DELETE', accessToken });
  },
};
