'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { signInPathWithError, ssoErrorKindOf } from '@/lib/auth/sso-errors';
import {
  isSsoPopupMessage,
  SIGNED_IN_MESSAGE,
  SSO_POPUP_CHANNEL,
  SSO_POPUP_HEIGHT,
  SSO_POPUP_WIDTH,
  openedAsTab,
  popupFeatures,
  ssoLoginPath,
  uniquePopupName,
  ssoProviderOf,
  type SsoPopupMessage,
  type SsoProvider,
} from '@/lib/auth/sso-popup';
import { withNext } from '@/lib/auth/next-path';
import { paths } from '@/paths';

const CLOSED_POLL_MS = 500;
const EMERGE_LABEL = 'Continue with Emerge';
const PROVIDER_LABELS: Record<SsoProvider, string> = { google: 'Continue with Google' };

type Phase = { kind: 'idle' } | { kind: 'waiting'; provider: SsoProvider | null } | { kind: 'blocked'; provider: SsoProvider | null };

function openBlankCentred(): Window | null {
  const left = Math.round(window.screenX + (window.outerWidth - SSO_POPUP_WIDTH) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - SSO_POPUP_HEIGHT) / 2);
  return window.open('about:blank', uniquePopupName(), popupFeatures(left, top));
}

function navigatePopup(popupWindow: Window, url: string): boolean {
  try {
    popupWindow.location.href = new URL(url, window.location.origin).href;
    return true;
  } catch {
    popupWindow.close();
    return false;
  }
}

function GoogleMark(): React.ReactElement {
  return (
    <Box component="svg" viewBox="0 0 48 48" aria-hidden sx={{ width: 18, height: 18 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Box>
  );
}

function EmergeMark(): React.ReactElement {
  return <Box component="img" src="/brand/emerge-mark.svg" alt="" aria-hidden sx={{ width: 20, height: 20 }} />;
}

export function SsoSignInChoices({ popup, providers, next }: { popup: boolean; providers: readonly string[]; next: string }): React.ReactElement {
  const [phase, setPhase] = React.useState<Phase>({ kind: 'idle' });
  const popupWindow = React.useRef<Window | null>(null);
  const cleanup = React.useRef<(() => void) | null>(null);
  const extra = providers.map(ssoProviderOf).filter((provider): provider is SsoProvider => provider !== null);

  React.useEffect(() => () => cleanup.current?.(), []);

  const continueInThisTab = (provider: SsoProvider | null): void => window.location.assign(ssoLoginPath(false, provider, next));

  const destinationOf = (message: SsoPopupMessage): string => {
    if (message.type === SIGNED_IN_MESSAGE) return next;
    return withNext(signInPathWithError(paths.auth.signIn, ssoErrorKindOf(message.error) ?? 'exchange_failed'), next);
  };

  const listen = (opened: Window): void => {
    cleanup.current?.();
    let settled = false;
    const settle = (message: SsoPopupMessage): void => {
      if (settled) return;
      settled = true;
      cleanup.current?.();
      window.location.assign(destinationOf(message));
    };
    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== window.location.origin || event.source !== opened || !isSsoPopupMessage(event.data)) return;
      settle(event.data);
    };
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(SSO_POPUP_CHANNEL) : null;
    const onBroadcast = (event: MessageEvent): void => {
      if (isSsoPopupMessage(event.data)) settle(event.data);
    };
    const poll = window.setInterval(() => {
      if (!opened.closed || settled) return;
      window.clearInterval(poll);
      setPhase((current) => (current.kind === 'waiting' ? { kind: 'idle' } : current));
    }, CLOSED_POLL_MS);

    window.addEventListener('message', onMessage);
    channel?.addEventListener('message', onBroadcast);
    cleanup.current = () => {
      window.removeEventListener('message', onMessage);
      channel?.close();
      window.clearInterval(poll);
      cleanup.current = null;
    };
  };

  const start = (provider: SsoProvider | null): void => {
    const opened = openBlankCentred();
    if (!opened) {
      setPhase({ kind: 'blocked', provider });
      return;
    }
    if (openedAsTab(opened)) {
      opened.close();
      continueInThisTab(provider);
      return;
    }
    if (!navigatePopup(opened, ssoLoginPath(true, provider, next))) {
      setPhase({ kind: 'blocked', provider });
      return;
    }
    opened.focus();
    popupWindow.current = opened;
    setPhase({ kind: 'waiting', provider });
    listen(opened);
  };

  const reopen = (provider: SsoProvider | null): void => {
    const opened = popupWindow.current;
    if (opened && !opened.closed) {
      opened.focus();
      return;
    }
    start(provider);
  };

  const cancel = (): void => {
    cleanup.current?.();
    popupWindow.current?.close();
    popupWindow.current = null;
    setPhase({ kind: 'idle' });
  };

  const waiting = phase.kind === 'waiting';

  const button = (provider: SsoProvider | null): React.ReactElement => {
    const label = provider ? PROVIDER_LABELS[provider] : EMERGE_LABEL;
    const look = {
      variant: provider ? ('outlined' as const) : ('contained' as const),
      size: 'large' as const,
      fullWidth: true,
      startIcon: provider ? <GoogleMark /> : <EmergeMark />,
    };
    if (!popup) {
      return (
        <Button key={provider ?? 'emerge'} {...look} href={ssoLoginPath(false, provider, next)}>
          {label}
        </Button>
      );
    }
    return (
      <Button key={provider ?? 'emerge'} {...look} type="button" disabled={waiting} onClick={() => start(provider)}>
        {label}
      </Button>
    );
  };

  return (
    <Stack spacing={1.25}>
      {button(null)}
      {extra.map(button)}
      {phase.kind === 'waiting' ? (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }} role="status">
          <Typography variant="body2" color="text.secondary">
            Finish signing in in the Emerge window.
          </Typography>
          <Link component="button" type="button" variant="body2" onClick={() => reopen(phase.provider)}>
            Reopen window
          </Link>
          <Link component="button" type="button" variant="body2" onClick={cancel}>
            Cancel
          </Link>
        </Stack>
      ) : null}
      {phase.kind === 'blocked' ? (
        <Alert
          severity="warning"
          action={
            <Button variant="contained" size="small" onClick={() => continueInThisTab(phase.provider)}>
              Continue in this tab
            </Button>
          }
        >
          Your browser blocked the sign-in window.
        </Alert>
      ) : null}
    </Stack>
  );
}
