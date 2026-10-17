'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { EmergeLogo } from '@/components/brand/emerge-logo';

// The student's whole screen: no sidebar, no account, one column sized for a phone.
export function StudentFrame({ children, wide = false }: { children: React.ReactNode; wide?: boolean }): React.ReactElement {
  return (
    <Box sx={(t) => ({ minHeight: '100dvh', bgcolor: t.brand.canvas, display: 'flex', flexDirection: 'column' })}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', px: 2.5, py: 1.75 }}>
        <EmergeLogo height={22} />
        <Box sx={(t) => ({ width: '1px', height: 18, bgcolor: t.brand.line2 })} />
        <Typography variant="eyebrow" color="text.secondary">
          GRASP
        </Typography>
      </Stack>
      <Box sx={{ flex: 1, width: '100%', maxWidth: wide ? 760 : 560, mx: 'auto', px: 2.5, pb: 4, display: 'flex', flexDirection: 'column' }}>{children}</Box>
    </Box>
  );
}
