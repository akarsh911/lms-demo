import { fitLine, relativeError } from '../fit';
import { clamp, formatClock, parseDecimal, within } from '../numbers';
import type { RichText, Tone } from '../types';
import { vivaPaperFor } from '../viva';

import {
  MAX_WIRES_PER_TERMINAL,
  P,
  TAP_LETTER,
  TERMINALS,
  cellsUsed,
  wiresAt,
  type TerminalId,
} from './apparatus';
import { diagnose, nextCanonWire } from './diagnose';
import {
  CIRCUIT,
  DEDUCTION,
  MAX,
  READINGS_REQUIRED,
  READING_POINTS,
  STEP,
  VIVA_POINTS,
} from './marking';
import { setCurrentMethod, type LabMethod } from './method';
import { solveBench, type BenchReading } from './solve';
import { newLabState, type LabState, type MeterId } from './state';
import { vivaBankFor } from './viva-bank';

/**
 * Everything that can happen at the bench.
 *
 * Every action that depends on time carries `now` (ms since epoch), stamped by
 * the event handler that dispatches it. The reducer never reads a clock, so the
 * same state and action always give the same result.
 */
export type LabAction =
  | { type: 'connect'; a: TerminalId; b: TerminalId; now: number }
  | { type: 'removeWire'; index: number; now: number }
  | { type: 'undoWire'; now: number }
  | { type: 'clearWires'; now: number }
  | { type: 'sand' }
  | { type: 'toggleKey'; now: number }
  | { type: 'setSlider'; s: number; now: number }
  | { type: 'setMethod'; method: LabMethod; now: number }
  | { type: 'tick'; dt: number; now: number }
  | { type: 'checkLeastCounts'; A: string; V: string; now: number }
  | { type: 'checkCircuit'; now: number }
  | { type: 'buyHint'; now: number }
  | { type: 'record'; I: string; V: string; now: number }
  | { type: 'submitResult'; r: string; now: number }
  | { type: 'answerViva'; question: number; option: number; now: number }
  | { type: 'openLens'; meter: MeterId }
  | { type: 'closeLens' }
  | { type: 'say'; text: RichText; tone: Tone }
  /** Set by the guided build when the student reads the meters during it. */
  | { type: 'noteTourReading'; I: number; V: number };

/** How long a bought hint keeps its two terminals pulsing. */
const HINT_MS = 7000;
/** Steady temperature rise per watt, and the time constant, of the nichrome. */
const HEAT_PER_WATT = 12;
const HEAT_TAU = 25;
/** Needles need this long at one operating point before a reading counts. */
const SETTLE_S = 0.8;
/** Key in longer than this warms the wire enough to cost marks. */
const KEY_IN_LIMIT_S = 40;

/** Whichever control decides the current: the cell count, or the slider. */
function controlOf(s: LabState): number {
  return s.method === 'cells' ? cellsUsed(s.wires, s.method) : s.s;
}

export function labReducer(state: LabState, action: LabAction): LabState {
  switch (action.type) {
    case 'tick':
      return tick(state, action.dt, action.now);
    case 'openLens':
      return edit(state, (d) => {
        d.lens = action.meter;
        d.lensOpens += 1;
      });
    case 'closeLens':
      return state.lens === null ? state : { ...state, lens: null };
    case 'say':
      return { ...state, message: { text: action.text, tone: action.tone } };
    case 'noteTourReading':
      return { ...state, tourReading: { I: action.I, V: action.V } };
    case 'setMethod':
      return setMethod(state, action.method, action.now);
    default:
      // Nothing is marked after the viva; the bench is inert until a new one.
      if (state.done) return state;
      return act(state, action);
  }
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

/** Clone, mutate the clone, return it. The given state is never touched. */
function edit(state: LabState, fn: (draft: LabState) => void): LabState {
  const draft = structuredClone(state);
  fn(draft);
  return draft;
}

function say(d: LabState, text: RichText, tone: Tone = 'info'): void {
  d.message = { text, tone };
}

function mistake(d: LabState, now: number, what: string, pts: number, deduct: boolean): void {
  d.log.push({ t: formatClock(now - d.t0), what, pts });
  if (deduct) d.procDed += pts;
}

function reading(d: LabState): BenchReading {
  return solveBench(d);
}

/**
 * CHANGING THE METHOD CHANGES THE APPARATUS ON THE BENCH, so it starts the
 * practical again on the same bench rather than leaving half a circuit wired to
 * terminals that no longer exist.
 */
function setMethod(state: LabState, method: LabMethod, now: number): LabState {
  if (method === state.method) return state;
  setCurrentMethod(method);
  const fresh = newLabState(
    state.seed,
    now,
    {
      text:
        method === 'cells'
          ? `Back to the manual’s own method: **no rheostat**. The current is changed by changing how many cells drive the circuit — anything from one to ${P.cells} — by moving one lead along the taps on the holder. The bench is set up again from the start.`
          : 'Switched to the **rheostat**, the alternative the manual offers in its Note for the Teacher for a bench driven by an accumulator or battery instead of cells. The whole battery drives the circuit and the slider varies the current. The bench is set up again from the start.',
      tone: 'info',
    },
    { vivaShuffled: state.vivaShuffled },
    method,
  );
  return { ...fresh, t0: state.t0 };
}

/**
 * Safety events, evaluated whenever the circuit changes with the key in:
 * a short, an over-ranged ammeter, a needle kicking backwards. Each fires once
 * per incident, not once per re-solve.
 */
function settle(d: LabState, now: number): void {
  if (!d.key) return;
  const r = reading(d);
  const w = d.warned;

  if (Math.abs(r.Ibat) > P.shortI) {
    if (!w.short) {
      w.short = true;
      mistake(d, now, 'Short circuit with the key closed', DEDUCTION.short, true);
      d.flashes += 1;
      say(
        d,
        '**Short circuit!** The cells are being drained through almost zero resistance and the wires are heating. Pull the plug key out now, then find the wire that bypasses the resistance.',
        'bad',
      );
    }
  } else w.short = false;

  if (Math.abs(r.Iam) > P.amFS * 1.05 && Math.abs(r.Ibat) <= P.shortI) {
    if (!w.over) {
      w.over = true;
      mistake(d, now, 'Ammeter driven past full scale', DEDUCTION.over, true);
      d.flashes += 1;
      say(
        d,
        `The ammeter needle has hit the stop — **more than ${P.amFS} A** is flowing through it. Remove the key and ${
          d.method === 'cells' ? 'move the lead back to a lower tap' : 'increase the resistance'
        } before trying again.`,
        'bad',
      );
    }
  } else w.over = false;

  const rev = r.Iam < -0.01 ? 'ammeter' : r.Vvm < -0.05 ? 'voltmeter' : null;
  if (rev && w.rev !== rev) {
    w.rev = rev;
    mistake(d, now, `Reversed ${rev} polarity`, 0, false);
    say(
      d,
      `The ${rev} needle kicked **backwards** against its stop. Its + and − leads are swapped — current must enter at the red **+** terminal.`,
      'warn',
    );
  }
  if (!rev) w.rev = null;
}

/** After any change to the wiring: re-verify a checked circuit, then settle. */
function wiringChanged(d: LabState, now: number): void {
  // Moving a lead — a cell tap included — is a new operating point.
  d.obsFor = 0;
  d.lastObs = null;
  const dx = diagnose(d);
  if (d.circuit.ok && !dx.ok) {
    d.circuit.ok = false;
    d.circuit.broken = true;
    say(d, `You changed a verified circuit and it no longer behaves correctly: ${dx.msg}`, 'warn');
  } else if (d.circuit.broken && dx.ok) {
    d.circuit.ok = true;
    d.circuit.broken = false;
    say(d, 'The circuit is correct again. Carry on.', 'good');
  }
  settle(d, now);
}

function advance(d: LabState): void {
  d.step += 1;
}

// ---------------------------------------------------------------------------
// Slow physics at 10 Hz: Joule heating and the "key left in" habit
// ---------------------------------------------------------------------------

function tick(state: LabState, dt: number, now: number): LabState {
  const hintExpired = state.hint !== null && now >= state.hint.until;
  if (state.done) return hintExpired ? { ...state, hint: null } : state;

  const r = reading(state);
  const flowing = state.key && Math.abs(r.Ir) > 0.02;

  // Idle: key out, wire cold, nothing timing. The common case returns the SAME
  // state, so an idle bench ticking ten times a second renders nothing.
  if (!flowing && state.T === 0 && state.keyClosedFor === 0 && !hintExpired) return state;

  return edit(state, (d) => {
    if (hintExpired) d.hint = null;

    const power = flowing ? r.Ir * r.Ir * r.R : 0;
    d.T += ((power * HEAT_PER_WATT - d.T) / HEAT_TAU) * dt;
    if (!flowing && d.T < 0.05) d.T = 0;

    if (flowing) {
      d.keyClosedFor += dt;
      d.obsFor += dt;
    } else {
      d.keyClosedFor = 0;
    }

    if (d.key && d.obsFor >= SETTLE_S) {
      const settled = reading(d);
      const ctl = controlOf(d);
      const obs = d.lastObs;
      if (!obs || obs.Iam !== settled.Iam || obs.Vvm !== settled.Vvm || obs.ctl !== ctl) {
        d.lastObs = { Iam: settled.Iam, Vvm: settled.Vvm, ctl };
      }
    }

    if (d.keyClosedFor > KEY_IN_LIMIT_S && !d.warned.heat) {
      d.warned.heat = true;
      mistake(d, now, 'Key left in for over 40 s — wire heating', DEDUCTION.heat, true);
      say(
        d,
        'The key has been in for a while and the nichrome is **warming up** — its resistance rises with temperature, which bends your V–I line. Remove the key whenever you are not reading the meters.',
        'warn',
      );
    }

    if (flowing && d.T > 0.5) settle(d, now);
  });
}

// ---------------------------------------------------------------------------
// Hands-on actions and the marked steps
// ---------------------------------------------------------------------------

function act(
  state: LabState,
  action: Exclude<
    LabAction,
    { type: 'tick' | 'openLens' | 'closeLens' | 'say' | 'noteTourReading' | 'setMethod' }
  >,
): LabState {
  switch (action.type) {
    case 'connect': {
      const { a, b, now } = action;
      if (a === b) return state;
      // STEP 2 OF THE MANUAL, ENFORCED. A dull end is an unaccounted resistance
      // in series with everything, so nothing is joined until the ends are bright.
      if (!state.sanded) {
        return edit(state, (d) =>
          say(
            d,
            'Those wire ends are still dull with their insulating layer, and a dull end makes a poor joint — resistance you never account for. **Tap the sand paper** on the bench and rub them bright first.',
            'warn',
          ),
        );
      }
      if (state.wires.some((w) => (w[0] === a && w[1] === b) || (w[0] === b && w[1] === a))) {
        return edit(state, (d) => say(d, 'Those two terminals are already joined by a wire.'));
      }
      if (
        wiresAt(state.wires, a) >= MAX_WIRES_PER_TERMINAL ||
        wiresAt(state.wires, b) >= MAX_WIRES_PER_TERMINAL
      ) {
        return edit(state, (d) =>
          say(d, 'A terminal screw can only hold a few wires. Take one off before adding another here.', 'warn'),
        );
      }
      return edit(state, (d) => {
        d.wires.push([a, b]);
        wiringChanged(d, now);
      });
    }

    case 'sand':
      return edit(state, (d) => sand(d));

    case 'removeWire': {
      if (!state.wires[action.index]) return state;
      return edit(state, (d) => {
        const before = d.message;
        d.wires.splice(action.index, 1);
        wiringChanged(d, action.now);
        // Keep anything more important that re-verifying the circuit said.
        if (d.message === before) say(d, 'Wire removed.');
      });
    }

    case 'undoWire':
      if (!state.wires.length) return state;
      return edit(state, (d) => {
        d.wires.pop();
        wiringChanged(d, action.now);
      });

    case 'clearWires':
      if (!state.wires.length) return state;
      return edit(state, (d) => {
        d.wires = [];
        wiringChanged(d, action.now);
        say(d, 'All wires removed. The bench is clear.');
      });

    case 'toggleKey':
      return edit(state, (d) => {
        d.key = !d.key;
        d.obsFor = 0;
        d.keyToggles += 1;
        if (!d.key) d.keyOpenedSinceRec = true;
        settle(d, action.now);
        if (d.key) onKeyInserted(d, action.now);
      });

    case 'setSlider': {
      if (state.method === 'cells') return state;
      const s = clamp(action.s, 0, 1);
      if (Math.abs(s - state.s) < 1e-4) return state;
      return edit(state, (d) => {
        d.s = s;
        d.obsFor = 0;
        d.lastObs = null;
        settle(d, action.now);
      });
    }

    case 'checkLeastCounts':
      return edit(state, (d) => checkLeastCounts(d, action.A, action.V, action.now));

    case 'checkCircuit':
      return edit(state, (d) => checkCircuit(d, action.now));

    case 'buyHint':
      return edit(state, (d) => buyHint(d, action.now));

    case 'record':
      if (state.step !== STEP.readings) return state;
      return edit(state, (d) => record(d, action.I, action.V, action.now));

    case 'submitResult':
      if (state.step !== STEP.result) return state;
      return edit(state, (d) => submitResult(d, action.r, action.now));

    case 'answerViva': {
      const { question, option, now } = action;
      const paper = vivaPaperFor(vivaBankFor(state.method), state.seed, state.vivaShuffled);
      if (state.step !== STEP.viva || state.viva[question] || !paper[question]) return state;
      return edit(state, (d) => {
        const ok = option === paper[question]!.a;
        d.viva[question] = { pick: option, pts: ok ? VIVA_POINTS : 0 };
        if (!ok) mistake(d, now, `Viva: question ${question + 1}`, 0, false);
        if (d.viva.every(Boolean)) {
          d.done = true;
          d.tEnd = now;
          advance(d);
        }
      });
    }

    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled lab action: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Step 2 of the Laboratory Manual: clean the ends of the connecting wires with
 * sand paper before anything is joined.
 */
function sand(d: LabState): void {
  if (d.sanded) {
    say(d, 'The ends are already bright. Once is enough — now lay the wires.');
    return;
  }
  d.sanded = true;
  if (d.step === STEP.sand) {
    say(
      d,
      'The ends are bright copper now. A clean, tight joint is the difference between the resistance you meant to put in the circuit and the resistance that is actually there. Now wire it up.',
      'good',
    );
    advance(d);
  } else {
    say(d, 'Wire ends cleaned.');
  }
}

function checkLeastCounts(d: LabState, rawA: string, rawV: string, now: number): void {
  const grade = (k: 'A' | 'V', raw: string, truth: number, unit: string): boolean => {
    const part = d.lc[k];
    if (part.ok) return true;
    const v = parseDecimal(raw);
    if (Number.isNaN(v)) return false;
    if (Math.abs(v - truth) < truth * 0.01) {
      part.ok = true;
      part.pts = Math.max(1, 5 - 2 * part.tries);
      return true;
    }
    part.tries += 1;
    mistake(d, now, `Wrong least count for the ${k === 'A' ? 'ammeter' : 'voltmeter'} (${v} ${unit})`, 0, false);
    return false;
  };

  const a = grade('A', rawA, P.lcA, 'A');
  const v = grade('V', rawV, P.lcV, 'V');
  d.lc.A.flag = a ? 'ok' : 'no';
  d.lc.V.flag = v ? 'ok' : 'no';

  if (a && v) {
    say(
      d,
      `Right. The ammeter has ${P.amDivs} divisions over ${P.amFS} A, so each is **${P.lcA} A**; the voltmeter has ${P.vmDivs} over ${P.vmFS} V, so each is **${P.lcV} V**. Now clean the wire ends.`,
      'good',
    );
    advance(d);
  } else {
    say(
      d,
      'Not quite. Open the close-up and count every small line between **0** and the last number on the scale — then divide the range by that count.',
      'warn',
    );
  }
}

function checkCircuit(d: LabState, now: number): void {
  const dx = diagnose(d);
  if (!dx.ok) {
    d.circuit.fails += 1;
    mistake(d, now, `Circuit check failed: ${dx.code}`, 0, false);
    say(d, dx.msg, 'bad');
    return;
  }
  if (!d.circuit.pts) {
    d.circuit.pts = Math.max(
      CIRCUIT.min,
      MAX.circuit - CIRCUIT.perFail * d.circuit.fails - CIRCUIT.perHint * d.circuit.hints,
    );
  }
  d.circuit.ok = true;
  if (d.circuit.broken) {
    d.circuit.broken = false;
    say(d, 'Circuit is correct again. Carry on.', 'good');
    return;
  }
  say(
    d,
    (d.method === 'cells'
      ? 'Circuit approved: ammeter in series, voltmeter across the resistor, key in the loop and one cell driving it.'
      : 'Circuit approved: ammeter in series, voltmeter across the resistor, rheostat and key in the loop.') +
      (d.key ? ' Now take the plug out.' : ''),
    'good',
  );
  advance(d);
}

function buyHint(d: LabState, now: number): void {
  d.circuit.hints += 1;
  const next = nextCanonWire(d.wires, d.method);
  if (!next) {
    const dx = diagnose(d);
    say(
      d,
      dx.ok
        ? 'Everything needed is connected — press **Check my circuit**.'
        : `All the needed connections are there, but something extra is interfering. ${dx.msg}`,
      dx.ok ? 'good' : 'warn',
    );
    return;
  }
  d.hint = { pair: next, until: now + HINT_MS };
  say(d, `Connect **${TERMINALS[next[0]].name}** to **${TERMINALS[next[1]].name}** — the two pulsing terminals.`);
}

function onKeyInserted(d: LabState, now: number): void {
  if (d.step !== STEP.closeSafely || !d.circuit.ok) return;
  const dx = diagnose(d);
  if (!dx.ok) return;

  const cells = d.method === 'cells';
  const used = cellsUsed(d.wires, d.method);
  let lowest: boolean;
  if (cells) {
    // One cell is the least this circuit can be driven with.
    lowest = used <= 1;
  } else {
    const minI = Math.min(Math.abs(dx.lo.Iam), Math.abs(dx.hi.Iam));
    lowest = Math.abs(reading(d).Iam) <= minI * 1.08;
  }

  if (!lowest) {
    mistake(
      d,
      now,
      cells
        ? `Key inserted with ${used} cells instead of one`
        : 'Key inserted with rheostat below maximum resistance',
      DEDUCTION.belowMax,
      true,
    );
    say(
      d,
      cells
        ? `Current is flowing, but you inserted the key with **${used} cells** already in the circuit. Always start at the smallest current — one cell — so nothing is overloaded. Now you can take readings.`
        : 'Current is flowing, but you inserted the key at **less than maximum resistance**. Always start with the smallest current so nothing is overloaded. Now you can take readings.',
      'warn',
    );
  } else {
    say(
      d,
      'Good habit — current started at its **smallest** value. Both needles moved forward, so the polarities are right. Read the meters and record your first reading.',
      'good',
    );
  }
  advance(d);
}

function record(d: LabState, rawI: string, rawV: string, now: number): void {
  if (!d.circuit.ok) {
    say(d, 'The circuit has changed since it was checked. Fix it first.', 'warn');
    return;
  }
  const I = parseDecimal(rawI);
  const V = parseDecimal(rawV);
  if (Number.isNaN(I) || Number.isNaN(V)) {
    say(d, 'Type both readings — the ammeter in ampere and the voltmeter in volt.', 'warn');
    return;
  }
  const cells = d.method === 'cells';
  const ctl = controlOf(d);
  const obs = d.lastObs && Math.abs(d.lastObs.ctl - ctl) < 1e-4 ? d.lastObs : null;
  if (!obs) {
    say(
      d,
      `Insert the key and let the needles settle before you record — you have not read the meters at this ${
        cells ? 'cell tap' : 'slider position'
      } yet.`,
      'warn',
    );
    return;
  }
  const tI = Math.abs(obs.Iam);
  const tV = Math.abs(obs.Vvm);

  if (cells) {
    // ONE READING PER CELL COUNT is the whole table: four taps, four points.
    const dup = d.readings.findIndex((r) => r.cells === ctl);
    if (dup >= 0) {
      say(
        d,
        `Reading ${dup + 1} was already taken with **${ctl} cell${ctl > 1 ? 's' : ''}**. Take the key out and move the lead on the holder to the next tap — one reading per cell count is the whole table.`,
        'warn',
      );
      return;
    }
  } else {
    const near = d.readings.findIndex((r) => Math.abs(Math.abs(r.trueI) - tI) < 0.04);
    if (near >= 0) {
      say(
        d,
        `This is almost the same current as reading ${near + 1}. Move the rheostat slider further so your points spread along the line.`,
        'warn',
      );
      return;
    }
  }

  // Within one least count = full marks for that meter, within two = half.
  const q = (value: number, truth: number, lc: number): number =>
    within(value, truth, lc) ? 1 : within(value, truth, 2 * lc) ? 0.5 : 0;
  const qI = q(I, tI, P.lcA);
  const qV = q(V, tV, P.lcV);
  const pts = (READING_POINTS / 2) * (qI + qV);

  if (d.readings.length && d.keyOpenedSinceRec) d.gaps += 1;
  d.keyOpenedSinceRec = !d.key;
  d.readings.push({ I, V, cells: cells ? ctl : null, trueI: obs.Iam, trueV: obs.Vvm, pts });
  if (pts < READING_POINTS) {
    mistake(
      d,
      now,
      `Reading ${d.readings.length} misread (${I} A, ${V} V; meters showed ${tI.toFixed(3)} A, ${tV.toFixed(2)} V)`,
      0,
      false,
    );
  }

  const feedback =
    pts === READING_POINTS
      ? 'Both readings are within one least count.'
      : `The needles actually pointed to **${tI.toFixed(2)} A** and **${tV.toFixed(1)} V**. ` +
        `${qI < 1 ? `Check the ammeter: each small division is ${P.lcA} A. ` : ''}` +
        `${qV < 1 ? `Check the voltmeter: each small division is ${P.lcV} V. ` : ''}` +
        'Look straight down at the needle to avoid parallax.';

  if (d.readings.length >= READINGS_REQUIRED) {
    if (d.gaps < (READINGS_REQUIRED - 1) * 0.75) {
      mistake(d, now, 'Key not removed between readings', DEDUCTION.gaps, true);
    }
    say(
      d,
      `${feedback} All ${READINGS_REQUIRED} readings done. Now find R from your graph.`,
      pts === READING_POINTS ? 'good' : 'warn',
    );
    advance(d);
  } else {
    const k = cells ? Math.min(ctl + 1, P.cells) : 0;
    const next = cells
      ? `move the lead on to tap **${TAP_LETTER[k]}** (${k} cell${k > 1 ? 's' : ''}) for the next reading.`
      : 'move the slider for the next reading.';
    say(
      d,
      feedback + (d.key ? ` Remove the key, then ${next}` : ` ${next.charAt(0).toUpperCase()}${next.slice(1)}`),
      pts === READING_POINTS ? 'good' : 'warn',
    );
  }
}

function submitResult(d: LabState, raw: string, now: number): void {
  const r = parseDecimal(raw);
  if (Number.isNaN(r) || r <= 0) {
    say(d, 'Enter the resistance you got from the slope, in ohm.', 'warn');
    return;
  }
  const fit = fitLine(d.readings.map((p) => ({ x: p.I, y: p.V })));
  const err = relativeError(r, fit.m);
  const pts = err <= 0.05 ? 10 : err <= 0.1 ? 6 : 2;
  d.result = { r, fit, pts, err };
  if (pts < 10) mistake(d, now, `Resistance from graph off by ${(err * 100).toFixed(0)}%`, 0, false);
  const trueErr = relativeError(fit.m, d.R0) * 100;
  say(
    d,
    `Your points give a best-fit slope of **${fit.m.toFixed(2)} Ω**; you wrote ${r} Ω. ` +
      `This bench’s wire was actually **${d.R0.toFixed(1)} Ω**, so your experiment was within **${trueErr.toFixed(1)}%**. ` +
      'V/I stayed constant and the line passes close to the origin — **Ohm’s law is verified**.',
    pts === 10 ? 'good' : 'warn',
  );
  advance(d);
}
