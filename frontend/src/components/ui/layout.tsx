'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

/**
 * Page and section headers, and the grid helper.
 *
 * These exist so that "the title of a page" is one decision made once, rather
 * than a `<Typography variant="h2">` copied around with slightly different
 * margins each time. The portal is visually consistent precisely because these
 * are not re-typed per screen.
 */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}): React.ReactElement {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 2.5,
        mb: 2.5,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="h1"
          sx={{
            fontSize: theme.band.type.h1,
            fontFamily: theme.typography.h1.fontFamily,
            fontWeight: 800,
            letterSpacing: '-0.5px',
            color: theme.brand.ink,
            lineHeight: 1.2,
          }}
        >
          {title}
        </Typography>
        {subtitle ? (
          <Typography sx={{ fontSize: theme.band.type.base, color: theme.brand.sub, mt: 0.5 }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {actions ? (
        <Box sx={{ flex: 'none', display: 'flex', gap: 1, alignItems: 'center' }}>{actions}</Box>
      ) : null}
    </Box>
  );
}

export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}): React.ReactElement {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
        mb: 1.75,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="h2"
          sx={{
            fontSize: theme.band.type.h3,
            fontFamily: theme.typography.h1.fontFamily,
            fontWeight: 800,
            color: theme.brand.ink,
            letterSpacing: '-0.2px',
            lineHeight: 1.25,
          }}
        >
          {title}
        </Typography>
        {subtitle ? (
          <Typography
            sx={{ fontSize: theme.band.type.min + 1, color: theme.brand.tert, mt: '2px' }}
          >
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {actions ? (
        <Box sx={{ flex: 'none', display: 'flex', gap: 1, alignItems: 'center' }}>{actions}</Box>
      ) : null}
    </Box>
  );
}

/**
 * Equal-column grid. `cols` is the DESKTOP count; it always collapses to one
 * column on small screens, which is why this exists rather than a raw
 * `display:grid` — the collapse is the bit people forget.
 */
export function Grid({
  cols = 2,
  gap = 2,
  children,
}: {
  cols?: 1 | 2 | 3 | 4 | 5;
  gap?: number;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box
      sx={{
        display: 'grid',
        gap,
        gridTemplateColumns: { xs: '1fr', md: `repeat(${cols}, minmax(0, 1fr))` },
      }}
    >
      {children}
    </Box>
  );
}

/** A horizontal rule in the system's line colour. */
export function Divider(): React.ReactElement {
  const theme = useTheme();
  return <Box sx={{ height: '1px', backgroundColor: theme.brand.line }} />;
}
