'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ArrowRight, KeyRound, Mail } from 'lucide-react';

import { config } from '@/config';
import { useRemaining, clock } from '@/hooks/use-remaining';
import { channelLabel, fieldForError } from '@/lib/auth/messages';
import { alternativeLabel, offeredAlternatives, RECOVERY_METHOD, RECOVERY_PROMPT, TOTP_CHANNEL, TOTP_PROMPT } from '@/lib/auth/totp';
import { NEXT_PARAM } from '@/lib/auth/next-path';
import { signIn, type SignInChallenge, type SignInState } from '@/server/actions/auth';

import { CodeInput } from './code-input';
import { DemoAccounts } from './demo-accounts';
import { HelpLink } from './help-link';
import { ErrorNote } from './error-note';
import { PasswordField } from './password-field';
import { SsoSignInChoices } from './sso-sign-in-choices';
import { StepHeading } from './step-heading';

const INITIAL: SignInState = { step: 'credentials' };

export interface SignInPageOptions {
  appName: string;
  next: string;
  notice: { text: string; severity: 'info' | 'error' } | null;
  sso: { popup: boolean; providers: readonly string[] } | null;
}

export function SignInForm({ options }: { options: SignInPageOptions }): React.ReactElement {
  const [state, formAction, pending] = React.useActionState(signIn, INITIAL);
  const [intent, setIntent] = React.useState<string | null>(null);

  const invalidField = state.error ? fieldForError(state.error.kind) : null;

  const rememberIntent = (event: React.FormEvent<HTMLFormElement>): void => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const named = submitter instanceof HTMLButtonElement && submitter.name === 'intent' ? submitter.value : null;
    setIntent(named);
  };

  return (
    <Box component="form" action={formAction} onSubmit={rememberIntent}>
      <input type="hidden" name={NEXT_PARAM} value={options.next} />
      <Stack spacing={2.25}>
        {state.step === 'handoff' && state.adoptUrl ? (
          <HandoffStep adoptUrl={state.adoptUrl} />
        ) : state.step === 'challenge' && state.challenge ? (
          <ChallengeStep key={state.challenge.id} state={state} challenge={state.challenge} pending={pending} intent={intent} invalidField={invalidField} />
        ) : state.step === 'password_change' ? (
          <PasswordStep key="password-change" state={state} pending={pending} intent={intent} />
        ) : (
          <CredentialsStep key="credentials" state={state} pending={pending} intent={intent} invalidField={invalidField} options={options} />
        )}
      </Stack>
    </Box>
  );
}

interface StepProps {
  state: SignInState;
  pending: boolean;
  intent: string | null;
  invalidField?: 'identifier' | 'password' | 'code' | null;
}

function HandoffStep({ adoptUrl }: { adoptUrl: string }): React.ReactElement {
  React.useEffect(() => {
    window.location.assign(adoptUrl);
  }, [adoptUrl]);
  return (
    <Stack spacing={2} role="status" sx={{ alignItems: 'center', justifyContent: 'center', width: 1, py: 6 }}>
      <CircularProgress />
      <Typography variant="h3" component="p">
        Signing you in…
      </Typography>
    </Stack>
  );
}

function CredentialsStep({ state, pending, intent, invalidField, options }: StepProps & { options: SignInPageOptions }): React.ReactElement {
  const [identifier, setIdentifier] = React.useState(state.identifier ?? '');
  const [password, setPassword] = React.useState('');
  const demo = config.devBypass && !config.publicDemo;
  return (
    <React.Fragment>
      {options.sso ? (
        <StepHeading large title={`Sign in to ${options.appName}`} subtitle="One Emerge account for every Emerge app." />
      ) : (
        <StepHeading large title="Welcome back" subtitle="Sign in to your Emerge account." />
      )}

      {options.notice ? (
        <Alert severity={options.notice.severity} role={options.notice.severity === 'error' ? 'alert' : 'status'}>
          {options.notice.text}
        </Alert>
      ) : null}

      {options.sso ? (
        <React.Fragment>
          <SsoSignInChoices popup={options.sso.popup} providers={options.sso.providers} next={options.next} />
          <Divider>
            <Typography variant="body2" color="text.secondary">
              or sign in with email
            </Typography>
          </Divider>
        </React.Fragment>
      ) : null}

      <Stack spacing={1}>
        <Typography component="label" htmlFor="identifier" variant="subtitle2">
          School email or ID
        </Typography>
        <TextField
          id="identifier"
          name="identifier"
          placeholder="Enter your email or ID"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          autoFocus
          required
          fullWidth
          error={invalidField === 'identifier'}
          slotProps={{ htmlInput: { spellCheck: false, autoCapitalize: 'none' } }}
        />
      </Stack>

      <Stack spacing={1}>
        <Typography component="label" htmlFor="password" variant="subtitle2">
          Password
        </Typography>
        <PasswordField id="password" name="password" label="Password" autoComplete="current-password" required error={invalidField === 'password'} value={password} onChange={setPassword} plain={{ placeholder: 'Enter your password' }} />
      </Stack>

      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mt: -0.5 }}>
        <FormControlLabel control={<Checkbox name="remember" defaultChecked size="small" />} label={<Typography variant="body2">Remember me</Typography>} />
        <HelpLink label="Forgot password?" variant="body2" />
      </Stack>

      <ErrorNote error={state.error} />

      <Button type="submit" variant={options.sso ? 'outlined' : 'contained'} size="large" fullWidth disabled={pending} endIcon={<ArrowRight size={16} />}>
        {pending && intent === null ? 'Signing in…' : 'Sign in'}
      </Button>

      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        Need access? Contact your school.
      </Typography>

      {demo ? (
        <DemoAccounts onPick={(a) => (setIdentifier(a.identifier), setPassword(a.password))} />
      ) : (
        <Button type="submit" name="intent" value="email_code" variant="text" size="small" formNoValidate disabled={pending} startIcon={<Mail size={15} />} sx={{ alignSelf: 'center' }}>
          {pending && intent === 'email_code' ? 'Sending…' : 'Email me a sign-in code instead'}
        </Button>
      )}
    </React.Fragment>
  );
}

function ChallengeStep({ state, challenge, pending, intent, invalidField }: StepProps & { challenge: SignInChallenge }): React.ReactElement {
  const [code, setCode] = React.useState('');
  const expiresIn = useRemaining(challenge.expiresAt);
  const resendIn = useRemaining(challenge.nextResendAt);
  const resendReady = challenge.nextResendAt ? resendIn !== null && resendIn <= 0 : true;
  const expired = expiresIn !== null && expiresIn <= 0;
  const totp = challenge.channel === TOTP_CHANNEL;
  const [recovery, setRecovery] = React.useState(false);
  const [choosing, setChoosing] = React.useState(false);
  const alternatives = offeredAlternatives(challenge.channel, challenge.alternatives, recovery);
  const subtitle = recovery ? RECOVERY_PROMPT : totp ? TOTP_PROMPT : `We sent it to the ${channelLabel(challenge.channel)} ${challenge.destination}.`;

  return (
    <React.Fragment>
      <StepHeading eyebrow="Two-step verification" title={recovery ? 'Enter a recovery code.' : 'Enter your code.'} subtitle={subtitle} />

      <CodeInput key={recovery ? 'recovery' : 'code'} name="code" label={recovery ? 'Recovery code' : 'Verification code'} autoFocus error={invalidField === 'code'} value={code} onChange={setCode} recovery={recovery} autoSubmit={!pending} />

      <Typography aria-live="polite" variant="caption" color={expired ? 'error' : 'text.secondary'} sx={{ minHeight: 18 }}>
        {expiresIn === null ? '' : expired ? (totp ? 'This sign-in has expired. Start again.' : 'This code has expired. Send yourself a new one.') : `This ${totp ? 'sign-in' : 'code'} expires in ${clock(expiresIn)}.`}
      </Typography>

      {state.notice === 'code_sent' ? (
        <Alert severity="success" role="status">
          A new code is on its way to {challenge.destination}.
        </Alert>
      ) : null}

      {challenge.devCode ? <Alert severity="info">Development code: {challenge.devCode}</Alert> : null}

      <ErrorNote error={state.error} />

      <Button type="submit" variant="contained" size="large" fullWidth disabled={pending || state.challengeDead === true} endIcon={<ArrowRight size={16} />}>
        {pending && intent === null ? 'Verifying…' : 'Verify and Sign In'}
      </Button>

      <Stack direction="row" spacing={1} sx={{ justifyContent: totp ? 'center' : 'space-between', alignItems: 'center' }}>
        {totp ? null : (
          <Button type="submit" name="intent" value="resend" variant="text" size="small" formNoValidate disabled={pending || !resendReady}>
            {pending && intent === 'resend' ? 'Sending…' : resendReady ? 'Send a New Code' : `New code in ${clock(resendIn ?? 0)}`}
          </Button>
        )}
        <Button type="submit" name="intent" value="restart" variant="text" size="small" formNoValidate disabled={pending}>
          Use Another Account
        </Button>
      </Stack>

      {alternatives.length > 0 ? (
        choosing ? (
          <Stack spacing={0.5} sx={{ alignItems: 'center' }}>
            {alternatives.map((method) =>
              method === RECOVERY_METHOD ? (
                <Button
                  key={method}
                  type="button"
                  variant="text"
                  size="small"
                  disabled={pending}
                  onClick={() => {
                    setCode('');
                    setRecovery(true);
                    setChoosing(false);
                  }}
                >
                  {alternativeLabel(method)}
                </Button>
              ) : (
                <Button key={method} type="submit" name="intent" value={`alternate:${method}`} variant="text" size="small" formNoValidate disabled={pending}>
                  {pending && intent === `alternate:${method}` ? 'Sending…' : alternativeLabel(method)}
                </Button>
              ),
            )}
          </Stack>
        ) : (
          <Button type="button" variant="text" size="small" disabled={pending} sx={{ alignSelf: 'center' }} onClick={() => setChoosing(true)}>
            Try another way
          </Button>
        )
      ) : null}
    </React.Fragment>
  );
}

function PasswordStep({ state, pending, intent }: StepProps): React.ReactElement {
  return (
    <React.Fragment>
      <StepHeading eyebrow="One more step" title="Choose a new password." subtitle="This account still has the password your school issued. Nothing else opens until it is changed." />

      <PasswordField id="currentPassword" name="currentPassword" label="Current password" autoComplete="current-password" autoFocus required />
      <PasswordField id="newPassword" name="newPassword" label="New password" autoComplete="new-password" required icon={<KeyRound size={18} />} />
      <PasswordField id="confirmPassword" name="confirmPassword" label="Repeat new password" autoComplete="new-password" required icon={<KeyRound size={18} />} error={state.error?.kind === 'password_mismatch'} />

      <ErrorNote error={state.error} />

      <Button type="submit" variant="contained" size="large" fullWidth disabled={pending} endIcon={<ArrowRight size={16} />}>
        {pending && intent === null ? 'Saving…' : 'Set Password and Continue'}
      </Button>

      <Button type="submit" name="intent" value="restart" variant="text" size="small" formNoValidate disabled={pending} sx={{ alignSelf: 'center' }}>
        Cancel and Sign In Again
      </Button>
    </React.Fragment>
  );
}
