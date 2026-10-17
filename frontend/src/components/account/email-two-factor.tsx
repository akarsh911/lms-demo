'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { CODE_LENGTH, CodeInput } from '@/components/auth/code-input';
import { confirmEmailTwoFactor, startEmailTwoFactor } from '@/server/actions/two-factor';
import { withStepUpRetry } from '@/services/step-up-gate';
import type { EmailChallengeView, TwoFactorView } from '@/types/account';

import { failureMessage } from './action-message';

export function EmailTwoFactorFlow({
  onEnabled,
  onCancel,
}: {
  onEnabled: (view: TwoFactorView | null) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [challenge, setChallenge] = React.useState<EmailChallengeView | null>(null);
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const started = React.useRef(false);

  const send = React.useCallback(async (again: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await withStepUpRetry(startEmailTwoFactor);
    setBusy(false);
    if (result.status !== 'ok') {
      setError(failureMessage(result));
      return;
    }
    setChallenge(result.value);
    setCode('');
    if (again) setNotice('A new code is on its way.');
  }, []);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send(false);
  }, [send]);

  const confirm = async (current: EmailChallengeView): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await withStepUpRetry(() => confirmEmailTwoFactor(current.id, code));
    setBusy(false);
    if (result.status === 'ok') onEnabled(result.value);
    else setError(failureMessage(result));
  };

  return (
    <Stack spacing={2}>
      {challenge ? (
        <React.Fragment>
          <Typography variant="body2">We sent a code to {challenge.destination || 'your email'}. Enter it to turn on two-step verification.</Typography>
          <Box sx={{ maxWidth: 360 }}>
            <CodeInput name="email-code" label="Code from the email" autoFocus value={code} onChange={setCode} error={error !== null} onComplete={busy ? undefined : () => void confirm(challenge)} />
          </Box>
        </React.Fragment>
      ) : busy ? (
        <Typography variant="body2" color="text.secondary">
          Sending a code to your email…
        </Typography>
      ) : null}
      {notice ? <Alert severity="success">{notice}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Stack direction="row" spacing={1}>
        {challenge ? (
          <React.Fragment>
            <Button variant="contained" disabled={busy || code.length !== CODE_LENGTH} onClick={() => void confirm(challenge)}>
              {busy ? 'Checking…' : 'Turn on'}
            </Button>
            <Button disabled={busy} onClick={() => void send(true)}>
              Send a new code
            </Button>
          </React.Fragment>
        ) : null}
        <Button disabled={busy && challenge !== null} onClick={onCancel}>
          Cancel
        </Button>
      </Stack>
    </Stack>
  );
}
