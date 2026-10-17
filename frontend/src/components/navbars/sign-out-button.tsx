'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import { useFormStatus } from 'react-dom';

import { announceSignedOut } from '@/lib/auth/session-channel';

export function SignOutButton(): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    // `nowrap`: in the top bar's flex row this was breaking into "Sign / out"
    // on a phone, at twice the height of everything beside it.
    <Button type="submit" size="small" color="inherit" disabled={pending} onClick={announceSignedOut} sx={{ whiteSpace: 'nowrap', flex: 'none' }}>
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
