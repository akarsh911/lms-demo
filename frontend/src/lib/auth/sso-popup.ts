import { NEXT_PARAM } from './next-path';

export const SSO_POPUP_PARAM = 'popup';
export const SSO_PROVIDER_PARAM = 'provider';
export const SSO_PROVIDERS = ['google'] as const;

export type SsoProvider = (typeof SSO_PROVIDERS)[number];

export function ssoProviderOf(raw: string | null | undefined): SsoProvider | null {
  return SSO_PROVIDERS.find((provider) => provider === raw) ?? null;
}

export function ssoLoginPath(popup: boolean, provider: SsoProvider | null, next: string | null = null): string {
  const params = new URLSearchParams();
  if (popup) params.set(SSO_POPUP_PARAM, '1');
  if (provider) params.set(SSO_PROVIDER_PARAM, provider);
  if (next && next !== '/') params.set(NEXT_PARAM, next);
  const query = params.toString();
  return query ? `/auth/login?${query}` : '/auth/login';
}
export const SSO_POPUP_NAME_PREFIX = 'emerge-signin-';
export const SSO_POPUP_TAB_WIDTH = 700;
export const SSO_POPUP_TAB_HEIGHT = 900;
export const SSO_POPUP_CHANNEL = 'cas-signin';
export const SSO_POPUP_WIDTH = 480;
export const SSO_POPUP_HEIGHT = 640;

export const SIGNED_IN_MESSAGE = 'cas:signed-in';
export const SIGN_IN_FAILED_MESSAGE = 'cas:sign-in-failed';

export type SsoPopupMessage = { type: typeof SIGNED_IN_MESSAGE } | { type: typeof SIGN_IN_FAILED_MESSAGE; error: string };

export function isSsoPopupMessage(data: unknown): data is SsoPopupMessage {
  if (typeof data !== 'object' || data === null) return false;
  const { type } = data as { type?: unknown };
  return type === SIGNED_IN_MESSAGE || type === SIGN_IN_FAILED_MESSAGE;
}

export function uniquePopupName(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${SSO_POPUP_NAME_PREFIX}${random}`;
}

export function popupFeatures(left: number, top: number): string {
  return `popup=yes,width=${SSO_POPUP_WIDTH},height=${SSO_POPUP_HEIGHT},left=${left},top=${top}`;
}

export function openedAsTab(opened: Window): boolean {
  try {
    return opened.innerWidth > SSO_POPUP_TAB_WIDTH || opened.innerHeight > SSO_POPUP_TAB_HEIGHT;
  } catch {
    return false;
  }
}
