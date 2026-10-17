'use server';

import { parseExpiry } from '@/server/session/cookie';
import { casClient } from '@/server/cas/client';
import { CAS_ERROR_CODES } from '@/constants/cas';
import { ALTERNATE_METHOD, alternativesOf, RECOVERY_METHOD } from '@/lib/auth/totp';
import { trustedClientIp } from '@/server/request-ip';
import { resealAccessToken, withCasSession, type CasActionResult } from '@/server/account/cas-session';
import type { StepUpChallenge, StepUpResult } from '@/types/cas';

export interface StepUpChallengeView {
  id: string;
  method: string;
  destination: string;
  expiresAt: string;
  nextResendAt?: string;
  alternatives: string[];
}

export type StepUpOutcome =
  | { status: 'challenge'; challenge: StepUpChallengeView }
  | { status: 'verified' }
  | { status: 'enroll_required' }
  | { status: 'invalid_code' }
  | { status: 'too_many_attempts' }
  | { status: 'signed_out' }
  | { status: 'failed'; message: string };

const MAX_ID_LENGTH = 128;
const MAX_CODE_LENGTH = 32;

function asBoundedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function viewOf(challenge: StepUpChallenge): StepUpChallengeView {
  return {
    id: challenge.challenge_id,
    method: challenge.method,
    destination: challenge.destination,
    expiresAt: challenge.expires_at,
    nextResendAt: challenge.next_resend_at,
    alternatives: alternativesOf(challenge.alternatives),
  };
}

function expiryOf(result: StepUpResult): number {
  return typeof result.expires_at === 'number' ? result.expires_at * 1000 : parseExpiry(result.expires_at);
}

function outcomeOf(result: CasActionResult<StepUpOutcome>): StepUpOutcome {
  switch (result.status) {
    case 'ok':
      return result.value;
    case 'signed_out':
      return { status: 'signed_out' };
    case 'step_up_required':
      return { status: 'failed', message: 'Verification could not start. Try again.' };
    case 'refused':
      switch (result.code) {
        case CAS_ERROR_CODES.enrollRequired:
          return { status: 'enroll_required' };
        case CAS_ERROR_CODES.invalidCode:
          return { status: 'invalid_code' };
        case CAS_ERROR_CODES.tooManyAttempts:
          return { status: 'too_many_attempts' };
        default:
          return { status: 'failed', message: result.message };
      }
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

export async function startStepUp(method?: unknown): Promise<StepUpOutcome> {
  const chosen = typeof method === 'string' && ALTERNATE_METHOD.test(method) && method !== RECOVERY_METHOD ? method : undefined;
  const clientIp = await trustedClientIp();
  return outcomeOf(
    await withCasSession(async (session) => ({
      status: 'challenge' as const,
      challenge: viewOf(await casClient.startStepUp(session.accessToken, clientIp, chosen)),
    })),
  );
}

export async function resendStepUp(challengeId: unknown): Promise<StepUpOutcome> {
  const id = asBoundedString(challengeId, MAX_ID_LENGTH);
  if (!id) return { status: 'failed', message: 'This verification is no longer valid. Start again.' };
  const clientIp = await trustedClientIp();
  return outcomeOf(
    await withCasSession(async () => {
      const issued = await casClient.resendOtp(id, clientIp);
      return {
        status: 'challenge' as const,
        challenge: {
          id: issued.challenge_id,
          method: issued.channel,
          destination: issued.destination,
          expiresAt: issued.expires_at,
          nextResendAt: issued.next_resend_at,
          alternatives: alternativesOf(issued.alternatives),
        },
      };
    }),
  );
}

export async function verifyStepUp(challengeId: unknown, code: unknown): Promise<StepUpOutcome> {
  const id = asBoundedString(challengeId, MAX_ID_LENGTH);
  const value = asBoundedString(code, MAX_CODE_LENGTH);
  if (!id) return { status: 'failed', message: 'This verification is no longer valid. Start again.' };
  if (!value) return { status: 'invalid_code' };
  const clientIp = await trustedClientIp();
  return outcomeOf(
    await withCasSession(async (session) => {
      const result = await casClient.verifyStepUp(session.accessToken, id, value, clientIp);
      await resealAccessToken(session, result.access_token, expiryOf(result));
      return { status: 'verified' as const };
    }),
  );
}
