'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';

// One shape for every short form: a title, the fields, the failure shown inside, and a primary that waits.
export function FormDialog({
  open,
  title,
  description,
  submitLabel,
  pending,
  error,
  warning,
  canSubmit = true,
  maxWidth = 'sm',
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  submitLabel: string;
  pending: boolean;
  error?: Error | null;
  // Said, not enforced: the form may still be sent.
  warning?: string | null;
  canSubmit?: boolean;
  maxWidth?: 'sm' | 'md';
  onClose: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    // A save in flight cannot be abandoned by Escape or a click outside.
    <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth={maxWidth}>
      <Box
        component="form"
        noValidate
        onSubmit={(event: React.FormEvent) => {
          event.preventDefault();
          if (canSubmit && !pending) onSubmit();
        }}
      >
        <DialogTitle>
          {title}
          {description ? (
            <DialogContentText component="span" sx={{ display: 'block', mt: 0.5 }}>
              {description}
            </DialogContentText>
          ) : null}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            {error ? (
              <Alert severity="error" variant="outlined" role="alert">
                {error.message}
              </Alert>
            ) : null}
            {children}
            {warning ? (
              <Alert severity="warning" variant="outlined">
                {warning}
              </Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={pending} disabled={!canSubmit}>
            {submitLabel}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
