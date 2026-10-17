import { solveNetwork, type Conductance, type Injection, type Wire } from '../circuit';

import { P, tapId, terminalIdsFor, type TerminalId } from './apparatus';
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
  /** The nichrome wire's resistance at room temperature. */
  R0: number;
  /** Temperature rise of the nichrome, °C. */
  T: number;
}

/** What the meters and the wire are actually doing. Signed: negative is backwards. */
export interface BenchReading {
  /** Current through the ammeter. */
  Iam: number;
  /** Potential difference across the voltmeter. */
  Vvm: number;
  /** Potential difference across the resistor. */
  Vr: number;
  /** Current through the resistor. */
  Ir: number;
  /** Current through the voltmeter. */
  Ivm: number;
  /**
   * Current drawn from the cells — under the cells method, the current in the
   * HARDEST-WORKED cell of the chain, which is what a wire laid across two taps
   * actually drains.
   */
  Ibat: number;
  /** The resistor's present, temperature-dependent resistance. */
  R: number;
}

export function resistorOhms(R0: number, T: number): number {
  return R0 * (1 + P.alpha * (T || 0));
}

/**
 * HOW FAST THE ELECTRONS IN THE COIL ARE ACTUALLY MOVING, in metres per second.
 *
 * `I = nAev`, so `v = I / nAe`, and for this wire that is a fraction of a
 * millimetre a second at any current the bench can reach. It is signed: wire
 * the circuit the other way round and the carriers go the other way round too.
 *
 * The bench draws its carriers from this rather than from the current directly
 * for one reason worth keeping: it is the SAME current the ammeter is reading
 * and the marking is computed from, put through one divide, so a student who
 * moves the lead to the next tap sees the needle and the carriers answer
 * together because they are answering the same number.
 */
export function driftSpeed(I: number): number {
  return I / P.nAe;
}

/**
 * Nodal analysis of whatever is wired. Battery − (the holder's stud A) is the
 * reference.
 *
 * THE HOLDER IS MODELLED AS WHAT IT IS. Under the cells method it is a chain of
 * four real cells with a stud between every pair: each cell is its own EMF and
 * its own internal resistance between two consecutive studs. Wiring to a tap
 * therefore puts exactly that many cells in the loop, and the ones beyond it
 * hang off the end of the chain and carry nothing — nothing anywhere counts
 * taps or special-cases them. A wire laid from one tap to another is a short
 * across the cells between, for the same reason: the equations say so.
 */
export function solveBench({ method, wires, key, s, R0, T }: CircuitInputs): BenchReading {
  const cells = method === 'cells';
  const R = resistorOhms(R0, T);

  const conductances: Conductance<TerminalId>[] = [
    { a: 'am+', b: 'am-', g: 1 / P.rAm },
    { a: 'vm+', b: 'vm-', g: 1 / P.rVm },
    { a: 'r.a', b: 'r.b', g: 1 / R },
  ];
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

  const Vr = v('r.a') - v('r.b');
  const Vvm = v('vm+') - v('vm-');
  return {
    Iam: (v('am+') - v('am-')) / P.rAm,
    Vvm,
    Vr,
    Ir: Vr / R,
    Ivm: Vvm / P.rVm,
    Ibat,
    R,
  };
}
