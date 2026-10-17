import 'server-only';

import { cookies } from 'next/headers';

import { CAS_ERROR_CODES } from '@/constants/cas';
import { COOKIE_OPTIONS, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/constants/session';
import { logger } from '@/lib/logger';
import { CasError } from '@/server/cas/errors';
import { isDevBypass } from '@/server/dev/bypass';
import { seal, unseal, type SessionPayload } from '@/server/session/cookie';
import type { CasActionResult } from '@/types/account';

export type { CasActionResult };

const DEMO_REFUSAL = { status: 'refused', code: 'demo', message: 'Account security needs the real sign-in service; the demo has none.' } as const;

export async function currentCasSession(): Promise<SessionPayload | null> {
  if (isDevBypass()) return null;
  const jar = await cookies();
  const session = await unseal(jar.get(SESSION_COOKIE)?.value);
  if (!session || session.accessExpiresAt <= Date.now()) return null;
  return session;
}

export async function withCasSession<T>(run: (session: SessionPayload) => Promise<T>): Promise<CasActionResult<T>> {
  if (isDevBypass()) return DEMO_REFUSAL;
  const session = await currentCasSession();
  if (!session) return { status: 'signed_out' };
  try {
    return { status: 'ok', value: await run(session) };
  } catch (cause) {
    return failureOf(cause);
  }
}

export function failureOf(cause: unknown): CasActionResult<never> {
  if (!(cause instanceof CasError)) {
    logger.error('CAS account call failed', { cause });
    return { status: 'refused', code: 'unexpected', message: 'Something went wrong. Try again.' };
  }
  const { failure } = cause;
  if (failure.code === CAS_ERROR_CODES.stepUpRequired) return { status: 'step_up_required' };
  if (failure.kind === 'sign_out' || failure.kind === 'refresh') return { status: 'signed_out' };
  return { status: 'refused', code: failure.code, message: failure.message };
}

export async function resealAccessToken(session: SessionPayload, accessToken: string, accessExpiresAt: number): Promise<void> {
  const next: SessionPayload = { ...session, accessToken, accessExpiresAt };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await seal(next), {
    ...COOKIE_OPTIONS,
    maxAge: session.browserOnly ? undefined : SESSION_MAX_AGE_SECONDS,
  });
}
