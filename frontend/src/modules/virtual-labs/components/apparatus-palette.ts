/**
 * Colours of PHYSICAL apparatus: a black epoxy bench top, a cream meter dial,
 * brass terminal screws, red and black leads.
 *
 * The one deliberate exception to "never hardcode a colour". These are not
 * brand or interface colours and must not follow the theme: they depict real
 * objects, and a student learns to recognise a red + terminal or a brass screw
 * by exactly these colours in the school lab. The bench stays dark in every
 * band for the same reason a real bench top does.
 *
 * Interface chrome drawn ON the bench (buttons, chips) still comes from the
 * theme; only the apparatus uses this table.
 */
export const apparatus = {
  bench: '#1b2221',
  benchEdge: '#0f1413',
  benchInk: '#b9c4c1',
  benchInkMuted: '#76837f',
  benchLabel: '#7d8a86',

  dialFace: '#f3eedf',
  dialRim: '#b7ae97',
  dialInk: '#1d1d1b',
  dialInkMuted: '#6b6658',
  dialArc: '#a9b3b8',
  needle: '#b3241b',
  pivot: '#2b2f33',

  bakeliteTop: '#2a2e33',
  bakeliteBottom: '#16191c',

  wireRed: '#d23b33',
  wireBlack: '#171717',
  wireBrass: '#e0b23a',
  terminalRed: '#c8332b',
  terminalBlack: '#161616',

  stray: '#ff5a52',
  hintRing: '#8fd0ff',
  glow: '#ff7a2e',
  live: '#3ddc84',
} as const;

/** A serif for printed scales, as on a real meter face. System fonts only. */
export const DIAL_FONT = "Georgia, 'Times New Roman', serif";
/** The sans used for labels stencilled on apparatus. */
export const LABEL_FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";
