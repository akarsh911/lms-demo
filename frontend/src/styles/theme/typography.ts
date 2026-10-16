import type { TypographyVariantsOptions } from '@mui/material/styles';

import type { GradeBand } from './bands';
import { fonts } from './tokens';

declare module '@mui/material/styles' {
  interface TypographyVariants {
    display: React.CSSProperties;
    figure: React.CSSProperties;
    eyebrow: React.CSSProperties;
  }
  interface TypographyVariantsOptions {
    display?: React.CSSProperties;
    figure?: React.CSSProperties;
    eyebrow?: React.CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    display: true;
    figure: true;
    eyebrow: true;
  }
}

// Three voices: a display face for anything that is a title or a number, a neutral body, a mono for labels.
export function typographyFor(band: GradeBand): TypographyVariantsOptions {
  const { type } = band;
  const heading = { fontFamily: fonts.display } as const;

  return {
    fontFamily: fonts.sans,
    fontSize: type.base,
    htmlFontSize: 16,

    h1: { ...heading, fontSize: Math.round(type.h1 * 1.15), fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 },
    h2: { ...heading, fontSize: type.h2 + 2, fontWeight: 800, letterSpacing: '-0.028em', lineHeight: 1.1 },
    h3: { ...heading, fontSize: type.h3 + 1, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 },
    h4: { ...heading, fontSize: type.h4 + 1, fontWeight: 700, letterSpacing: '-0.014em', lineHeight: 1.25 },
    h5: { ...heading, fontSize: type.base + 1, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 },
    h6: { ...heading, fontSize: type.base, fontWeight: 600, letterSpacing: '-0.008em', lineHeight: 1.3 },

    body1: { fontSize: type.base, lineHeight: band.lineHeight },
    body2: { fontSize: type.base - 1, lineHeight: band.lineHeight },
    subtitle1: { fontSize: type.base + 0.5, fontWeight: 600, letterSpacing: '-0.008em' },
    subtitle2: { fontSize: type.min + 1, fontWeight: 600 },
    caption: { fontSize: type.min, lineHeight: 1.4 },
    // Sans, not the mono the marketplace uses: here a button is often a record's name or a whole phrase.
    button: { fontSize: type.base - 1, fontWeight: 600, letterSpacing: '-0.005em', textTransform: 'none' },
    overline: { fontFamily: fonts.mono, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.14em', lineHeight: 1.6, textTransform: 'uppercase' },

    // The greeting and the one headline a page may have.
    display: { ...heading, fontSize: 'clamp(2.25rem, 4.6vw, 3.75rem)', fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 0.94 },
    // A number meant to be read from across the room.
    figure: {
      ...heading,
      fontSize: 'clamp(1.9rem, 3vw, 2.6rem)',
      fontWeight: 800,
      letterSpacing: '-0.04em',
      lineHeight: 1,
      fontVariantNumeric: 'tabular-nums',
    },
    eyebrow: { fontFamily: fonts.mono, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.14em', lineHeight: 1.6, textTransform: 'uppercase' },
  };
}
