'use client';

import * as React from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';

export function ReportSection({
  title,
  children,
  sx,
}: {
  title: string;
  children: React.ReactNode;
  sx?: SxProps<Theme>;
}): React.ReactElement {
  return (
    <Stack spacing={1.5} component="section" sx={sx}>
      <Typography variant="h5" component="h4">
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

export function Quote({ text, turn }: { text: string; turn: number | null }): React.ReactElement {
  return (
    <Typography variant="body2" sx={{ fontStyle: 'italic', mt: 0.5 }}>
      “{text}”{turn !== null ? ` · turn ${turn + 1}` : ''}
    </Typography>
  );
}
