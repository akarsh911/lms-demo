'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  COOKIE_OPTIONS,
  PENDING_SESSION_COOKIE,
  PENDING_SESSION_MAX_AGE_SECONDS,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from '@/constants/session';
import { isTotpOrRecoveryCode, RECOVERY_METHOD, TOTP_CHANNEL } from '@/lib/auth/totp';
import { logger } from '@/lib/logger';
import { paths } from '@/paths';
import { DEMO_ACCOUNTS, DEMO_SESSION_COOKIE } from '@/constants/demo-accounts';
import { casClient } from '@/server/cas/client';
import { isDevBypass } from '@/server/dev/bypass';
import { errorFrom, isDeadKind, toChallenge } from '@/server/cas/sign-in-errors';
import { parseExpiry, readTokenClaims, seal, unseal } from '@/server/session/cookie';
import { forgetTenant } from '@/server/core/tenant';
import { dropSession } from '@/server/session/store';
import { casLogoutUrl, configuredClientId } from '@/server/sso/config';
import { ssoAdoptUrl } from '@/server/sso/handoff';
import { NEXT_PARAM, safeNextPath } from '@/lib/auth/next-path';
import { trustedClientIp } from '@/server/request-ip';
import type { LoginResult, TokenPair } from '@/types/cas';

/**
 * Auth write surface.
 *
 * Server Actions rather than route handlers: they are POST-only, carry Next's
 * built-in Origin check, and can set cookies — which is what lets the session
 * be established without the token ever touching client JavaScript.
 */

export type SignInStep = 'credentials' | 'challenge' | 'password_change' | 'handoff' | 'done';

export type SignInErrorKind =
  | 'missing_identifier'
  | 'missing_password'
  | 'missing_code'
  | 'totp_code_format'
  | 'missing_new_password'
  | 'password_mismatch'
  | 'password_policy'
  | 'invalid_credentials'
  | 'account_locked'
  | 'account_blocked'
  | 'user_inactive'
  | 'no_otp_destination'
  | 'throttled'
  | 'unavailable'
  | 'pending_expired'
  | 'otp_wrong_code'
  | 'otp_expired'
  | 'otp_consumed'
  | 'otp_too_many_attempts'
  | 'otp_resend_too_soon'
  | 'otp_resend_limit'
  | 'otp_daily_limit'
  | 'otp_not_found'
  | 'otp_no_destination'
  | 'method_not_allowed'
  | 'method_unavailable'
  | 'unexpected';

export interface SignInError {
  kind: SignInErrorKind;
  code: string;
  detail?: string;
}

export interface SignInChallenge {
  id: string;
  channel: string;
  destination: string;
  expiresAt: string;
  nextResendAt?: string;
  alternatives: string[];
  /** Present only in development, mirroring CAS's `dev_otp`. */
  devCode?: string;
}

export interface SignInState {
  step: SignInStep;
  identifier?: string;
  challenge?: SignInChallenge;
  challengeDead?: boolean;
  mustChangePassword?: boolean;
  // Remember me: a session cookie that outlives the browser, or one that ends with it.
  remember?: boolean;
  notice?: 'code_sent';
  error?: SignInError;
  handoffToken?: string;
  adoptUrl?: string;
}

type Intent = 'credentials' | 'email_code' | 'code' | 'resend' | 'alternate' | 'password' | 'restart';

const ALTERNATE_PREFIX = 'alternate:';

export async function signIn(prev: SignInState, formData: FormData): Promise<SignInState> {
  const destination = safeNextPath(String(formData.get(NEXT_PARAM) ?? ''), paths.root);
  if (isDevBypass()) {
    const demo = await demoSignIn(formData);
    if (demo.step !== 'done') return demo;
    redirect(destination);
  }
  const { handoffToken, ...next } = await runIntent(intentOf(formData, prev), prev, formData);
  if (next.step !== 'done') return next;
  const adoptUrl = handoffToken ? await ssoAdoptUrl(handoffToken, destination) : null;
  if (adoptUrl) return { step: 'handoff', adoptUrl };
  // Outside every try: `redirect` throws a control-flow signal that must not be
  // caught by the error handling in the steps above.
  redirect(destination);
}

async function runIntent(
  intent: Intent,
  prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  switch (intent) {
    case 'credentials':
      return withPassword(formData);
    case 'email_code':
      return withEmailedCode(formData);
    case 'code':
      return withCode(prev, formData);
    case 'resend':
      return resendCode(prev);
    case 'alternate':
      return switchMethod(prev, formData);
    case 'password':
      return withNewPassword(prev, formData);
    case 'restart':
      return restart(prev);
  }
}

function intentOf(formData: FormData, prev: SignInState): Intent {
  const raw = String(formData.get('intent') ?? '');
  if (raw.startsWith(ALTERNATE_PREFIX)) return 'alternate';
  switch (raw) {
    case 'email_code':
    case 'code':
    case 'resend':
    case 'password':
    case 'restart':
      return raw;
    default:
      break;
  }
  switch (prev.step) {
    case 'challenge':
      return 'code';
    case 'password_change':
      return 'password';
    default:
      return 'credentials';
  }
}

async function withPassword(formData: FormData): Promise<SignInState> {
  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!identifier) {
    return { step: 'credentials', error: { kind: 'missing_identifier', code: '' } };
  }
  if (!password) {
    return { step: 'credentials', identifier, error: { kind: 'missing_password', code: '' } };
  }

  try {
    const result = await casClient.login(identifier, password, await trustedClientIp(), configuredClientId());
    return await fromLoginResult(result, identifier, false, formData.get('remember') === 'on');
  } catch (cause) {
    return { step: 'credentials', identifier, error: errorFrom(cause, 'login') };
  }
}

async function withEmailedCode(formData: FormData): Promise<SignInState> {
  const identifier = String(formData.get('identifier') ?? '').trim();
  if (!identifier) {
    return { step: 'credentials', error: { kind: 'missing_identifier', code: '' } };
  }

  try {
    const challenge = await casClient.startOtp(identifier, await trustedClientIp(), configuredClientId());
    return { step: 'challenge', identifier, challenge: toChallenge(challenge), remember: formData.get('remember') === 'on' };
  } catch (cause) {
    return { step: 'credentials', identifier, error: errorFrom(cause, 'otp/start') };
  }
}

async function withCode(prev: SignInState, formData: FormData): Promise<SignInState> {
  const challenge = prev.challenge;
  if (!challenge) return { step: 'credentials', identifier: prev.identifier };

  const code = String(formData.get('code') ?? '').trim();
  if (!code) return { ...prev, notice: undefined, error: { kind: 'missing_code', code: '' } };
  if (challenge.channel === TOTP_CHANNEL && !isTotpOrRecoveryCode(code)) {
    return { ...prev, notice: undefined, error: { kind: 'totp_code_format', code: '' } };
  }

  try {
    const result = await casClient.verifyOtp(challenge.id, code, await trustedClientIp());
    return await fromLoginResult(result, prev.identifier, prev.mustChangePassword === true, prev.remember !== false);
  } catch (cause) {
    const error = errorFrom(cause, 'login/verify');
    return {
      ...prev,
      notice: undefined,
      error,
      challengeDead: isDeadKind(error.kind),
    };
  }
}

async function resendCode(prev: SignInState): Promise<SignInState> {
  const challenge = prev.challenge;
  if (!challenge) return { step: 'credentials', identifier: prev.identifier };
  if (challenge.channel === TOTP_CHANNEL) return { ...prev, notice: undefined };

  try {
    const issued = await casClient.resendOtp(challenge.id, await trustedClientIp());
    return {
      step: 'challenge',
      identifier: prev.identifier,
      challenge: toChallenge(issued),
      mustChangePassword: prev.mustChangePassword,
      remember: prev.remember,
      notice: 'code_sent',
    };
  } catch (cause) {
    const error = errorFrom(cause, 'otp/resend');
    return {
      ...prev,
      notice: undefined,
      error,
      challengeDead: prev.challengeDead === true || isDeadKind(error.kind),
    };
  }
}

async function switchMethod(prev: SignInState, formData: FormData): Promise<SignInState> {
  const challenge = prev.challenge;
  if (!challenge) return { step: 'credentials', identifier: prev.identifier };
  const method = String(formData.get('intent') ?? '').slice(ALTERNATE_PREFIX.length);
  if (method === RECOVERY_METHOD || !challenge.alternatives.includes(method)) return { ...prev, notice: undefined };

  try {
    const issued = await casClient.alternateLogin(challenge.id, method, await trustedClientIp());
    return {
      step: 'challenge',
      identifier: prev.identifier,
      challenge: toChallenge(issued),
      mustChangePassword: prev.mustChangePassword,
      remember: prev.remember,
    };
  } catch (cause) {
    const error = errorFrom(cause, 'login/alternate');
    return { ...prev, notice: undefined, error, challengeDead: prev.challengeDead === true || isDeadKind(error.kind) };
  }
}

async function withNewPassword(prev: SignInState, formData: FormData): Promise<SignInState> {
  const current = String(formData.get('currentPassword') ?? '');
  const next = String(formData.get('newPassword') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  if (!current) {
    return { ...prev, error: { kind: 'missing_password', code: '' } };
  }
  if (!next) {
    return { ...prev, error: { kind: 'missing_new_password', code: '' } };
  }
  if (next !== confirm) {
    return { ...prev, error: { kind: 'password_mismatch', code: '' } };
  }

  const jar = await cookies();
  const pending = await unseal(jar.get(PENDING_SESSION_COOKIE)?.value);
  if (!pending) {
    jar.delete(PENDING_SESSION_COOKIE);
    return {
      step: 'credentials',
      identifier: prev.identifier,
      error: { kind: 'pending_expired', code: '' },
    };
  }

  try {
    const result = await casClient.changePassword(
      pending.accessToken,
      current,
      next,
      await trustedClientIp(),
    );
    return await fromLoginResult(result, prev.identifier, false, prev.remember !== false);
  } catch (cause) {
    return { ...prev, error: errorFrom(cause, 'password/change') };
  }
}

async function restart(prev: SignInState): Promise<SignInState> {
  const jar = await cookies();
  jar.delete(PENDING_SESSION_COOKIE);
  return { step: 'credentials', identifier: prev.identifier };
}

async function fromLoginResult(
  result: LoginResult,
  identifier: string | undefined,
  carriedFlag = false,
  remember = true,
): Promise<SignInState> {
  const forced = result.must_change_password === true || carriedFlag;

  if (result.requires_2fa) {
    if (!result.otp) {
      logger.error('CAS asked for 2FA without a challenge');
      return { step: 'credentials', identifier, error: { kind: 'unexpected', code: '' } };
    }
    return {
      step: 'challenge',
      identifier,
      challenge: toChallenge(result.otp),
      mustChangePassword: forced,
      remember,
    };
  }

  const tokens = result.tokens;
  if (!tokens) {
    logger.error('CAS answered sign-in with neither a challenge nor tokens');
    return { step: 'credentials', identifier, error: { kind: 'unexpected', code: '' } };
  }

  if (forced) {
    const held = await hold(tokens, PENDING_SESSION_COOKIE, PENDING_SESSION_MAX_AGE_SECONDS);
    if (!held) {
      return { step: 'credentials', identifier, error: { kind: 'unexpected', code: '' } };
    }
    return { step: 'password_change', identifier, remember };
  }

  const held = await hold(tokens, SESSION_COOKIE, remember ? SESSION_MAX_AGE_SECONDS : undefined);
  if (!held) {
    return { step: 'credentials', identifier, error: { kind: 'unexpected', code: '' } };
  }

  const jar = await cookies();
  jar.delete(PENDING_SESSION_COOKIE);
  return { step: 'done', handoffToken: tokens.access_token };
}

async function hold(tokens: TokenPair, name: string, maxAge: number | undefined): Promise<boolean> {
  const claims = readTokenClaims(tokens.access_token);
  if (!claims) {
    logger.error('CAS access token carried no readable claims');
    return false;
  }

  const sealed = await seal({
    uid: claims.sub,
    sid: claims.sid,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessExpiresAt: parseExpiry(tokens.expires_at),
    browserOnly: maxAge === undefined,
    origin: 'password',
  });

  const jar = await cookies();
  jar.set(name, sealed, { ...COOKIE_OPTIONS, maxAge });
  return true;
}

// The dev bypass signs in only its demo accounts, each by its own password.
async function demoSignIn(formData: FormData): Promise<SignInState> {
  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (formData.get('intent') === 'email_code') return { step: 'credentials', identifier, error: { kind: 'unexpected', code: '', detail: 'Demo accounts sign in with their password' } };
  if (!identifier) return { step: 'credentials', error: { kind: 'missing_identifier', code: '' } };
  if (!password) return { step: 'credentials', identifier, error: { kind: 'missing_password', code: '' } };
  const account = DEMO_ACCOUNTS.find((a) => a.identifier === identifier.toLowerCase() && a.password === password);
  if (!account) return { step: 'credentials', identifier, error: { kind: 'invalid_credentials', code: '' } };
  const jar = await cookies();
  jar.set(DEMO_SESSION_COOKIE, account.user, { ...COOKIE_OPTIONS, httpOnly: false, maxAge: formData.get('remember') === 'on' ? SESSION_MAX_AGE_SECONDS : undefined });
  return { step: 'done' };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(DEMO_SESSION_COOKIE);
  const session = await unseal(jar.get(SESSION_COOKIE)?.value);

  if (session) {
    dropSession(session.sid);
    // The tenant this session was confirmed for goes with it. It is cached on
    // `sid`, and a `sid` is reusable in principle, so leaving it behind would
    // let a later session inherit a school it never confirmed.
    forgetTenant(session.sid);
    try {
      await casClient.logout(session.refreshToken);
    } catch (cause) {
      // The local session is being destroyed either way; a failure to tell CAS
      // must not leave the user stuck in a session they asked to end.
      logger.warn('CAS logout failed; clearing local session anyway', { cause });
    }
  }

  jar.delete(SESSION_COOKIE);
  jar.delete(PENDING_SESSION_COOKIE);
  const casLogout = isDevBypass() ? null : casLogoutUrl();
  redirect(casLogout ? casLogout.toString() : paths.auth.signIn);
}
