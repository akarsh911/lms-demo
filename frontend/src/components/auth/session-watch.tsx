'use client';

import * as React from 'react';

import { leaveForSignIn, onSignedOutElsewhere } from '@/lib/auth/session-channel';
import { checkSessionLiveness } from '@/server/actions/session';

const CHECK_EVERY_MS = 60_000;

export function SessionWatch(): null {
  React.useEffect(() => {
    let checking = false;
    let gone = false;

    const check = async (): Promise<void> => {
      if (checking || gone || document.visibilityState !== 'visible') return;
      checking = true;
      try {
        if ((await checkSessionLiveness()) === 'signed_out') {
          gone = true;
          leaveForSignIn();
        }
      } catch {
        return;
      } finally {
        checking = false;
      }
    };

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void check();
    };
    const onFocus = (): void => void check();
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const stopListening = onSignedOutElsewhere();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      stopListening();
    };
  }, []);

  return null;
}
