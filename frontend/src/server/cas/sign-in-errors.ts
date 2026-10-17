import 'server-only';

import { CAS_ERROR_CODES } from '@/constants/cas';
import { otpFailureFrom, type OtpFailure } from '@/lib/auth/otp-failure';
import { alternativesOf } from '@/lib/auth/totp';
import { logger } from '@/lib/logger';
import type { SignInChallenge, SignInError, SignInErrorKind } from '@/server/actions/auth';
import type { OtpChallenge } from '@/types/cas';

import { CasError, type CasFailure } from './errors';

export function toChallenge(otp: OtpChallenge): SignInChallenge {
  return {
    id: otp.challenge_id,
    channel: otp.channel,
    destination: otp.destination,
    expiresAt: otp.expires_at,
    nextResendAt: otp.next_resend_at,
    alternatives: alternativesOf(otp.alternatives),
    // CAS refuses to emit `dev_otp` under CAS_ENV=production, but this app must
    // not rely on another service's configuration to keep a login code out of a
    // browser. Gated on OUR build as well: a production Next build never
    // forwards it, whatever CAS chose to send.
    devCode: process.env.NODE_ENV === 'development' ? otp.dev_otp : undefined,
  };
}

export function isDeadKind(kind: SignInErrorKind): boolean {
  return (
    kind === 'otp_expired' ||
    kind === 'otp_consumed' ||
    kind === 'otp_not_found' ||
    kind === 'otp_too_many_attempts'
  );
}

const OTP_KINDS: Record<OtpFailure, SignInErrorKind> = {
  wrong_code: 'otp_wrong_code',
  expired: 'otp_expired',
  consumed: 'otp_consumed',
  too_many_attempts: 'otp_too_many_attempts',
  resend_too_soon: 'otp_resend_too_soon',
  resend_limit: 'otp_resend_limit',
  daily_limit: 'otp_daily_limit',
  not_found: 'otp_not_found',
  no_destination: 'otp_no_destination',
  unknown: 'unexpected',
};

export function errorFrom(cause: unknown, where: string): SignInError {
  const failure: CasFailure | null = cause instanceof CasError ? cause.failure : null;
  if (!failure) {
    logger.error('sign-in call failed', { where, cause });
    return { kind: 'unexpected', code: '' };
  }

  if (failure.kind === 'throttled') return { kind: 'throttled', code: failure.code };
  if (failure.kind === 'unavailable') return { kind: 'unavailable', code: failure.code };

  switch (failure.code) {
    case CAS_ERROR_CODES.invalidCredentials:
      return { kind: 'invalid_credentials', code: failure.code };
    case CAS_ERROR_CODES.accountLocked:
      return { kind: 'account_locked', code: failure.code };
    case CAS_ERROR_CODES.accountBlocked:
      return { kind: 'account_blocked', code: failure.code };
    case CAS_ERROR_CODES.userInactive:
      return { kind: 'user_inactive', code: failure.code };
    case CAS_ERROR_CODES.methodUnavailable:
      return { kind: 'method_unavailable', code: failure.code };
    case CAS_ERROR_CODES.methodNotAllowed:
      return { kind: 'method_not_allowed', code: failure.code };
    case CAS_ERROR_CODES.noOtpDestination:
      return { kind: 'no_otp_destination', code: failure.code };
    case CAS_ERROR_CODES.passwordPolicy:
      return { kind: 'password_policy', code: failure.code, detail: failure.message };
    case CAS_ERROR_CODES.missingFields:
      return { kind: 'missing_identifier', code: failure.code };
    case CAS_ERROR_CODES.invalidChallenge:
      return { kind: 'otp_not_found', code: failure.code };
    case CAS_ERROR_CODES.otpError:
      return { kind: OTP_KINDS[otpFailureFrom(failure.message)], code: failure.code };
    default:
      break;
  }

  if (failure.kind === 'sign_out' || failure.kind === 'refresh') {
    return { kind: 'pending_expired', code: failure.code };
  }

  logger.warn('unmapped CAS sign-in failure', { where, code: failure.code });
  return { kind: 'unexpected', code: failure.code, detail: failure.message };
}
