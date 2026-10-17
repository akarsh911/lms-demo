'use client';

import * as React from 'react';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { Avatar } from '@/components/ui/row';

export function PersonHeader({
  name,
  subtitle,
  chips,
  isPending,
}: {
  name: string | null;
  subtitle?: string | null;
  chips?: readonly string[];
  isPending: boolean;
}): React.ReactElement {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
      <Avatar name={name ?? '?'} size={52} />
      <Stack spacing={0.5} sx={{ minWidth: 0 }}>
        <Typography variant="h2" component="h1" sx={{ wordBreak: 'break-word' }}>
          {isPending ? (
            <Skeleton variant="text" width={220} sx={{ maxWidth: '100%' }} />
          ) : (
            (name ?? 'Name not shown to you')
          )}
        </Typography>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        ) : null}
        {chips && chips.length > 0 ? (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, pt: 0.5 }}>
            {chips.map((chip) => (
              <EmergeChip key={chip} label={chip} />
            ))}
          </Stack>
        ) : null}
      </Stack>
    </Stack>
  );
}
