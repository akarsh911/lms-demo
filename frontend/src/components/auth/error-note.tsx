import * as React from 'react';
import Alert from '@mui/material/Alert';

import { signInErrorText } from '@/lib/auth/messages';
import type { SignInError } from '@/server/actions/auth';

export function ErrorNote({ error }: { error: SignInError | undefined }): React.ReactElement | null {
  if (!error) return null;
  return (
    <Alert severity="error" role="alert">
      {signInErrorText(error)}
    </Alert>
  );
}
