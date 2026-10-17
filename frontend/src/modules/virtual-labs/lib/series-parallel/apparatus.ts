import type { Wire } from '../circuit';
import { mulberry32 } from '../seed';
import type { RichText } from '../types';

import type { LabMethod } from './method';

/**
 * The simulated apparatus for "Equivalent resistance of two resistors in
 * series and in parallel" (CBSE Class X practical 5, NCERT Ch. 11 Electricity).
 *
 * THE METERS BELONG TO THE PRACTICAL, NOT TO THE BENCH. The CBSE Laboratory
 * Manual prescribes 0–5 A and 0–5 V for Experiment 5 — a different pair from
 * Experiment 4's — because the resistors are different: two of about 2 Ω each,
 * across which three cells drive a current of amperes rather than milliamperes.
 * Full scale, the division count and the least count are declared together
 * here, so a dial, a least count and a full-scale check can never disagree.
 *
 * Ported from `lms-lab-engine/web/index.html` (`PRACTICALS['series-parallel']`),
 * which stays the reference.
 */
export const P = {
  /** One dry cell, and its internal resistance. */
  cellEmf: 1.5,
  cellR: 0.1,
  /** Laboratory Manual, Experiments 50 and 51: three dry cells with a holder. */
  cells: 3,
  /** The whole holder wired as one battery — the rheostat method's source. */
  emf: 4.5,
  rBat: 0.3,
  /** Plug-key contact and ammeter shunt resistances. */
  rKey: 0.01,
  rAm: 0.05,
  /** Voltmeter: 1 kΩ per volt of its 5 V range. */
  rVm: 5000,
  /**
   * Rheostat, end to end. FIVE ohms, not twenty: a 20 Ω coil would swamp 2 Ω
   * resistors and leave the voltmeter on a twentieth of full scale. A control
   * has to be matched to what it is controlling.
   */
  rRh: 5,
  /** Ammeter: 0–5 A over 50 divisions, so one division is 0.1 A. */
  amFS: 5,
  amDivs: 50,
  lcA: 0.1,
  /** Voltmeter: 0–5 V over 50 divisions, so one division is 0.1 V. */
  vmFS: 5,
  vmDivs: 50,
  lcV: 0.1,
  /**
   * Current out of the cells that counts as a short, and the current through
   * the ammeter that says the short is THROUGH the meter. The parallel
   * combination at three cells draws over 3 A honestly, so the threshold sits
   * well above that and well below the 15 A a dead short draws.
   */
  shortI: 7,
  amShortI: 6,
  /** Temperature coefficient of nichrome, per °C. */
  alpha: 0.0004,
  /**
   * n·A·e for either coil: free-electron density times cross-section times the
   * electron charge, in ampere-seconds per metre. Both boards are wound from
   * the same 0.3 mm nichrome, which is what makes the comparison fair — the
   * carriers in R₁ and R₂ differ in speed ONLY because the currents differ.
   *
   * `driftSpeed` is `I / nAe`, and that is the number the bench animates from.
   * Nothing is graded against it.
   */
  nAe: 963,
} as const;

/** What the manual lays out on the bench, printed in step 1. */
export const APPARATUS =
  'two resistors of about 2 Ω each, an ammeter (0–5 A), a voltmeter (0–5 V), three dry cells of 1.5 V each ' +
  'with a cell holder, a plug key, connecting wires and a piece of sand paper';

/**
 * Axes for the four V–I lines: a little past what the prescribed apparatus can
 * reach, so the parallel line (the shallowest, and the one that runs furthest
 * along the current axis) and the series line both fit on one sheet.
 */
export const GRAPH_MAX = { I: 4, V: 5 } as const;

export type TerminalId =
  | 'bat-'
  | 'bat+'
  | 'bat+1'
  | 'bat+2'
  | 'bat+3'
  | 'key.a'
  | 'key.b'
  | 'am+'
  | 'am-'
  | 'vm+'
  | 'vm-'
  | 'r1.a'
  | 'r1.b'
  | 'r2.a'
  | 'r2.b'
  | 'rh.a'
  | 'rh.b'
  | 'rh.c';

/** The two unknown resistors on their boards. */
export type ResistorId = 'r1' | 'r2';
export const RESISTOR_IDS: readonly ResistorId[] = ['r1', 'r2'];

export type ComponentId = 'battery' | 'key' | 'ammeter' | 'voltmeter' | 'rheostat' | ResistorId;

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

/**
 * The two resistor boards. Stacked where the single nichrome board sits on the
 * Ohm's law bench, thinner so both fit between the meters and the rheostat.
 */
export interface Board {
  id: ResistorId;
  /** Top edge and height of the wooden board, in bench coordinates. */
  y: number;
  h: number;
  name: string;
  tag: string;
}

export const BOARDS: readonly Board[] = [
  { id: 'r1', y: 262, h: 54, name: 'R₁', tag: 'R₁ · unknown' },
  { id: 'r2', y: 336, h: 54, name: 'R₂', tag: 'R₂ · unknown' },
];

/** Centre line of a board: where its two brass terminals sit. */
export function boardY(board: Board): number {
  return board.y + board.h / 2;
}

// ---------------------------------------------------------------------------
// The cell holder
// ---------------------------------------------------------------------------

/** The − stud, then one brass stud after every cell. */
export const BATTERY_X0 = 70;
export const BATTERY_PITCH = 56;
export const TAP_LETTER = ['A', 'B', 'C', 'D'] as const;

export function tapX(k: number): number {
  return BATTERY_X0 + k * BATTERY_PITCH;
}

/** The terminal id of the stud `k` cells along from the − end. */
export function tapId(k: number): TerminalId {
  return `bat+${k}` as TerminalId;
}

/** Every tap the cells method offers, in order: B, C, D. */
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
  'key.a': { x: 362, y: 480, name: 'Plug key terminal', comp: 'key' },
  'key.b': { x: 478, y: 480, name: 'Plug key terminal', comp: 'key' },
  'am+': { x: 210, y: 232, pol: '+', name: 'Ammeter +', comp: 'ammeter' },
  'am-': { x: 290, y: 232, pol: '-', name: 'Ammeter −', comp: 'ammeter' },
  'vm+': { x: 630, y: 232, pol: '+', name: 'Voltmeter +', comp: 'voltmeter' },
  'vm-': { x: 710, y: 232, pol: '-', name: 'Voltmeter −', comp: 'voltmeter' },
  'r1.a': { x: 505, y: 289, name: 'R₁ left end', comp: 'r1' },
  'r1.b': { x: 835, y: 289, name: 'R₁ right end', comp: 'r1' },
  'r2.a': { x: 505, y: 363, name: 'R₂ left end', comp: 'r2' },
  'r2.b': { x: 835, y: 363, name: 'R₂ right end', comp: 'r2' },
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
  'r1.a',
  'r1.b',
  'r2.a',
  'r2.b',
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

export const COMPONENT_NAMES: Readonly<Record<ComponentId, string>> = {
  battery: 'battery',
  key: 'plug key',
  ammeter: 'ammeter',
  voltmeter: 'voltmeter',
  rheostat: 'rheostat',
  r1: 'R₁',
  r2: 'R₂',
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
 * the same answer whether the key is in or out.
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

/** Rheostat slider travel along the top rod, in bench coordinates. */
export const SLIDER_X0 = 606;
export const SLIDER_TRAVEL = 288;

// ---------------------------------------------------------------------------
// The four circuits
// ---------------------------------------------------------------------------

export type ConfigId = 'r1' | 'r2' | 'series' | 'parallel';
export const CONFIG_IDS: readonly ConfigId[] = ['r1', 'r2', 'series', 'parallel'];

export type ConfigMode = 'single' | 'series' | 'parallel';

/** A field written per method; anything else is the same for both. */
export type ByMethod<T> = T | Readonly<Record<LabMethod, T>>;

export function byMethod<T>(value: ByMethod<T>, method: LabMethod): T {
  return value && typeof value === 'object' && !Array.isArray(value) && 'cells' in value
    ? (value as Record<LabMethod, T>)[method]
    : (value as T);
}

export interface ConfigSpec {
  id: ConfigId;
  /** Which boards are under test. */
  ids: readonly ResistorId[];
  mode: ConfigMode;
  /** How the assistant names what is under test, mid-sentence. */
  name: string;
  /** Column and tab label. */
  label: string;
  /** The symbol its mean V/I is called by: R₁, R₂, Rs, Rp. */
  short: string;
  /** Readings required before the circuit is done. */
  readings: number;
  /** A theme hue key, so the four circuits keep one colour each throughout. */
  hue: 'blue' | 'green' | 'violet' | 'amber';
  /**
   * One correct wiring per method, used ONLY to suggest the next connection
   * when a hint is bought and to script the guided build. Grading never
   * compares against it: any topology that behaves correctly passes.
   */
  canon: Readonly<Record<LabMethod, readonly Wire<TerminalId>[]>>;
  title: string;
  instruction: ByMethod<RichText>;
  okMessage: RichText;
}

const HEAD: Readonly<Record<LabMethod, readonly Wire<TerminalId>[]>> = {
  cells: [
    ['bat+1', 'key.a'],
    ['key.b', 'am+'],
  ],
  rheostat: [
    ['bat+', 'key.a'],
    ['key.b', 'am+'],
  ],
};

export const CONFIGS: Readonly<Record<ConfigId, ConfigSpec>> = {
  r1: {
    id: 'r1',
    ids: ['r1'],
    mode: 'single',
    name: 'R₁',
    label: 'R₁ alone',
    short: 'R₁',
    readings: 3,
    hue: 'blue',
    canon: {
      cells: [...HEAD.cells, ['am-', 'r1.a'], ['r1.b', 'bat-'], ['vm+', 'r1.a'], ['vm-', 'r1.b']],
      rheostat: [...HEAD.rheostat, ['am-', 'r1.a'], ['r1.b', 'rh.a'], ['rh.c', 'bat-'], ['vm+', 'r1.a'], ['vm-', 'r1.b']],
    },
    title: 'Measure R₁ on its own',
    instruction: {
      cells:
        'Build the circuit with **only R₁**: cell holder → key → ammeter → R₁ → back to the holder, with the voltmeter across R₁. Take the loop off the holder at **tap B**, so it starts with one cell. Leave R₂ unconnected.',
      rheostat:
        'Build the circuit with **only R₁**: battery → key → ammeter → R₁ → rheostat → back to the battery, with the voltmeter across R₁. Leave R₂ unconnected.',
    },
    okMessage: 'Circuit approved: R₁ alone, with the ammeter in series and the voltmeter across R₁.',
  },
  r2: {
    id: 'r2',
    ids: ['r2'],
    mode: 'single',
    name: 'R₂',
    label: 'R₂ alone',
    short: 'R₂',
    readings: 3,
    hue: 'green',
    canon: {
      cells: [...HEAD.cells, ['am-', 'r2.a'], ['r2.b', 'bat-'], ['vm+', 'r2.a'], ['vm-', 'r2.b']],
      rheostat: [...HEAD.rheostat, ['am-', 'r2.a'], ['r2.b', 'rh.a'], ['rh.c', 'bat-'], ['vm+', 'r2.a'], ['vm-', 'r2.b']],
    },
    title: 'Measure R₂ on its own',
    instruction:
      'Take the key out, then swap R₁ for **R₂**. The quickest way: move each wire on R₁’s ends — the voltmeter leads too — to the same end of R₂.',
    okMessage: 'Circuit approved: R₂ alone, with the ammeter in series and the voltmeter across R₂.',
  },
  series: {
    id: 'series',
    ids: ['r1', 'r2'],
    mode: 'series',
    name: 'the series combination',
    label: 'Series',
    short: 'Rs',
    readings: 3,
    hue: 'violet',
    canon: {
      cells: [
        ...HEAD.cells,
        ['am-', 'r1.a'],
        ['r1.b', 'r2.a'],
        ['r2.b', 'bat-'],
        ['vm+', 'r1.a'],
        ['vm-', 'r2.b'],
      ],
      rheostat: [
        ...HEAD.rheostat,
        ['am-', 'r1.a'],
        ['r1.b', 'r2.a'],
        ['r2.b', 'rh.a'],
        ['rh.c', 'bat-'],
        ['vm+', 'r1.a'],
        ['vm-', 'r2.b'],
      ],
    },
    title: 'R₁ and R₂ in series',
    instruction:
      'Connect R₁ and R₂ **one after the other**, so the same current passes through both. The voltmeter goes across the **whole combination** — from the free end of R₁ to the free end of R₂.',
    okMessage: 'Circuit approved: R₁ and R₂ in series, with the voltmeter across both.',
  },
  parallel: {
    id: 'parallel',
    ids: ['r1', 'r2'],
    mode: 'parallel',
    name: 'the parallel combination',
    label: 'Parallel',
    short: 'Rp',
    readings: 3,
    hue: 'amber',
    canon: {
      cells: [
        ...HEAD.cells,
        ['am-', 'r1.a'],
        ['r1.a', 'r2.a'],
        ['r1.b', 'r2.b'],
        ['r2.b', 'bat-'],
        ['vm+', 'r1.a'],
        ['vm-', 'r1.b'],
      ],
      rheostat: [
        ...HEAD.rheostat,
        ['am-', 'r1.a'],
        ['r1.a', 'r2.a'],
        ['r1.b', 'r2.b'],
        ['r2.b', 'rh.a'],
        ['rh.c', 'bat-'],
        ['vm+', 'r1.a'],
        ['vm-', 'r1.b'],
      ],
    },
    title: 'R₁ and R₂ in parallel',
    instruction:
      'Connect R₁ and R₂ **side by side**: join both left ends together and both right ends together. The ammeter stays in the main line and the voltmeter goes across the pair. In parallel the current is larger — keep an eye on the ammeter.',
    okMessage:
      'Circuit approved: R₁ and R₂ in parallel, ammeter in the main line, voltmeter across the pair.',
  },
};

export function canonOf(config: ConfigSpec, method: LabMethod): readonly Wire<TerminalId>[] {
  return config.canon[method];
}

/** Which components are on the bench for a circuit, for "you have not connected…". */
export function componentsFor(config: ConfigSpec, method: LabMethod): readonly ComponentId[] {
  return method === 'cells'
    ? ['battery', 'key', 'ammeter', ...config.ids]
    : ['battery', 'key', 'ammeter', ...config.ids, 'rheostat'];
}

/**
 * Which node each terminal belongs to in the textbook layout of a combination.
 * A wire joining two different nodes is "stray" during the guided build. The
 * practical itself accepts any working topology, so this is never used for marks.
 */
export type BuildNetId = 'series' | 'parallel';

export const BUILD_NETS: Readonly<
  Record<LabMethod, Readonly<Record<BuildNetId, Partial<Record<TerminalId, number>>>>>
> = {
  cells: {
    series: {
      'bat+1': 1,
      'key.a': 1,
      'key.b': 2,
      'am+': 2,
      'am-': 3,
      'r1.a': 3,
      'vm+': 3,
      'r1.b': 4,
      'r2.a': 4,
      'r2.b': 5,
      'vm-': 5,
      'bat-': 5,
      'bat+2': 6,
      'bat+3': 7,
    },
    parallel: {
      'bat+1': 1,
      'key.a': 1,
      'key.b': 2,
      'am+': 2,
      'am-': 3,
      'r1.a': 3,
      'r2.a': 3,
      'vm+': 3,
      'r1.b': 5,
      'r2.b': 5,
      'vm-': 5,
      'bat-': 5,
      'bat+2': 6,
      'bat+3': 7,
    },
  },
  rheostat: {
    series: {
      'bat+': 1,
      'key.a': 1,
      'key.b': 2,
      'am+': 2,
      'am-': 3,
      'r1.a': 3,
      'vm+': 3,
      'r1.b': 4,
      'r2.a': 4,
      'r2.b': 5,
      'rh.a': 5,
      'vm-': 5,
      'rh.c': 6,
      'bat-': 6,
      'rh.b': 7,
    },
    parallel: {
      'bat+': 1,
      'key.a': 1,
      'key.b': 2,
      'am+': 2,
      'am-': 3,
      'r1.a': 3,
      'r2.a': 3,
      'vm+': 3,
      'r1.b': 5,
      'r2.b': 5,
      'rh.a': 5,
      'vm-': 5,
      'rh.c': 6,
      'bat-': 6,
      'rh.b': 7,
    },
  },
};

export function buildNetFor(
  net: BuildNetId,
  method: LabMethod,
): Partial<Record<TerminalId, number>> {
  return BUILD_NETS[method][net];
}

/**
 * Each student gets a different pair of unknown resistors, both about 2 Ω as
 * the manual prescribes: R₁ 1.7–2.0 Ω and R₂ 2.2–2.5 Ω.
 *
 * They are nominally equal and the bench keeps them a little apart, so that
 * "the same current" and "the same potential difference" stay the tests that
 * tell series from parallel rather than being true by accident. With three
 * cells behind them the parallel combination — the least resistance of the four
 * and so the largest current — still comes in comfortably under the ammeter's
 * 5 A scale, and the voltmeter sits between a quarter and four fifths of its
 * 5 V one in every circuit.
 */
export function benchFromSeed(seed: number): { r1: number; r2: number } {
  const rnd = mulberry32(seed);
  const round1 = (x: number): number => Math.round(x * 10) / 10;
  const r1 = round1(1.7 + rnd() * 0.3);
  const r2 = round1(2.2 + rnd() * 0.3);
  return { r1, r2 };
}

/**
 * A practice dial for the tutorial. Deliberately a different meter from either
 * of the bench's own — a different range AND a different division count, so the
 * tour teaches the method without answering step 1 for the student.
 */
export const PRACTICE_DIAL = { fs: 10, divs: 20, value: 6.5 } as const;
