import 'server-only';

import { cookies } from 'next/headers';

import { config } from '@/config';
import { DEMO_SESSION_COOKIE, demoAccountOf } from '@/constants/demo-accounts';
import type { SessionPayload } from '@/server/session/cookie';

// The one switch, honoured in every build: `DEV_BYPASS=1` serves fixtures, anything else calls the real services.
// `PUBLIC_DEMO=1` is the labs demo: the same bypass, a public label, and live textbook retrieval. CLAUDE.md section 2.
export function isPublicDemo(): boolean {
  return process.env.PUBLIC_DEMO === '1';
}

export function isDevBypass(): boolean {
  return process.env.DEV_BYPASS === '1' || isPublicDemo();
}

// Far enough ahead that `needsRefresh` is never true for the fixture session.
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

const UID_PREFIX = 'dev-bypass:';

// Who is signed in under the bypass: the demo account's user, or null when nobody is. The public demo needs no sign-in.
export async function devUserId(): Promise<string | null> {
  if (isPublicDemo()) return config.devUser;
  const jar = await cookies();
  return demoAccountOf(jar.get(DEMO_SESSION_COOKIE)?.value)?.user ?? null;
}

export function devUserOf(uid: string): string {
  return uid.startsWith(UID_PREFIX) ? uid.slice(UID_PREFIX.length) : config.devUser;
}

// Placeholder tokens, never sent anywhere: the service proxy withholds the bearer while bypassing.
export function devSession(user: string): SessionPayload {
  const uid = `${UID_PREFIX}${user}`;
  return {
    uid,
    sid: uid,
    accessToken: 'dev-bypass',
    refreshToken: 'dev-bypass',
    accessExpiresAt: Date.now() + TEN_YEARS_MS,
  };
}

// Shown in the top bar so nobody mistakes a bypassed screen for a real one.
export function devBypassLabel(uid: string): string {
  return isPublicDemo() ? 'Demo · sample data' : `Demo · ${demoAccountOf(devUserOf(uid))?.label ?? devUserOf(uid)}`;
}

// The tenant a forwarded (unmocked) service is scoped by while bypassing.
export function devSchoolId(): string {
  return process.env.DEV_SCHOOL_ID?.trim() || 'S_42';
}
