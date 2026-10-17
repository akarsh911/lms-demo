import { clamp } from '../numbers';
import { mulberry32 } from '../seed';

/**
 * The leaf, the slide and the optics.
 *
 * Everything here is a pure model in MILLIMETRES. The peel is a real sheet of
 * cells generated once from its own seed, the slide carries what was actually
 * put on it, and what the eyepiece shows is derived from that — so counting the
 * stomata in a field of view is a real count of what was generated, and the
 * marking can compare it against the truth for THAT peel.
 *
 * No React, no DOM: the same functions the eyepiece draws from are the ones a
 * harness in plain Node counts stomata with.
 */

export const MM = {
  /** The peel is a few millimetres of epidermis. */
  PEEL_W: 2.8,
  PEEL_H: 2.4,
  /** An epidermal cell is about 50 µm across. */
  CELL: 0.05,
} as const;

/**
 * The chance that a cell site is a stoma. A dorsiventral (dicot) leaf carries
 * far more stomata on its shaded lower surface than on the upper one; these two
 * numbers are the whole reason the conclusion has an answer.
 */
export const P_LOWER = 0.34;
export const P_UPPER = 0.014;

/** Stomata are never neighbours: each is separated from the next by epidermal cells. */
export const STOMA_GAP = 0.072;

export type Magnification = 10 | 40;

export interface Objective {
  name: string;
  /** Radius of the field of view, mm. */
  fieldR: number;
  /** Depth of field, in stage units. */
  dof: number;
  /** Stage height at which this lens presses into the coverslip. */
  crash: number;
}

export const OBJ: Readonly<Record<Magnification, Objective>> = {
  10: { name: '10×', fieldR: 0.76, dof: 6.0, crash: 9.0 },
  40: { name: '40×', fieldR: 0.19, dof: 1.1, crash: 2.6 },
};

/** Where the stage starts, how far it travels, and what each knob is worth. */
export const Z0 = -18;
export const ZMIN = -26;
export const ZMAX = 14;
export const COARSE = 1.5;
export const FINE = 0.2;

/** How far one tap moves the stage sideways, and how far it may go. */
export const PAN = 0.16;
export const PAN_LIM = 2.2;

export const MAGNIFICATIONS: readonly Magnification[] = [10, 40];

// ---------------------------------------------------------------------------
// The things on the bench
// ---------------------------------------------------------------------------

export type Surface = 'lower' | 'upper';

export interface Peel {
  surface: Surface;
  /** Shredded — by the needle, or by lifting it wet on forceps. Little of it left. */
  torn: boolean;
  /** The whole lamina, several cells thick: no one plane is ever in focus. */
  thick: boolean;
  /** Relaxed flat in the watch glass before mounting. */
  floated: boolean;
  /** Mounted without floating, so it folded on itself. */
  curled: boolean;
  seed: number;
}

export interface Bubble {
  x: number;
  y: number;
  r: number;
}

export interface SlideState {
  seed: number;
  peel: Peel | null;
  /** Drops of water, drops of safranin, and whether glycerine went on. */
  water: number;
  stain: number;
  glyc: boolean;
  blotted: boolean;
  /** `angle` records whether it was lowered on the needle or dropped flat. */
  cover: { angle: boolean } | null;
  bubbles: Bubble[];
  /** Covered with no liquid under it at all. */
  dry: boolean;
  onStage: boolean;
  broken: boolean;
  /** Liquid was on the slide BEFORE the peel went into it. */
  waterFirst: boolean;
}

export interface MicState {
  obj: Magnification;
  /** Stage height. 0 is the focal plane. */
  z: number;
  /** Where the field of view sits over the peel, mm. */
  cx: number;
  cy: number;
  foundLow: boolean;
  centredLow: boolean;
  /** Whether 40× has ever been swung round, and what had been achieved by then. */
  switched: boolean;
  lowFirst: boolean;
  centredFirst: boolean;
  /** The sharpest high-power image ever achieved. */
  bestHigh: number;
}

/** The part of the practical the optics depend on. */
export interface OpticsView {
  slide: SlideState;
  mic: MicState;
}

export interface Cell {
  x: number;
  y: number;
  stoma: boolean;
  /** Rotation, radians. */
  a: number;
  /** Size, as a fraction of a nominal cell. */
  sz: number;
  /** Index, so the same cell always gets the same wavy wall. */
  k: number;
}

export interface PeelSheet {
  cells: readonly Cell[];
  stomata: readonly Cell[];
}

/** Deterministic per-index noise, for a cell wall that is the same every render. */
export function hash01(n: number): number {
  let t = Math.imul(n ^ 0x9e3779b9, 2654435761) >>> 0;
  t = Math.imul(t ^ (t >>> 13), 1597334677) >>> 0;
  return (t >>> 8) / 16777216;
}

/**
 * The outline of the peel: a rough rectangle with a wavy torn edge. The same
 * function decides which cells exist, where the outline is drawn, and how much
 * of the field of view is covered by peel.
 */
export function inPeel(x: number, y: number, pl: Peel): boolean {
  const k = pl.torn ? 0.62 : 1;
  const X = x / k;
  const Y = y / k;
  const ex = MM.PEEL_W / 2 - 0.1 - 0.07 * Math.sin(Y * 4.1 + 1.2) - 0.05 * Math.sin(Y * 9.3);
  const ey = MM.PEEL_H / 2 - 0.1 - 0.07 * Math.sin(X * 3.7 + 0.4) - 0.05 * Math.sin(X * 8.1 + 2.0);
  if (Math.abs(X) > ex || Math.abs(Y) > ey) return false;
  // A bite torn out of a scrap.
  if (pl.torn && (X - 0.5) * (X - 0.5) + (Y + 0.35) * (Y + 0.35) < 0.3) return false;
  return true;
}

/**
 * Every cell of the peel, once, from the peel's own seed.
 *
 * Cached rather than stored on the peel: the practical's state is cloned on
 * every action, and a few thousand cells inside it would be copied each time.
 * The key is everything about a peel that changes its geometry, so a peel torn
 * on the forceps regenerates as the smaller scrap it now is.
 */
const SHEETS = new Map<string, PeelSheet>();

export function peelCells(pl: Peel): PeelSheet {
  const key = `${pl.seed}:${pl.surface}:${pl.torn ? 1 : 0}`;
  const hit = SHEETS.get(key);
  if (hit) return hit;

  const rnd = mulberry32(pl.seed >>> 0);
  const cells: Cell[] = [];
  const stomata: Cell[] = [];
  const D = MM.CELL;
  const pSt = pl.surface === 'lower' ? P_LOWER : P_UPPER;
  let k = 0;

  for (let gy = -MM.PEEL_H / 2; gy <= MM.PEEL_H / 2; gy += D) {
    for (let gx = -MM.PEEL_W / 2; gx <= MM.PEEL_W / 2; gx += D) {
      const r1 = rnd();
      const r2 = rnd();
      const r3 = rnd();
      const r4 = rnd();
      const x = gx + (r1 - 0.5) * D * 0.55;
      const y = gy + (r2 - 0.5) * D * 0.55;
      if (!inPeel(x, y, pl)) continue;
      let stoma = r3 < pSt;
      if (stoma) {
        for (const s of stomata) {
          if ((s.x - x) * (s.x - x) + (s.y - y) * (s.y - y) < STOMA_GAP * STOMA_GAP) {
            stoma = false;
            break;
          }
        }
      }
      const c: Cell = { x, y, stoma, a: r4 * Math.PI, sz: 0.82 + r1 * 0.4, k: k++ };
      if (stoma) stomata.push(c);
      cells.push(c);
    }
  }

  const sheet: PeelSheet = { cells, stomata };
  // A student sees a handful of peels in one sitting; this only stops the map
  // growing without bound over a long session of restarts.
  if (SHEETS.size > 24) SHEETS.clear();
  SHEETS.set(key, sheet);
  return sheet;
}

export function peelStomata(pl: Peel): readonly Cell[] {
  return peelCells(pl).stomata;
}

// ---------------------------------------------------------------------------
// The mount
// ---------------------------------------------------------------------------

export function liquidOn(sl: SlideState): number {
  return sl.water + sl.stain + (sl.glyc ? 1 : 0);
}

/**
 * Air bubbles. Lowering the coverslip at an angle with a needle lets the liquid
 * push the air out ahead of it; dropping it flat traps a crowd of them, and a
 * mount with too little liquid traps them either way.
 */
export function bubbleCount(sl: SlideState, liq: number): number {
  if (sl.cover && sl.cover.angle) return liq >= 1 ? 0 : 6;
  return liq >= 4 ? 3 : liq >= 2 ? 6 : liq >= 1 ? 8 : 11;
}

export function makeBubbles(sl: SlideState, liq: number): Bubble[] {
  const rnd = mulberry32((sl.seed ^ 0x9e37) >>> 0);
  const n = bubbleCount(sl, liq);
  const out: Bubble[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: (rnd() - 0.5) * (MM.PEEL_W + 0.5),
      y: (rnd() - 0.5) * (MM.PEEL_H + 0.4),
      r: 0.045 + rnd() * 0.125,
    });
  }
  return out;
}

export function bubbleAt(sl: SlideState, x: number, y: number): boolean {
  for (const b of sl.bubbles) {
    if ((b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) < b.r * b.r) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The optics
// ---------------------------------------------------------------------------

/**
 * Whether the coverslip is FLOATING rather than resting on the mount: more
 * liquid under it than the mount can hold, and none of it drawn off with
 * blotting paper.
 *
 * One function because it is one fact with two consequences that must not be
 * allowed to disagree. It is why the image can never be brought fully sharp —
 * `sharpness` caps at `FLOAT_CAP` below — and it is also, and for exactly the
 * same reason, why the whole field is seen to wander: a coverslip that is
 * floating IS the drift. Drawing one without the other would leave a student
 * looking for a knob that will fix a cap the drawing gave them no reason for.
 */
export function floatingCover(sl: SlideState): boolean {
  return liquidOn(sl) >= 4 && !sl.blotted;
}

/** As sharp as a floating mount will ever come: it will not sit still to be focused. */
export const FLOAT_CAP = 0.78;

/**
 * Focus. The stage carries the slide up and down; the specimen is sharp only
 * where the stage sits at the focal plane (z = 0). High power has a far
 * shallower depth of field, so the same knob movement that barely softens the
 * 10× image throws the 40× image away completely. A peel that is more than one
 * cell thick has no single plane to focus on at all.
 */
export function sharpness(v: OpticsView): number {
  const sl = v.slide;
  if (!sl.onStage || sl.broken || !sl.peel) return 0;
  const o = OBJ[v.mic.obj];
  const d = Math.abs(v.mic.z);
  const s = 1 / (1 + (d / o.dof) * (d / o.dof));
  let cap = 1;
  if (sl.peel.thick) cap = Math.min(cap, 0.4);
  if (sl.peel.curled) cap = Math.min(cap, 0.55);
  // Too much liquid and the coverslip floats: the mount drifts under the lens.
  if (floatingCover(sl)) cap = Math.min(cap, FLOAT_CAP);
  return s * cap;
}

/**
 * HOW FAR THE MOUNT IS RIDING, as a swing about the optical axis in degrees.
 *
 * A wet mount is a sheet of epidermis lying in a film of water between two
 * pieces of glass, and it is never still: the film creeps, the coverslip
 * settles, and over a few seconds the whole field turns. A mount whose excess
 * was never blotted has the coverslip afloat on it and turns several times as
 * far — the same fact `floatingCover` caps the sharpness with, so the wander
 * the student sees and the sharpness they cannot reach come from one place.
 *
 * Reported as an ANGLE, not a distance, for two reasons. It is the only rigid
 * motion of a round field under which nothing enters or leaves it, so the count
 * on the screen is the count `visibleStomata` computes at every instant. And an
 * angle is scale-free, so the mount rides by the same fraction of the field at
 * 40× as at 10×, which is what a mount actually does: at high power the drift
 * that was barely visible is the thing you cannot work against.
 *
 * Zero whenever there is nothing to ride — no slide on the stage, a cracked
 * one, a dry mount, no coverslip on it yet. A dry mount is drawn perfectly
 * still, which is itself worth seeing.
 *
 * The two angles are as large as they are because nothing bounds them from
 * below: a rotation about the axis cannot lose a stoma however far it goes, so
 * the size is chosen to be SEEN — a degree or so is a slow creep at the edge of
 * a settled field, and four is a mount that is plainly not sitting still.
 */
export const RIDE_SETTLED_DEG = 1.3;
export const RIDE_FLOATING_DEG = 3.8;

export function mountRideDeg(v: OpticsView): number {
  const sl = v.slide;
  if (!sl.onStage || sl.broken || !sl.peel || !sl.cover || sl.dry) return 0;
  if (liquidOn(sl) <= 0) return 0;
  return floatingCover(sl) ? RIDE_FLOATING_DEG : RIDE_SETTLED_DEG;
}

/** Contrast. An unstained epidermal peel is nearly colourless. */
export function contrast(v: OpticsView): number {
  const sl = v.slide;
  if (!sl.peel) return 0;
  return sl.stain === 0 ? 0.2 : sl.stain <= 3 ? 0.92 : 1;
}

export function overStained(v: OpticsView): boolean {
  return v.slide.stain >= 4;
}

export interface FieldCell {
  cell: Cell;
  /** Offset from the centre of the field, mm. */
  dx: number;
  dy: number;
  /** Under a bubble, so it cannot be seen at all. */
  hidden: boolean;
}

/** What is under the objective right now. */
export function fieldCells(v: OpticsView): FieldCell[] {
  const sl = v.slide;
  const R = OBJ[v.mic.obj].fieldR;
  const out: FieldCell[] = [];
  if (!sl.peel) return out;
  for (const cell of peelCells(sl.peel).cells) {
    const dx = cell.x - v.mic.cx;
    const dy = cell.y - v.mic.cy;
    if (dx * dx + dy * dy > R * R) continue;
    out.push({ cell, dx, dy, hidden: bubbleAt(sl, cell.x, cell.y) });
  }
  return out;
}

/** The stomata a student could honestly count in this field. */
export function visibleStomata(v: OpticsView): FieldCell[] {
  return fieldCells(v).filter((f) => f.cell.stoma && !f.hidden);
}

export function hiddenStomata(v: OpticsView): FieldCell[] {
  return fieldCells(v).filter((f) => f.cell.stoma && f.hidden);
}

export function bubblesInField(v: OpticsView): boolean {
  const R = OBJ[v.mic.obj].fieldR;
  return v.slide.bubbles.some((b) => Math.hypot(b.x - v.mic.cx, b.y - v.mic.cy) < R + b.r * 0.6);
}

/** How much of the field is peel — the centring test. */
export function coverage(v: OpticsView): number {
  const pl = v.slide.peel;
  if (!pl) return 0;
  const R = OBJ[v.mic.obj].fieldR;
  let n = 0;
  let hit = 0;
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      const x = ((i + 0.5) / 13) * 2 - 1;
      const y = ((j + 0.5) / 13) * 2 - 1;
      if (x * x + y * y > 1) continue;
      n++;
      if (inPeel(v.mic.cx + x * R, v.mic.cy + y * R, pl)) hit++;
    }
  }
  return hit / n;
}

// ---------------------------------------------------------------------------
// Driving the microscope
// ---------------------------------------------------------------------------

export type MoveResult = 'ok' | 'crash' | 'noslide' | 'same';

/**
 * Racking the stage up past the working distance of the objective in use
 * presses the lens into the coverslip and cracks the slide — the classic
 * accident, and the reason low power comes first.
 */
export function crashCheck(v: OpticsView): MoveResult {
  if (v.slide.onStage && !v.slide.broken && v.mic.z > OBJ[v.mic.obj].crash) {
    v.slide.broken = true;
    return 'crash';
  }
  return 'ok';
}

export function moveZ(v: OpticsView, dz: number): MoveResult {
  if (!v.slide.onStage) return 'noslide';
  v.mic.z = clamp(v.mic.z + dz, ZMIN, ZMAX);
  return crashCheck(v);
}

export function setObjective(v: OpticsView, o: Magnification): MoveResult {
  if (v.mic.obj === o) return 'same';
  if (o === 40 && !v.mic.switched) {
    v.mic.switched = true;
    v.mic.lowFirst = v.mic.foundLow;
    v.mic.centredFirst = v.mic.centredLow;
  }
  v.mic.obj = o;
  return crashCheck(v);
}

export function panStage(v: OpticsView, dx: number, dy: number): void {
  v.mic.cx = clamp(v.mic.cx + dx, -PAN_LIM, PAN_LIM);
  v.mic.cy = clamp(v.mic.cy + dy, -PAN_LIM, PAN_LIM);
}

/** Record what was achieved, every time the microscope is touched. */
export function micTick(v: OpticsView): void {
  const s = sharpness(v);
  if (v.mic.obj === 10) {
    if (s >= 0.6 && fieldCells(v).length > 0) v.mic.foundLow = true;
    if (s >= 0.6 && coverage(v) >= 0.95) v.mic.centredLow = true;
  } else if (s > v.mic.bestHigh) {
    v.mic.bestHigh = s;
  }
}

/** The gap between the front lens and the coverslip, for the side gauge. */
export function lensGap(v: OpticsView): number {
  return OBJ[v.mic.obj].crash - v.mic.z;
}
