import type { Components, Theme } from '@mui/material/styles';

import type { GradeBand } from '../bands';
import { INK_RGB } from '../colors';
import { brand, shadows } from '../tokens';

declare module '@mui/material/Paper' {
  interface PaperPropsVariantOverrides {
    ink: true;
    glass: true;
  }
}

// Approximates frosted glass with `backdrop-filter`; it only reads as glass with artwork or colour behind it.
const GLASS = {
  backgroundColor: 'rgb(255 255 255 / 0.62)',
  backdropFilter: 'blur(18px) saturate(170%)',
  WebkitBackdropFilter: 'blur(18px) saturate(170%)',
  border: '1px solid rgb(255 255 255 / 0.75)',
  boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.85), 0 18px 40px -26px rgb(${INK_RGB} / 0.45)`,
  '@media (prefers-reduced-transparency: reduce)': { backgroundColor: brand.surface, backdropFilter: 'none' },
} as const;

export function surfaces(band: GradeBand): Components<Theme> {
  const flat = band.depth === 'flat';

  return {
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
        rounded: { borderRadius: band.radius.lg },
      },
      variants: [
        // The one dark tile a dashboard is allowed, for the thing that matters most on the page.
        { props: { variant: 'ink' }, style: { backgroundColor: brand.ink, color: '#FFFFFF', border: `1px solid ${brand.ink}` } },
        { props: { variant: 'glass' }, style: GLASS },
      ],
    },

    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: brand.surface,
          border: `1px solid ${brand.line2}`,
          borderRadius: band.radius.lg,
          boxShadow: flat ? 'none' : shadows.card,
          variants: [
            { props: { variant: 'ink' }, style: { backgroundColor: brand.ink, borderColor: brand.ink, color: '#FFFFFF' } },
            { props: { variant: 'glass' }, style: GLASS },
          ],
        },
      },
    },

    // A card has fixed regions: a header band over a hairline, a padded body, and a soft footer strip.
    MuiCardHeader: {
      defaultProps: { slotProps: { title: { variant: 'h4' }, subheader: { variant: 'body2' } } },
      styleOverrides: {
        // Wraps, so on a phone the action drops under the title instead of crushing it.
        root: { padding: '18px 24px', alignItems: 'center', flexWrap: 'wrap', gap: '12px 16px', borderBottom: `1px solid ${brand.line}` },
        content: { minWidth: 0, flex: '1 1 220px' },
        action: { alignSelf: 'center', margin: 0, maxWidth: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
        subheader: { color: brand.sub, marginTop: 2 },
      },
    },

    MuiCardContent: {
      styleOverrides: { root: { padding: 24, '&:last-child': { paddingBottom: 24 } } },
    },

    MuiCardActions: {
      styleOverrides: {
        root: { padding: '12px 24px', gap: 4, borderTop: `1px solid ${brand.line}`, backgroundColor: brand.subtle },
      },
    },

    MuiDivider: { styleOverrides: { root: { borderColor: brand.line } } },

    MuiDialog: {
      // 600px unless a dialog asks for less: a form in a 444px box reads as an afterthought.
      defaultProps: { fullWidth: true, maxWidth: 'sm' },
      styleOverrides: {
        paper: {
          borderRadius: band.radius.xl,
          border: `1px solid ${brand.line2}`,
          backgroundColor: brand.surface,
          boxShadow: shadows.pop,
        },
      },
    },

    // A plain ink scrim. No blur: the page behind stays readable, only set back.
    MuiBackdrop: {
      styleOverrides: {
        root: { backgroundColor: `rgb(${INK_RGB} / 0.4)` },
        invisible: { backgroundColor: 'transparent' },
      },
    },

    // A dialog is a small page: a real title, a divided body, and room around both.
    MuiDialogTitle: { defaultProps: { variant: 'h3' }, styleOverrides: { root: { padding: '22px 28px 18px' } } },
    MuiDialogContent: {
      styleOverrides: {
        root: { padding: '8px 28px 20px' },
        dividers: { padding: '24px 28px', borderColor: brand.line },
      },
    },
    MuiDialogActions: { styleOverrides: { root: { padding: '16px 28px', gap: 8 } } },

    MuiDrawer: {
      styleOverrides: { paper: { backgroundColor: brand.surface, borderRight: `1px solid ${brand.line2}` } },
    },

    MuiAccordion: {
      defaultProps: { disableGutters: true, elevation: 0 },
      styleOverrides: {
        root: {
          border: `1px solid ${brand.line2}`,
          borderRadius: band.radius.md,
          '&::before': { display: 'none' },
          '& + &': { marginTop: 8 },
        },
      },
    },

    MuiPopover: {
      styleOverrides: {
        paper: { borderRadius: band.radius.md, border: `1px solid ${brand.line2}`, boxShadow: shadows.raised },
      },
    },
  };
}
