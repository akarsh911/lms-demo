'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

/**
 * A compact label-over-value readout for a toolbar: Score 72/100, Time 4:05.
 *
 * `Stat` is the dashboard KPI (icon square, big number). This is its small
 * sibling for a header strip, where several sit in a row and must not shout.
 * `tone="bad"` colours the value, for a count that should not be climbing.
 */
export function Metric({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  suffix?: React.ReactNode;
  tone?: 'bad';
}): React.ReactElement {
  const theme = useTheme();
  return (
    <Box
      sx={{
        backgroundColor: theme.brand.surface,
        border: `1px solid ${theme.brand.line}`,
        borderRadius: `${theme.band.radius.sm}px`,
        px: 1.25,
        py: 0.5,
        minWidth: 76,
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'block',
          ...theme.typography.eyebrow,
          color: theme.brand.tert,
        }}
      >
        {label}
      </Box>
      <Box
        component="span"
        sx={{
          fontSize: theme.band.type.h4,
          fontFamily: theme.typography.h1.fontFamily,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          color: tone === 'bad' ? theme.hues.red : theme.brand.ink,
        }}
      >
        {value}
      </Box>
      {suffix ? (
        <Box component="span" sx={{ color: theme.brand.tert, fontSize: theme.band.type.min + 0.5, ml: 0.25 }}>
          {suffix}
        </Box>
      ) : null}
    </Box>
  );
}
