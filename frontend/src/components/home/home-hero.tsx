'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { PaperArt } from '@/components/brand/paper-art';
import { useIdentity } from '@/hooks/query/use-identity';

function greetingAt(time: number): string {
  const hour = new Date(time).getHours();
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function longDate(time: number): string {
  return new Date(time).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function HomeHero({ roleName }: { roleName: string }): React.ReactElement {
  const theme = useTheme();
  const { data, dataUpdatedAt, errorUpdatedAt } = useIdentity();

  // The query's own clock, so the greeting is computed from a value React was handed rather than read mid-render.
  const settledAt = dataUpdatedAt || errorUpdatedAt;
  const firstName = data?.person?.first_name ?? data?.person?.display_name?.split(' ')[0];
  const school = data?.school?.name;

  return (
    <Box
      component="header"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto' },
        alignItems: 'end',
        gap: 3,
        pt: { xs: 1, md: 2 },
      }}
    >
      <Stack spacing={1.25} sx={{ minWidth: 0, pb: { md: 1 } }}>
        {settledAt ? (
          <>
            <Typography variant="eyebrow" component="p" color="text.secondary">
              {[longDate(settledAt), school].filter(Boolean).join(' · ')}
            </Typography>
            <Typography variant="display" component="h1" sx={{ textWrap: 'balance' }}>
              {greetingAt(settledAt)}
              {firstName ? `, ${firstName}` : ''}
              <Box component="span" sx={{ color: 'primary.main' }}>
                .
              </Box>
            </Typography>
          </>
        ) : (
          <>
            <Skeleton variant="text" width={220} sx={{ fontSize: 12 }} />
            <Skeleton variant="rounded" width="min(520px, 80%)" height={56} />
          </>
        )}
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '52ch' }}>
          Your {roleName.toLowerCase()} dashboard. Today at a glance, and everything else one step away in the menu.
        </Typography>
      </Stack>

      {theme.band.ornament !== 'minimal' ? (
        <PaperArt name="shelf" width={{ md: 300, lg: 360, xl: 420 }} sx={{ display: { xs: 'none', md: 'block' }, mb: -1 }} />
      ) : null}
    </Box>
  );
}
