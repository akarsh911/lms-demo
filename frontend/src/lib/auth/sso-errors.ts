export const SSO_ERROR_KINDS = ['access_denied', 'not_linked', 'signed_out', 'sign_in_required', 'state_mismatch', 'exchange_failed', 'unavailable'] as const;

export type SsoErrorKind = (typeof SSO_ERROR_KINDS)[number];

export const SSO_ERROR_PARAM = 'sso_error';

const GENERIC_FAILURE = 'Sign-in didn’t finish. Try again.';

export function ssoErrorKindOf(raw: string | string[] | null | undefined): SsoErrorKind | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return SSO_ERROR_KINDS.find((kind) => kind === value) ?? null;
}

export function ssoErrorText(kind: SsoErrorKind, appName: string): string {
  switch (kind) {
    case 'access_denied':
      return `Your Emerge account doesn’t have access to ${appName}.`;
    case 'not_linked':
      return 'This Google account isn’t linked to an Emerge account. Sign in with your email and password, then link Google from Account security.';
    case 'signed_out':
      return 'You were signed out. Sign in again to continue.';
    default:
      return GENERIC_FAILURE;
  }
}

export function signInPathWithError(signInPath: string, kind: SsoErrorKind): string {
  return `${signInPath}?${SSO_ERROR_PARAM}=${kind}`;
}
