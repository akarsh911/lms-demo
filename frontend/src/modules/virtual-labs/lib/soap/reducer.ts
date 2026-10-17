import { VIVA_BANK } from './viva-bank';
import { logMistake } from '../marking';
import { vivaPaperFor } from '../viva';
import { parseDecimal } from '../numbers';
import type { RichText, Tone } from '../types';

import {
  CAP,
  DROPS,
  LEAST_COUNT,
  MAX_DROPS,
  POUR,
  SHAKES_MIN,
  WATER_BY_ID,
  frothWord,
  lathered,
  model,
  threshold,
  volume,
  type WaterId,
} from './chemistry';
import {
  CONCLUSION_CONSISTENT,
  CONCLUSION_REASON,
  EXTENSION_COUNT,
  EXTENSION_LATHERED,
  EXTENSION_TOLERANCE,
  FAIR_SHAKING,
  FAIR_SOAP,
  MAX,
  REASON_OK,
  SCUM_MARKS,
  SETUP_PER_TUBE,
  STEP,
  TUBES,
  TUBE_A,
  TUBE_B,
  UNEQUAL_VOLUME_PENALTY,
  VIVA_POINTS,
  WHICH_OPTIONS,
  WHICH_SOFT,
  heightMarksFor,
} from './marking';
import {
  bothFilled,
  bothMeasured,
  bothShaken,
  bothSoaped,
  emptyTube,
  entryAt,
  fairness,
  latherIn,
  recordedCount,
  tubeAt,
  volumeIn,
  type Entry,
  type GradedCell,
  type Held,
  type SoapState,
  type Tube,
} from './state';

/**
 * Everything that can happen at this bench.
 *
 * Every action that depends on time carries `now` (ms since epoch), stamped by
 * the event handler that dispatches it, so the same state and action always
 * give the same result and the engine can be driven from plain Node.
 */
export type SoapAction =
  | { type: 'pickUp'; held: Held }
  | { type: 'putDown' }
  | { type: 'selectTube'; index: number }
  /** The one gesture the bench has: whatever is in hand, applied to a tube. */
  | { type: 'tapTube'; index: number; now: number }
  | { type: 'emptyTube'; index: number; now: number }
  | { type: 'setEntry'; index: number; field: 'height' | 'scum'; value: string }
  | { type: 'submitTable'; now: number }
  | { type: 'setExtDrops'; value: string }
  | { type: 'submitExtension'; skipped: boolean; now: number }
  | { type: 'setConclusion'; field: 'which' | 'why'; value: string }
  | { type: 'submitConclusion'; now: number }
  | { type: 'answerViva'; question: number; option: number; now: number }
  | { type: 'say'; text: RichText; tone: Tone };

export function soapReducer(state: SoapState, action: SoapAction): SoapState {
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
function edit(state: SoapState, fn: (draft: SoapState) => void): SoapState {
  const draft = structuredClone(state);
  fn(draft);
  return draft;
}

function say(d: SoapState, text: RichText, tone: Tone = 'info'): void {
  d.message = { text, tone };
}

function mistake(d: SoapState, now: number, what: string, pts = 0): void {
  logMistake(d.log, { now, t0: d.t0, what, pts });
}

/**
 * The bench is inert once the practical is over — and only then.
 *
 * Deliberately NOT locked by the marked table: the extension is soaping tube B
 * further, on the very tube that was just graded. The heights and the scum were
 * marked against what each tube showed at that moment, and `graded` keeps them,
 * so nothing done afterwards can rewrite a mark.
 */
function locked(d: SoapState): boolean {
  return d.done;
}

function nameOf(index: number): string {
  return TUBES[index]?.id ?? '?';
}

/** "A: 4 drops · B: 4 drops — still equal." The line that keeps the test honest. */
function tally(d: SoapState, field: 'drops' | 'shakes', unit: string): string {
  const a = tubeAt(d, TUBE_A)[field];
  const b = tubeAt(d, TUBE_B)[field];
  return `A: ${a} ${unit} · B: ${b} ${unit}${a === b ? ' — still equal.' : ' — **not equal any more**.'}`;
}

/**
 * The steps that complete themselves, in order. Each is checked rather than
 * assumed, so filling the last tube and soaping it in one gesture still lands
 * on the right step.
 */
function progress(d: SoapState): void {
  if (d.step === STEP.fill && bothFilled(d)) {
    const equal = volumeIn(d, TUBE_A) === volumeIn(d, TUBE_B);
    d.step += 1;
    say(
      d,
      `Both tubes are filled${
        equal
          ? ` with ${volumeIn(d, TUBE_A)} mL each`
          : ' — but with **different volumes**, which spoils the comparison'
      }. Now pick up the **soap dropper** and put the **same** number of drops into each.`,
      equal ? 'good' : 'warn',
    );
  }
  if (d.step === STEP.soap && bothSoaped(d)) {
    const a = tubeAt(d, TUBE_A).drops;
    const b = tubeAt(d, TUBE_B).drops;
    d.step += 1;
    say(
      d,
      a === b
        ? `${a} drops in each tube. Now pick up a **cork** and shake both tubes the **same** number of times — at ` +
            `least ${SHAKES_MIN} each.`
        : `Tube A has ${a} drops and tube B has ${b}. **That is no longer a fair test**: any difference in froth ` +
            'could be the soap rather than the water. Even it up before you shake.',
      a === b ? 'good' : 'warn',
    );
  }
  if (d.step === STEP.shake && bothShaken(d)) {
    const a = tubeAt(d, TUBE_A).shakes;
    const b = tubeAt(d, TUBE_B).shakes;
    d.step += 1;
    say(
      d,
      a === b
        ? 'Both tubes shaken the same number of times. Now pick up the **scale** and hold it against each tube to ' +
            'measure the froth.'
        : `Tube A was shaken ${a} times and tube B ${b}. **Unequal shaking spoils the test.** Shake the other tube ` +
            'to match before you measure.',
      a === b ? 'good' : 'warn',
    );
  }
  if (d.step === STEP.measure && bothMeasured(d)) {
    d.step += 1;
    say(
      d,
      'Both tubes measured. Write each froth height in the table in centimetres, and say whether that tube showed scum.',
      'good',
    );
  }
}

// ---------------------------------------------------------------------------
// Hands on the bench
// ---------------------------------------------------------------------------

function sameHold(a: Held | null, b: Held): boolean {
  if (!a || a.kind !== b.kind) return false;
  return a.kind !== 'water' || b.kind !== 'water' || a.id === b.id;
}

/** Anything done to a tube invalidates the measurement taken before it. */
function disturb(t: Tube): void {
  t.measured = false;
}

function pour(d: SoapState, index: number, id: WaterId, now: number): void {
  const t = tubeAt(d, index);
  const want = TUBES[index]?.water;
  if (locked(d)) {
    say(d, 'The practical is over — the tubes stay as they are.');
    return;
  }
  if (volume(t) + POUR > CAP) {
    say(d, `Tube ${nameOf(index)} already holds ${volume(t)} mL — a test tube takes ${CAP} mL.`, 'warn');
    return;
  }
  t.liq[id] = (t.liq[id] ?? 0) + POUR;
  t.added.push(id);
  disturb(t);
  d.sel = index;

  if (id !== want) {
    mistake(
      d,
      now,
      `Poured ${WATER_BY_ID[id].label} into tube ${nameOf(index)}, which is for ${
        want ? WATER_BY_ID[want].name : 'another water'
      }`,
      SETUP_PER_TUBE,
    );
    say(
      d,
      `Tube ${nameOf(index)} is for **${want ? WATER_BY_ID[want].name : 'another water'}**, but you poured ` +
        `**${WATER_BY_ID[id].label}** into it. Press **Empty and rinse** and pour it again — a comparison only means ` +
        'something if you know what is in each tube.',
      'bad',
    );
  } else {
    const unequal = bothFilled(d) && volumeIn(d, TUBE_A) !== volumeIn(d, TUBE_B);
    say(
      d,
      `${POUR} mL of ${WATER_BY_ID[id].label} in tube ${nameOf(index)}. ` +
        (unequal
          ? `**The volumes are not equal** — A has ${volumeIn(d, TUBE_A)} mL and B has ${volumeIn(d, TUBE_B)} mL.`
          : 'You are still holding the bottle.'),
      unequal ? 'warn' : 'info',
    );
  }
  progress(d);
}

function addSoap(d: SoapState, index: number): void {
  const t = tubeAt(d, index);
  if (locked(d)) return;
  if (!volume(t)) {
    say(d, 'That tube is empty — pour the water in first.', 'warn');
    return;
  }
  if (t.drops + DROPS > MAX_DROPS) {
    say(
      d,
      `Tube ${nameOf(index)} has had ${t.drops} drops already. That is as much soap as this experiment needs.`,
      'warn',
    );
    return;
  }
  t.drops += DROPS;
  disturb(t);
  d.sel = index;

  const m = model(t, d.hardness);
  const equal = tubeAt(d, TUBE_A).drops === tubeAt(d, TUBE_B).drops;
  say(
    d,
    `${DROPS} more drops into tube ${nameOf(index)} — ${t.drops} in all. ` +
      (m.scumSeen && !t.shakes ? 'The water has turned cloudy. ' : '') +
      tally(d, 'drops', 'drops'),
    equal ? 'info' : 'warn',
  );
  progress(d);
}

function shakeTube(d: SoapState, index: number): void {
  const t = tubeAt(d, index);
  if (locked(d)) return;
  if (!volume(t)) {
    say(d, 'Nothing to shake — that tube is empty.', 'warn');
    return;
  }
  t.shakes += 1;
  disturb(t);
  d.sel = index;
  if (!t.drops) {
    say(
      d,
      `Tube ${nameOf(index)} corked and shaken, but there is no soap in it yet — shaking plain water gives no froth.`,
      'warn',
    );
    return;
  }
  const equal = tubeAt(d, TUBE_A).shakes === tubeAt(d, TUBE_B).shakes;
  say(
    d,
    `Tube ${nameOf(index)} corked and shaken — ${t.shakes} time${t.shakes === 1 ? '' : 's'}. ` +
      tally(d, 'shakes', 'shakes'),
    equal ? 'info' : 'warn',
  );
  progress(d);
}

function measureTube(d: SoapState, index: number): void {
  const t = tubeAt(d, index);
  if (locked(d)) return;
  if (!volume(t)) {
    say(d, 'Nothing to measure — that tube is empty.', 'warn');
    return;
  }
  t.measured = true;
  d.sel = index;
  say(
    d,
    `The scale is held against tube ${nameOf(index)} with its **zero at the water line**. Look at the close-up beside ` +
      `the box you type into and read the top of the froth to the nearest millimetre — each small division is ` +
      `${LEAST_COUNT} cm.`,
  );
  progress(d);
}

// ---------------------------------------------------------------------------
// The marked steps
// ---------------------------------------------------------------------------

function submitTable(d: SoapState, now: number): void {
  if (d.step !== STEP.record || d.graded) return;
  if (recordedCount(d) < 2) {
    say(d, 'Both rows need a froth height and a scum answer before the table can be marked.', 'warn');
    return;
  }
  if (!bothMeasured(d)) {
    say(
      d,
      '**A tube has changed since you measured it.** Pick the scale up and hold it against that tube again before ' +
        'you submit.',
      'warn',
    );
    return;
  }

  const cells: Record<number, GradedCell> = {};
  let heightPts = 0;
  let scumPts = 0;

  for (const k of [TUBE_A, TUBE_B]) {
    const m = latherIn(d, k);
    const r = entryAt(d, k);
    const wrote = parseDecimal(r.height);
    const error = Number.isNaN(wrote) ? 99 : Math.abs(wrote - m.lather);
    const hp = heightMarksFor(error);
    const sp = r.scum === (m.scumSeen ? 'scum' : 'none') ? SCUM_MARKS : 0;
    heightPts += hp;
    scumPts += sp;
    cells[k] = { pts: hp + sp, heightPts: hp, scumPts: sp, trueHeight: m.lather, trueScum: m.scumSeen };
    if (hp < heightMarksFor(0)) {
      mistake(
        d,
        now,
        `Tube ${nameOf(k)}: you wrote ${Number.isNaN(wrote) ? 'nothing' : `${wrote} cm`}; the froth column measured ` +
          `${m.lather.toFixed(2)} cm`,
      );
    }
    if (sp < SCUM_MARKS) {
      mistake(
        d,
        now,
        `Tube ${nameOf(k)}: you recorded “${r.scum || '—'}”; the tube ${m.scumSeen ? 'did show scum' : 'showed no scum'}`,
      );
    }
  }

  // Tube C is optional and unmarked, but what it showed belongs in the record.
  if (volumeIn(d, 2) > 0) {
    const m = latherIn(d, 2);
    cells[2] = { pts: 0, heightPts: 0, scumPts: 0, trueHeight: m.lather, trueScum: m.scumSeen, extra: true };
  }

  const fair = fairness(d);
  d.fair = fair;
  d.pts.fair = (fair.soap ? FAIR_SOAP : 0) + (fair.shaking ? FAIR_SHAKING : 0);
  d.pts.heights = heightPts;
  d.pts.scum = scumPts;
  d.graded = { cells };
  d.held = null;

  const a = tubeAt(d, TUBE_A);
  const b = tubeAt(d, TUBE_B);
  if (!fair.soap) mistake(d, now, `Unfair test: tube A got ${a.drops} drops of soap, tube B got ${b.drops}`, FAIR_SOAP);
  if (!fair.shaking) {
    mistake(d, now, `Unfair test: tube A was shaken ${a.shakes} times, tube B ${b.shakes}`, FAIR_SHAKING);
  }
  if (!fair.volumes) {
    mistake(
      d,
      now,
      `Unfair test: tube A held ${volumeIn(d, TUBE_A)} mL, tube B ${volumeIn(d, TUBE_B)} mL`,
      UNEQUAL_VOLUME_PENALTY,
    );
  }

  const read = [TUBE_A, TUBE_B].filter((k) => cells[k]?.heightPts === heightMarksFor(0)).length;
  const allFair = fair.volumes && fair.soap && fair.shaking;
  const unfair = [
    fair.volumes ? '' : 'the volumes of water',
    fair.soap ? '' : 'the soap',
    fair.shaking ? '' : 'the shaking',
  ]
    .filter(Boolean)
    .join(' and ');

  say(
    d,
    `${read} of the 2 marked heights read to within a millimetre.` +
      (allFair
        ? ' Both tubes had the same water volume, the same soap and the same shaking, so the difference in froth can ' +
          'only be the water — that is what makes this a fair test.'
        : ` **But ${unfair} differed between the tubes**, so a difference in froth cannot be blamed on the hardness. ` +
          'The readings still count; the comparison does not.') +
      ' Now try the extension: keep soaping tube B until even the hard water lathers.',
    allFair && read === 2 ? 'good' : 'warn',
  );
  d.step += 1;
}

function submitExtension(d: SoapState, skipped: boolean, now: number): void {
  if (d.step !== STEP.extend) return;
  const b = tubeAt(d, TUBE_B);
  const m = model(b, d.hardness);
  const made = lathered(m);
  const needed = threshold(b, d.hardness);
  const wrote = Number.parseInt(d.extDrops.trim(), 10);
  const near =
    made && needed !== null && !Number.isNaN(wrote) && Math.abs(wrote - needed) <= EXTENSION_TOLERANCE;

  if (!skipped && !made) {
    say(
      d,
      `Tube B has ${frothWord(m)}. Keep squeezing soap in — every drop so far has gone into scum. Or skip the ` +
        'extension if you would rather move on.',
      'warn',
    );
    return;
  }

  d.pts.extension = skipped ? 0 : (made ? EXTENSION_LATHERED : 0) + (near ? EXTENSION_COUNT : 0);
  d.ext = {
    skipped,
    lathered: made,
    dropsRecorded: Number.isNaN(wrote) ? null : wrote,
    dropsNeeded: needed,
    dropsUsed: b.drops,
  };

  if (skipped) {
    mistake(d, now, 'Extension skipped — the hard-water tube was never made to lather', MAX.extension);
    say(
      d,
      'Extension skipped. It is worth doing: once enough soap has been added to precipitate every Ca²⁺ and Mg²⁺ ion, ' +
        'the extra soap stays in solution and hard water lathers just like soft water. Now write your conclusion.',
      'warn',
    );
  } else if (near) {
    say(
      d,
      `Correct — tube B needed about **${needed} drops** before a froth column stood up, against the ` +
        `${tubeAt(d, TUBE_A).drops} drops that were enough for the soft water. Everything below that went into scum. ` +
        'Now write your conclusion.',
      'good',
    );
  } else {
    mistake(
      d,
      now,
      `Extension: you wrote ${Number.isNaN(wrote) ? 'nothing' : `${wrote} drops`}; tube B in fact needed ${needed} ` +
        'drops to lather',
    );
    say(
      d,
      `Tube B lathers, but the count is out: with ${b.shakes} shakes it needed **${needed} drops**, not ` +
        `${Number.isNaN(wrote) ? 'a blank' : wrote}. The drops below that were all spent precipitating scum. Now ` +
        'write your conclusion.',
      'warn',
    );
  }
  d.step += 1;
}

/** What the student's OWN two heights say about which water washed better. */
function fromMyTable(d: SoapState): number {
  const a = parseDecimal(entryAt(d, TUBE_A).height);
  const b = parseDecimal(entryAt(d, TUBE_B).height);
  if (Number.isNaN(a) || Number.isNaN(b) || Math.abs(a - b) < 1e-9) return 2;
  return a > b ? 0 : 1;
}

function submitConclusion(d: SoapState, now: number): void {
  if (d.step !== STEP.conclude) return;
  if (d.conclPick.which === '' || d.conclPick.why === '') {
    say(d, 'Answer both halves: which water washed better, and why.', 'warn');
    return;
  }

  const mine = fromMyTable(d);
  const which = Number.parseInt(d.conclPick.which, 10);
  const why = Number.parseInt(d.conclPick.why, 10);
  const consistent = which === mine;
  const reasonOk = why === REASON_OK;
  const heightA = parseDecimal(entryAt(d, TUBE_A).height);
  const heightB = parseDecimal(entryAt(d, TUBE_B).height);

  d.concl = {
    which,
    why,
    consistent,
    reasonOk,
    fromMyTable: mine,
    myHeights: {
      A: Number.isNaN(heightA) ? null : heightA,
      B: Number.isNaN(heightB) ? null : heightB,
    },
  };
  d.pts.conclusion = (consistent ? CONCLUSION_CONSISTENT : 0) + (reasonOk ? CONCLUSION_REASON : 0);

  const unfairTest = d.fair !== null && !(d.fair.volumes && d.fair.soap && d.fair.shaking);
  if (!consistent) {
    mistake(
      d,
      now,
      `The conclusion does not follow from your own table (you recorded A ${
        Number.isNaN(heightA) ? '—' : heightA
      } cm and B ${Number.isNaN(heightB) ? '—' : heightB} cm)`,
      CONCLUSION_CONSISTENT,
    );
  }
  if (!reasonOk) mistake(d, now, 'The reason given for the difference is not the right one', CONCLUSION_REASON);
  if (which !== WHICH_SOFT) {
    mistake(
      d,
      now,
      `Conclusion reached: ${(WHICH_OPTIONS[which] ?? '—').toLowerCase()} cleans better — it is soft water that does`,
    );
  }

  say(
    d,
    (consistent && reasonOk
      ? 'Both halves right. '
      : consistent
        ? 'Your choice follows from your own table, but the reason is wrong. '
        : 'That choice does not follow from the heights you wrote down. ') +
      (which !== WHICH_SOFT && unfairTest
        ? 'It follows from your table, but your table came out of an **unfair test** — the tube that frothed more got ' +
          'more soap or more shaking, so the froth says nothing about the water. '
        : which !== WHICH_SOFT
          ? 'Even so, the answer is the other way round. '
          : '') +
      '**Soft water cleans better** for the same soap: the Ca²⁺ and Mg²⁺ ions of hard water throw the soap out as an ' +
      'insoluble scum, so hardly any soap is left in solution to foam. Add enough soap and the ions run out — which ' +
      'is exactly what the extension showed. Now the viva.',
    consistent && reasonOk && which === WHICH_SOFT ? 'good' : 'warn',
  );
  d.step += 1;
}

// ---------------------------------------------------------------------------
// The bench's one dispatch table
// ---------------------------------------------------------------------------

function act(state: SoapState, action: Exclude<SoapAction, { type: 'say' }>): SoapState {
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
        if (held.kind === 'water') pour(d, action.index, held.id, action.now);
        else if (held.kind === 'soap') addSoap(d, action.index);
        else if (held.kind === 'cork') shakeTube(d, action.index);
        else measureTube(d, action.index);
      });
    }

    case 'emptyTube': {
      if (!state.tubes[action.index] || locked(state)) return state;
      return edit(state, (d) => {
        d.tubes[action.index] = emptyTube();
        d.sel = action.index;
        say(d, `Tube ${nameOf(action.index)} emptied into the waste beaker and rinsed with distilled water.`);
      });
    }

    case 'setEntry': {
      if (state.step !== STEP.record || state.graded) return state;
      return edit(state, (d) => {
        const r: Entry = entryAt(d, action.index);
        if (action.field === 'height') r.height = action.value;
        else r.scum = action.value as Entry['scum'];
        d.rec[action.index] = r;
      });
    }

    case 'submitTable':
      return edit(state, (d) => submitTable(d, action.now));

    case 'setExtDrops':
      return state.step !== STEP.extend ? state : { ...state, extDrops: action.value };

    case 'submitExtension':
      return edit(state, (d) => submitExtension(d, action.skipped, action.now));

    case 'setConclusion':
      return state.step !== STEP.conclude
        ? state
        : { ...state, conclPick: { ...state.conclPick, [action.field]: action.value } };

    case 'submitConclusion':
      return edit(state, (d) => submitConclusion(d, action.now));

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
      throw new Error(`Unhandled soap bench action: ${JSON.stringify(exhaustive)}`);
    }
  }
}
