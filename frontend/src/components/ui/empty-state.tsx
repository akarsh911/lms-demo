'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

/**
 * Empty state — centred, with room for an illustration on bands that allow one.
 *
 * Always say what the user can DO. "No assignments" is a dead end; "No
 * assignments yet — new ones appear here when your teacher sets them" tells
 * them nothing is broken and nothing is required of them.
 */
export function EmptyState({
  title,
  body,
  art,
  action,
}: {
  title: React.ReactNode;
  body?: React.ReactNode;
  art?: React.ReactNode;
  action?: React.ReactNode;
}): React.ReactElement {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 0.75,
        px: 2.5,
        py: 5,
      }}
    >
      {art && theme.band.ornament !== 'minimal' ? (
        <Box aria-hidden="true" sx={{ mb: 1 }}>
          {art}
        </Box>
      ) : null}
      <Typography sx={{ fontFamily: theme.typography.h1.fontFamily, fontWeight: 800, fontSize: theme.band.type.h4, color: theme.brand.ink }}>
        {title}
      </Typography>
      {body ? (
        <Typography
          sx={{
            fontSize: theme.band.type.base - 0.5,
            color: theme.brand.sub,
            maxWidth: 340,
            mb: 1.5,
          }}
        >
          {body}
        </Typography>
      ) : null}
      {action}
    </Box>
  );
}
