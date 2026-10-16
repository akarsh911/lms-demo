import type { Components, Theme } from '@mui/material/styles';

import type { GradeBand } from '../bands';
import { INK_RGB, ember, glow, moss, tide } from '../colors';
import { brand, fonts } from '../tokens';

export function feedback(band: GradeBand): Components<Theme> {
  return {
    // Quiet by default: a tinted panel with a coloured mark, so ten notices on a page do not shout at once.
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: band.radius.md,
          fontSize: band.type.base - 0.5,
          alignItems: 'flex-start',
          variants: [
            { props: { variant: 'outlined', severity: 'info' }, style: { backgroundColor: tide[50], borderColor: tide[200], color: tide[700] } },
            { props: { variant: 'outlined', severity: 'success' }, style: { backgroundColor: moss[50], borderColor: moss[200], color: moss[700] } },
            { props: { variant: 'outlined', severity: 'warning' }, style: { backgroundColor: glow[50], borderColor: glow[200], color: glow[700] } },
            { props: { variant: 'outlined', severity: 'error' }, style: { backgroundColor: ember[50], borderColor: ember[200], color: ember[700] } },
          ],
        },
        message: { paddingBlock: 9 },
      },
    },

    MuiAlertTitle: { styleOverrides: { root: { fontWeight: 700, fontSize: band.type.base, marginBottom: 2 } } },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: brand.ink,
          borderRadius: band.radius.sm,
          fontFamily: fonts.sans,
          fontSize: band.type.min,
          fontWeight: 500,
          padding: '6px 10px',
        },
        arrow: { color: brand.ink },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: '999px', height: band.ornament === 'rich' ? 10 : 6, backgroundColor: brand.sunken },
        bar: { borderRadius: '999px' },
      },
    },

    MuiSkeleton: {
      defaultProps: { animation: 'wave' },
      styleOverrides: { root: { backgroundColor: `rgb(${INK_RGB} / 0.07)` }, rounded: { borderRadius: band.radius.sm + 2 } },
    },
  };
}
