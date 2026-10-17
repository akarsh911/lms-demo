'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { DEMO_ACCOUNTS, type DemoAccount } from '@/constants/demo-accounts';

// Dev bypass only: one quiet line of sample sign-ins, each filling the form when picked.
export function DemoAccounts({ onPick }: { onPick: (account: DemoAccount) => void }): React.ReactElement {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', columnGap: 0.5, rowGap: 0.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
        Try a demo:
      </Typography>
      {DEMO_ACCOUNTS.map((account) => (
        <Button key={account.user} size="small" variant="text" onClick={() => onPick(account)} title={`${account.identifier} · ${account.password}`} sx={{ minWidth: 0, px: 1, typography: 'caption', fontWeight: 600 }}>
          {account.label}
        </Button>
      ))}
    </Stack>
  );
}
