import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { safeNextPath } from '@/lib/auth/next-path';
import { sealValue, unsealValue } from '@/server/session/cookie';

export const SSO_FLOW_COOKIE = 'emerge_sso_flow';
export const SSO_FLOW_MAX_AGE_SECONDS = 10 * 60;
export const SSO_FLOW_COOKIE_PATH = '/auth';

export interface SsoFlow {
  state: string;
  verifier: string;
  popup: boolean;
  next: string;
}

function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function newFlow(popup = false, next = '/'): SsoFlow {
  return { state: randomToken(), verifier: randomToken(), popup, next };
}

export function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function sealFlow(flow: SsoFlow): Promise<string> {
  return sealValue({ ...flow }, SSO_FLOW_MAX_AGE_SECONDS);
}

export async function unsealFlow(token: string | undefined): Promise<SsoFlow | null> {
  const payload = await unsealValue(token);
  if (!payload) return null;
  const { state, verifier, popup, next } = payload;
  if (typeof state !== 'string' || typeof verifier !== 'string' || !state || !verifier) return null;
  return { state, verifier, popup: popup === true, next: safeNextPath(typeof next === 'string' ? next : null, '/') };
}
