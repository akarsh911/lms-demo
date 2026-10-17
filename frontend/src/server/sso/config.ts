import 'server-only';

import { config } from '@/config';
import { CAS_PATHS } from '@/constants/cas';
import { paths } from '@/paths';
import { isDevBypass } from '@/server/dev/bypass';

export function isSsoEnabled(): boolean {
  if (isDevBypass()) return false;
  const raw = process.env.CAS_SSO_ENABLED?.trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

export type SsoMode = 'popup' | 'redirect';

export function ssoMode(): SsoMode {
  return process.env.CAS_SSO_MODE?.trim().toLowerCase() === 'popup' ? 'popup' : 'redirect';
}

export function ssoClientId(): string {
  const id = process.env.CAS_CLIENT_ID?.trim();
  if (!id) throw new Error('CAS_CLIENT_ID is not set. It is required when CAS_SSO_ENABLED is on.');
  return id;
}

export function configuredClientId(): string | undefined {
  return process.env.CAS_CLIENT_ID?.trim() || undefined;
}

export function ssoProviderButtons(): string[] {
  const raw = process.env.CAS_SSO_PROVIDERS;
  if (raw === undefined) return ['google'];
  return raw
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
}

export function appUrl(): string {
  return (process.env.APP_URL?.trim() || config.site.url).replace(/\/+$/, '');
}

export function ssoRedirectUri(): string {
  return `${appUrl()}${paths.auth.ssoCallback}`;
}

export function authorizeUrl(state: string, codeChallenge: string, popup = false, provider: string | null = null): URL {
  const url = new URL(CAS_PATHS.oauthAuthorize, `${config.casUrl}/`);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: ssoClientId(),
    redirect_uri: ssoRedirectUri(),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    ...(popup ? { display: 'popup' } : {}),
    ...(provider ? { provider } : {}),
  }).toString();
  return url;
}

export function googleLinkUrl(returnPath: string): string {
  const url = new URL(CAS_PATHS.identityGoogleLink, `${config.casUrl}/`);
  url.search = new URLSearchParams({ return_to: `${appUrl()}${returnPath}` }).toString();
  return url.toString();
}

export function casLogoutUrl(): URL | null {
  if (!isSsoEnabled()) return null;
  const clientId = configuredClientId();
  if (!clientId) return null;
  const url = new URL(CAS_PATHS.ssoLogout, `${config.casUrl}/`);
  url.search = new URLSearchParams({
    client_id: clientId,
    post_logout_redirect_uri: `${appUrl()}/`,
  }).toString();
  return url;
}
