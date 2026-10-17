'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

export function MdmDialog({
  open,
  onClose,
  formKey,
  maxWidth = 'sm',
  children,
}: {
  open: boolean;
  onClose: () => void;
  formKey: string;
  maxWidth?: 'xs' | 'sm' | 'md';
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth={maxWidth}>
      {open ? <React.Fragment key={formKey}>{children}</React.Fragment> : null}
    </Dialog>
  );
}

export function MdmFormError({ error }: { error: Error | null }): React.ReactElement | null {
  if (!error) return null;
  return (
    <Alert severity="error" variant="outlined">
      {error.message}
    </Alert>
  );
}

export function MdmFormActions({
  onDelete,
  onCancel,
  onSave,
  busy,
  canSave,
}: {
  onDelete?: () => void;
  onCancel: () => void;
  onSave: () => void;
  busy: boolean;
  canSave: boolean;
}): React.ReactElement {
  return (
    <DialogActions sx={{ justifyContent: 'space-between' }}>
      <span>
        {onDelete ? (
          <Button color="error" size="small" disabled={busy} onClick={onDelete}>
            Delete
          </Button>
        ) : null}
      </span>
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onSave} disabled={busy || !canSave}>
          Save
        </Button>
      </Stack>
    </DialogActions>
  );
}

export function StatusSelect({
  value,
  onChange,
  options = ['active', 'inactive'],
  labels,
}: {
  value: string;
  onChange: (next: string) => void;
  options?: readonly string[];
  labels?: Record<string, string>;
}): React.ReactElement {
  return (
    <TextField
      select
      label="Status"
      size="small"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <MenuItem key={option} value={option}>
          {labels?.[option] ?? option}
        </MenuItem>
      ))}
    </TextField>
  );
}
