import type { Components, Theme } from '@mui/material/styles';

import type { GradeBand } from '../bands';
import { ink } from '../colors';
import { brand, shadows } from '../tokens';

export function inputs(band: GradeBand): Components<Theme> {
  const radius = band.radius.sm + 2;

  return {
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: radius,
          backgroundColor: brand.surface,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: brand.line2 },
          // The gap in the outline is cut for a 75% label; ours floats at 88%, so the gap is cut to match.
          '& .MuiOutlinedInput-notchedOutline legend': { fontSize: '0.88em' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: ink[400] },
          // A focused field takes the rose border and nothing else. The error border stays the error red.
          '&.Mui-focused:not(.Mui-error) .MuiOutlinedInput-notchedOutline': { borderColor: brand.accent, borderWidth: 1.5 },
          '&.Mui-disabled': { backgroundColor: brand.subtle },
        },
      },
    },

    // A floated label shrinks to 75%, which took the senior band below the 11.5px floor; scaled less instead.
    MuiInputLabel: {
      styleOverrides: {
        root: { fontSize: band.type.base, color: brand.sub, '&.Mui-focused:not(.Mui-error)': { color: brand.accent } },
        shrink: { transform: 'translate(14px, -9px) scale(0.88)' },
      },
    },

    MuiFormHelperText: { styleOverrides: { root: { marginInline: 2, fontSize: band.type.min } } },

    MuiMenu: {
      styleOverrides: {
        paper: { borderRadius: band.radius.md, border: `1px solid ${brand.line2}`, boxShadow: shadows.raised, marginTop: 6 },
        list: { padding: 6 },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: band.radius.sm,
          minHeight: band.control.md,
          fontSize: band.type.base,
          '&.Mui-selected': { backgroundColor: brand.sunken, fontWeight: 600, '&:hover': { backgroundColor: brand.sunken } },
        },
      },
    },

    MuiAutocomplete: {
      styleOverrides: {
        paper: { borderRadius: band.radius.md, border: `1px solid ${brand.line2}`, boxShadow: shadows.raised },
      },
    },

    MuiSwitch: {
      styleOverrides: {
        track: { backgroundColor: ink[300], opacity: 1 },
        switchBase: { '&.Mui-checked + .MuiSwitch-track': { opacity: 1 } },
      },
    },
  };
}
