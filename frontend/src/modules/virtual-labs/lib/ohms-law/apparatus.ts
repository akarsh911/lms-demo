import type { Wire } from '../circuit';
import { mulberry32 } from '../seed';

import type { LabMethod } from './method';

/**
 * The simulated apparatus for Verification of Ohm's Law (Class 10, NCERT
 * Ch. 11 Electricity). Every number is a physical property of the bench; the
 * grading tolerances are derived from them, never tuned separately.
 *
 * THE METERS BELONG TO THE PRACTICAL, NOT TO THE BENCH. The CBSE Laboratory
 * Manual prescribes 0–3 A and 0–10 V for Experiment 4 (and 0–5 A / 0–5 V for
 * Experiment 5, which is why each practical carries its own `P`). Full scale,
 * the division count and the least count are declared together here, so a dial,
 * a least count and a full-scale check can never disagree — each is read from
 * this one object.
 *
 * Ported from `lms-lab-engine/web/index.html`, which stays the reference.
 */
export const P = {
  /** One dry cell, and its internal resistance. */
  cellEmf: 1.5,
  cellR: 0.1,
  /** Laboratory Manual, Experiment 48: four dry cells of 1.5 V with a holder. */
  cells: 4,
  /** The whole holder wired as one battery — the rheostat method's source. */
  emf: 6,
  rBat: 0.4,
  /** Plug-key contact and ammeter shunt resistances. */
  rKey: 0.01,
  rAm: 0.05,
  /** Voltmeter: 1 kΩ per volt of its 10 V range. */
  rVm: 10000,
  /** Rheostat, end to end — matched to this practical's resistor. */
  rRh: 10,
  /**
   * Ammeter: 0–3 A over 60 divisions, so one division is 0.05 A. It is
   * numbered every 10 divisions and carries a medium mark every 5, which is
   * how the instrument is actually engraved: 0, 0.5, 1.0 … 3.0. Numbering it
   * by an even fifth of the scale instead would print 0, 0.6, 1.2 …, and no
   * ammeter reads that way.
   */
  amFS: 3,
  amDivs: 60,
  amMaj: 10,
  amMid: 5,
  lcA: 0.05,
  /** Voltmeter: 0–10 V over 50 divisions, so one division is 0.2 V. */
  vmFS: 10,
  vmDivs: 50,
  vmMaj: 10,
  vmMid: 5,
  lcV: 0.2,
  /**
   * Current out of the cells that counts as a short, and the current through
   * the ammeter that says the short is THROUGH the meter. Both are far above
   * anything the prescribed apparatus reaches (about 1.1 A at four cells) and
   * far below what a dead short draws (15 A).
   */
  shortI: 5,
  amShortI: 4,
  /** Temperature coefficient of nichrome, per °C. */
  alpha: 0.0004,
  /**
   * n·A·e for this coil: its free-electron density times its cross-section
   * times the electron charge, in ampere-seconds per metre. A 0.3 mm nichrome
   * wire at 8.5 × 10²⁸ carriers per cubic metre.
   *
   * Its only job is to turn the solved current into the speed the electrons in
   * the coil actually move at, `I / nAe`, which is the number the animation is
   * drawn from. It is a property of the wire on the board, so it sits here with
   * the wire's other properties; nothing is graded against it.
   */
  nAe: 963,
} as const;

/** What the manual lays out on the bench, printed in step 1. */
export const APPARATUS =
  'a resistor of about 5 Ω, an ammeter (0–3 A), a voltmeter (0–10 V), four dry cells of 1.5 V each ' +
  'with a cell holder, a plug key, connecting wires and a piece of sand paper';

/**
 * Axes for the V–I graph: both a little past what the prescribed apparatus can
 * reach, so four honest points fill the sheet instead of huddling in a corner
 * of one drawn to full scale.
 */
export const GRAPH_MAX = { I: 1.5, V: 6 } as const;

export type TerminalId =
  | 'bat-'
  | 'bat+'
  | 'bat+1'
  | 'bat+2'
  | 'bat+3'
  | 'bat+4'
  | 'key.a'
  | 'key.b'
  | 'am+'
  | 'am-'
  | 'vm+'
  | 'vm-'
  | 'r.a'
  | 'r.b'
  | 'rh.a'
  | 'rh.b'
  | 'rh.c';

export type ComponentId = 'battery' | 'key' | 'ammeter' | 'voltmeter' | 'resistor' | 'rheostat';

export interface Terminal {
  /** Position in bench coordinates (the bench is drawn on a 1000 × 600 canvas). */
  x: number;
  y: number;
  pol?: '+' | '-';
  name: string;
  comp: ComponentId;
}

export const BENCH_WIDTH = 1000;
export const BENCH_HEIGHT = 600;

// ---------------------------------------------------------------------------
// The cell holder
// ---------------------------------------------------------------------------

/** The − stud, then one brass stud after every cell. */
export const BATTERY_X0 = 70;
export const BATTERY_PITCH = 56;
export const TAP_LETTER = ['A', 'B', 'C', 'D', 'E'] as const;

export function tapX(k: number): number {
  return BATTERY_X0 + k * BATTERY_PITCH;
}

/** The terminal id of the stud `k` cells along from the − end. */
export function tapId(k: number): TerminalId {
  return `bat+${k}` as TerminalId;
}

/** Every tap the cells method offers, in order: B, C, D, E. */
export const TAP_IDS: readonly TerminalId[] = Array.from({ length: P.cells }, (_, i) => tapId(i + 1));

function tapName(k: number): string {
  return `Cell tap ${TAP_LETTER[k]} — ${k} cell${k > 1 ? 's' : ''}, ${(k * P.cellEmf).toFixed(1)} V`;
}

export const TERMINALS: Readonly<Record<TerminalId, Terminal>> = {
  'bat-': { x: tapX(0), y: 458, pol: '-', name: 'Battery − (point A)', comp: 'battery' },
  'bat+': { x: tapX(P.cells), y: 458, pol: '+', name: 'Battery +', comp: 'battery' },
  'bat+1': { x: tapX(1), y: 458, pol: '+', name: tapName(1), comp: 'battery' },
  'bat+2': { x: tapX(2), y: 458, pol: '+', name: tapName(2), comp: 'battery' },
  'bat+3': { x: tapX(3), y: 458, pol: '+', name: tapName(3), comp: 'battery' },
  'bat+4': { x: tapX(4), y: 458, pol: '+', name: tapName(4), comp: 'battery' },
  'key.a': { x: 362, y: 480, name: 'Plug key terminal', comp: 'key' },
  'key.b': { x: 478, y: 480, name: 'Plug key terminal', comp: 'key' },
  'am+': { x: 210, y: 232, pol: '+', name: 'Ammeter +', comp: 'ammeter' },
  'am-': { x: 290, y: 232, pol: '-', name: 'Ammeter −', comp: 'ammeter' },
  'vm+': { x: 630, y: 232, pol: '+', name: 'Voltmeter +', comp: 'voltmeter' },
  'vm-': { x: 710, y: 232, pol: '-', name: 'Voltmeter −', comp: 'voltmeter' },
  'r.a': { x: 505, y: 338, name: 'Resistor left end', comp: 'resistor' },
  'r.b': { x: 835, y: 338, name: 'Resistor right end', comp: 'resistor' },
  'rh.a': { x: 588, y: 550, name: 'Rheostat end A', comp: 'rheostat' },
  'rh.b': { x: 912, y: 550, name: 'Rheostat end B', comp: 'rheostat' },
  'rh.c': { x: 588, y: 452, name: 'Rheostat slider C', comp: 'rheostat' },
};

const SHARED_IDS: readonly TerminalId[] = [
  'bat-',
  'key.a',
  'key.b',
  'am+',
  'am-',
  'vm+',
  'vm-',
  'r.a',
  'r.b',
];

const CELL_IDS: readonly TerminalId[] = [...SHARED_IDS, ...TAP_IDS];
const RHEOSTAT_IDS: readonly TerminalId[] = [...SHARED_IDS, 'bat+', 'rh.a', 'rh.b', 'rh.c'];

/**
 * WHICH TERMINALS ARE ON THE BENCH. The method decides: under the cells method
 * the holder shows a stud per cell and there is no rheostat at all; under the
 * rheostat method the holder is wired as one battery and only its two ends
 * show. Nothing outside this list is drawn, solved or wired.
 */
export function terminalIdsFor(method: LabMethod): readonly TerminalId[] {
  return method === 'cells' ? CELL_IDS : RHEOSTAT_IDS;
}

/** Which components are on the bench, for "you have not connected…". */
export function componentsFor(method: LabMethod): readonly ComponentId[] {
  return method === 'cells'
    ? ['battery', 'key', 'ammeter', 'resistor']
    : ['battery', 'key', 'ammeter', 'resistor', 'rheostat'];
}

export const COMPONENT_NAMES: Readonly<Record<ComponentId, string>> = {
  battery: 'battery',
  key: 'plug key',
  ammeter: 'ammeter',
  voltmeter: 'voltmeter',
  resistor: 'resistor',
  rheostat: 'rheostat',
};

/** A terminal screw holds only a few wires. */
export const MAX_WIRES_PER_TERMINAL = 3;

/** How many wires end at a terminal. */
export function wiresAt(wires: readonly Wire<TerminalId>[], id: TerminalId): number {
  return wires.filter((w) => w[0] === id || w[1] === id).length;
}

/**
 * WHICH TAP THE STUDENT HAS ACTUALLY WIRED TO: the highest stud carrying a
 * lead, which is how many cells are driving the circuit.
 *
 * Topology only. It never looks at a meter and never solves anything, so it is
 * the same answer whether the key is in or out — which is what lets the
 * observation table record a cell count for a reading taken with the key in and
 * the bench bar show the same number with it out.
 */
export function cellsUsed(wires: readonly Wire<TerminalId>[], method: LabMethod): number {
  if (method !== 'cells') return P.cells;
  let k = 0;
  for (let i = 1; i <= P.cells; i += 1) if (wiresAt(wires, tapId(i))) k = i;
  return k;
}

/** How many studs carry a lead. More than one shorts the cells between them. */
export function tapsWired(wires: readonly Wire<TerminalId>[]): number {
  let n = 0;
  for (let i = 1; i <= P.cells; i += 1) if (wiresAt(wires, tapId(i))) n += 1;
  return n;
}

// ---------------------------------------------------------------------------
// The textbook layout
// ---------------------------------------------------------------------------

/**
 * One correct wiring per method, used ONLY to suggest the next connection when
 * a hint is bought and to script the guided build. Grading never compares
 * against it: any topology that behaves correctly passes.
 */
const CANON_CELLS: readonly Wire<TerminalId>[] = [
  ['bat+1', 'key.a'],
  ['key.b', 'am+'],
  ['am-', 'r.a'],
  ['r.b', 'bat-'],
  ['vm+', 'r.a'],
  ['vm-', 'r.b'],
];

const CANON_RHEOSTAT: readonly Wire<TerminalId>[] = [
  ['bat+', 'key.a'],
  ['key.b', 'am+'],
  ['am-', 'r.a'],
  ['r.b', 'rh.a'],
  ['rh.c', 'bat-'],
  ['vm+', 'r.a'],
  ['vm-', 'r.b'],
];

export function canonFor(method: LabMethod): readonly Wire<TerminalId>[] {
  return method === 'cells' ? CANON_CELLS : CANON_RHEOSTAT;
}

/**
 * Which node each terminal belongs to in the textbook layout. A wire joining
 * two different nodes is "stray" during the guided build. The practical itself
 * accepts any working topology, so this is never used for marks.
 */
const NET_CELLS: Partial<Record<TerminalId, number>> = {
  'bat+1': 1,
  'key.a': 1,
  'key.b': 2,
  'am+': 2,
  'am-': 3,
  'r.a': 3,
  'vm+': 3,
  'r.b': 4,
  'vm-': 4,
  'bat-': 4,
  'bat+2': 5,
  'bat+3': 6,
  'bat+4': 7,
};

const NET_RHEOSTAT: Partial<Record<TerminalId, number>> = {
  'bat+': 1,
  'key.a': 1,
  'key.b': 2,
  'am+': 2,
  'am-': 3,
  'r.a': 3,
  'vm+': 3,
  'r.b': 4,
  'rh.a': 4,
  'vm-': 4,
  'rh.c': 5,
  'bat-': 5,
  'rh.b': 6,
};

export function textbookNetFor(method: LabMethod): Partial<Record<TerminalId, number>> {
  return method === 'cells' ? NET_CELLS : NET_RHEOSTAT;
}

/**
 * The same layout with the lead moved from tap B to tap `k` — the guided
 * build's "change the current" step, where the only wire that moves is the one
 * on the holder.
 */
export function netAtTap(k: number): Partial<Record<TerminalId, number>> {
  const net = { ...NET_CELLS };
  const b = tapId(1);
  const t = tapId(k);
  const swap = net[b];
  net[b] = net[t];
  net[t] = swap;
  return net;
}

/** Rheostat slider travel along the top rod, in bench coordinates. */
export const SLIDER_X0 = 606;
export const SLIDER_TRAVEL = 288;

/**
 * Each student gets a different unknown nichrome wire, about 5 Ω as the manual
 * prescribes. The spread is deliberately narrow: with four cells behind it the
 * ammeter then runs from roughly a tenth to a third of its 3 A scale and the
 * voltmeter from a seventh to well over half of its 10 V one, which is what
 * four spread-out, readable points on the graph need.
 */
export function benchFromSeed(seed: number): { R0: number } {
  const r = mulberry32(seed);
  return { R0: Math.round((4.5 + r() * 1.2) * 10) / 10 };
}

/**
 * A practice dial for the tutorial. Deliberately a different meter from either
 * of the bench's own — a different range AND a different division count, so the
 * tour teaches the method without answering step 1 for the student.
 *
 * Its needle sits one small division past a labelled number, which is the whole
 * of the skill: 3 + 0.25 = 3.25 V.
 */
export const PRACTICE_DIAL = { fs: 5, divs: 20, value: 3.25 } as const;
