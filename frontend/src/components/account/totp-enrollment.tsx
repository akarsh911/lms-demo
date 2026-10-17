'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { CODE_LENGTH, CodeInput } from '@/components/auth/code-input';
import { confirmTotp, enrollTotp, type TotpEnrollmentView } from '@/server/actions/account-security';
import { withStepUpRetry } from '@/services/step-up-gate';

import { failureMessage } from './action-message';
import { RecoveryCodes } from './recovery-codes';

type Phase = { kind: 'starting' } | { kind: 'scan'; enrollment: TotpEnrollmentView } | { kind: 'codes'; codes: string[] } | { kind: 'failed' };

export function TotpEnrollmentFlow({
  onConfirmed,
  onFinished,
  onCancel,
}: {
  onConfirmed?: () => void;
  onFinished: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const [phase, setPhase] = React.useState<Phase>({ kind: 'starting' });
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    void withStepUpRetry(enrollTotp).then((result) => {
      if (result.status === 'ok') {
        setPhase({ kind: 'scan', enrollment: result.value });
        return;
      }
      setError(failureMessage(result));
      setPhase({ kind: 'failed' });
    });
  }, []);

  const confirm = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const result = await withStepUpRetry(() => confirmTotp(code));
    setBusy(false);
    if (result.status !== 'ok') {
      setError(failureMessage(result));
      return;
    }
    setPhase({ kind: 'codes', codes: result.value });
    onConfirmed?.();
  };

  if (phase.kind === 'codes') return <RecoveryCodes codes={phase.codes} onDone={onFinished} />;

  if (phase.kind !== 'scan') {
    return (
      <Stack spacing={2}>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Preparing your authenticator setup…
          </Typography>
        )}
        <Button sx={{ alignSelf: 'flex-start' }} onClick={onCancel}>
          {error ? 'Close' : 'Cancel'}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2">Scan this code with your authenticator app, then enter the 6-digit code it shows.</Typography>
      <Box component="img" src={phase.enrollment.qrDataUrl} alt="QR code for your authenticator app" sx={{ width: 200, height: 200, alignSelf: 'flex-start' }} />
      <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
        Cannot scan it? Enter this key instead: <Box component="span" sx={{ fontFamily: 'monospace' }}>{phase.enrollment.secret}</Box>
      </Typography>
      <Box sx={{ maxWidth: 360 }}>
        <CodeInput name="totp" label="Code from your authenticator app" autoFocus value={code} onChange={setCode} error={error !== null} onComplete={busy ? undefined : () => void confirm()} />
      </Box>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Stack direction="row" spacing={1}>
        <Button variant="contained" disabled={busy || code.length !== CODE_LENGTH} onClick={() => void confirm()}>
          {busy ? 'Checking…' : 'Turn on'}
        </Button>
        <Button disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </Stack>
    </Stack>
  );
}
