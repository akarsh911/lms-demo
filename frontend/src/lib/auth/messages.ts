import type { SignInError, SignInErrorKind } from '@/server/actions/auth';

const TEXT: Record<SignInErrorKind, string> = {
  missing_identifier: 'Enter your school ID or email address.',
  missing_password: 'Enter your password.',
  missing_code: 'Enter the code you were sent.',
  totp_code_format: 'Enter the 6-digit code from your authenticator app, or a recovery code such as abcd-1234.',
  missing_new_password: 'Choose a new password.',
  password_mismatch: 'The two new passwords do not match.',
  password_policy: 'That password does not meet your school’s policy.',
  invalid_credentials: 'That ID and password do not match an account.',
  account_locked: 'This account is locked for now, after too many failed attempts.',
  account_blocked: 'This account is blocked. Ask your school administrator.',
  user_inactive: 'This account is not active. Ask your school administrator.',
  no_otp_destination: 'This account has nowhere to send a code. Ask your school administrator.',
  throttled: 'Too many attempts from this network. Try again in a few minutes.',
  unavailable: 'Sign-in is temporarily unavailable. Try again shortly.',
  pending_expired: 'That took too long. Sign in again to continue.',
  otp_wrong_code: 'That code is not correct.',
  otp_expired: 'That code has expired. Send yourself a new one.',
  otp_consumed: 'That code has already been used. Send yourself a new one.',
  otp_too_many_attempts: 'Too many incorrect codes. Send a new one to try again.',
  otp_resend_too_soon: 'A new code cannot be sent yet. Wait for the timer.',
  otp_resend_limit: 'No more codes can be sent for this sign-in. Start again.',
  otp_daily_limit: 'The daily limit for sign-in codes has been reached.',
  otp_not_found: 'This code is no longer valid. Start again.',
  otp_no_destination: 'There is nowhere to send a code for this account.',
  method_unavailable: 'That way of signing in is not available for this account right now.',
  method_not_allowed: 'This sign-in method isn’t allowed for your organisation.',
  unexpected: 'Something went wrong. Try again.',
};

export function signInErrorText(error: SignInError): string {
  if (error.kind === 'password_policy' && error.detail) return sentence(error.detail);
  if (error.kind === 'unexpected' && error.detail) return sentence(error.detail);
  return TEXT[error.kind];
}

export function fieldForError(kind: SignInErrorKind): 'identifier' | 'password' | 'code' | null {
  switch (kind) {
    case 'missing_identifier':
    case 'invalid_credentials':
      return 'identifier';
    case 'missing_password':
      return 'password';
    case 'missing_code':
    case 'totp_code_format':
    case 'otp_wrong_code':
      return 'code';
    default:
      return null;
  }
}

export function channelLabel(channel: string): string {
  switch (channel) {
    case 'email':
      return 'email';
    case 'sms':
      return 'phone';
    case 'totp':
      return 'authenticator app';
    default:
      return channel;
  }
}

function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return TEXT.unexpected;
  const capitalised = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}
