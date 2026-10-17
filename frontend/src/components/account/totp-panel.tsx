'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';

import { disableTotp, regenerateRecoveryCodes } from '@/server/actions/account-security';
import type { CasActionResult } from '@/types/account';
import { withStepUpRetry } from '@/services/step-up-gate';

import { failureMessage } from './action-message';
import { RecoveryCodes } from './recovery-codes';
import { TotpEnrollmentFlow } from './totp-enrollment';

type Mode = { kind: 'idle' } | { kind: 'enrolling' } | { kind: 'codes'; codes: string[] };

export function TotpPanel({ enrolled, recoveryCodesRemaining }: { enrolled: boolean; recoveryCodesRemaining: number }): React.ReactElement {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>({ kind: 'idle' });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = async <T,>(action: () => Promise<CasActionResult<T>>, onOk: (value: T) => void): Promise<void> => {
    setBusy(true);
    setError(null);
    const result = await withStepUpRetry(action);
    setBusy(false);
    if (result.status === 'ok') onOk(result.value);
    else setError(failureMessage(result));
  };

  const regenerate = (): Promise<void> =>
    run<string[]>(regenerateRecoveryCodes, (codes) => {
      setMode({ kind: 'codes', codes });
      router.refresh();
    });

  const turnOff = (): Promise<void> => {
    if (!window.confirm('Turn off the authenticator app for this account?')) return Promise.resolve();
    return run<null>(disableTotp, () => {
      setMode({ kind: 'idle' });
      router.refresh();
    });
  };

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <div>
          <Typography variant="h4" component="h2">
            Authenticator app
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {enrolled
              ? `On. Sign-in and sensitive changes ask for a code from your app. ${recoveryCodesRemaining} recovery codes left.`
              : 'Off. Use an app such as Google Authenticator, Microsoft Authenticator or 1Password for a code at sign-in.'}
          </Typography>
        </div>

        {mode.kind === 'enrolling' ? (
          <TotpEnrollmentFlow onConfirmed={() => router.refresh()} onFinished={() => setMode({ kind: 'idle' })} onCancel={() => setMode({ kind: 'idle' })} />
        ) : null}

        {mode.kind === 'codes' ? <RecoveryCodes codes={mode.codes} onDone={() => setMode({ kind: 'idle' })} /> : null}

        {error ? <Alert severity="error">{error}</Alert> : null}

        {mode.kind === 'idle' ? (
          <Stack direction="row" spacing={1}>
            {enrolled ? (
              <React.Fragment>
                <Button variant="outlined" disabled={busy} onClick={() => void regenerate()}>
                  New recovery codes
                </Button>
                <Button color="error" disabled={busy} onClick={() => void turnOff()}>
                  Turn off
                </Button>
              </React.Fragment>
            ) : (
              <Button
                variant="contained"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setMode({ kind: 'enrolling' });
                }}
              >
                Set up authenticator app
              </Button>
            )}
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}
