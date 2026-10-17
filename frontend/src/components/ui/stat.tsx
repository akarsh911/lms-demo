'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import type { TintName } from '@/styles/theme';

/**
 * A single KPI: tinted icon square, big value, small label.
 *
 * The value is the loudest thing on the row — 800 weight with negative
 * letter-spacing, because a number set at normal tracking at this size looks
 * loose and unconsidered.
 */
export interface StatProps {
  value: React.ReactNode;
  label: string;
  icon?: React.ReactNode;
  tone?: TintName;
}

export function Stat({ value, label, icon, tone = 'orange' }: StatProps): React.ReactElement {
  const theme = useTheme();

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
      {icon ? (
        <Box
          sx={{
            width: theme.band.control.md,
            height: theme.band.control.md,
            borderRadius: `${theme.band.radius.sm}px`,
            display: 'grid',
            placeItems: 'center',
            flex: 'none',
            backgroundColor: theme.tints[tone],
            color: theme.brand.ink,
          }}
        >
          {icon}
        </Box>
      ) : null}
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: theme.band.type.h4,
            fontFamily: theme.typography.h1.fontFamily,
            fontWeight: 800,
            color: theme.brand.ink,
            lineHeight: 1.15,
            letterSpacing: '-0.3px',
          }}
        >
          {value}
        </Typography>
        <Typography
          sx={{ fontSize: theme.band.type.min, color: theme.brand.tert, fontWeight: 600 }}
        >
          {label}
        </Typography>
      </Box>
    </Box>
  );
}
