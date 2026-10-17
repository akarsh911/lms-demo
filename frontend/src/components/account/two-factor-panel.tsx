'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';

import { DISALLOWED_TEXT, EMAIL_METHOD, isDisallowed, methodLabel, preferableMethods, requirementText, sourceLabel } from '@/lib/auth/two-factor';
import { setPreferredTwoFactor, turnOffTwoFactor } from '@/server/actions/two-factor';
import { withStepUpRetry } from '@/services/step-up-gate';
import type { TwoFactorMethodView, TwoFactorView } from '@/types/account';

import { failureMessage } from './action-message';
import { EmailTwoFactorFlow } from './email-two-factor';

function optionLabel(method: TwoFactorMethodView): string {
  if (isDisallowed(method)) return `${methodLabel(method.method)}: ${DISALLOWED_TEXT}`;
  return method.destination ? `${methodLabel(method.method)} (${method.destination})` : methodLabel(method.method);
}

export function TwoFactorPanel({ view }: { view: TwoFactorView }): React.ReactElement {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [enablingEmail, setEnablingEmail] = React.useState(false);
  const options = preferableMethods(view);
  const email = view.methods.find((method) => method.method === EMAIL_METHOD && method.available);

  const choose = async (method: string): Promise<void> => {
    if (method === view.preferred) return;
    setBusy(true);
    setError(null);
    const result = await withStepUpRetry(() => setPreferredTwoFactor(method));
    setBusy(false);
    if (result.status === 'ok') router.refresh();
    else setError(failureMessage(result));
  };

  const turnOff = async (): Promise<void> => {
    if (!window.confirm('Turn off two-step verification for this account?')) return;
    setBusy(true);
    setError(null);
    const result = await withStepUpRetry(turnOffTwoFactor);
    setBusy(false);
    if (result.status === 'ok') router.refresh();
    else setError(failureMessage(result));
  };

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <div>
          <Typography variant="h4" component="h2">
            Two-step verification
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {view.enabled ? `On. ${sourceLabel(view)}` : 'Off. Signing in needs only your password.'}
          </Typography>
        </div>

        {requirementText(view) ? <Alert severity="info">{requirementText(view)} It cannot be turned off here.</Alert> : null}

        {view.enabled && options.some((method) => !isDisallowed(method)) ? (
          <div>
            <Typography variant="subtitle2" component="h3">
              Preferred method
            </Typography>
            <RadioGroup name="preferred-method" value={view.preferred ?? ''} onChange={(event) => void choose(event.target.value)}>
              {options.map((method) => (
                <FormControlLabel key={method.method} value={method.method} disabled={busy || isDisallowed(method)} control={<Radio />} label={optionLabel(method)} />
              ))}
            </RadioGroup>
          </div>
        ) : null}

        {!view.enabled && email ? (
          enablingEmail ? (
            <EmailTwoFactorFlow
              onEnabled={() => {
                setEnablingEmail(false);
                router.refresh();
              }}
              onCancel={() => setEnablingEmail(false)}
            />
          ) : (
            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary">
                Turn it on with a code sent to {email.destination ?? 'your email'}, or set up an authenticator app below.
              </Typography>
              <Button variant="outlined" disabled={busy} sx={{ alignSelf: 'flex-start' }} onClick={() => setEnablingEmail(true)}>
                Turn on with email codes
              </Button>
            </Stack>
          )
        ) : null}

        {error ? <Alert severity="error">{error}</Alert> : null}

        {view.canDisable ? (
          <Button color="error" disabled={busy} sx={{ alignSelf: 'flex-start' }} onClick={() => void turnOff()}>
            Turn off 2FA
          </Button>
        ) : null}
      </Stack>
    </Paper>
  );
}
