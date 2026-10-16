import { INK_RGB, ROSE_RGB, ember, glow, ink, moss, paper, rose, stone, tide } from './colors';

/**
 * Brand tokens. Fixed across every grade band: one school, one identity.
 *
 * The palette is Slate Rose: paper beige, ink, rose as the primary and warm
 * grey as the secondary. Semantic hues exist to tell things apart, never to decorate.
 */
export const brand = {
  canvas: paper.ground,
  surface: paper.raised,
  subtle: paper.soft,
  sunken: paper.well,

  line: paper.hairline,
  line2: paper.edge,

  ink: ink[900],
  text: ink[900],
  sub: stone[700],
  // Captions and eyebrows. Between stone 600 and 700, the lightest grey that still clears 4.5:1 on a card.
  tert: '#787270',

  // The rose for text and filled controls (4.8:1 with white), its lighter mark, and its pressed tone.
  accent: rose[500],
  accentHi: rose[400],
  accentLo: rose[600],

  // The accent's old name, kept because `tone="orange"` is a prop value across the app.
  orange: rose[500],
  orangeHi: rose[400],
  orangeLo: rose[600],
} as const;

export const hues = {
  amber: glow[400],
  gold: glow[500],
  lilac: '#D79BDD',
  violet: '#7B6FD6',
  coral: '#E8705C',
  rose: rose[500],
  teal: moss[400],
  indigo: tide[600],
  green: '#2B8A66',
  red: ember[500],
  blue: tide[500],
} as const;

// Text on the matching tint, one per tint. Each clears 4.5:1 on its own background.
export const onTint = {
  orange: '#9C4A10',
  amber: glow[700],
  lilac: '#8A4F80',
  violet: '#4B3FA0',
  coral: '#A63A28',
  rose: rose[700],
  teal: moss[700],
  indigo: tide[700],
  green: '#1C6B4C',
  red: ember[600],
  blue: tide[600],
  grey: stone[700],
} as const;

// `orange` is the highlight for "chosen" and "active". A peach, so it stays apart from the rose and the error tints.
export const tints = {
  orange: '#FFF0E2',
  rose: rose[100],
  amber: glow[50],
  lilac: '#F8EDF9',
  violet: '#EFEDFB',
  coral: '#FDEEEA',
  teal: moss[50],
  indigo: tide[100],
  green: '#E4F4EC',
  red: ember[50],
  blue: tide[50],
  // A step darker than `subtle`, so a neutral chip still has an edge on a soft tile.
  grey: stone[200],
} as const;

// One low, wide, ink-tinted shadow: a card sits on the paper, it does not float above it.
export const shadows = {
  card: `0 14px 32px -26px rgb(${INK_RGB} / 0.5)`,
  raised: `0 18px 40px -24px rgb(${INK_RGB} / 0.45), 0 2px 6px -2px rgb(${INK_RGB} / 0.08)`,
  pop: `0 28px 64px -24px rgb(${INK_RGB} / 0.42), 0 8px 18px -8px rgb(${INK_RGB} / 0.14)`,
  focus: `0 0 0 3px rgb(${ROSE_RGB} / 0.24)`,
} as const;

export const fonts = {
  display: "var(--font-display), 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif",
  sans: "var(--font-sans), 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
  mono: "var(--font-mono), 'JetBrains Mono', ui-monospace, 'SF Mono', monospace",
} as const;

export const fontStack = fonts.sans;

export type HueName = keyof typeof hues;
export type TintName = keyof typeof tints;
