'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';

import { paths } from '@/paths';

import { StudentFrame } from './student-frame';

export function EnterCode(): React.ReactElement {
  const router = useRouter();
  const [code, setCode] = React.useState('');
  const digits = code.replace(/\D/g, '');
  return (
    <StudentFrame>
      <Stack spacing={3} sx={{ my: 'auto', textAlign: 'center' }}>
        <div>
          <Typography variant="h2" component="h1">
            Hand in your homework
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Enter the code on the board.
          </Typography>
        </div>
        <Stack component="form" spacing={2} onSubmit={(e) => (e.preventDefault(), digits.length === 6 && router.push(paths.graspJoin(digits)))}>
          <TextField
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123 456"
            slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': 'Code', style: { textAlign: 'center', fontSize: 34, letterSpacing: '0.18em', fontWeight: 700 } } }}
          />
          <Button type="submit" variant="contained" size="large" disabled={digits.length !== 6}>
            Join
          </Button>
        </Stack>
      </Stack>
    </StudentFrame>
  );
}
