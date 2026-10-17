'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';

import { useToast } from '@/components/ui/toast';
import { DISALLOWED_TEXT, EMAIL_METHOD, PROMPT_ADD_AUTHENTICATOR, TOTP_METHOD, canChooseInPrompt, canSetUpInline, isDisallowed, methodLabel, promptMethods } from '@/lib/auth/two-factor';
import { loadTwoFactorPrompt, snoozeTwoFactorPrompt } from '@/server/actions/two-factor';
import type { TwoFactorMethodView, TwoFactorView } from '@/types/account';

import { EmailTwoFactorFlow } from './email-two-factor';
import { TotpEnrollmentFlow } from './totp-enrollment';

const PROMPTED_KEY = 'emerge.two-factor-prompt.checked';

const ENABLE_INTRO = 'Add a second step when you sign in, so a stolen password alone is not enough to get into your account.';
const ADD_AUTHENTICATOR_INTRO = 'Two-step verification is on. An authenticator app is quicker than waiting for a code and works without email or signal.';

type Step = { kind: 'choose' } | { kind: 'method'; method: string };

function promptedThisSession(): boolean {
  try {
    if (window.sessionStorage.getItem(PROMPTED_KEY)) return true;
    window.sessionStorage.setItem(PROMPTED_KEY, '1');
    return false;
  } catch {
    return false;
  }
}

function describe(method: TwoFactorMethodView): string {
  if (isDisallowed(method)) return DISALLOWED_TEXT;
  if (!canSetUpInline(method.method)) return 'Not available in this app yet.';
  if (method.method === TOTP_METHOD) return 'Codes from an app such as Google Authenticator or 1Password, even offline.';
  return method.destination ? `A code sent to ${method.destination}.` : 'A code sent to your email.';
}

export function TwoFactorPrompt(): React.ReactElement | null {
  const router = useRouter();
  const notify = useToast();
  const [view, setView] = React.useState<TwoFactorView | null>(null);
  const [step, setStep] = React.useState<Step>({ kind: 'choose' });
  const [error, setError] = React.useState<string | null>(null);
  const checked = React.useRef(false);

  React.useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    if (promptedThisSession()) return;
    void loadTwoFactorPrompt().then((result) => {
      if (result.status === 'ok' && result.value && promptMethods(result.value).some(canChooseInPrompt)) setView(result.value);
    });
  }, []);

  if (!view) return null;

  const methods = promptMethods(view);
  const close = (): void => setView(null);
  const finish = (message: string): void => {
    notify(message);
    close();
    router.refresh();
  };

  const remindLater = async (): Promise<void> => {
    const result = await snoozeTwoFactorPrompt();
    if (result.status === 'ok' || result.status === 'signed_out') close();
    else setError('That could not be saved. Close this and we will ask again another time.');
  };

  return (
    <Dialog open onClose={step.kind === 'choose' ? close : undefined} maxWidth="sm" fullWidth>
      <DialogTitle>Protect your account</DialogTitle>
      <DialogContent>
        {step.kind === 'choose' ? (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              {view.prompt?.reason === PROMPT_ADD_AUTHENTICATOR ? ADD_AUTHENTICATOR_INTRO : ENABLE_INTRO}
            </Typography>
            {methods.map((method) => (
              <Stack key={method.method} direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Typography variant="subtitle2" color={isDisallowed(method) ? 'text.disabled' : undefined}>
                      {methodLabel(method.method)}
                    </Typography>
                    {method.method === TOTP_METHOD ? <Chip size="small" color="primary" label="Recommended" /> : null}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {describe(method)}
                  </Typography>
                </div>
                <Button
                  variant={method.method === TOTP_METHOD ? 'contained' : 'outlined'}
                  disabled={!canChooseInPrompt(method)}
                  onClick={() => {
                    setError(null);
                    setStep({ kind: 'method', method: method.method });
                  }}
                >
                  Set up
                </Button>
              </Stack>
            ))}
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        ) : step.method === EMAIL_METHOD ? (
          <EmailTwoFactorFlow onEnabled={() => finish('Two-step verification is on.')} onCancel={() => setStep({ kind: 'choose' })} />
        ) : (
          <TotpEnrollmentFlow onFinished={() => finish('Your authenticator app is set up.')} onCancel={() => setStep({ kind: 'choose' })} />
        )}
      </DialogContent>
      {step.kind === 'choose' ? (
        <DialogActions>
          <Button onClick={() => void remindLater()}>Remind me later</Button>
          <Button onClick={close}>Close</Button>
        </DialogActions>
      ) : null}
    </Dialog>
  );
}
