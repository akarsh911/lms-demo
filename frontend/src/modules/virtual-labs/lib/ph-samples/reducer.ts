import { VIVA_BANK } from './viva-bank';
import { logMistake } from '../marking';
import { vivaPaperFor } from '../viva';
import { parseDecimal } from '../numbers';
import type { RichText, Tone } from '../types';

import {
  CAP,
  POUR,
  SAMPLE_BY_ID,
  TRUE_ORDER,
  natureOf,
  pHof,
  type Nature,
  type SampleId,
} from './chemistry';
import {
  CONTAMINATION_PENALTY,
  MAX,
  NATURE_MARKS,
  STEP,
  VIVA_POINTS,
  phMarksFor,
} from './marking';
import {
  emptyTube,
  poursDone,
  recordedCount,
  testsDone,
  type Entry,
  type Held,
  type PhState,
  type Tube,
} from './state';

/**
 * Everything that can happen at this bench.
 *
 * Every action that depends on time carries `now` (ms since epoch), stamped by
 * the event handler that dispatches it, so the same state and action always
 * give the same result and the engine can be driven from plain Node.
 */
export type PhAction =
  | { type: 'pickUp'; held: Held }
  | { type: 'putDown' }
  | { type: 'selectTube'; index: number }
  /** The one gesture the bench has: whatever is in hand, applied to a tube. */
  | { type: 'tapTube'; index: number; now: number }
  | { type: 'rinseTube'; index: number; now: number }
  | { type: 'setEntry'; index: number; field: 'ph' | 'nature'; value: string }
  | { type: 'submitReadings'; now: number }
  | { type: 'pushOrder'; sample: SampleId }
  | { type: 'clearOrder' }
  | { type: 'submitOrder'; now: number }
  | { type: 'answerViva'; question: number; option: number; now: number }
  | { type: 'say'; text: RichText; tone: Tone };

export function phReducer(state: PhState, action: PhAction): PhState {
  switch (action.type) {
    case 'say':
      return { ...state, message: { text: action.text, tone: action.tone } };
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
function edit(state: PhState, fn: (draft: PhState) => void): PhState {
  const draft = structuredClone(state);
  fn(draft);
  return draft;
}

function say(d: PhState, text: RichText, tone: Tone = 'info'): void {
  d.message = { text, tone };
}

function mistake(d: PhState, now: number, what: string, pts = 0): void {
  logMistake(d.log, { now, t0: d.t0, what, pts });
}

/** Readings already marked: the tubes stay exactly as they were graded. */
function locked(d: PhState): boolean {
  return d.graded !== null || d.done;
}

function tubeAt(d: PhState, index: number): Tube | null {
  return d.tubes[index] ?? null;
}

function entryAt(d: PhState, index: number): Entry {
  return d.rec[index] ?? { ph: '', nature: '' };
}

/**
 * Advance out of the two steps that complete themselves. Both can finish on one
 * action — the last tube poured and tested in a single tap never happens, but
 * the order is checked rather than assumed.
 */
function progress(d: PhState): void {
  if (d.step === STEP.pour && poursDone(d)) {
    d.pts.setup = Math.max(0, MAX.setup - CONTAMINATION_PENALTY * d.contam);
    d.step += 1;
    say(
      d,
      'All six tubes are filled. Now test each one: dip a strip of **pH paper**, or add two drops of ' +
        '**universal indicator** to the tube itself. Either is accepted.',
      'good',
    );
  }
  if (d.step === STEP.test && testsDone(d)) {
    d.pts.testing = MAX.testing;
    d.step += 1;
    say(
      d,
      'Every sample is tested. Now read each colour against the chart and write the pH in the table — the chart is ' +
        'on the bench and beside the box you type into.',
      'good',
    );
  }
}

// ---------------------------------------------------------------------------
// Hands on the bench
// ---------------------------------------------------------------------------

function sameHold(a: Held | null, b: Held): boolean {
  if (!a || a.kind !== b.kind) return false;
  return a.kind !== 'bottle' || b.kind !== 'bottle' || a.id === b.id;
}

function pour(d: PhState, index: number, id: SampleId, now: number): void {
  const t = tubeAt(d, index);
  if (!t) return;
  if (locked(d)) {
    say(d, 'Your readings are already marked — the tubes stay as they are.');
    return;
  }
  const inTube = Object.values(t.liq).reduce((a: number, ml) => a + (ml ?? 0), 0);
  if (inTube + POUR > CAP) {
    say(d, `That tube already holds ${inTube} mL — plenty for a pH test.`, 'warn');
    return;
  }
  t.liq[id] = (t.liq[id] ?? 0) + POUR;
  t.added.push(id);
  // Whatever was in it has changed, so any earlier test no longer describes it.
  t.strip = null;
  t.tested = null;
  t.indicator = false;
  d.sel = index;

  if (id !== t.sample) {
    d.contam += 1;
    mistake(d, now, `Poured ${SAMPLE_BY_ID[id].label} into the ${SAMPLE_BY_ID[t.sample].name} tube`, CONTAMINATION_PENALTY);
    say(
      d,
      `That tube is for **${SAMPLE_BY_ID[t.sample].name}**, but you added **${SAMPLE_BY_ID[id].label}**. ` +
        'A mixture has its own pH, not the sample’s — press **Empty and rinse** and start that tube again.',
      'bad',
    );
  } else {
    say(d, `${POUR} mL of ${SAMPLE_BY_ID[id].label} in tube ${index + 1}. You are still holding the bottle.`);
  }
  progress(d);
}

function dipPaper(d: PhState, index: number): void {
  const t = tubeAt(d, index);
  if (!t || locked(d)) return;
  const ph = pHof(t);
  if (ph === null) {
    say(d, 'That tube is empty — pour the sample in first.', 'warn');
    return;
  }
  // The strip is frozen at the pH it was dipped into: paper does not update.
  t.strip = ph;
  t.tested = 'paper';
  d.sel = index;
  say(
    d,
    `Dipped a fresh strip into tube ${index + 1} and laid it on the tile. Compare its colour with the chart to read the pH.`,
  );
  progress(d);
}

function addIndicator(d: PhState, index: number): void {
  const t = tubeAt(d, index);
  if (!t || locked(d)) return;
  if (pHof(t) === null) {
    say(d, 'That tube is empty — pour the sample in first.', 'warn');
    return;
  }
  t.indicator = true;
  t.tested = t.tested ?? 'ui';
  d.sel = index;
  say(
    d,
    `Two drops of universal indicator in tube ${index + 1}. The solution has taken its own colour — match it against the chart.`,
  );
  progress(d);
}

// ---------------------------------------------------------------------------
// The marked steps
// ---------------------------------------------------------------------------

function submitReadings(d: PhState, now: number): void {
  if (d.step !== STEP.record || d.graded) return;
  if (recordedCount(d) < d.tubes.length) {
    say(d, 'Every row needs a pH and whether the sample is acidic, neutral or basic.', 'warn');
    return;
  }

  const cells: Record<number, { pts: number; truePh: number | null }> = {};
  let phPts = 0;
  let natPts = 0;
  let untested = 0;

  d.tubes.forEach((t, i) => {
    const r = entryAt(d, i);
    const truePh = pHof(t);
    const wrote = parseDecimal(r.ph);
    const err = truePh === null || Number.isNaN(wrote) ? 99 : Math.abs(wrote - truePh);
    const p = phMarksFor(err);
    const n = truePh !== null && r.nature === natureOf(truePh) ? NATURE_MARKS : 0;
    phPts += p;
    natPts += n;
    cells[i] = { pts: p + n, truePh };
    if (!t.tested) untested += 1;
    if (p < phMarksFor(0) || n < NATURE_MARKS) {
      mistake(
        d,
        now,
        `${SAMPLE_BY_ID[t.sample].short}: you wrote pH ${r.ph || '—'} (${r.nature || '—'}); the tube was pH ` +
          `${truePh === null ? '—' : truePh.toFixed(1)} (${truePh === null ? '—' : natureOf(truePh)})`,
      );
    }
  });

  d.graded = { cells };
  d.pts.ph = phPts;
  d.pts.nature = natPts;
  d.held = null;

  const exact = Object.values(cells).filter((c) => c.pts === phMarksFor(0) + NATURE_MARKS).length;
  say(
    d,
    `${exact} of ${d.tubes.length} samples read correctly.` +
      (untested
        ? ` ${untested} tube${untested > 1 ? 's were' : ' was'} never tested — a pH has to be measured, not guessed.`
        : '') +
      ' Colour matching is never exact, so a reading within 1 pH of the true value still counts. Now put the samples in order.',
    exact >= 5 ? 'good' : 'warn',
  );
  d.step += 1;
}

function submitOrder(d: PhState, now: number): void {
  if (d.step !== STEP.order || d.order.length !== d.tubes.length) return;

  const mine = d.order.map((id) => {
    const i = d.layout.indexOf(id);
    return parseDecimal(entryAt(d, i).ph);
  });
  const consistent = mine.every((ph, k) => mine.slice(k + 1).every((next) => ph <= next));
  const truth = d.order.every((id, k) => TRUE_ORDER[k] === id);

  d.concl = { order: [...d.order], consistent, truth };
  d.pts.order = (consistent ? MAX.order / 2 : 0) + (truth ? MAX.order / 2 : 0);
  if (!consistent) mistake(d, now, 'The order does not follow from your own pH readings');
  if (!truth) mistake(d, now, 'The order is not the true order of pH');

  const trueLine = '**HCl (1) → lemon juice (2) → ethanoic acid (3) → water (7) → NaHCO₃ (9) → NaOH (13)**';
  say(
    d,
    truth && consistent
      ? `Correct: ${trueLine}. Strong acid, weak acids, neutral, weak base, strong base.`
      : consistent
        ? `Your order follows from your readings — good — but it is not the true order. The true order is ${trueLine}; ` +
          'check the readings that sit closest together.'
        : `That order does not match your own table. Sort by the pH values you wrote: lowest first. The true order is ${trueLine}.`,
    truth && consistent ? 'good' : 'warn',
  );
  d.step += 1;
}

// ---------------------------------------------------------------------------
// The bench's one dispatch table
// ---------------------------------------------------------------------------

function act(state: PhState, action: Exclude<PhAction, { type: 'say' }>): PhState {
  switch (action.type) {
    case 'pickUp':
      return edit(state, (d) => {
        if (sameHold(d.held, action.held)) {
          d.held = null;
          return;
        }
        d.held = action.held;
        d.pickUps += 1;
      });

    case 'putDown':
      return state.held === null ? state : { ...state, held: null };

    case 'selectTube':
      return state.sel === action.index || !state.tubes[action.index]
        ? state
        : { ...state, sel: action.index };

    case 'tapTube': {
      const held = state.held;
      if (!state.tubes[action.index]) return state;
      if (!held) return state.sel === action.index ? state : { ...state, sel: action.index };
      return edit(state, (d) => {
        if (held.kind === 'bottle') pour(d, action.index, held.id, action.now);
        else if (held.kind === 'paper') dipPaper(d, action.index);
        else addIndicator(d, action.index);
      });
    }

    case 'rinseTube': {
      const t = state.tubes[action.index];
      if (!t || locked(state)) return state;
      return edit(state, (d) => {
        d.tubes[action.index] = emptyTube(t.sample);
        d.sel = action.index;
        say(d, 'Emptied into the waste beaker and rinsed with distilled water.');
      });
    }

    case 'setEntry': {
      if (state.step !== STEP.record || state.graded) return state;
      return edit(state, (d) => {
        const r = entryAt(d, action.index);
        if (action.field === 'ph') {
          r.ph = action.value;
          // Offer the obvious reading rather than making it twice; still editable.
          const ph = parseDecimal(action.value);
          if (!Number.isNaN(ph) && r.nature === '') r.nature = natureOf(ph);
        } else {
          r.nature = action.value as Nature | '';
        }
        d.rec[action.index] = r;
      });
    }

    case 'submitReadings':
      return edit(state, (d) => submitReadings(d, action.now));

    case 'pushOrder':
      if (state.step !== STEP.order || state.order.includes(action.sample)) return state;
      return { ...state, order: [...state.order, action.sample] };

    case 'clearOrder':
      return state.order.length === 0 ? state : { ...state, order: [] };

    case 'submitOrder':
      return edit(state, (d) => submitOrder(d, action.now));

    case 'answerViva': {
      const { question, option, now } = action;
      const q = vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled)[question];
      if (state.step !== STEP.viva || !q || state.viva[question]) return state;
      return edit(state, (d) => {
        const ok = option === q.a;
        d.viva[question] = { pick: option, pts: ok ? VIVA_POINTS : 0 };
        if (!ok) mistake(d, now, `Viva: question ${question + 1}`);
        if (d.viva.every(Boolean)) {
          d.done = true;
          d.tEnd = now;
          d.step += 1;
        }
      });
    }

    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled pH bench action: ${JSON.stringify(exhaustive)}`);
    }
  }
}
