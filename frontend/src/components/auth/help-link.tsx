'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';

// Accounts and passwords belong to the school, so every help path ends at the school office.
export function HelpLink({ label = 'Help & support', variant = 'caption' }: { label?: string; variant?: 'caption' | 'body2' }): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Link component="button" type="button" variant={variant} color={variant === 'caption' ? 'text.secondary' : 'primary'} underline="hover" onClick={() => setOpen(true)} sx={{ fontWeight: variant === 'body2' ? 500 : 400 }}>
        {label}
      </Link>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Help with signing in</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Your school creates your Emerge account and can reset your password. Ask your class teacher or the school office, and have your school ID ready.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Got It</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
