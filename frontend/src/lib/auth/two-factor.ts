import type { TwoFactorMethodView, TwoFactorView } from '@/types/account';
import type { MfaMethodStatus, MfaStatus } from '@/types/cas';

export const TOTP_METHOD = 'totp';
export const EMAIL_METHOD = 'email';
export const PROMPT_ADD_AUTHENTICATOR = 'add_authenticator';
export const DISALLOWED_BY_POLICY = 'disallowed_by_policy';
export const DISALLOWED_TEXT = 'Not allowed by your organisation.';

const INLINE_SETUP = new Set([TOTP_METHOD, EMAIL_METHOD]);
const SCHOOL_SOURCES = new Set(['tenant', 'user_policy']);

const METHOD_LABELS: Record<string, string> = {
  totp: 'Authenticator app',
  email: 'Email code',
  sms: 'Text message code',
};

const SOURCE_LABELS: Record<string, string> = {
  self: 'You turned this on.',
  user_policy: 'Required by your school.',
  tenant: 'Required by your school.',
  global: 'Required for every Emerge account.',
  authenticator: 'On because you set up an authenticator app.',
  group: 'Required for your role.',
  permission: 'Required for your role.',
  rule: 'Required for your role.',
};

function methodOf(raw: MfaMethodStatus): TwoFactorMethodView | null {
  if (!raw || typeof raw.method !== 'string' || !raw.method) return null;
  return {
    method: raw.method,
    available: raw.available === true,
    enrolled: raw.enrolled === true,
    destination: typeof raw.destination === 'string' && raw.destination ? raw.destination : null,
    reason: typeof raw.reason === 'string' ? raw.reason : null,
  };
}

export function toTwoFactorView(mfa: MfaStatus | null | undefined): TwoFactorView | null {
  if (!mfa || !Array.isArray(mfa.methods) || typeof mfa.enabled !== 'boolean') return null;
  const prompt = mfa.prompt && typeof mfa.prompt.show === 'boolean' ? { show: mfa.prompt.show, reason: mfa.prompt.reason ?? '' } : null;
  return {
    enabled: mfa.enabled,
    source: mfa.source ?? null,
    canDisable: mfa.can_disable === true,
    requiredBy: typeof mfa.required_by?.name === 'string' && mfa.required_by.name.trim() ? mfa.required_by.name.trim() : null,
    preferred: mfa.preferred ?? null,
    methods: mfa.methods.map(methodOf).filter((method): method is TwoFactorMethodView => method !== null),
    prompt,
  };
}

export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

export function requirementText(view: TwoFactorView): string | null {
  if (!view.enabled || view.canDisable) return null;
  if (view.requiredBy) return `Required by ${view.requiredBy}.`;
  if (view.source !== null && SCHOOL_SOURCES.has(view.source)) return 'Required by your school.';
  return null;
}

export function sourceLabel(view: TwoFactorView): string {
  if (!view.source) return '';
  return requirementText(view) ?? SOURCE_LABELS[view.source] ?? '';
}

export function canSetUpInline(method: string): boolean {
  return INLINE_SETUP.has(method);
}

export function isDisallowed(method: TwoFactorMethodView): boolean {
  return !method.available && method.reason === DISALLOWED_BY_POLICY;
}

export function promptMethods(view: TwoFactorView): TwoFactorMethodView[] {
  const offered = view.methods.filter((method) => (method.available || isDisallowed(method)) && !(method.method === TOTP_METHOD && method.enrolled));
  const relevant = view.prompt?.reason === PROMPT_ADD_AUTHENTICATOR ? offered.filter((method) => method.method === TOTP_METHOD) : offered;
  return [...relevant].sort((a, b) => Number(b.method === TOTP_METHOD) - Number(a.method === TOTP_METHOD));
}

export function canChooseInPrompt(method: TwoFactorMethodView): boolean {
  return method.available && canSetUpInline(method.method);
}

export function preferableMethods(view: TwoFactorView): TwoFactorMethodView[] {
  return view.methods.filter((method) => isDisallowed(method) || (method.available && (method.method !== TOTP_METHOD || method.enrolled)));
}
