import { paths } from '@/paths';

import { signInPathWithError } from './sso-errors';

export const SESSION_CHANNEL = 'cas-session';
export const SIGNED_OUT_MESSAGE = 'cas:signed-out';
export const SESSION_INVALID = 'session_invalid';

const OTHER_TAB_DELAY_MS = 1000;

export function announceSignedOut(): void {
  try {
    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage({ type: SIGNED_OUT_MESSAGE });
    channel.close();
  } catch {
    return;
  }
}

export function leaveForSignIn(): void {
  announceSignedOut();
  window.location.assign(signInPathWithError(paths.auth.signIn, 'signed_out'));
}

export function onSignedOutElsewhere(): () => void {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return () => undefined;
  const channel = new BroadcastChannel(SESSION_CHANNEL);
  let timer: number | undefined;
  channel.addEventListener('message', (event: MessageEvent) => {
    const type = (event.data as { type?: unknown } | null)?.type;
    if (type !== SIGNED_OUT_MESSAGE || timer !== undefined) return;
    timer = window.setTimeout(() => window.location.assign(signInPathWithError(paths.auth.signIn, 'signed_out')), OTHER_TAB_DELAY_MS);
  });
  return () => {
    window.clearTimeout(timer);
    channel.close();
  };
}
