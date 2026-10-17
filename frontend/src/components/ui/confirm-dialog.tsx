'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

// Asks before something is removed, and says what will happen in the button itself.
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  tone = 'danger',
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  // Red for something being removed; the ordinary primary for a step forward that still deserves a second look.
  tone?: 'danger' | 'primary';
  pending: boolean;
  error?: Error | null;
  onConfirm: () => void;
  onClose: () => void;
}): React.ReactElement {
  return (
    <Dialog open onClose={pending ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{body}</DialogContentText>
        {error ? (
          <Alert severity="error" variant="outlined" role="alert" sx={{ mt: 2 }}>
            {error.message}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={pending} autoFocus>
          Cancel
        </Button>
        <Button variant="contained" color={tone === 'danger' ? 'error' : 'primary'} loading={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
