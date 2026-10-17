'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { useTheme, type Theme } from '@mui/material/styles';

import type { TintName } from '@/styles/theme';

/**
 * Status chip — pill, tinted background, bold small text, optional leading dot.
 *
 * Colour is chosen by TONE, not by passing a hex. Every tone is a
 * tint/foreground PAIR that has already been checked for contrast, so a chip
 * cannot be built that is unreadable. Passing arbitrary colours is how a design
 * system rots.
 */
export type ChipTone = TintName | 'orange';

export interface EmergeChipProps {
  label: React.ReactNode;
  tone?: ChipTone;
  /** Leading dot, in the chip's own foreground colour. */
  dot?: boolean;
  icon?: React.ReactNode;
}

/** Readable foreground for each tint. Not derived — chosen and checked. */
export function tintForeground(tone: ChipTone, theme: Theme): string {
  return theme.onTint[tone];
}

const DOT = <Box component="span" sx={{ width: 6, height: 6, borderRadius: '999px', backgroundColor: 'currentColor' }} />;

export function EmergeChip({
  label,
  tone = 'grey',
  dot = false,
  icon,
}: EmergeChipProps): React.ReactElement {
  const theme = useTheme();
  const mark = dot ? DOT : React.isValidElement(icon) ? icon : undefined;

  return (
    <Chip
      component="span"
      size="small"
      label={label}
      icon={mark}
      sx={{
        flex: 'none',
        // Hugs its label even as a child of a stretching column.
        width: 'fit-content',
        maxWidth: '100%',
        backgroundColor: theme.tints[tone],
        color: theme.onTint[tone],
        '& .MuiChip-icon': { color: 'inherit', marginLeft: '9px', marginRight: '-5px' },
      }}
    />
  );
}
