export const TOTP_CHANNEL = 'totp';

const TOTP_CODE = /^\d{6}$/;
const RECOVERY_CODE = /^[a-z0-9]{4}-[a-z0-9]{4}$/i;

export function isTotpCode(code: string): boolean {
  return TOTP_CODE.test(code);
}

export function isTotpOrRecoveryCode(code: string): boolean {
  return TOTP_CODE.test(code) || RECOVERY_CODE.test(code);
}

export const RECOVERY_METHOD = 'recovery';
export const RECOVERY_PROMPT = 'Enter one of the recovery codes you saved, such as abcd-1234.';
export const ALTERNATE_METHOD = /^[a-z][a-z0-9_-]{0,31}$/;

const ALTERNATIVE_LABELS: Record<string, string> = {
  email: 'Email me a code',
  sms: 'Text me a code',
  recovery: 'Use a recovery code',
};

export function alternativeLabel(method: string): string {
  return ALTERNATIVE_LABELS[method] ?? `Use ${method}`;
}

export function alternativesOf(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((method): method is string => typeof method === 'string' && ALTERNATE_METHOD.test(method)) : [];
}

export const TOTP_PROMPT = 'Enter the 6-digit code from your authenticator app.';

export function offeredAlternatives(channel: string, alternatives: readonly string[], recovery: boolean): string[] {
  const offered = channel === TOTP_CHANNEL && !alternatives.includes(RECOVERY_METHOD) ? [...alternatives, RECOVERY_METHOD] : [...alternatives];
  return recovery ? offered.filter((method) => method !== RECOVERY_METHOD) : offered;
}
