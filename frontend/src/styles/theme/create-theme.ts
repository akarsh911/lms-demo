import { createTheme, type Shadows, type Theme } from '@mui/material/styles';

import { GRADE_BANDS, type GradeBand, type GradeBandId } from './bands';
import { INK_RGB, ROSE_RGB, ember, glow, ink, moss, rose, stone, tide } from './colors';
import { baseline } from './components/baseline';
import { buttons } from './components/buttons';
import { data } from './components/data';
import { feedback } from './components/feedback';
import { inputs } from './components/inputs';
import { navigation } from './components/navigation';
import { surfaces } from './components/surfaces';
import { brand, hues, onTint, shadows, tints } from './tokens';
import { typographyFor } from './typography';

/**
 * Builds a MUI theme for one grade band.
 *
 * Everything band-dependent is read from the `GradeBand` spec, so a component
 * never asks "which band am I in" — it asks the theme for a radius or a
 * duration and gets the right answer. That is the whole point: rotating the
 * band must not require touching a single component.
 *
 * The band spec is also attached to the theme as `theme.band`, for the rare
 * case where a component genuinely needs to branch on ornament level (whether
 * to render a mascot, say). Reach for a token first; `theme.band` is the
 * escape hatch, not the front door.
 */
declare module '@mui/material/styles' {
  interface Theme {
    band: GradeBand;
    brand: typeof brand;
    hues: typeof hues;
    tints: typeof tints;
    onTint: typeof onTint;
  }
  interface ThemeOptions {
    band?: GradeBand;
    brand?: typeof brand;
    hues?: typeof hues;
    tints?: typeof tints;
    onTint?: typeof onTint;
  }
}

const ELEVATIONS = Array.from({ length: 25 }, (_, level) =>
  level === 0 ? 'none' : level <= 2 ? shadows.card : level <= 8 ? shadows.raised : shadows.pop,
) as Shadows;

export function createBandTheme(bandId: GradeBandId): Theme {
  const band = GRADE_BANDS[bandId];

  return createTheme({
    band,
    brand,
    hues,
    tints,
    onTint,

    // 8px unit, scaled by the band. Foundation is airier, senior is tighter.
    spacing: (factor: number) => `${8 * band.spacing * factor}px`,

    shape: { borderRadius: band.radius.md },

    // MUI's 25 elevations mapped onto three ink-tinted shadows, so no component draws a black one.
    shadows: ELEVATIONS,

    palette: {
      mode: 'light',
      // The whole ramp is spread so `primary.700` resolves; the four tokens are set by hand so MUI derives nothing.
      primary: { ...rose, light: rose[300], main: rose[500], dark: rose[600], contrastText: '#FFFFFF' },
      secondary: { ...stone, light: stone[300], main: stone[500], dark: stone[700], contrastText: brand.ink },
      success: { ...moss, light: moss[300], main: moss[500], dark: moss[700], contrastText: '#FFFFFF' },
      warning: { ...glow, light: glow[300], main: glow[500], dark: glow[700], contrastText: '#FFFFFF' },
      // A true red, kept apart from the rose so "this failed" and "this is the primary action" never share a hue.
      error: { ...ember, light: ember[400], main: ember[600], dark: ember[700], contrastText: '#FFFFFF' },
      info: { ...tide, light: tide[300], main: tide[500], dark: tide[700], contrastText: '#FFFFFF' },
      grey: ink,
      background: { default: brand.canvas, paper: brand.surface },
      text: { primary: brand.text, secondary: brand.sub, disabled: ink[400] },
      divider: brand.line,
      action: {
        active: brand.sub,
        hover: `rgb(${INK_RGB} / 0.05)`,
        selected: `rgb(${INK_RGB} / 0.08)`,
        disabled: ink[300],
        disabledBackground: ink[100],
        focus: `rgb(${ROSE_RGB} / 0.24)`,
      },
    },

    typography: typographyFor(band),

    transitions: {
      duration: {
        shortest: band.motion.fast,
        shorter: band.motion.fast,
        short: band.motion.base,
        standard: band.motion.base,
        complex: band.motion.slow,
        enteringScreen: band.motion.base,
        leavingScreen: band.motion.fast,
      },
    },

    components: {
      ...baseline,
      ...surfaces(band),
      ...buttons(band),
      ...inputs(band),
      ...navigation(band),
      ...feedback(band),
      ...data(band),
    },
  });
}
