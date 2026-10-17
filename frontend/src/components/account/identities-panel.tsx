'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { usePathname, useRouter } from 'next/navigation';

import { useToast } from '@/components/ui/toast';

import { unlinkIdentity } from '@/server/actions/account-security';
import type { LinkedIdentityView } from '@/types/account';
import { withStepUpRetry } from '@/services/step-up-gate';

import { failureMessage } from './action-message';

const PROVIDER_NAMES: Record<string, string> = { google: 'Google' };

const LINK_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled, so nothing was linked.',
  already_linked: 'That Google account is already linked to another Emerge account.',
  identity_in_use: 'That Google account is already linked to another Emerge account.',
  email_mismatch: 'That Google account does not match the email on your Emerge account.',
  login_required: 'Your sign-in has expired. Sign in again, then link Google.',
};

function providerName(provider: string): string {
  return PROVIDER_NAMES[provider] ?? provider;
}

function linkErrorMessage(code: string): string {
  return LINK_ERROR_MESSAGES[code] ?? 'Google could not be linked. Try again.';
}

type IdentitiesPanelProps = {
  identities: readonly LinkedIdentityView[];
  googleLinkUrl: string;
  linked: string | null;
  linkError: string | null;
};

export function IdentitiesPanel({ identities, googleLinkUrl, linked, linkError }: IdentitiesPanelProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const notify = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(linkError ? linkErrorMessage(linkError) : null);
  const handledReturn = React.useRef(false);
  const googleLinked = identities.some((identity) => identity.provider === 'google');

  React.useEffect(() => {
    if (handledReturn.current || (!linked && !linkError)) return;
    handledReturn.current = true;
    if (linked) notify(`${providerName(linked)} account linked`);
    router.replace(pathname, { scroll: false });
  }, [linked, linkError, notify, pathname, router]);

  const unlink = async (provider: string): Promise<void> => {
    if (!window.confirm(`Stop signing in with ${providerName(provider)}?`)) return;
    setBusy(provider);
    setError(null);
    const result = await withStepUpRetry(() => unlinkIdentity(provider));
    setBusy(null);
    if (result.status === 'ok') router.refresh();
    else setError(failureMessage(result));
  };

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <div>
          <Typography variant="h4" component="h2">
            Linked sign-in accounts
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Other accounts you can sign in to Emerge with.
          </Typography>
        </div>
        {identities.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            None linked.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {identities.map((identity) => (
              <Stack key={identity.provider} direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <Typography variant="subtitle2">{providerName(identity.provider)}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {identity.email}
                  </Typography>
                </div>
                <Button color="error" disabled={busy !== null} onClick={() => void unlink(identity.provider)}>
                  {busy === identity.provider ? 'Unlinking…' : 'Unlink'}
                </Button>
              </Stack>
            ))}
          </Stack>
        )}
        {googleLinked ? null : (
          <Button variant="outlined" href={googleLinkUrl} disabled={busy !== null} sx={{ alignSelf: 'flex-start' }}>
            Link Google
          </Button>
        )}
        {error ? <Alert severity="error">{error}</Alert> : null}
      </Stack>
    </Paper>
  );
}
