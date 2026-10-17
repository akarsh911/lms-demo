'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import type { ProvisionRequest } from '@/types/people-write';

export interface IdentityDraft {
  username: string;
  email: string;
  phone: string;
  firstName: string;
  middleName: string;
  lastName: string;
  displayName: string;
  password: string;
}

export const EMPTY_IDENTITY: IdentityDraft = {
  username: '',
  email: '',
  phone: '',
  firstName: '',
  middleName: '',
  lastName: '',
  displayName: '',
  password: '',
};

export function identityUsable(draft: IdentityDraft): boolean {
  return draft.username.trim() !== '' && draft.firstName.trim() !== '';
}

export function provisionRequestOf(
  draft: IdentityDraft,
  groupKey: string,
): ProvisionRequest {
  const body: ProvisionRequest = {
    username: draft.username.trim(),
    first_name: draft.firstName.trim(),
    group_keys: [groupKey],
  };
  if (draft.email.trim() !== '') body.email = draft.email.trim();
  if (draft.phone.trim() !== '') body.phone = draft.phone.trim();
  if (draft.middleName.trim() !== '') body.middle_name = draft.middleName.trim();
  if (draft.lastName.trim() !== '') body.last_name = draft.lastName.trim();
  if (draft.displayName.trim() !== '') body.display_name = draft.displayName.trim();
  if (draft.password !== '') body.password = draft.password;
  return body;
}

export function IdentityFields({
  value,
  onChange,
  disabled,
}: {
  value: IdentityDraft;
  onChange: (next: IdentityDraft) => void;
  disabled: boolean;
}): React.ReactElement {
  const set = (patch: Partial<IdentityDraft>): void => onChange({ ...value, ...patch });

  return (
    <Stack spacing={2}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        Who they are
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="First name"
          size="small"
          value={value.firstName}
          onChange={(event) => set({ firstName: event.target.value })}
          disabled={disabled}
          required
          fullWidth
          error={value.firstName.trim() === '' && value.username.trim() !== ''}
          helperText="Required."
        />
        <TextField
          label="Middle name"
          size="small"
          value={value.middleName}
          onChange={(event) => set({ middleName: event.target.value })}
          disabled={disabled}
          fullWidth
          helperText="Optional."
        />
        <TextField
          label="Last name"
          size="small"
          value={value.lastName}
          onChange={(event) => set({ lastName: event.target.value })}
          disabled={disabled}
          fullWidth
          helperText="Optional."
        />
      </Stack>

      <TextField
        label="Name to show"
        size="small"
        value={value.displayName}
        onChange={(event) => set({ displayName: event.target.value })}
        disabled={disabled}
        helperText="What the school calls them on screen. Left empty, their first and last name is used."
      />

      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        How they sign in
      </Typography>

      <TextField
        label="Username"
        size="small"
        value={value.username}
        onChange={(event) => set({ username: event.target.value })}
        disabled={disabled}
        required
        autoComplete="off"
        error={value.username.trim() === '' && value.firstName.trim() !== ''}
        helperText="Required, and this is what they type to sign in."
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Email"
          size="small"
          type="email"
          value={value.email}
          onChange={(event) => set({ email: event.target.value })}
          disabled={disabled}
          fullWidth
          autoComplete="off"
          helperText="Optional here, but it is how most people are found later."
        />
        <TextField
          label="Phone"
          size="small"
          value={value.phone}
          onChange={(event) => set({ phone: event.target.value })}
          disabled={disabled}
          fullWidth
          autoComplete="off"
          helperText="Optional."
        />
      </Stack>

      <Alert severity="info" variant="outlined">
        A username or email that already exists is not refused: this attaches the new
        record to that existing person and to their existing password, rather than
        creating a second identity. Check both before saving, and read what comes back —
        it says which of the two happened.
      </Alert>

      <TextField
        label="Password"
        size="small"
        type="password"
        value={value.password}
        onChange={(event) => set({ password: event.target.value })}
        disabled={disabled}
        autoComplete="new-password"
        helperText={
          value.password === ''
            ? 'Leave this empty and one is generated and shown to you once, on the next screen.'
            : 'Setting one yourself means nothing is shown back: you are the only channel it has.'
        }
      />
    </Stack>
  );
}
