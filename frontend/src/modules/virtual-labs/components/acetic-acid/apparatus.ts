import { clamp } from '@labs/lib/numbers';
import type { Hue, LiquidId } from '@labs/lib/acetic-acid/chemistry';
import type { ToolKind } from '@labs/lib/acetic-acid/state';

/**
 * Where everything sits on the bench, and what colour it is.
 *
 * Geometry is in the drawing's own 1000×600 coordinates: the apparatus scales
 * to fit whatever room the stage has, so a tour can point at a bottle by naming
 * a rectangle here and nothing has to know how large the bench is on screen.
 *
 * The colours are of PHYSICAL things — a strip of red litmus, the yellow of
 * vegetable oil, the white of a carbonate — so they are fixed the way the
 * shared `apparatus-palette` is fixed, and do not follow the theme.
 */
export const BENCH_WIDTH = 1000;
export const BENCH_HEIGHT = 600;

export const BOTTLE_X: Readonly<Record<LiquidId, number>> = {
  acid: 78,
  water: 186,
  lime: 294,
  oil: 402,
  hcl: 510,
};
export const BOTTLE_ORDER: readonly LiquidId[] = ['acid', 'water', 'lime', 'oil', 'hcl'];
export const JAR_X = 618;

export interface ToolSpec {
  kind: ToolKind;
  /** Stencilled under it on the bench. */
  label: string;
  aria: string;
  x: number;
}

export const TOOLS: readonly ToolSpec[] = [
  { kind: 'blue', label: 'BLUE LITMUS', aria: 'Blue litmus paper', x: 112 },
  { kind: 'red', label: 'RED LITMUS', aria: 'Red litmus paper', x: 226 },
  { kind: 'ph', label: 'pH PAPER', aria: 'pH paper', x: 340 },
  { kind: 'rod', label: 'GLASS ROD', aria: 'Glass rod — shake and stir a tube', x: 454 },
  { kind: 'waft', label: 'WAFT (SAFE)', aria: 'Waft the vapour towards you — the safe way to smell', x: 568 },
  { kind: 'sniff', label: 'SNIFF DIRECTLY', aria: 'Put your nose to the mouth of the tube — unsafe', x: 682 },
  { kind: 'pipe', label: 'DELIVERY TUBE', aria: 'Delivery tube — carry the gas into another tube', x: 796 },
  { kind: 'splint', label: 'BURNING SPLINTER', aria: 'Lighted splinter', x: 910 },
];

/** Where each tube stands, and how a tube is drawn on the rack. */
export const TUBE_X: readonly number[] = [120, 260, 400, 540, 680, 820];
export const RACK_GEOMETRY = { top: 366, bottom: 548, width: 34, mlPx: 10 } as const;

/** Rectangles a tour points at, in bench coordinates. */
export const REGION = {
  bottles: [40, 36, 630, 172],
  jar: [572, 78, 96, 126],
  card: [652, 44, 328, 196],
  tools: [50, 240, 922, 116],
  smell: [508, 240, 232, 116],
  pipe: [736, 240, 232, 116],
  rack: [50, 352, 900, 248],
  tube1: [TUBE_X[0]! - 48, 352, 96, 248],
  tubes45: [TUBE_X[3]! - 48, 352, 236, 248],
} as const satisfies Record<string, readonly [number, number, number, number]>;

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

export const HUE_HEX: Readonly<Record<Hue, string>> = {
  red: '#c4382f',
  purple: '#7d54a6',
  blue: '#2f5fc0',
};

const hex2rgb = (h: string): number[] => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));

const mix = (a: number[], b: number[], f: number): string =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * f)).join(',')})`;

/** Litmus against pH, for the reference card on the bench. */
export function litmusRamp(ph: number): string {
  const x = clamp(ph, 0, 14);
  const stops: readonly [number, string][] = [
    [0, HUE_HEX.red],
    [5, HUE_HEX.red],
    [6.5, HUE_HEX.purple],
    [8, HUE_HEX.blue],
    [14, HUE_HEX.blue],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i]!;
    const [p1, c1] = stops[i + 1]!;
    if (x <= p1) {
      const f = p1 === p0 ? 0 : (x - p0) / (p1 - p0);
      return mix(hex2rgb(c0), hex2rgb(c1), f);
    }
  }
  return HUE_HEX.blue;
}

/** The universal-indicator ramp, used only by the pH paper so a number can be read off. */
const UI_RAMP = [
  '#e2231a', '#e8442a', '#ef6a25', '#f4892a', '#f7ab2f', '#e9c531', '#c3d436', '#55bb4a',
  '#2fb69c', '#2f92c8', '#2a67bb', '#3b48ab', '#5a33a0', '#6d2596', '#7c2086',
];

export function phPaperColour(ph: number): string {
  const x = clamp(ph, 0, 14);
  const lo = Math.floor(x);
  return mix(hex2rgb(UI_RAMP[lo]!), hex2rgb(UI_RAMP[Math.min(14, lo + 1)]!), x - lo);
}

export const GLASS = {
  wall: 'rgba(255,255,255,.55)',
  body: 'rgba(255,255,255,.05)',
  meniscus: 'rgba(255,255,255,.45)',
  solid: '#f4f6f8',
  gas: '#9fe8d4',
  cork: '#8a6a46',
  corkEdge: '#6a5136',
  emulsion: 'rgba(226,214,168,.55)',
  paper: '#f4f1ea',
  paperInk: '#1d1d1b',
  paperSub: '#6b6658',
} as const;
