import { relativeError } from '../fit';
import { vivaPaperFor } from '../viva';
import { clamp, formatClock, parseDecimal, within } from '../numbers';
import type { RichText, Tone } from '../types';

import {
  CONFIGS,
  MAX_WIRES_PER_TERMINAL,
  P,
  RESISTOR_IDS,
  TAP_LETTER,
  TERMINALS,
  byMethod,
  cellsUsed,
  wiresAt,
  type ConfigId,
  type ConfigSpec,
  type TerminalId,
} from './apparatus';
import { diagnose, nextCanonWire } from './diagnose';
import {
  CIRCUIT,
  DEDUCTION,
  READING_POINTS,
  RESULT_POINTS,
  STAGES,
  VIVA_POINTS,
  type Stage,
} from './marking';
import { setCurrentMethod, type LabMethod } from './method';
import { solveBench, type BenchReading } from './solve';
import { meanResistance, newLabState, type LabState, type MeterId } from './state';
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
  | { type: 'submitCalc'; rs: string; rp: string; now: number }
  | { type: 'answerViva'; question: number; option: number; now: number }
  | { type: 'openLens'; meter: MeterId }
  | { type: 'closeLens' }
  | { type: 'say'; text: RichText; tone: Tone };

/** How long a bought hint keeps its two terminals pulsing. */
const HINT_MS = 7000;
/** Steady temperature rise per watt, and the time constant, of the nichrome. */
const HEAT_PER_WATT = 12;
const HEAT_TAU = 25;
/** Needles need this long at one operating point before a reading counts. */
const SETTLE_S = 0.8;
/** Key in longer than this warms the coils enough to cost marks. */
const KEY_IN_LIMIT_S = 40;

export function stageOf(state: LabState): Stage | undefined {
  return STAGES[state.stage];
}

/** Whichever control decides the current: the cell count, or the slider. */
function controlOf(s: LabState): number {
  return s.method === 'cells' ? cellsUsed(s.wires, s.method) : s.s;
}

/** The circuit a wire / start / read stage is about; null on any other stage. */
export function configIdOf(state: LabState): ConfigId | null {
  const stage = stageOf(state);
  return stage && 'cfg' in stage ? stage.cfg : null;
}

export function configOf(state: LabState): ConfigSpec | null {
  const id = configIdOf(state);
  return id ? CONFIGS[id] : null;
}

/**
 * The circuit the notebook should be showing: the one being measured, else the
 * next one coming up, else the last.
 */
export function tableConfigId(state: LabState): ConfigId {
  for (let i = state.stage; i < STAGES.length; i += 1) {
    const stage = STAGES[i]!;
    if ('cfg' in stage) return stage.cfg;
  }
  return 'parallel';
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

function advance(d: LabState): void {
  d.stage += 1;
}

/**
 * CHANGING THE METHOD CHANGES THE APPARATUS ON THE BENCH, so it starts the
 * practical again on the same bench rather than leaving four circuits' worth of
 * wiring attached to terminals that no longer exist.
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
          ? `Back to the manual’s own method: **no rheostat**. Each arrangement is read at one cell, then two, then ${P.cells} — by moving one lead along the taps on the holder. The bench is set up again from the start.`
          : 'Switched to the **rheostat**, the alternative the manual offers in its Note for the Teacher for a bench driven by an accumulator or battery instead of cells. The whole battery drives the circuit and the slider varies the current. The bench is set up again from the start.',
      tone: 'info',
    },
    { vivaShuffled: state.vivaShuffled },
    method,
  );
  return { ...fresh, t0: state.t0 };
}

/**
 * Safety events, evaluated whenever the circuit changes with the key in: a
 * short, an over-ranged ammeter, a needle kicking backwards. Each fires once
 * per incident, not once per re-solve.
 *
 * The parallel combination can genuinely drive the ammeter past full scale at
 * the lowest rheostat setting. That is not a bug to tune away: two resistors
 * side by side draw more current than either alone, and noticing that before
 * the needle hits the stop is the point.
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

/**
 * After any change to the wiring. Only the circuit being MEASURED right now has
 * to stay correct: while wiring the next one, taking the old one apart is the
 * job, not a mistake.
 */
function wiringChanged(d: LabState, now: number): void {
  // Moving a lead — a cell tap included — is a new operating point.
  d.obsFor = 0;
  d.lastObs = null;
  const stage = stageOf(d);
  const id = stage && (stage.type === 'start' || stage.type === 'read') ? stage.cfg : null;
  if (id) {
    const progress = d.cfg[id];
    const dx = diagnose(d, CONFIGS[id]);
    if (progress.ok && !dx.ok) {
      progress.ok = false;
      progress.broken = true;
      say(d, `You changed a verified circuit and it no longer behaves correctly: ${dx.msg}`, 'warn');
    } else if (progress.broken && dx.ok) {
      progress.ok = true;
      progress.broken = false;
      say(d, 'The circuit is correct again. Carry on.', 'good');
    }
  }
  settle(d, now);
}

// ---------------------------------------------------------------------------
// Slow physics at 10 Hz: Joule heating and the "key left in" habit
// ---------------------------------------------------------------------------

function tick(state: LabState, dt: number, now: number): LabState {
  const hintExpired = state.hint !== null && now >= state.hint.until;
  if (state.done) return hintExpired ? { ...state, hint: null } : state;

  const r = reading(state);
  const flowing = state.key && RESISTOR_IDS.some((id) => Math.abs(r.res[id].I) > 0.02);
  const cold = RESISTOR_IDS.every((id) => state.T[id] === 0);

  // Idle: key out, coils cold, nothing timing. The common case returns the SAME
  // state, so an idle bench ticking ten times a second renders nothing.
  if (!flowing && cold && state.keyClosedFor === 0 && !hintExpired) return state;

  return edit(state, (d) => {
    if (hintExpired) d.hint = null;

    for (const id of RESISTOR_IDS) {
      const board = r.res[id];
      const on = d.key && Math.abs(board.I) > 0.02;
      const power = on ? board.I * board.I * board.R : 0;
      d.T[id] += ((power * HEAT_PER_WATT - d.T[id]) / HEAT_TAU) * dt;
      if (!on && d.T[id] < 0.05) d.T[id] = 0;
    }

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
      mistake(d, now, 'Key left in for over 40 s — coils heating', DEDUCTION.heat, true);
      say(
        d,
        'The key has been in for a while and the nichrome is **warming up** — its resistance rises with temperature, which shifts every V/I you take after this. Remove the key whenever you are not reading the meters.',
        'warn',
      );
    }

    if (flowing && RESISTOR_IDS.some((id) => d.T[id] > 0.5)) settle(d, now);
  });
}

// ---------------------------------------------------------------------------
// Hands-on actions and the marked stages
// ---------------------------------------------------------------------------

function act(
  state: LabState,
  action: Exclude<LabAction, { type: 'tick' | 'openLens' | 'closeLens' | 'say' | 'setMethod' }>,
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
      if (stageOf(state)?.type !== 'read') return state;
      return edit(state, (d) => record(d, action.I, action.V, action.now));

    case 'submitCalc':
      if (stageOf(state)?.type !== 'calc') return state;
      return edit(state, (d) => submitCalc(d, action.rs, action.rp, action.now));

    case 'answerViva': {
      const { question, option, now } = action;
      const paper = vivaPaperFor(vivaBankFor(state.method), state.seed, state.vivaShuffled);
      if (stageOf(state)?.type !== 'viva' || state.viva[question] || !paper[question]) return state;
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
 * sand paper before anything is joined. Once, at the start — the four circuits
 * that follow are all wired with the same bright ends.
 */
function sand(d: LabState): void {
  if (d.sanded) {
    say(d, 'The ends are already bright. Once is enough — now lay the wires.');
    return;
  }
  d.sanded = true;
  if (stageOf(d)?.type === 'sand') {
    say(
      d,
      'The ends are bright copper now. A clean, tight joint is the difference between the resistance you meant to put in the circuit and the resistance that is actually there. Now wire the first circuit: R₁ on its own.',
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
  const id = configIdOf(d);
  if (!id || stageOf(d)?.type !== 'wire') return;
  const config = CONFIGS[id];
  const progress = d.cfg[id];
  const dx = diagnose(d, config);

  if (!dx.ok) {
    progress.fails += 1;
    mistake(d, now, `Circuit check failed (${config.label}): ${dx.code}`, 0, false);
    say(d, dx.msg, 'bad');
    return;
  }
  if (!progress.pts) {
    progress.pts = Math.max(
      CIRCUIT.min,
      CIRCUIT.max - CIRCUIT.perFail * progress.fails - CIRCUIT.perHint * progress.hints,
    );
  }
  progress.ok = true;
  progress.broken = false;
  say(d, `${byMethod(config.okMessage, d.method)}${d.key ? ' Now take the plug out.' : ''}`, 'good');
  advance(d);
}

function buyHint(d: LabState, now: number): void {
  const id = configIdOf(d);
  if (!id) return;
  const config = CONFIGS[id];
  const progress = d.cfg[id];
  progress.hints += 1;
  const next = nextCanonWire(d.wires, config, d.method);
  if (!next) {
    const dx = diagnose(d, config);
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
  const stage = stageOf(d);
  if (stage?.type !== 'start') return;
  const config = CONFIGS[stage.cfg];
  if (!d.cfg[stage.cfg].ok) return;
  const dx = diagnose(d, config);
  if (!dx.ok) return;

  const cells = d.method === 'cells';
  const used = cellsUsed(d.wires, d.method);
  let lowest: boolean;
  if (cells) {
    // One cell is the least this arrangement can be driven with.
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
        ? `Key inserted with ${used} cells instead of one (${config.label})`
        : `Key inserted below maximum resistance (${config.label})`,
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
  const stage = stageOf(d);
  if (stage?.type !== 'read') return;
  const config = CONFIGS[stage.cfg];
  const progress = d.cfg[stage.cfg];

  if (!progress.ok) {
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
    // ONE READING PER CELL COUNT: three taps, three points for this arrangement.
    const dup = progress.readings.findIndex((r) => r.cells === ctl);
    if (dup >= 0) {
      say(
        d,
        `Reading ${dup + 1} of ${config.label} was already taken with **${ctl} cell${ctl > 1 ? 's' : ''}**. Take the key out and move the lead on the holder to the next tap — one reading per cell count is the whole table.`,
        'warn',
      );
      return;
    }
  } else {
    const near = progress.readings.findIndex((r) => Math.abs(Math.abs(r.trueI) - tI) < 0.04);
    if (near >= 0) {
      say(
        d,
        `This is almost the same current as reading ${near + 1}. Move the rheostat slider further so your three points are genuinely different.`,
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

  if (progress.readings.length && d.keyOpenedSinceRec) progress.gaps += 1;
  d.keyOpenedSinceRec = !d.key;
  progress.readings.push({ I, V, cells: cells ? ctl : null, trueI: obs.Iam, trueV: obs.Vvm, pts });
  if (pts < READING_POINTS) {
    mistake(
      d,
      now,
      `${config.label} reading ${progress.readings.length} misread (${I} A, ${V} V; meters showed ${tI.toFixed(3)} A, ${tV.toFixed(2)} V)`,
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

  if (progress.readings.length >= config.readings) {
    if (progress.gaps < (config.readings - 1) * 0.75) {
      mistake(d, now, `Key not removed between readings (${config.label})`, DEDUCTION.gaps, true);
    }
    const next = STAGES[d.stage + 1];
    const tail =
      next?.type === 'wire'
        ? ' Take the key out and rewire for the next circuit.'
        : next?.type === 'calc'
          ? ' All four circuits measured. Now calculate and compare.'
          : d.key
            ? ' Take the key out.'
            : '';
    say(
      d,
      `${feedback} ${config.label} done: mean V/I = **${meanResistance(progress).toFixed(2)} Ω**.${tail}`,
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

function submitCalc(d: LabState, rawS: string, rawP: string, now: number): void {
  const rs = parseDecimal(rawS);
  const rp = parseDecimal(rawP);
  if (Number.isNaN(rs) || Number.isNaN(rp) || rs <= 0 || rp <= 0) {
    say(d, 'Enter both results in ohm: R₁ + R₂, and R₁R₂ ÷ (R₁ + R₂).', 'warn');
    return;
  }

  const m1 = meanResistance(d.cfg.r1);
  const m2 = meanResistance(d.cfg.r2);
  const ms = meanResistance(d.cfg.series);
  const mp = meanResistance(d.cfg.parallel);
  const ts = m1 + m2;
  const tp = (m1 * m2) / (m1 + m2);

  // Graded against the student's OWN means, so an honest experiment with real
  // error still earns the marks for getting the arithmetic right.
  const grade = (value: number, truth: number): number => {
    const e = relativeError(value, truth);
    return e <= 0.02 ? RESULT_POINTS.exact : e <= 0.05 ? RESULT_POINTS.close : 0;
  };
  const ps = grade(rs, ts);
  const pp = grade(rp, tp);
  const pct = (value: number, truth: number): string => (relativeError(value, truth) * 100).toFixed(1);

  d.result = { rsIn: rs, rpIn: rp, ts, tp, m1, m2, ms, mp, pts: ps + pp };
  if (ps < RESULT_POINTS.exact) {
    mistake(d, now, `R₁ + R₂ calculated as ${rs} Ω (your means give ${ts.toFixed(2)} Ω)`, 0, false);
  }
  if (pp < RESULT_POINTS.exact) {
    mistake(d, now, `R₁R₂/(R₁ + R₂) calculated as ${rp} Ω (your means give ${tp.toFixed(2)} Ω)`, 0, false);
  }

  const full = ps + pp === RESULT_POINTS.exact * 2;
  say(
    d,
    `${full ? 'Both calculations are right.' : `From your means, R₁ + R₂ = **${ts.toFixed(2)} Ω** and R₁R₂/(R₁ + R₂) = **${tp.toFixed(2)} Ω**.`} ` +
      `Series: you measured **${ms.toFixed(2)} Ω**, ${pct(ms, ts)}% from theory. ` +
      `Parallel: you measured **${mp.toFixed(2)} Ω**, ${pct(mp, tp)}% from theory.\n` +
      `This bench’s resistors were ${d.R.r1} Ω and ${d.R.r2} Ω. Series resistance is more than either resistor and parallel is less than either — **verified**.`,
    full ? 'good' : 'warn',
  );
  advance(d);
}
