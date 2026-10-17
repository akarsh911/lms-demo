import { config } from '@/config';
import { DEMO_SESSION_COOKIE, demoAccountOf } from '@/constants/demo-accounts';

// The fixture user this tab is served as: the signed-in demo account, else the build's own.
export function devUser(): string {
  if (config.publicDemo || typeof document === 'undefined') return config.devUser;
  const signedIn = document.cookie.split('; ').find((part) => part.startsWith(`${DEMO_SESSION_COOKIE}=`))?.slice(DEMO_SESSION_COOKIE.length + 1);
  return demoAccountOf(signedIn)?.user ?? config.devUser;
}
