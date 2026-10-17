'use server';

import { toTwoFactorView } from '@/lib/auth/two-factor';
import { casClient } from '@/server/cas/client';
import { withCasSession, type CasActionResult } from '@/server/account/cas-session';
import type { EmailChallengeView, TwoFactorView } from '@/types/account';

const MAX_ID_LENGTH = 128;
const MAX_CODE_LENGTH = 32;
const METHOD = /^[a-z][a-z0-9_-]{0,31}$/;

function bounded(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

const INVALID_CODE = { status: 'refused', code: 'invalid_code', message: 'Enter the code from the email.' } as const;

export async function loadTwoFactorPrompt(): Promise<CasActionResult<TwoFactorView | null>> {
  return withCasSession(async (session) => {
    const view = toTwoFactorView(await casClient.mfaStatus(session.accessToken));
    return view?.prompt?.show ? view : null;
  });
}

export async function startEmailTwoFactor(): Promise<CasActionResult<EmailChallengeView>> {
  return withCasSession(async (session) => {
    const challenge = await casClient.enableEmailMfa(session.accessToken);
    return { id: challenge.challenge_id, destination: challenge.destination, expiresAt: challenge.expires_at };
  });
}

export async function confirmEmailTwoFactor(challengeId: unknown, code: unknown): Promise<CasActionResult<TwoFactorView | null>> {
  const id = bounded(challengeId, MAX_ID_LENGTH);
  const value = bounded(code, MAX_CODE_LENGTH);
  if (!id || !value) return INVALID_CODE;
  return withCasSession(async (session) => toTwoFactorView(await casClient.confirmEmailMfa(session.accessToken, id, value)));
}

export async function setPreferredTwoFactor(method: unknown): Promise<CasActionResult<TwoFactorView | null>> {
  if (typeof method !== 'string' || !METHOD.test(method)) {
    return { status: 'refused', code: 'invalid_input', message: 'Unknown verification method.' };
  }
  return withCasSession(async (session) => toTwoFactorView(await casClient.setPreferredMfa(session.accessToken, method)));
}

export async function turnOffTwoFactor(): Promise<CasActionResult<null>> {
  return withCasSession(async (session) => {
    await casClient.disableMfaOptIn(session.accessToken);
    return null;
  });
}

export async function snoozeTwoFactorPrompt(): Promise<CasActionResult<null>> {
  return withCasSession(async (session) => {
    await casClient.snoozeMfaPrompt(session.accessToken);
    return null;
  });
}
