/**
 * Theme entry point.
 *
 * Two layers:
 *   tokens.ts  — brand. Fixed. One school, one identity.
 *   bands.ts   — grade band. Rotatable. Playful -> composed.
 *
 * Read `docs/THEMING.md` before changing either.
 */
export { brand, hues, tints, onTint, shadows, fonts, fontStack } from './tokens';
export type { HueName, TintName } from './tokens';

export {
  GRADE_BANDS,
  DEFAULT_BAND,
  bandForGrade,
  bandForGroupKeys,
  isGradeBandId,
} from './bands';
export type { GradeBand, GradeBandId } from './bands';

export { createBandTheme } from './create-theme';
export { ThemeProvider, useBand } from './theme-provider';
