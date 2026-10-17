import { solveNetwork, type Conductance, type Injection, type Wire } from '../circuit';

import {
  BOARDS,
  P,
  RESISTOR_IDS,
  tapId,
  terminalIdsFor,
  type ResistorId,
  type TerminalId,
} from './apparatus';
import type { LabMethod } from './method';

/** The parts of the bench's state the circuit depends on. */
export interface CircuitInputs {
  /** Which apparatus is on the bench: the cell taps, or a battery and rheostat. */
  method: LabMethod;
  wires: readonly Wire<TerminalId>[];
  /** Plug in (closed) or out. */
  key: boolean;
  /** Rheostat slider, 0 at end A to 1 at end B. Ignored under the cells method. */
  s: number;
  /** The two resistors at room temperature. */
  R: Readonly<Record<ResistorId, number>>;
  /** Temperature rise of each coil, °C. */
  T: Readonly<Record<ResistorId, number>>;
}

/** What one resistor board is doing. Signed: negative is backwards. */
export interface BoardReading {
  /** Potential difference across the board. */
  V: number;
  /** Current through the board. */
  I: number;
  /** Its present, temperature-dependent resistance. */
  R: number;
}

/** What the meters and both boards are actually doing. */
export interface BenchReading {
  /** Current through the ammeter. */
  Iam: number;
  /** Potential difference across the voltmeter. */
  Vvm: number;
  /** Current through the voltmeter. */
  Ivm: number;
  /**
   * Current drawn from the cells — under the cells method, the current in the
   * HARDEST-WORKED cell of the chain, which is what a wire laid across two taps
   * actually drains.
   */
  Ibat: number;
  res: Readonly<Record<ResistorId, BoardReading>>;
}

export function resistorOhms(R0: number, T: number): number {
  return R0 * (1 + P.alpha * (T || 0));
}

/**
 * HOW FAST THE ELECTRONS IN A COIL ARE ACTUALLY MOVING, in metres per second.
 *
 * `I = nAev`, so `v = I / nAe`, and for this wire that is a fraction of a
 * millimetre a second at any current the bench can reach. Signed: wire a board
 * the other way round and its carriers go the other way round.
 *
 * THIS IS THE PRACTICAL, DRAWN. Both boards are the same wire, so `nAe`
 * cancels and the ratio of the two speeds IS the ratio of the two currents. In
 * parallel the boards sit across one pair of nodes, so that ratio is G₁/G₂ =
 * R₂/R₁ — the smaller resistance carries the larger share, and carries it
 * visibly. In series it is 1, and both coils run together. Neither is asserted
 * anywhere: both fall out of the same nodal solution the meters are read from,
 * so the drawing cannot claim a division the circuit is not making.
 */
export function driftSpeed(I: number): number {
  return I / P.nAe;
}

/** The drift speed in each coil, from one solved reading. */
export function driftOf(reading: BenchReading): Readonly<Record<ResistorId, number>> {
  return { r1: driftSpeed(reading.res.r1.I), r2: driftSpeed(reading.res.r2.I) };
}

/**
 * Nodal analysis of whatever is wired. Battery − (the holder's stud A) is the
 * reference.
 *
 * Nothing about series or parallel is special-cased: both boards are just two
 * more conductances, so how the student joined them is read out of the answer
 * rather than matched against a template.
 *
 * THE HOLDER IS MODELLED AS WHAT IT IS. Under the cells method it is a chain of
 * three real cells with a stud between every pair: each cell is its own EMF and
 * its own internal resistance between two consecutive studs. Wiring to a tap
 * therefore puts exactly that many cells in the loop, and a wire laid from one
 * tap to another is a short across the cells between — because the equations
 * say so, not because a rule was written for it.
 */
export function solveBench({ method, wires, key, s, R, T }: CircuitInputs): BenchReading {
  const cells = method === 'cells';
  const ohms = {
    r1: resistorOhms(R.r1, T.r1),
    r2: resistorOhms(R.r2, T.r2),
  } as const;

  const conductances: Conductance<TerminalId>[] = [
    { a: 'am+', b: 'am-', g: 1 / P.rAm },
    { a: 'vm+', b: 'vm-', g: 1 / P.rVm },
  ];
  for (const board of BOARDS) {
    conductances.push({ a: `${board.id}.a`, b: `${board.id}.b`, g: 1 / ohms[board.id] });
  }
  const injections: Injection<TerminalId>[] = [];
  /** Each cell of the chain, as the pair of studs it lies between. */
  const chain: [TerminalId, TerminalId][] = [];

  if (cells) {
    let prev: TerminalId = 'bat-';
    for (let k = 1; k <= P.cells; k += 1) {
      const t = tapId(k);
      conductances.push({ a: prev, b: t, g: 1 / P.cellR });
      injections.push({ at: t, amps: P.cellEmf / P.cellR }, { at: prev, amps: -P.cellEmf / P.cellR });
      chain.push([prev, t]);
      prev = t;
    }
  } else {
    conductances.push({ a: 'bat+', b: 'bat-', g: 1 / P.rBat });
    injections.push({ at: 'bat+', amps: P.emf / P.rBat }, { at: 'bat-', amps: -P.emf / P.rBat });
    // The slider splits the coil; a floor keeps an end-stop from being a dead short.
    conductances.push(
      { a: 'rh.a', b: 'rh.c', g: 1 / Math.max(P.rRh * s, 0.02) },
      { a: 'rh.c', b: 'rh.b', g: 1 / Math.max(P.rRh * (1 - s), 0.02) },
    );
  }
  if (key) conductances.push({ a: 'key.a', b: 'key.b', g: 1 / P.rKey });

  const v = solveNetwork<TerminalId>({
    terminals: terminalIdsFor(method),
    wires,
    ground: 'bat-',
    conductances,
    injections,
  });

  let Ibat = 0;
  if (cells) {
    for (const [a, b] of chain) {
      const Ik = (P.cellEmf - (v(b) - v(a))) / P.cellR;
      if (Math.abs(Ik) > Math.abs(Ibat)) Ibat = Ik;
    }
  } else {
    Ibat = (P.emf - (v('bat+') - v('bat-'))) / P.rBat;
  }

  const res = {} as Record<ResistorId, BoardReading>;
  for (const id of RESISTOR_IDS) {
    const Vr = v(`${id}.a`) - v(`${id}.b`);
    res[id] = { V: Vr, I: Vr / ohms[id], R: ohms[id] };
  }

  const Vvm = v('vm+') - v('vm-');
  return {
    Iam: (v('am+') - v('am-')) / P.rAm,
    Vvm,
    Ivm: Vvm / P.rVm,
    Ibat,
    res,
  };
}
