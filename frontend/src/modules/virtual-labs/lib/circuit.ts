/**
 * A DC circuit solver for wired benches: nodal analysis over whatever the
 * student actually connected.
 *
 * Nothing is scripted. Wires merge terminals into electrical nodes; every
 * component is a conductance between two terminals; a battery is its Norton
 * equivalent (a conductance plus an injected current). One terminal is the
 * reference. So a voltmeter wired in series really does choke the current, and
 * an ammeter across the supply really does short it, because that is what the
 * equations say, not because a rule was written for it.
 *
 * Bench-agnostic on purpose: the Ohm's law bench, a series/parallel bench and a
 * resistivity bench all describe themselves as terminals + elements and share
 * this file.
 */

export type Wire<T extends string = string> = readonly [T, T];

/** A conductance `g` (siemens) between two terminals. */
export interface Conductance<T extends string = string> {
  a: T;
  b: T;
  g: number;
}

/** A current (amperes) injected into the node a terminal belongs to. */
export interface Injection<T extends string = string> {
  at: T;
  amps: number;
}

/**
 * Union-find over terminals. Returns `find`, which maps a terminal to the id
 * of the node it belongs to. Two terminals are on one node iff `find` agrees.
 */
export function netsOf<T extends string>(
  terminals: readonly T[],
  wires: readonly Wire<T>[],
): (terminal: T) => T {
  const parent = new Map<T, T>(terminals.map((t) => [t, t]));
  const find = (x: T): T => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  for (const [a, b] of wires) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  return find;
}

/** Gaussian elimination with partial pivoting. Singular rows resolve to 0. */
function gauss(A: number[][], b: number[]): number[] {
  const n = b.length;
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) {
      if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    }
    [A[c], A[p]] = [A[p]!, A[c]!];
    [b[c], b[p]] = [b[p]!, b[c]!];
    const d = A[c]![c]!;
    if (Math.abs(d) < 1e-300) continue;
    for (let r = c + 1; r < n; r += 1) {
      const f = A[r]![c]! / d;
      if (!f) continue;
      for (let k = c; k < n; k += 1) A[r]![k]! -= f * A[c]![k]!;
      b[r]! -= f * b[c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = b[r]!;
    for (let k = r + 1; k < n; k += 1) s -= A[r]![k]! * x[k]!;
    x[r] = Math.abs(A[r]![r]!) < 1e-300 ? 0 : s / A[r]![r]!;
  }
  return x;
}

/**
 * Solve a network and return the potential of any terminal, relative to
 * `ground`.
 *
 * A tiny leak to ground on every node keeps floating islands (a meter wired to
 * nothing) solvable instead of singular; at 1e-7 S it is invisible at any
 * reading a student can take.
 */
export function solveNetwork<T extends string>({
  terminals,
  wires,
  ground,
  conductances,
  injections,
}: {
  terminals: readonly T[];
  wires: readonly Wire<T>[];
  ground: T;
  conductances: readonly Conductance<T>[];
  injections: readonly Injection<T>[];
}): (terminal: T) => number {
  const find = netsOf(terminals, wires);
  const gnd = find(ground);

  const index = new Map<T, number>();
  for (const t of terminals) {
    const r = find(t);
    if (r !== gnd && !index.has(r)) index.set(r, index.size);
  }
  const node = (t: T): number => {
    const r = find(t);
    return r === gnd ? -1 : index.get(r)!;
  };

  const n = index.size;
  const G = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const I = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) G[i]![i]! += 1e-7;

  for (const { a, b, g } of conductances) {
    const i = node(a);
    const j = node(b);
    if (i === j) continue;
    if (i >= 0) G[i]![i]! += g;
    if (j >= 0) G[j]![j]! += g;
    if (i >= 0 && j >= 0) {
      G[i]![j]! -= g;
      G[j]![i]! -= g;
    }
  }
  for (const { at, amps } of injections) {
    const i = node(at);
    if (i >= 0) I[i]! += amps;
  }

  const V = gauss(G, I);
  return (t) => {
    const i = node(t);
    return i < 0 ? 0 : V[i]!;
  };
}
