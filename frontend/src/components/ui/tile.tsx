'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import type { TintName } from '@/styles/theme';

/**
 * A large clickable tile — the portal's hero navigation block.
 *
 * The lift on hover uses an overshoot easing (`cubic-bezier(.34,1.4,.64,1)`)
 * rather than a linear ease. That slight overshoot is most of why the younger
 * screens feel toy-like; the duration comes from the band, so a senior screen
 * gets the same gesture at half the length and it reads as brisk instead.
 */
export function Tile({
  title,
  meta,
  tone = 'orange',
  art,
  onClick,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  tone?: TintName;
  /** Decorative illustration. Only drawn on bands that permit ornament. */
  art?: React.ReactNode;
  onClick?: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const showArt = art && theme.band.ornament !== 'minimal';

  const surface = {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: `${theme.band.radius.lg}px`,
    p: 2.25,
    minHeight: theme.band.ornament === 'rich' ? 170 : 132,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    textAlign: 'left',
    backgroundColor: theme.tints[tone],
  } as const;

  const body = (
    <>
      <Typography
        sx={{
          fontSize: theme.band.type.h4,
          fontFamily: theme.typography.h1.fontFamily,
          fontWeight: 800,
          lineHeight: 1.15,
          letterSpacing: '-0.3px',
          position: 'relative',
          zIndex: 1,
          maxWidth: '65%',
          color: theme.brand.ink,
        }}
      >
        {title}
      </Typography>

      {meta ? (
        <Box sx={{ position: 'relative', zIndex: 1, mt: 1.5 }}>{meta}</Box>
      ) : null}

      {showArt ? (
        <Box
          aria-hidden="true"
          sx={{ position: 'absolute', right: -8, bottom: -8, opacity: 0.9, pointerEvents: 'none' }}
        >
          {art}
        </Box>
      ) : null}
    </>
  );

  if (!onClick) return <Box sx={surface}>{body}</Box>;

  return (
    <ButtonBase
      component="div"
      onClick={onClick}
      sx={{
        ...surface,
        transition: `transform ${theme.band.motion.base}ms cubic-bezier(.34,1.4,.64,1), box-shadow ${theme.band.motion.base}ms`,
        '&:hover': { transform: 'translateY(-3px)', boxShadow: theme.shadows[4] },
        '&.Mui-focusVisible': { boxShadow: `0 0 0 2px ${theme.brand.accentHi}` },
      }}
    >
      {body}
    </ButtonBase>
  );
}
