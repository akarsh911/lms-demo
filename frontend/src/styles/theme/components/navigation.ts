import type { Components, Theme } from '@mui/material/styles';

import type { GradeBand } from '../bands';
import { INK_RGB, ink } from '../colors';
import { brand, fonts, shadows } from '../tokens';

export function navigation(band: GradeBand): Components<Theme> {
  return {
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'transparent' },
      styleOverrides: { root: { backgroundColor: 'transparent', backgroundImage: 'none' } },
    },

    // A selected row is a rose pill: the one filled mark in a column of quiet rows.
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: '999px',
          minHeight: band.control.md,
          color: ink[800],
          transition: 'background-color 140ms, color 140ms',
          '&:hover': { backgroundColor: `rgb(${INK_RGB} / 0.06)` },
          '&.Mui-selected': {
            backgroundColor: brand.accent,
            color: '#FFFFFF',
            '&:hover': { backgroundColor: brand.accentLo },
          },
          '&.Mui-focusVisible': { backgroundColor: `rgb(${INK_RGB} / 0.06)`, boxShadow: shadows.focus },
          '&.Mui-selected.Mui-focusVisible': { backgroundColor: brand.accent },
        },
      },
    },

    MuiTabs: {
      styleOverrides: {
        root: { minHeight: band.control.md + 6 },
        indicator: { height: 2, borderRadius: 2, backgroundColor: brand.accent },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontFamily: fonts.sans,
          fontSize: band.type.base,
          fontWeight: 600,
          minHeight: band.control.md + 6,
          color: brand.sub,
          '&.Mui-selected': { color: brand.ink },
        },
      },
    },

    MuiBreadcrumbs: {
      styleOverrides: {
        root: { fontSize: band.type.min, color: brand.tert },
        separator: { marginInline: 6 },
      },
    },

    MuiLink: {
      defaultProps: { underline: 'hover' },
      styleOverrides: { root: { color: brand.accent, fontWeight: 600 } },
    },
  };
}
