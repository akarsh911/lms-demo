'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { usePathname } from 'next/navigation';

import { clock, useRemaining } from '@/hooks/use-remaining';
import { channelLabel } from '@/lib/auth/messages';
import { alternativeLabel, offeredAlternatives, RECOVERY_METHOD, RECOVERY_PROMPT, TOTP_CHANNEL, TOTP_PROMPT } from '@/lib/auth/totp';
import { SESSION_ENDED } from '@/lib/api-failure';
import { paths } from '@/paths';
import { resendStepUp, startStepUp, verifyStepUp, type StepUpChallengeView, type StepUpOutcome } from '@/server/actions/step-up';
import { registerStepUpHandler } from '@/services/step-up-gate';

import { CodeInput } from './code-input';

type CodePhase = { kind: 'code'; challenge: StepUpChallengeView; error?: string; notice?: string; busy: boolean };

type Phase =
  | { kind: 'closed' }
  | { kind: 'starting' }
  | CodePhase
  | { kind: 'blocked'; message: string; enroll: boolean };

const ENROLL_MESSAGE = 'This action needs a second step, and your account has no way to receive one. Set up an authenticator app first.';
const START_FAILED = 'Verification could not start. Try again.';

function personaSlugOf(pathname: string | null): string | null {
  const match = /^\/p\/([^/]+)/.exec(pathname ?? '');
  return match?.[1] ?? null;
}

function blockedBy(outcome: StepUpOutcome): Phase | null {
  switch (outcome.status) {
    case 'enroll_required':
      return { kind: 'blocked', message: ENROLL_MESSAGE, enroll: true };
    case 'signed_out':
      return { kind: 'blocked', message: SESSION_ENDED, enroll: false };
    case 'failed':
      return { kind: 'blocked', message: outcome.message, enroll: false };
    default:
      return null;
  }
}

export function StepUpDialog(): React.ReactElement {
  const [phase, setPhase] = React.useState<Phase>({ kind: 'closed' });
  const [code, setCode] = React.useState('');
  const settle = React.useRef<((verified: boolean) => void) | null>(null);
  const slug = personaSlugOf(usePathname());

  const finish = React.useCallback((verified: boolean) => {
    settle.current?.(verified);
    settle.current = null;
    setCode('');
    setPhase({ kind: 'closed' });
  }, []);

  const begin = React.useCallback(async (method?: string) => {
    setCode('');
    setPhase({ kind: 'starting' });
    const outcome = await startStepUp(method);
    if (outcome.status === 'challenge') setPhase({ kind: 'code', challenge: outcome.challenge, busy: false });
    else setPhase(blockedBy(outcome) ?? { kind: 'blocked', message: START_FAILED, enroll: false });
  }, []);

  React.useEffect(
    () =>
      registerStepUpHandler(
        () =>
          new Promise<boolean>((resolve) => {
            settle.current = resolve;
            void begin();
          }),
      ),
    [begin],
  );

  const submit = async (current: CodePhase): Promise<void> => {
    setPhase({ ...current, busy: true, error: undefined, notice: undefined });
    const outcome = await verifyStepUp(current.challenge.id, code);
    switch (outcome.status) {
      case 'verified':
        finish(true);
        return;
      case 'invalid_code':
        setPhase({ ...current, busy: false, error: 'That code is not correct.' });
        return;
      case 'too_many_attempts':
        setPhase({ ...current, busy: false, error: 'Too many incorrect codes. Close this and try the action again later.' });
        return;
      default:
        setPhase(blockedBy(outcome) ?? { ...current, busy: false, error: 'Verification failed. Try again.' });
    }
  };

  const resend = async (current: CodePhase): Promise<void> => {
    setPhase({ ...current, busy: true, error: undefined, notice: undefined });
    const outcome = await resendStepUp(current.challenge.id);
    if (outcome.status === 'challenge') {
      setPhase({ kind: 'code', challenge: outcome.challenge, busy: false, notice: 'A new code is on its way.' });
      return;
    }
    setPhase(blockedBy(outcome) ?? { ...current, busy: false, error: 'A new code could not be sent yet.' });
  };

  return (
    <Dialog open={phase.kind !== 'closed'} onClose={() => finish(false)} maxWidth="xs" fullWidth>
      <DialogTitle>Confirm it is you</DialogTitle>
      {phase.kind === 'code' ? (
        <CodeStep
          key={phase.challenge.id}
          phase={phase}
          code={code}
          onCode={setCode}
          onSubmit={() => void submit(phase)}
          onResend={() => void resend(phase)}
          onAlternate={(method) => void begin(method)}
          onCancel={() => finish(false)}
        />
      ) : (
        <React.Fragment>
          <DialogContent>
            {phase.kind === 'blocked' ? (
              <Stack spacing={1.5}>
                <Alert severity={phase.enroll ? 'info' : 'error'}>{phase.message}</Alert>
                {phase.enroll && slug ? (
                  <Link href={paths.accountSecurity(slug)} onClick={() => finish(false)}>
                    Set up an authenticator app
                  </Link>
                ) : null}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Preparing verification…
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => finish(false)}>Close</Button>
          </DialogActions>
        </React.Fragment>
      )}
    </Dialog>
  );
}

function CodeStep({
  phase,
  code,
  onCode,
  onSubmit,
  onResend,
  onAlternate,
  onCancel,
}: {
  phase: CodePhase;
  code: string;
  onCode: (value: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  onAlternate: (method: string) => void;
  onCancel: () => void;
}): React.ReactElement {
  const { challenge } = phase;
  const totp = challenge.method === TOTP_CHANNEL;
  const [recovery, setRecovery] = React.useState(false);
  const [choosing, setChoosing] = React.useState(false);
  const alternatives = offeredAlternatives(challenge.method, challenge.alternatives, recovery);
  const resendIn = useRemaining(challenge.nextResendAt);
  const resendReady = challenge.nextResendAt ? resendIn !== null && resendIn <= 0 : true;
  const prompt = recovery
    ? RECOVERY_PROMPT
    : totp
    ? TOTP_PROMPT
    : `This action needs a fresh check. We sent a code to your ${channelLabel(challenge.method)} ${challenge.destination}.`;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {prompt}
          </Typography>
          <CodeInput key={recovery ? 'recovery' : 'code'} name="code" label={recovery ? 'Recovery code' : 'Verification code'} autoFocus error={phase.error !== undefined} value={code} onChange={onCode} recovery={recovery} autoSubmit={!phase.busy} />
          {alternatives.length > 0 ? (
            choosing ? (
              <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                {alternatives.map((method) => (
                  <Button
                    key={method}
                    type="button"
                    size="small"
                    disabled={phase.busy}
                    onClick={() => {
                      setChoosing(false);
                      if (method !== RECOVERY_METHOD) {
                        onAlternate(method);
                        return;
                      }
                      onCode('');
                      setRecovery(true);
                    }}
                  >
                    {alternativeLabel(method)}
                  </Button>
                ))}
              </Stack>
            ) : (
              <Button type="button" size="small" disabled={phase.busy} sx={{ alignSelf: 'flex-start' }} onClick={() => setChoosing(true)}>
                Try another way
              </Button>
            )
          ) : null}
          {phase.notice ? <Alert severity="success">{phase.notice}</Alert> : null}
          {phase.error ? (
            <Alert severity="error" role="alert">
              {phase.error}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: totp ? 'flex-end' : 'space-between' }}>
        {totp ? null : (
          <Button type="button" size="small" disabled={phase.busy || !resendReady} onClick={onResend}>
            {resendReady ? 'Send a New Code' : `New code in ${clock(resendIn ?? 0)}`}
          </Button>
        )}
        <Stack direction="row" spacing={1}>
          <Button type="button" onClick={onCancel} disabled={phase.busy}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={phase.busy || code === ''}>
            {phase.busy ? 'Checking…' : 'Confirm'}
          </Button>
        </Stack>
      </DialogActions>
    </form>
  );
}
