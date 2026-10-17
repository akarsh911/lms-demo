'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Check, Minus, X } from 'lucide-react';

import { CopyableId } from '../copy-id';
import { STEP_LABELS } from './options';
import type { ApiError } from '@/services/api';
import type {
  AdmissionState,
  AdmissionStep,
  StepStatus,
} from '@/hooks/mutation/use-admission';

const STATUS_READINGS: Record<StepStatus, string> = {
  pending: 'Not attempted yet',
  running: 'Being created',
  created: 'Created',
  reused: 'Already there, kept',
  failed: 'Refused',
  blocked: 'Not attempted: the step before it failed',
};

export function identityFailureReading(error: ApiError): string | null {
  if (error.status === 501) {
    return 'This deployment cannot create sign-in identities at all: no identity service is configured for it. Nothing was created, and nobody can be added here until an administrator configures one.';
  }
  if (error.status === 403) {
    return 'The identity service refused YOU permission to create a person. That is about your own account rather than about the details you typed.';
  }
  if (error.status === 401) {
    return 'The identity service rejected your sign-in while creating the person. Sign in again and try once more.';
  }
  return null;
}

export function PasswordOnce({
  password,
  username,
  acknowledged,
  onAcknowledge,
}: {
  password: string;
  username: string;
  acknowledged: boolean;
  onAcknowledge: (next: boolean) => void;
}): React.ReactElement {
  const panel = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <Paper
      ref={panel}
      tabIndex={-1}
      variant="outlined"
      sx={{ p: 2, borderWidth: 2, borderColor: 'warning.main' }}
    >
      <Stack spacing={1.5}>
        <Typography variant="h6" component="h3">
          Write this password down now
        </Typography>
        <Typography variant="body2">
          It is shown here once and is stored nowhere it can be read back. Nobody,
          including you, can retrieve it after this dialog closes: a lost one has to be
          reset in the identity service.
        </Typography>
        <Stack spacing={0.5}>
          <CopyableId label="Username" value={username} />
          <CopyableId label="Password" value={password} />
        </Stack>
        <FormControlLabel
          control={
            <Checkbox
              checked={acknowledged}
              onChange={(event) => onAcknowledge(event.target.checked)}
            />
          }
          label="I have given this password to them, or written it down"
        />
      </Stack>
    </Paper>
  );
}

function StepIcon({ status }: { status: StepStatus }): React.ReactElement {
  if (status === 'running') return <CircularProgress size={16} />;
  if (status === 'created' || status === 'reused') return <Check size={16} />;
  if (status === 'failed') return <X size={16} />;
  return <Minus size={16} />;
}

function stepTone(status: StepStatus): string {
  if (status === 'failed') return 'error.main';
  if (status === 'created' || status === 'reused') return 'success.main';
  return 'text.secondary';
}

export function AdmissionSteps({ state }: { state: AdmissionState }): React.ReactElement {
  return (
    <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {state.order.map((step: AdmissionStep) => {
        const status = state.status[step] ?? 'pending';
        return (
          <Stack
            key={step}
            component="li"
            direction="row"
            spacing={1.5}
            sx={{ alignItems: 'center' }}
          >
            <Box sx={{ display: 'flex', color: stepTone(status) }}>
              <StepIcon status={status} />
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {STEP_LABELS[step]}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {STATUS_READINGS[status]}
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}

export function AdmissionReport({
  state,
  username,
  acknowledged,
  onAcknowledge,
  onRetry,
}: {
  state: AdmissionState;
  username: string;
  acknowledged: boolean;
  onAcknowledge: (next: boolean) => void;
  onRetry: () => void;
}): React.ReactElement {
  const identity = state.identity;
  const failure = state.error;
  const identityFailure =
    failure && state.failedAt === 'identity' ? identityFailureReading(failure) : null;

  return (
    <Stack spacing={2.5}>
      <Box aria-live="polite">
        <AdmissionSteps state={state} />
      </Box>

      {identity?.linkedExisting ? (
        <Alert severity="warning" variant="outlined">
          <AlertTitle>This attached to somebody who already exists</AlertTitle>
          That username or email was already registered, so no new sign-in was created
          and every record below hangs off the EXISTING person. They keep the password
          they already had, no new one was set, and none is shown here. If you meant a
          different person, stop and check the username and the email.
        </Alert>
      ) : null}

      {identity?.password ? (
        <PasswordOnce
          password={identity.password}
          username={username}
          acknowledged={acknowledged}
          onAcknowledge={onAcknowledge}
        />
      ) : null}

      {identity?.createdInCas && !identity.password ? (
        <Alert severity="info" variant="outlined">
          A new sign-in was created with the password you typed. Nothing is shown back,
          so you are the only channel it has.
        </Alert>
      ) : null}

      {failure ? (
        <Alert severity="error" variant="outlined">
          <AlertTitle>
            {state.failedAt ? STEP_LABELS[state.failedAt] : 'A step'} was refused
          </AlertTitle>
          <Stack spacing={1}>
            {identityFailure ? <span>{identityFailure}</span> : null}
            <span>{failure.message}</span>
            {identity ? (
              <span>
                Whatever is ticked above really exists. A failure here undoes nothing,
                so finish from where it stopped rather than starting again.
              </span>
            ) : null}
          </Stack>
        </Alert>
      ) : null}

      {identity ? (
        <Stack spacing={0.5}>
          <Typography variant="caption" color="text.secondary">
            What now exists in the school record
          </Typography>
          <CopyableId label="Person" value={identity.personId} />
          {state.studentId ? <CopyableId label="Pupil" value={state.studentId} /> : null}
          {state.staffId ? <CopyableId label="Staff" value={state.staffId} /> : null}
          {state.teacherId ? <CopyableId label="Teacher" value={state.teacherId} /> : null}
          {state.enrolmentId ? (
            <CopyableId label="Enrolment" value={state.enrolmentId} />
          ) : null}
        </Stack>
      ) : null}

      {failure ? (
        <Box>
          <Button variant="contained" onClick={onRetry} disabled={state.busy}>
            {state.failedAt === 'identity' ? 'Try again' : 'Carry on from here'}
          </Button>
        </Box>
      ) : null}
    </Stack>
  );
}
