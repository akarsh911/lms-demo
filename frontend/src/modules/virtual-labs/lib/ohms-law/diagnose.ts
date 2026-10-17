import { netsOf, type Wire } from '../circuit';
import type { RichText } from '../types';

import {
  COMPONENT_NAMES,
  P,
  TAP_LETTER,
  TERMINALS,
  canonFor,
  cellsUsed,
  componentsFor,
  netAtTap,
  tapsWired,
  terminalIdsFor,
  textbookNetFor,
  wiresAt,
  type TerminalId,
} from './apparatus';
import type { LabMethod } from './method';
import { solveBench, type BenchReading, type CircuitInputs } from './solve';

/**
 * The lab assistant: it diagnoses a circuit BY EXPERIMENT, not by pattern
 * matching. It re-solves the student's own wiring with the key forced closed,
 * forced open, and (under the rheostat method) the coil at both ends, and reads
 * off what would happen. It never compares against a reference wiring, so any
 * correct topology passes.
 *
 * Under the cells method it also insists on EXACTLY ONE LEAD ON THE HOLDER. Two
 * studs wired is a wire lying straight across the cells between them, which
 * short-circuits them — an examinable misconception, so it is diagnosed rather
 * than quietly allowed.
 */

export type DiagnosisCode =
  | 'empty'
  | 'cell-taps'
  | 'no-tap'
  | 'am-parallel'
  | 'short'
  | 'vm-series'
  | 'am-across-r'
  | 'r-bypass'
  | 'open'
  | 'am-out'
  | 'am-branch'
  | 'am-reverse'
  | 'vm-out'
  | 'vm-wrong'
  | 'vm-reverse'
  | 'key-out'
  | 'rh-ends'
  | 'rh-out';

export type Diagnosis =
  | { ok: false; code: DiagnosisCode; msg: RichText }
  | { ok: true; code: 'ok'; lo: BenchReading; hi: BenchReading };

export { wiresAt };

export function diagnose(c: CircuitInputs): Diagnosis {
  const fail = (code: DiagnosisCode, msg: RichText): Diagnosis => ({ ok: false, code, msg });
  const { wires, method } = c;
  const cells = method === 'cells';

  if (!wires.length) {
    return fail(
      'empty',
      cells
        ? 'No wires yet. Start at a **cell tap** and follow the path current will take: cell holder → plug key → ammeter → resistor → back to the holder’s **−** stud at A.'
        : 'No wires yet. Start at the battery’s **+** terminal and follow the path current will take: battery → plug key → ammeter → resistor → rheostat → back to battery **−**.',
    );
  }

  if (cells) {
    const taps = tapsWired(wires);
    if (taps > 1) {
      return fail(
        'cell-taps',
        'Leads are on **more than one cell tap**. A wire from one tap to another lies straight across the cells between them and short-circuits them. Exactly **one** tap carries a lead — the one that says how many cells are in the circuit.',
      );
    }
    if (!taps) {
      return fail(
        'no-tap',
        `No lead on any **cell tap**. The circuit has to leave the holder at one of the studs ${TAP_LETTER.slice(1, P.cells + 1).join(', ')}, and which one you choose is how many cells drive it.`,
      );
    }
  }

  const lo = solveBench({ ...c, key: true, s: 0 });
  const hi = solveBench({ ...c, key: true, s: 1 });
  const open = solveBench({ ...c, key: false });

  for (const r of [hi, lo]) {
    if (Math.abs(r.Ibat) > P.shortI) {
      if (Math.abs(r.Iam) > P.amShortI) {
        return fail(
          'am-parallel',
          'That would be a **short circuit through the ammeter**. An ammeter has almost no resistance, so wired across anything it lets huge current flow — enough to burn the meter. It belongs **in series**: in the loop, one after another.',
        );
      }
      return fail(
        'short',
        `There is a path from the cells’ **+** side to their **−** side with almost no resistance — a **short circuit**. Every path out of the cells must pass through ${cells ? 'a resistor' : 'a resistor or the rheostat'} first.`,
      );
    }
    if (Math.abs(r.Ivm) > 5e-5 && Math.abs(r.Ir) < 0.01 && Math.abs(r.Vvm) > 1) {
      return fail(
        'vm-series',
        `The **voltmeter is in series**. Its resistance is huge (${(P.rVm / 1000).toFixed(0)} kΩ), so it chokes the current to almost zero — that’s why the ammeter barely moves. Connect the voltmeter **across** the resistor instead: one lead to each end of the wire.`,
      );
    }
    if (Math.abs(r.Ir) < 0.01) {
      if (
        Math.abs(r.Iam) > 0.01 &&
        Math.abs(Math.abs(r.Iam) - Math.abs(r.Ibat)) < 0.02 &&
        Math.abs(r.Vr) < 0.05
      ) {
        return fail(
          'am-across-r',
          'The **ammeter is connected across the resistor**. With almost no resistance of its own, it steals all the current and the resistor gets none. Take it off the resistor’s ends and put it **in series**, in the loop before the resistor.',
        );
      }
      if (Math.abs(r.Ibat) > 0.01) {
        return fail(
          'r-bypass',
          'Current flows, but **not through the resistor** — a wire joins its two ends or it is left out of the loop. The resistor must be one link in the single loop.',
        );
      }
      const loose = componentsFor(method).filter(
        (k) => !terminalIdsFor(method).some((id) => TERMINALS[id].comp === k && wiresAt(wires, id)),
      );
      return fail(
        'open',
        loose.length
          ? `The loop isn’t complete yet. Still not connected: **${loose.map((k) => COMPONENT_NAMES[k]).join(', ')}**.`
          : `Every component has a wire, but there is **no complete loop**. Trace from the ${cells ? 'cell tap' : 'battery +'} with your finger — the path breaks somewhere before it returns to the **−** stud.`,
      );
    }
    if (Math.abs(r.Iam) < 0.005) {
      return fail(
        'am-out',
        'No current passes through the **ammeter**. It must sit inside the main loop, so the same current that flows through the resistor also flows through it.',
      );
    }
    if (Math.abs(Math.abs(r.Iam) - Math.abs(r.Ir)) > 0.03 * Math.abs(r.Ir) + 0.002) {
      return fail(
        'am-branch',
        'The ammeter and the resistor are **not carrying the same current** — part of it takes another path. Put the ammeter in the same single loop as the resistor, with no branch between them.',
      );
    }
    if (r.Iam < 0) {
      return fail(
        'am-reverse',
        'The ammeter would deflect **backwards** — its terminals are reversed. Current must enter at the **+** (red) terminal, the side wired towards battery +.',
      );
    }
    if (Math.abs(r.Vvm) < 0.02) {
      return fail(
        'vm-out',
        'The **voltmeter** isn’t measuring anything yet. Connect its two terminals to the two ends of the resistor.',
      );
    }
    if (Math.abs(Math.abs(r.Vvm) - Math.abs(r.Vr)) > 0.03 * Math.abs(r.Vr) + 0.02) {
      return fail(
        'vm-wrong',
        'The voltmeter is across the **wrong two points** — it includes more (or less) than the resistor. Its leads should go to the resistor’s two ends and nothing else in between.',
      );
    }
    if (r.Vvm < 0) {
      return fail(
        'vm-reverse',
        'The voltmeter would deflect **backwards**. Swap its leads: **+** goes to the resistor end nearer battery +.',
      );
    }
  }

  if (Math.abs(open.Ibat) > 1e-3 || Math.abs(open.Ir) > 0.005) {
    return fail(
      'key-out',
      'Pulling the plug out of the key **doesn’t stop the current**, so the key isn’t in the main loop (or a wire bypasses it). The key must be the one switch every bit of current passes through.',
    );
  }

  // Only the rheostat method has a control whose travel can be tested; under the
  // cells method `lo` and `hi` are the same circuit, and must be.
  if (!cells && Math.abs(Math.abs(hi.Iam) - Math.abs(lo.Iam)) < 0.02) {
    if (wiresAt(wires, 'rh.a') && wiresAt(wires, 'rh.b') && !wiresAt(wires, 'rh.c')) {
      return fail(
        'rh-ends',
        'You used **both end terminals** of the rheostat (A and B), so the whole coil is always in the circuit and sliding does nothing. Move one wire to the **sliding contact C** on the top rod.',
      );
    }
    return fail(
      'rh-out',
      'Moving the rheostat slider **doesn’t change the current**, so the rheostat isn’t doing its job. Connect it in series: one end terminal (A or B) and the slider terminal C.',
    );
  }

  return { ok: true, code: 'ok', lo, hi };
}

/** Whether two terminals are already on one electrical node. */
export function joined(
  wires: readonly Wire<TerminalId>[],
  a: TerminalId,
  b: TerminalId,
  method: LabMethod,
): boolean {
  const find = netsOf(terminalIdsFor(method), wires);
  return find(a) === find(b);
}

/** The first textbook wire that is not yet in place, for a bought hint. */
export function nextCanonWire(
  wires: readonly Wire<TerminalId>[],
  method: LabMethod,
): Wire<TerminalId> | null {
  const find = netsOf(terminalIdsFor(method), wires);
  return canonFor(method).find(([a, b]) => find(a) !== find(b)) ?? null;
}

/** Indexes of wires that join two different textbook nodes (guided build only). */
export function strayWires(
  wires: readonly Wire<TerminalId>[],
  net: Partial<Record<TerminalId, number>>,
): number[] {
  return wires.flatMap((w, i) => (net[w[0]] !== net[w[1]] ? [i] : []));
}

/**
 * Stray wires for the bench AS IT STANDS, which is what the guided build
 * flashes red and what its steps are judged against.
 *
 * Under the cells method the layout FOLLOWS THE LEAD. Moving the single lead
 * from B to C is the whole of "change the current", so a lead on C is the
 * textbook layout once it is there — while a SECOND lead, on a lower tap, is
 * stray and flashes, which is exactly the mistake worth showing.
 */
export function strayWiresFor(
  wires: readonly Wire<TerminalId>[],
  method: LabMethod,
): number[] {
  if (method !== 'cells') return strayWires(wires, textbookNetFor(method));
  return strayWires(wires, netAtTap(Math.max(1, cellsUsed(wires, method))));
}
