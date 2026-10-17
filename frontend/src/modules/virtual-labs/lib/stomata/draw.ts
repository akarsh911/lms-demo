import { hash01, inPeel, type Peel } from './peel';

/**
 * Path geometry for everything the microscope draws.
 *
 * Pure string arithmetic — no React — so the eyepiece, the close-up of the
 * slide and the labelled drawing all derive their shapes from one place, and a
 * harness can check an outline without a browser.
 */

/** One decimal place. SVG paths do not need more, and the markup halves. */
const n1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * An irregular, wavy-walled epidermal cell — the jigsaw outline you see in a
 * real peel, not a circle. `k` is the cell's index, so the same cell keeps the
 * same wall on every render.
 */
export function cellPath(cx: number, cy: number, r: number, rot: number, k: number): string {
  const N = 8;
  const pt = (i: number, rr: number): [number, number] => {
    const a = rot + (i * 2 * Math.PI) / N;
    return [cx + Math.cos(a) * r * rr, cy + Math.sin(a) * r * rr];
  };
  const rad = (i: number): number => 1 + (hash01(k * 11 + i) - 0.5) * 0.34;
  const p0 = pt(0, rad(0));
  let d = `M${n1(p0[0])} ${n1(p0[1])}`;
  for (let i = 1; i <= N; i++) {
    const q = pt(i - 0.5, 1 + (i % 2 ? 0.26 : -0.2));
    const e = i === N ? p0 : pt(i, rad(i));
    d += `Q${n1(q[0])} ${n1(q[1])} ${n1(e[0])} ${n1(e[1])}`;
  }
  return `${d}Z`;
}

export interface StomaShape {
  /** The two bean-shaped guard cells, drawn either side of the pore. */
  guards: [string, string];
  pore: string;
  /** Chloroplasts, which the guard cells have and the epidermal cells do not. */
  chloroplasts: readonly { x: number; y: number; r: number }[];
  strokeWidth: number;
}

/**
 * A stoma of overall length `L`, centred on the origin: the caller places and
 * rotates it. Each guard cell is a crescent thicker on its inner wall, which is
 * what makes the pore open as the cell swells.
 */
export function stomaShape(L: number): StomaShape {
  const h = L / 2;
  const w = L * 0.3;
  const guard = (sign: number): string =>
    `M${n1(-h)} 0Q${n1(-h * 0.45)} ${n1(sign * w * 1.3)} 0 ${n1(sign * w * 1.38)}` +
    `Q${n1(h * 0.45)} ${n1(sign * w * 1.3)} ${n1(h)} 0Q${n1(h * 0.45)} ${n1(sign * w * 0.34)} 0 ${n1(sign * w * 0.3)}` +
    `Q${n1(-h * 0.45)} ${n1(sign * w * 0.34)} ${n1(-h)} 0Z`;

  const r = Math.max(0.9, L * 0.052);
  const chloroplasts: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * L * 0.155;
    chloroplasts.push({ x: n1(x), y: n1(-w * 0.82), r: n1(r) });
    chloroplasts.push({ x: n1(x), y: n1(w * 0.82), r: n1(r) });
  }

  return {
    guards: [guard(-1), guard(1)],
    pore: `M${n1(-h)} 0Q0 ${n1(-w * 0.3)} ${n1(h)} 0Q0 ${n1(w * 0.3)} ${n1(-h)} 0Z`,
    chloroplasts,
    strokeWidth: n1(Math.max(0.8, L * 0.055)),
  };
}

/**
 * The edge of the peel, marched round in polar coordinates from the same
 * `inPeel` test that decides which cells exist — so a torn scrap really is
 * drawn with the bite out of it.
 */
export function peelOutlinePath(pl: Peel, ox: number, oy: number, k: number): string {
  let d = '';
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    let lo = 0;
    let hi = 2.2;
    for (let j = 0; j < 14; j++) {
      const m = (lo + hi) / 2;
      if (inPeel(Math.cos(a) * m, Math.sin(a) * m, pl)) lo = m;
      else hi = m;
    }
    d += `${i ? 'L' : 'M'}${n1(ox + Math.cos(a) * lo * k)} ${n1(oy + Math.sin(a) * lo * k)}`;
  }
  return `${d}Z`;
}

export interface FieldPalette {
  wall: string;
  fill: string;
  guard: string;
  gwall: string;
  pore: string;
  chl: string;
  nuc: string | null;
  /** How strongly the outlines show at all: an unstained peel is nearly invisible. */
  op: number;
  wash: string;
}

/**
 * What the peel looks like at the stain it was actually given: colourless,
 * properly stained, or drowned in red.
 */
export function fieldPalette(stain: number, op: number): FieldPalette {
  if (stain === 0) {
    return {
      wall: '#5f6d55',
      fill: '#eef3ea',
      guard: '#d7e4cf',
      gwall: '#47563e',
      pore: '#7e8c75',
      chl: '#4e9a52',
      nuc: null,
      op,
      wash: 'rgba(232,240,228,.45)',
    };
  }
  if (stain >= 4) {
    return {
      wall: '#3d0a17',
      fill: '#c04d6c',
      guard: '#a93353',
      gwall: '#2d060f',
      pore: '#20040a',
      chl: '#7d2b3c',
      nuc: '#2d060f',
      op: 1,
      wash: 'rgba(176,45,80,.62)',
    };
  }
  return {
    wall: '#a8324e',
    fill: '#fbe7eb',
    guard: '#e88fa8',
    gwall: '#66152a',
    pore: '#4d0f20',
    chl: '#2f7d38',
    nuc: '#8d2740',
    op,
    wash: 'rgba(246,214,222,.5)',
  };
}
