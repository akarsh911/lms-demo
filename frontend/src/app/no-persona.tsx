import * as React from 'react';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';

import { signOut } from '@/server/actions/auth';
import { SignOutButton } from '@/components/navbars/sign-out-button';

/**
 * Signed in, but no group confers a designation.
 *
 * A real state, not an error: the account exists and authenticated correctly,
 * it simply has not been placed in a role-bearing group yet. Showing an error
 * page would send the user to support for something an administrator fixes in
 * one click.
 */
export function NoPersona(): React.ReactElement {
  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', mt: 12, px: 3 }}>
      <Typography variant="h2" gutterBottom>
        Almost there
      </Typography>
      <Alert severity="info" variant="outlined" sx={{ mb: 3 }}>
        Your account is active, but it has not been assigned a role yet. Once your
        school administrator adds you to a group, your dashboard will appear here.
      </Alert>
      <form action={signOut}>
        <SignOutButton />
      </form>
    </Box>
  );
}
