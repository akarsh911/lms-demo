import type { Components, Theme } from '@mui/material/styles';

import type { GradeBand } from '../bands';
import { INK_RGB } from '../colors';
import { brand, fonts, shadows } from '../tokens';

export function buttons(band: GradeBand): Components<Theme> {
  return {
    MuiButtonBase: { defaultProps: { disableRipple: false } },

    // Three tones and no more: rose for the one action that matters, an ink outline for the rest, ink text for the quiet ones.
    MuiButton: {
      defaultProps: { disableElevation: true, disableFocusRipple: true },
      styleOverrides: {
        root: {
          borderRadius: '999px',
          minHeight: band.control.md,
          paddingInline: 18,
          whiteSpace: 'nowrap',
          transition: 'background-color 160ms, border-color 160ms, color 160ms, transform 120ms',
          '&:active': { transform: 'scale(0.98)' },
          '&.Mui-focusVisible': { boxShadow: shadows.focus },
          variants: [
            {
              props: { variant: 'contained', color: 'primary' },
              style: { backgroundColor: brand.accent, color: '#FFFFFF', '&:hover': { backgroundColor: brand.accentLo } },
            },
            {
              props: { variant: 'outlined', color: 'primary' },
              // A solid surface, so it never reads as see-through over the paper artwork.
              style: {
                backgroundColor: brand.surface,
                borderColor: brand.line2,
                color: brand.ink,
                boxShadow: `0 1px 2px rgb(${INK_RGB} / 0.06)`,
                '&:hover': { backgroundColor: brand.subtle, borderColor: brand.ink },
              },
            },
            // Ink, not the accent: a table with a name and an Edit on every row would otherwise be a column of red.
            {
              props: { variant: 'text', color: 'primary' },
              style: { color: brand.ink, '&:hover': { backgroundColor: `rgb(${INK_RGB} / 0.06)` } },
            },
            {
              props: { variant: 'outlined', color: 'inherit' },
              style: { backgroundColor: brand.surface, borderColor: brand.line2, '&:hover': { borderColor: brand.ink, backgroundColor: brand.subtle } },
            },
          ],
        },
        sizeSmall: { minHeight: band.control.sm, paddingInline: 14, fontSize: band.type.min + 1 },
        sizeLarge: { minHeight: band.control.lg, paddingInline: 24, fontSize: band.type.base },
        startIcon: { marginRight: 6 },
        endIcon: { marginLeft: 6 },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: band.radius.sm + 2,
          color: brand.sub,
          '&:hover': { backgroundColor: `rgb(${INK_RGB} / 0.06)`, color: brand.ink },
          '&.Mui-focusVisible': { boxShadow: shadows.focus },
        },
      },
    },

    // A segmented control: a sunken track with one raised option.
    MuiToggleButtonGroup: {
      styleOverrides: {
        // 22px, not a full pill: when the options wrap to a second row it still reads as one rounded box.
        root: { backgroundColor: brand.sunken, borderRadius: 22, padding: 4, gap: 2 },
        grouped: { border: 0, borderRadius: '999px !important', margin: 0 },
      },
    },

    MuiToggleButton: {
      styleOverrides: {
        root: {
          border: 0,
          borderRadius: '999px',
          paddingInline: 14,
          paddingBlock: 6,
          color: brand.sub,
          fontFamily: fonts.sans,
          fontSize: band.type.min + 1,
          fontWeight: 600,
          lineHeight: 1.4,
          '&:hover': { backgroundColor: 'transparent', color: brand.ink },
          '&.Mui-selected': {
            backgroundColor: brand.surface,
            color: brand.ink,
            boxShadow: `0 1px 2px rgb(${INK_RGB} / 0.12)`,
            '&:hover': { backgroundColor: brand.surface },
          },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        // '999px', not 999: in `sx` a bare number is multiplied by theme.shape.borderRadius.
        root: { borderRadius: '999px', fontWeight: 600, fontSize: band.type.min, height: band.control.sm - 6 },
        filled: { backgroundColor: brand.sunken, color: brand.ink },
        outlined: { borderColor: brand.line2 },
      },
    },
  };
}
