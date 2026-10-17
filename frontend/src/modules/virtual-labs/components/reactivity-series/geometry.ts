import { METALS, SALTS, type Metal, type Salt } from '@labs/lib/reactivity-series/chemistry';

/**
 * Where everything sits on the chemistry bench, in one coordinate system.
 *
 * The drawing, the hit areas and the tour's spotlights all read these numbers,
 * so a tube cannot be drawn in one place and pointed at in another.
 *
 * The rack is a 4 × 4 GRID — a row per metal, a column per solution — which is
 * exactly the layout of the CBSE observation table. Sixteen tubes in one long
 * row (as on a real bench, and as the standalone page drew them) is 1400px of
 * apparatus that has to be read against a table laid out the other way round.
 * As a grid, the rack IS the table: the tube a student is describing is in the
 * same row and column as the cell they are typing into.
 */
export const BENCH_WIDTH = 1000;
export const BENCH_HEIGHT = 700;

/** The shelf above the rack: bottles, the tile of strips, sandpaper, the clock. */
export const BOTTLE_X = [62, 148, 234, 320] as const;
export const TILE = { x: 392, y: 54, w: 318, h: 150 } as const;
export const STACK_X = [452, 524, 596, 668] as const;
export const SAND = { x: 726, y: 70, w: 78, h: 96, fold: 18 } as const;
export const CLOCK = { cx: 902, cy: 122, r: 56 } as const;
export const SHELF_LABEL_Y = 224;

/** The rack. */
export const RACK = {
  /** Left gutter, where the metal that a row is for is printed. */
  gutter: 70,
  top: 258,
  colWidth: 228,
  rowHeight: 106,
  tubeWidth: 46,
  tubeHeight: 88,
  /** Pixels per millilitre of solution in a rack tube. */
  mlPx: 5.8,
} as const;

export const columnX = (g: number): number => 184 + g * RACK.colWidth;
export const rowY = (i: number): number => RACK.top + i * RACK.rowHeight;

/** The glass of one rack tube, in bench coordinates. */
export function tubeBox(index: number): {
  cx: number;
  top: number;
  bottom: number;
  w: number;
  stripTop: number;
  stripBottom: number;
  mlPx: number;
} {
  const i = Math.floor(index / SALTS.length);
  const g = index % SALTS.length;
  const top = rowY(i) + 10;
  return {
    cx: columnX(g),
    top,
    bottom: top + RACK.tubeHeight,
    w: RACK.tubeWidth,
    stripTop: top + 6,
    stripBottom: top + RACK.tubeHeight - 8,
    mlPx: RACK.mlPx,
  };
}

/** The same tube drawn large, for the close-up beside the observation input. */
export const CLOSE_UP = {
  width: 120,
  height: 250,
  cx: 60,
  top: 18,
  bottom: 238,
  w: 56,
  stripTop: 30,
  stripBottom: 226,
  mlPx: 16.5,
} as const;

export type Region = readonly [x: number, y: number, w: number, h: number];

export const RG_BOTTLES: Region = [26, 20, 340, 206];
export const RG_TILE: Region = [386, 44, 330, 178];
export const RG_SAND: Region = [714, 58, 104, 126];
export const RG_TOOLS: Region = [386, 44, 432, 178];
export const RG_CLOCK: Region = [838, 54, 128, 170];
export const RG_RACK: Region = [14, 236, 972, 452];

export function columnRegion(salt: Salt): Region {
  const g = SALTS.indexOf(salt);
  return [columnX(g) - 104, 236, 208, 452];
}

export function rowRegion(metal: Metal): Region {
  const i = METALS.indexOf(metal);
  return [14, rowY(i) - 4, 972, RACK.rowHeight];
}

export function cellRegion(metal: Metal, salt: Salt): Region {
  const g = SALTS.indexOf(salt);
  const i = METALS.indexOf(metal);
  return [columnX(g) - 58, rowY(i) - 2, 116, RACK.rowHeight];
}

/** A hot area's id: what a tour step pulses and what a click resolves to. */
export const HOT = {
  bottle: (salt: Salt) => `salt:${salt}`,
  metal: (metal: Metal) => `metal:${metal}`,
  sand: 'tool:sand',
  clock: 'tool:clock',
  tube: (metal: Metal, salt: Salt) => `tube:${metal}-${salt}`,
} as const;
