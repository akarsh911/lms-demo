'use server';

import QRCode from 'qrcode';

import { isTotpCode } from '@/lib/auth/totp';
import { casClient } from '@/server/cas/client';
import { withCasSession, type CasActionResult } from '@/server/account/cas-session';

export interface TotpEnrollmentView {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
}

const PROVIDER = /^[a-z][a-z0-9_-]{0,31}$/;

export async function enrollTotp(): Promise<CasActionResult<TotpEnrollmentView>> {
  return withCasSession(async (session) => {
    const enrollment = await casClient.enrollTotp(session.accessToken);
    return {
      secret: enrollment.secret,
      otpauthUri: enrollment.otpauth_uri,
      qrDataUrl: await QRCode.toDataURL(enrollment.otpauth_uri, { margin: 1, width: 240, errorCorrectionLevel: 'M' }),
    };
  });
}

export async function confirmTotp(code: unknown): Promise<CasActionResult<string[]>> {
  const value = typeof code === 'string' ? code.trim() : '';
  if (!isTotpCode(value)) {
    return { status: 'refused', code: 'invalid_code', message: 'Enter the 6-digit code your authenticator app shows.' };
  }
  return withCasSession(async (session) => (await casClient.confirmTotp(session.accessToken, value)).recovery_codes);
}

export async function disableTotp(): Promise<CasActionResult<null>> {
  return withCasSession(async (session) => {
    await casClient.disableTotp(session.accessToken);
    return null;
  });
}

export async function regenerateRecoveryCodes(): Promise<CasActionResult<string[]>> {
  return withCasSession(async (session) => (await casClient.regenerateRecoveryCodes(session.accessToken)).recovery_codes);
}

export async function unlinkIdentity(provider: unknown): Promise<CasActionResult<null>> {
  if (typeof provider !== 'string' || !PROVIDER.test(provider)) {
    return { status: 'refused', code: 'invalid_input', message: 'Unknown sign-in provider.' };
  }
  return withCasSession(async (session) => {
    await casClient.unlinkIdentity(session.accessToken, provider);
    return null;
  });
}
