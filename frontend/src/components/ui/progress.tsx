'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import type { HueName } from '@/styles/theme';

/** Linear progress. Thicker on younger bands, where it is a reward not a readout. */
export function ProgressBar({
  value,
  tone = 'green',
  height,
}: {
  value: number;
  tone?: HueName;
  height?: number;
}): React.ReactElement {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  const h = height ?? (theme.band.ornament === 'rich' ? 10 : 6);

  return (
    <Box
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      sx={{
        height: h,
        borderRadius: '999px',
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: theme.brand.sunken,
      }}
    >
      <Box
        sx={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: '999px',
          backgroundColor: theme.hues[tone],
          transition: `width ${theme.band.motion.slow}ms cubic-bezier(.2,.8,.2,1)`,
        }}
      />
    </Box>
  );
}

/**
 * Circular progress with the value in the middle.
 *
 * The sweep is animated by `stroke-dashoffset` on the same easing the portal
 * uses — it settles rather than stopping dead, which is what makes a number
 * feel earned on a younger screen.
 */
export function ProgressRing({
  value,
  size = 76,
  thickness = 8,
  tone = 'orange',
  label,
}: {
  value: number;
  size?: number;
  thickness?: number;
  tone?: HueName | 'orange';
  label?: string;
}): React.ReactElement {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const colour = tone === 'orange' ? theme.brand.orange : theme.hues[tone];

  return (
    <Box sx={{ position: 'relative', display: 'grid', placeItems: 'center', flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={theme.brand.sunken}
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <Box sx={{ position: 'absolute', textAlign: 'center' }}>
        <Typography sx={{ fontSize: theme.band.type.h4, fontFamily: theme.typography.h1.fontFamily, fontWeight: 800, lineHeight: 1 }}>
          {Math.round(pct)}
          <Box component="span" sx={{ fontSize: theme.band.type.min }}>
            %
          </Box>
        </Typography>
        {label ? (
          <Typography sx={{ fontSize: theme.band.type.min, color: theme.brand.tert }}>
            {label}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}
