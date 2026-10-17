'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { AdmissionReport } from './admission-report';
import type { AdmissionState } from '@/hooks/mutation/use-admission';

export function AdmissionShell({
  title,
  subtitle,
  state,
  username,
  editing,
  onEdit,
  acknowledged,
  onAcknowledge,
  canSubmit,
  onSubmit,
  onRetry,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  state: AdmissionState;
  username: string;
  editing: boolean;
  onEdit: () => void;
  acknowledged: boolean;
  onAcknowledge: (next: boolean) => void;
  canSubmit: boolean;
  onSubmit: () => void;
  onRetry: () => void;
  onClose: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const started = state.order.length > 0;
  const showForm = !started || editing;
  const settled = started && !state.busy && !state.error;
  const locked = Boolean(state.identity?.password) && !acknowledged;

  return (
    <>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>

          {showForm ? (
            <>
              {state.identity ? (
                <Alert severity="info" variant="outlined">
                  A person already exists from the attempt before this one, so the
                  identity below is kept as it is and only the remaining records are
                  created. Nothing you change about the name or the sign-in is applied a
                  second time.
                </Alert>
              ) : null}
              {children}
            </>
          ) : (
            <AdmissionReport
              state={state}
              username={username}
              acknowledged={acknowledged}
              onAcknowledge={onAcknowledge}
              onRetry={onRetry}
            />
          )}

          {!showForm && settled ? (
            <Alert severity="success" variant="outlined">
              Everything above was created. They are on the school record now.
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <span>
          {!showForm && state.error ? (
            <Button size="small" onClick={onEdit} disabled={state.busy}>
              Change the details
            </Button>
          ) : null}
        </span>
        <Stack direction="row" spacing={1}>
          {showForm ? (
            <>
              <Button variant="outlined" onClick={onClose} disabled={state.busy}>
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={onSubmit}
                disabled={state.busy || !canSubmit}
              >
                {state.identity ? 'Carry on' : 'Create them'}
              </Button>
            </>
          ) : (
            <Button variant="contained" onClick={onClose} disabled={state.busy || locked}>
              {locked ? 'Tick the box above to close' : 'Done'}
            </Button>
          )}
        </Stack>
      </DialogActions>
    </>
  );
}
