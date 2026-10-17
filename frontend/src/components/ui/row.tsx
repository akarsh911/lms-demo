'use client';

import * as React from 'react';
import MuiAvatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

/**
 * A list row: leading slot, title + subtitle that truncate, trailing slot.
 *
 * Both text lines truncate with an ellipsis rather than wrapping. In a list of
 * students or assignments a wrapping row changes height and the whole list
 * becomes ragged; a truncated one stays scannable.
 */
export function Row({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
}): React.ReactElement {
  const theme = useTheme();

  const body = (
    <>
      {leading}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" noWrap sx={{ fontSize: theme.band.type.base - 1, color: theme.brand.ink }}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography noWrap sx={{ fontSize: theme.band.type.min + 0.5, color: theme.brand.tert, mt: '1px' }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {trailing ? <Box sx={{ flex: 'none' }}>{trailing}</Box> : null}
    </>
  );

  const layout = { display: 'flex', alignItems: 'center', gap: 1.5, py: 1.4 } as const;

  if (!onClick) return <Box sx={layout}>{body}</Box>;

  // ButtonBase, not a div with a role: focus ring, Enter and Space, and the ripple come with it.
  return (
    <ButtonBase
      component="div"
      onClick={onClick}
      sx={{
        ...layout,
        width: '100%',
        justifyContent: 'flex-start',
        textAlign: 'left',
        borderRadius: `${theme.band.radius.sm}px`,
        '&:hover': { backgroundColor: theme.brand.subtle },
        '&.Mui-focusVisible': { backgroundColor: theme.brand.subtle, boxShadow: `0 0 0 2px ${theme.brand.accentHi}` },
      }}
    >
      {body}
    </ButtonBase>
  );
}

/**
 * Initials avatar. Deterministic tint from the name, so the same person is the
 * same colour on every screen without anyone storing a colour.
 */
export function Avatar({
  name,
  size = 34,
  ring = false,
}: {
  name: string;
  size?: number;
  ring?: boolean;
}): React.ReactElement {
  const theme = useTheme();
  const tones = ['orange', 'teal', 'violet', 'green', 'blue', 'coral', 'indigo'] as const;
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const tone = tones[hash % tones.length]!;

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <MuiAvatar
      aria-hidden="true"
      sx={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        flex: 'none',
        backgroundColor: theme.tints[tone],
        color: theme.onTint[tone],
        ...(ring ? { boxShadow: `0 0 0 2px ${theme.brand.surface}, 0 0 0 4px ${theme.tints.orange}` } : {}),
      }}
    >
      {initials}
    </MuiAvatar>
  );
}
