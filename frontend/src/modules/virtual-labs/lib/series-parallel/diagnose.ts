import { netsOf, type Wire } from '../circuit';
import type { RichText } from '../types';

import {
  COMPONENT_NAMES,
  P,
  RESISTOR_IDS,
  TAP_LETTER,
  TERMINALS,
  canonOf,
  cellsUsed,
  componentsFor,
  tapsWired,
  terminalIdsFor,
  wiresAt,
  type ConfigSpec,
  type ResistorId,
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
 * `config` says what should be under test — one resistor, or two in series or
 * in parallel — and series is told from parallel BY THE PHYSICS: equal currents
 * through both boards means series, equal potential differences across both
 * means parallel. A student who invents a different but electrically identical
 * layout is right, and is told so.
 *
 * Under the cells method it also insists on EXACTLY ONE LEAD ON THE HOLDER. Two
 * studs wired is a wire lying straight across the cells between them, which
 * short-circuits them.
 */

export type DiagnosisCode =
  | 'empty'
  | 'cell-taps'
  | 'no-tap'
  | 'am-parallel'
  | 'short'
  | 'vm-series'
  | 'extra-r'
  | 'am-across-r'
  | 'r-bypass'
  | 'open'
  | 'one-r'
  | 'not-series'
  | 'not-parallel'
  | 'am-out'
  | 'am-one-branch'
  | 'am-branch'
  | 'am-reverse'
  | 'vm-out'
  | 'vm-one'
  | 'vm-wrong'
  | 'vm-reverse'
  | 'key-out'
  | 'rh-ends'
  | 'rh-out';

export type Diagnosis =
  | { ok: false; code: DiagnosisCode; msg: RichText }
  | { ok: true; code: 'ok'; lo: BenchReading; hi: BenchReading };

export { wiresAt };

/** The current into, and the potential difference across, what is under test. */
export function loadOf(r: BenchReading, config: ConfigSpec): { I: number; V: number } {
  const a = r.res[config.ids[0]!];
  if (config.mode === 'single') return { I: Math.abs(a.I), V: Math.abs(a.V) };
  const b = r.res[config.ids[1]!];
  if (config.mode === 'series') return { I: Math.abs(a.I), V: Math.abs(a.V) + Math.abs(b.V) };
  return { I: Math.abs(a.I) + Math.abs(b.I), V: Math.abs(a.V) };
}

export function diagnose(c: CircuitInputs, config: ConfigSpec): Diagnosis {
  const fail = (code: DiagnosisCode, msg: RichText): Diagnosis => ({ ok: false, code, msg });
  const { wires, method } = c;
  const cells = method === 'cells';
  const N = config.name;
  const named = (id: ResistorId): string => COMPONENT_NAMES[id];

  if (!wires.length) {
    return fail(
      'empty',
      cells
        ? `No wires yet. Start at a **cell tap** and follow the path current will take: cell holder → plug key → ammeter → ${N} → back to the holder’s **−** stud at A.`
        : `No wires yet. Start at the battery’s **+** terminal and follow the path current will take: battery → plug key → ammeter → ${N} → rheostat → back to battery **−**.`,
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
  const others = RESISTOR_IDS.filter((id) => !config.ids.includes(id));

  for (const r of [hi, lo]) {
    const load = loadOf(r, config);

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

    if (Math.abs(r.Ivm) > 5e-5 && load.I < 0.01 && Math.abs(r.Vvm) > 1) {
      return fail(
        'vm-series',
        `The **voltmeter is in series**. Its resistance is huge (${(P.rVm / 1000).toFixed(0)} kΩ), so it chokes the current to almost zero — that’s why the ammeter barely moves. Connect the voltmeter **across** ${N} instead.`,
      );
    }

    const extra = others.filter((id) => Math.abs(r.res[id].I) > 0.005);
    if (extra.length) {
      return fail(
        'extra-r',
        `**${extra.map(named).join(' and ')}** is also carrying current. For this part only ${N} should be in the circuit — take ${extra.length > 1 ? 'their' : 'its'} wires off.`,
      );
    }

    const live = config.ids.filter((id) => Math.abs(r.res[id].I) > 0.005);
    if (!live.length) {
      if (Math.abs(r.Iam) > 0.01 && Math.abs(Math.abs(r.Iam) - Math.abs(r.Ibat)) < 0.02) {
        return fail(
          'am-across-r',
          `The **ammeter is connected across ${N}**. With almost no resistance of its own, it takes all the current. Take it off and put it **in series**, in the loop before ${N}.`,
        );
      }
      if (Math.abs(r.Ibat) > 0.01) {
        return fail(
          'r-bypass',
          `Current flows, but **not through ${N}** — a wire joins the ends or it is left out of the loop. It must be one link in the loop.`,
        );
      }
      const loose = componentsFor(config, method).filter(
        (k) => !terminalIdsFor(method).some((id) => TERMINALS[id].comp === k && wiresAt(wires, id)),
      );
      return fail(
        'open',
        loose.length
          ? `The loop isn’t complete yet. Still not connected: **${loose.map((k) => COMPONENT_NAMES[k]).join(', ')}**.`
          : `Every component has a wire, but there is **no complete loop**. Trace from the ${cells ? 'cell tap' : 'battery +'} with your finger — the path breaks somewhere before it returns to the **−** stud.`,
      );
    }

    if (config.mode !== 'single') {
      if (live.length < 2) {
        return fail(
          'one-r',
          `Only **${named(live[0]!)}** carries current — the other resistor is left out or bypassed. Both must be part of the circuit.`,
        );
      }
      const a = r.res[config.ids[0]!];
      const b = r.res[config.ids[1]!];
      // The physics, not the wiring: one current through both is series, one
      // potential difference across both is parallel.
      const isSeries =
        Math.abs(Math.abs(a.I) - Math.abs(b.I)) <= 0.02 * Math.max(Math.abs(a.I), Math.abs(b.I)) + 0.002;
      const isParallel =
        Math.abs(Math.abs(a.V) - Math.abs(b.V)) <= 0.02 * Math.max(Math.abs(a.V), Math.abs(b.V)) + 0.01;

      if (config.mode === 'series' && !isSeries) {
        return fail(
          'not-series',
          isParallel
            ? 'R₁ and R₂ are in **parallel** — side by side. For this part put them **in series**: one after the other, joined at a single point with nothing else there, so the same current passes through both.'
            : 'R₁ and R₂ are not carrying the same current, so they are not in series. Join one end of R₁ to one end of R₂, with no other wire at that joint.',
        );
      }
      if (config.mode === 'parallel' && !isParallel) {
        return fail(
          'not-parallel',
          isSeries
            ? 'R₁ and R₂ are in **series** — one after the other. For this part connect them **side by side**: join the two left ends together and the two right ends together.'
            : 'R₁ and R₂ don’t have the same potential difference across them, so they are not in parallel. Both must connect between the same two points.',
        );
      }
    }

    if (Math.abs(r.Iam) < 0.005) {
      return fail(
        'am-out',
        `No current passes through the **ammeter**. It must sit in the main loop, so all the current through ${N} also flows through it.`,
      );
    }

    if (
      config.mode === 'parallel' &&
      config.ids.some(
        (id) => Math.abs(Math.abs(r.Iam) - Math.abs(r.res[id].I)) < 0.01 * Math.abs(r.Iam) + 0.002,
      )
    ) {
      return fail(
        'am-one-branch',
        'The ammeter is in **one branch**, so it reads the current through a single resistor. Put it in the main line, before the current splits between R₁ and R₂.',
      );
    }

    if (Math.abs(Math.abs(r.Iam) - load.I) > 0.03 * load.I + 0.002) {
      return fail(
        'am-branch',
        `The ammeter and ${N} are **not carrying the same current** — part of it takes another path. Put the ammeter in the same single loop, with no branch between them.`,
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
        `The **voltmeter** isn’t measuring anything yet. Connect its two terminals across ${N}.`,
      );
    }

    if (
      config.mode === 'series' &&
      config.ids.some(
        (id) => Math.abs(Math.abs(r.Vvm) - Math.abs(r.res[id].V)) < 0.02 * Math.abs(r.Vvm) + 0.01,
      )
    ) {
      return fail(
        'vm-one',
        'The voltmeter is across **only one** resistor. For the series combination it must span **both** — from the free end of R₁ to the free end of R₂.',
      );
    }

    if (Math.abs(Math.abs(r.Vvm) - load.V) > 0.03 * load.V + 0.02) {
      return fail(
        'vm-wrong',
        `The voltmeter is across the **wrong two points**. Its leads should go across ${N} and nothing else in between.`,
      );
    }

    if (r.Vvm < 0) {
      return fail(
        'vm-reverse',
        'The voltmeter would deflect **backwards**. Swap its leads: **+** goes to the end nearer battery +.',
      );
    }
  }

  if (Math.abs(open.Ibat) > 1e-3 || loadOf(open, config).I > 0.005) {
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

/** The first textbook wire of this circuit that is not yet in place, for a bought hint. */
export function nextCanonWire(
  wires: readonly Wire<TerminalId>[],
  config: ConfigSpec,
  method: LabMethod,
): Wire<TerminalId> | null {
  const find = netsOf(terminalIdsFor(method), wires);
  return canonOf(config, method).find(([a, b]) => find(a) !== find(b)) ?? null;
}

/**
 * Indexes of wires that join two different textbook nodes (guided build only).
 *
 * Under the cells method the layout FOLLOWS THE LEAD: the guided build's
 * comparison is taken at one cell throughout, but a student who has moved the
 * lead along is not wrong, so the tap that carries it is treated as the
 * layout's source — while a SECOND lead, on another stud, is stray and flashes.
 */
export function strayWires(
  wires: readonly Wire<TerminalId>[],
  net: Partial<Record<TerminalId, number>>,
  method: LabMethod = 'rheostat',
): number[] {
  const layout = method === 'cells' ? followLead(net, wires) : net;
  return wires.flatMap((w, i) => (layout[w[0]] !== layout[w[1]] ? [i] : []));
}

/** The same layout with the source node moved to whichever tap holds the lead. */
function followLead(
  net: Partial<Record<TerminalId, number>>,
  wires: readonly Wire<TerminalId>[],
): Partial<Record<TerminalId, number>> {
  const k = Math.max(1, cellsUsed(wires, 'cells'));
  if (k === 1) return net;
  const moved = { ...net };
  const b = 'bat+1' as TerminalId;
  const t = `bat+${k}` as TerminalId;
  const swap = moved[b];
  moved[b] = moved[t];
  moved[t] = swap;
  return moved;
}
