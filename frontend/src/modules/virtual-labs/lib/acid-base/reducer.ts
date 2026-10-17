import { logMistake } from '../marking';
import { vivaPaperFor } from '../viva';
import type { RichText, Tone } from '../types';

import {
  CAP,
  CARB_G,
  DROPS,
  fizzLevel,
  gasRate,
  identifiedGas,
  isLitmusTest,
  limeResult,
  litmusObs,
  newTube,
  pHof,
  POUR,
  REAGENTS,
  reactTube,
  solutionVol,
  splinterResult,
  tubeIsLive,
  tubeVol,
  ZN_G,
  type FizzLevel,
  type GasClaim,
  type LitmusObs,
  type LitmusId,
  type ReagentId,
  type SolidId,
} from './chemistry';
import {
  CONCLUSIONS,
  CONCL_POINTS,
  FIZZ_WORDS,
  GAS_WORDS,
  LITMUS_WORDS,
  STEP,
  VIVA_POINTS,
} from './marking';
import { carbonateAcidTube, zincAcidTube } from './score';
import { rowFilled, tableComplete, type AcidBaseState, type Held } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * Everything that can happen at the bench.
 *
 * Every action that depends on time carries `now`, stamped by the handler that
 * dispatched it, so the reducer never reads a clock and the same state and
 * action always give the same result.
 */
export type AcidBaseAction =
  | { type: 'pickUp'; held: Held | null; now: number }
  | { type: 'tapTube'; tube: number; now: number }
  | { type: 'rinse'; tube: number; now: number }
  | { type: 'tick'; dt: number; now: number }
  | { type: 'goToRow'; row: number }
  | { type: 'writeLitmus'; row: number; value: LitmusObs; now: number }
  | { type: 'writeFizz'; row: number; value: FizzLevel; now: number }
  | { type: 'writeGas'; row: number; value: GasClaim; now: number }
  | { type: 'submitTable'; now: number }
  | { type: 'answerConclusion'; question: number; option: number; now: number }
  | { type: 'answerViva'; question: number; option: number; now: number };

export function acidBaseReducer(state: AcidBaseState, action: AcidBaseAction): AcidBaseState {
  switch (action.type) {
    case 'tick':
      return tick(state, action.dt);
    case 'goToRow':
      return state.row === action.row ? state : { ...state, row: clampRow(action.row) };
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
function edit(state: AcidBaseState, fn: (draft: AcidBaseState) => void): AcidBaseState {
  const draft = structuredClone(state);
  fn(draft);
  return draft;
}

function say(d: AcidBaseState, text: RichText, tone: Tone = 'info'): void {
  d.message = { text, tone };
}

function mistake(d: AcidBaseState, now: number, what: string, pts = 0): void {
  logMistake(d.log, { now, t0: d.t0, what, pts });
}

const clampRow = (row: number): number => Math.max(0, Math.min(7, row));

const SOLID_WORDS: Readonly<Record<SolidId, string>> = {
  Zn: 'zinc granules',
  Na2CO3: 'solid sodium carbonate',
};

/** Once the table is marked the tubes stay exactly as they are. */
const locked = (d: AcidBaseState): boolean => d.graded !== null || d.done;

const letter = (d: AcidBaseState, i: number): string => d.layout[i]?.id ?? '?';

/** The other tube of the pair that shares this tube's test. */
function partnerOf(d: AcidBaseState, i: number): number {
  const test = d.layout[i]!.test;
  return d.layout.findIndex((s, k) => k !== i && s.test === test);
}

// ---------------------------------------------------------------------------
// The reaction clock
// ---------------------------------------------------------------------------

/**
 * Bench time, at 10 Hz. An idle rack returns the SAME state, so eight settled
 * tubes ticking ten times a second render nothing.
 */
function tick(state: AcidBaseState, dt: number): AcidBaseState {
  if (locked(state) || !state.tubes.some(tubeIsLive)) return state;
  return edit(state, (d) => {
    for (const t of d.tubes) reactTube(t, dt);
  });
}

// ---------------------------------------------------------------------------
// Hands on the bench
// ---------------------------------------------------------------------------

function act(
  state: AcidBaseState,
  action: Exclude<AcidBaseAction, { type: 'tick' | 'goToRow' }>,
): AcidBaseState {
  switch (action.type) {
    case 'pickUp':
      // Tapping the bare bench with empty hands is not an event.
      if (!action.held && !state.held) return state;
      return edit(state, (d) => {
        d.held = action.held;
        if (action.held) d.pickUps += 1;
      });

    case 'tapTube': {
      const held = state.held;
      if (!held) return state.sel === action.tube ? state : { ...state, sel: action.tube };
      return edit(state, (d) => {
        d.sel = action.tube;
        useHeld(d, action.tube, held, action.now);
        progress(d);
      });
    }

    case 'rinse':
      if (locked(state)) return state;
      return edit(state, (d) => {
        d.tubes[action.tube] = newTube();
        d.rinses += 1;
        d.sel = action.tube;
        say(
          d,
          `Tube ${letter(d, action.tube)} emptied into the waste beaker and rinsed with distilled water.`,
        );
      });

    case 'writeLitmus':
      return writeRow(state, action.row, (row) => {
        row.lit = action.value;
      });

    case 'writeFizz':
      return writeRow(state, action.row, (row) => {
        row.eff = action.value;
      });

    case 'writeGas':
      return writeRow(state, action.row, (row) => {
        row.gas = action.value;
      });

    case 'submitTable':
      if (state.step !== STEP.record || state.graded || !tableComplete(state)) return state;
      return edit(state, (d) => submitTable(d, action.now));

    case 'answerConclusion': {
      const { question, option, now } = action;
      if (state.step !== STEP.conclusions || state.concl[question] || !CONCLUSIONS[question]) return state;
      return edit(state, (d) => {
        const ok = option === CONCLUSIONS[question]!.a;
        d.concl[question] = { pick: option, pts: ok ? CONCL_POINTS : 0 };
        if (!ok) mistake(d, now, `Conclusion ${question + 1}`);
        if (d.concl.every(Boolean)) {
          say(d, 'Now five viva questions to finish.');
          d.step = STEP.viva;
        }
      });
    }

    case 'answerViva': {
      const { question, option, now } = action;
      if (state.step !== STEP.viva || state.viva[question] || !vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled)[question]) return state;
      return edit(state, (d) => {
        const ok = option === vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled)[question]!.a;
        d.viva[question] = { pick: option, pts: ok ? VIVA_POINTS : 0 };
        if (!ok) mistake(d, now, `Viva: question ${question + 1}`);
        if (d.viva.every(Boolean)) {
          d.done = true;
          d.tEnd = now;
          d.step = STEP.viva + 1;
        }
      });
    }

    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled acid-base action: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** What the thing in your hand does when you tap a tube with it. */
function useHeld(d: AcidBaseState, k: number, held: Held, now: number): void {
  if (locked(d)) {
    say(d, 'Your observations are already marked — the tubes stay as they are.');
    return;
  }
  switch (held.kind) {
    case 'reagent':
      return pour(d, k, held.id, now);
    case 'litmus':
      return addLitmus(d, k, held.id, now);
    case 'jar':
      return addSolid(d, k, held.id, now);
    case 'splinter':
      return testSplinter(d, k);
    case 'lime':
      return testLime(d, k);
  }
}

function pour(d: AcidBaseState, k: number, id: ReagentId, now: number): void {
  const t = d.tubes[k]!;
  const spec = d.layout[k]!;
  if (tubeVol(t) + POUR > CAP) {
    say(
      d,
      `Tube ${spec.id} already holds ${tubeVol(t).toFixed(1)} mL — plenty for these tests.`,
      'warn',
    );
    return;
  }
  t.liq[id] += POUR;
  t.poured.push(id);
  if (id !== spec.reagent) {
    d.contam += 1;
    mistake(
      d,
      now,
      `Poured ${REAGENTS[id].label} into tube ${spec.id}, which is labelled ${REAGENTS[spec.reagent].label}`,
      2,
    );
    say(
      d,
      `Tube **${spec.id}** is labelled **${REAGENTS[spec.reagent].label}** and you have added **${REAGENTS[id].label}**. ` +
        `Acid and alkali cancel: the tube is now **pH ${(pHof(t) ?? 7).toFixed(1)}**, which is neither. ` +
        'Press **Empty and rinse**, then fill it again.',
      'bad',
    );
    return;
  }
  say(d, `${POUR} mL of ${REAGENTS[id].label} into tube ${spec.id}. You are still holding the bottle.`);
}

function addLitmus(d: AcidBaseState, k: number, id: LitmusId, now: number): void {
  const t = d.tubes[k]!;
  const spec = d.layout[k]!;
  if (!solutionVol(t)) {
    say(d, `Tube ${spec.id} is empty — pour the solution in first.`, 'warn');
    return;
  }
  t.drops[id] += DROPS;
  const obs = litmusObs(t);
  const ph = pHof(t) ?? 7;
  if (isLitmusTest(spec) && spec.test !== id) {
    mistake(d, now, `Tube ${spec.id} calls for ${spec.test} litmus and you added ${id} litmus`);
  }
  say(
    d,
    `${DROPS} drops of **${id} litmus** into tube ${spec.id}. The tube is at **pH ${ph.toFixed(1)}**, ` +
      `so the litmus is ${ph < 6 ? 'red' : ph > 8 ? 'blue' : 'purple'} — **${LITMUS_WORDS[obs]}**.`,
    obs === 'mixed' ? 'warn' : 'info',
  );
}

function addSolid(d: AcidBaseState, k: number, id: SolidId, now: number): void {
  const t = d.tubes[k]!;
  const spec = d.layout[k]!;
  if (!solutionVol(t)) {
    say(d, `Tube ${spec.id} is empty — a solid on its own does nothing. Pour the solution in first.`, 'warn');
    return;
  }
  if (spec.test !== id) {
    mistake(d, now, `Tube ${spec.id} calls for ${spec.what} and you tipped ${SOLID_WORDS[id]} into it`);
  }
  const g = id === 'Zn' ? ZN_G : CARB_G;
  t.solid[id] += g;
  t.put[id] += g;
  // The reaction starts the moment the solid goes in.
  reactTube(t, 0.25);
  const level = fizzLevel(gasRate(t));
  const name = id === 'Zn' ? 'zinc granules' : 'solid sodium carbonate';
  say(
    d,
    level === 'brisk'
      ? `A spatula of ${name} into tube ${spec.id} — **brisk effervescence**. Something is coming off, but the bubbles do not say what. Test the gas.`
      : level === 'slow'
        ? `A spatula of ${name} into tube ${spec.id} — **a few slow bubbles**. Slow is still a reaction. Give it a moment, then test the gas.`
        : `A spatula of ${name} into tube ${spec.id} — **nothing happens**. No bubbles at all.`,
    level === 'none' ? 'warn' : 'good',
  );
}

function testSplinter(d: AcidBaseState, k: number): void {
  const t = d.tubes[k]!;
  const spec = d.layout[k]!;
  const res = splinterResult(t);
  t.tests.splinter = res;
  if (res === 'pop') t.ident.H2 = true;
  say(
    d,
    res === 'pop'
      ? `Tube ${spec.id}: the gas at the mouth burned with a sharp **pop**. That is **hydrogen**.`
      : res === 'out'
        ? `Tube ${spec.id}: the flame **went straight out**. This gas does not support burning, so it is not hydrogen — pass it through **lime water** to name it.`
        : `Tube ${spec.id}: the splinter went on burning quietly — there is no gas at its mouth${
            gasRate(t) > 0 ? ' _yet_. The tube is still fizzing, so give it a few seconds and try again' : ''
          }.`,
    res === 'burns' ? 'warn' : 'good',
  );
}

function testLime(d: AcidBaseState, k: number): void {
  const t = d.tubes[k]!;
  const spec = d.layout[k]!;
  const res = limeResult(t);
  t.tests.lime = res;
  if (res === 'milky') t.ident.CO2 = true;
  d.lime = { from: spec.id, milky: res === 'milky' };
  say(
    d,
    res === 'milky'
      ? `The gas from tube ${spec.id} turned the lime water **milky** — white calcium carbonate. The gas is **carbon dioxide**.`
      : `The gas from tube ${spec.id} left the lime water **clear**. ` +
        (t.gas.H2 >= 0.15
          ? 'There is plenty of gas in that tube, but lime water does not respond to it — try a **burning splinter** instead.'
          : 'There was no carbon dioxide at the mouth of that tube.'),
    res === 'milky' ? 'good' : 'warn',
  );
}

// ---------------------------------------------------------------------------
// The procedure
// ---------------------------------------------------------------------------

const pourDone = (d: AcidBaseState): boolean =>
  d.tubes.every(
    (t, i) => t.liq[d.layout[i]!.reagent] >= POUR && t.poured.every((a) => a === d.layout[i]!.reagent),
  );

const litmusDone = (d: AcidBaseState): boolean =>
  [0, 1, 2, 3].every((i) => d.tubes[i]!.drops[d.layout[i]!.test as LitmusId] > 0);

const gasTested = (d: AcidBaseState, i: number): boolean =>
  d.tubes[i]!.tests.splinter !== null || d.tubes[i]!.tests.lime !== null;

const zincDone = (d: AcidBaseState): boolean =>
  [4, 5].every((i) => d.tubes[i]!.put.Zn > 0) && gasTested(d, zincAcidTube(d));

const carbonateDone = (d: AcidBaseState): boolean =>
  [6, 7].every((i) => d.tubes[i]!.put.Na2CO3 > 0) && gasTested(d, carbonateAcidTube(d));

/** Advance at most one stage, and say what the next one is. */
function progress(d: AcidBaseState): void {
  if (d.step === STEP.pour && pourDone(d)) {
    d.step = STEP.litmus;
    say(
      d,
      `All eight tubes are filled. Now the litmus tests: **blue litmus** into ${letter(d, 0)} and ${letter(d, 2)}, ` +
        `**red litmus** into ${letter(d, 1)} and ${letter(d, 3)}. Watch what each one does.`,
      'good',
    );
    return;
  }
  if (d.step === STEP.litmus && litmusDone(d)) {
    d.step = STEP.zinc;
    const acid = zincAcidTube(d);
    say(
      d,
      `Four litmus tests done. Now tip a spatula of **zinc granules** into tube ${letter(d, acid)} (acid) and tube ` +
        `${letter(d, partnerOf(d, acid))} (alkali) — then hold a **burning splinter** at the mouth of a fizzing tube to find out what the gas is.`,
      'good',
    );
    return;
  }
  if (d.step === STEP.zinc && zincDone(d)) {
    d.step = STEP.carbonate;
    const zn = zincAcidTube(d);
    const carb = carbonateAcidTube(d);
    const named = d.tubes[zn]!.ident.H2;
    say(
      d,
      (named
        ? `Hydrogen from tube ${letter(d, zn)}, named by its pop. `
        : `Careful — you have tested the gas in tube ${letter(d, zn)} but nothing has named it. Lime water does not respond to the gas zinc gives; a **burning splinter** does. Go back to that tube whenever you like. `) +
        `Now **solid sodium carbonate** into tube ${letter(d, carb)} (acid) and tube ${letter(d, partnerOf(d, carb))} (alkali). ` +
        'One of them will fizz — pass that gas through **lime water** to name it.',
      named ? 'good' : 'warn',
    );
    return;
  }
  if (d.step === STEP.carbonate && carbonateDone(d)) {
    d.step = STEP.record;
    d.row = 0;
    d.held = null;
    const carb = carbonateAcidTube(d);
    const named = d.tubes[carb]!.ident.CO2;
    say(
      d,
      (named
        ? `Carbon dioxide from tube ${letter(d, carb)}, named by the lime water. `
        : `You have tested the gas in tube ${letter(d, carb)} without naming it — only **lime water** identifies carbon dioxide. Go back to that tube if you want to. `) +
        'Now write down, tube by tube, **what you actually saw** — not what the textbook says you should have seen.',
      named ? 'good' : 'warn',
    );
  }
}

/** Write one cell of the table, then move to the next row that still needs one. */
function writeRow(
  state: AcidBaseState,
  row: number,
  fn: (r: AcidBaseState['rec'][number]) => void,
): AcidBaseState {
  if (state.step !== STEP.record || state.graded) return state;
  return edit(state, (d) => {
    fn(d.rec[row]!);
    d.row = row;
    if (rowFilled(d, row)) {
      const next = d.rec.findIndex((_, i) => i > row && !rowFilled(d, i));
      const back = d.rec.findIndex((_, i) => !rowFilled(d, i));
      if (next >= 0) d.row = next;
      else if (back >= 0) d.row = back;
    }
  });
}

/**
 * Mark the table against what the tubes really showed.
 *
 * A litmus row is worth 4 for the colour; a gas row 2 for the effervescence and
 * 2 for the gas the student actually established. Writing "carbon dioxide" for
 * a gas that was never tested costs the mark even when the textbook agrees.
 */
function submitTable(d: AcidBaseState, now: number): void {
  const graded: AcidBaseState['graded'] = [];
  let total = 0;
  let untested = 0;

  d.layout.forEach((spec, i) => {
    const t = d.tubes[i]!;
    const r = d.rec[i]!;
    if (isLitmusTest(spec)) {
      const truth = litmusObs(t);
      const pts = r.lit === truth ? 4 : 0;
      graded.push({
        pts,
        truth: LITMUS_WORDS[truth],
        recorded: r.lit ? LITMUS_WORDS[r.lit] : null,
      });
      if (!pts) {
        mistake(
          d,
          now,
          `Tube ${spec.id}: you recorded “${r.lit ? LITMUS_WORDS[r.lit] : '—'}”, but the tube showed ${LITMUS_WORDS[truth]}`,
        );
      }
      total += pts;
      return;
    }
    const tf = fizzLevel(t.peakRate);
    const tg = identifiedGas(t);
    const p1 = r.eff === tf ? 2 : 0;
    const p2 = r.gas === tg ? 2 : 0;
    if (tg === 'untested') untested += 1;
    graded.push({
      pts: p1 + p2,
      truth: `${FIZZ_WORDS[tf]}; ${GAS_WORDS[tg]}`,
      recorded: `${r.eff ? FIZZ_WORDS[r.eff] : '—'}; ${r.gas ? GAS_WORDS[r.gas] : '—'}`,
    });
    if (!p1) {
      mistake(
        d,
        now,
        `Tube ${spec.id}: you recorded “${r.eff ? FIZZ_WORDS[r.eff] : '—'}”, but the tube gave ${FIZZ_WORDS[tf]}`,
      );
    }
    if (!p2) {
      mistake(
        d,
        now,
        tg === 'untested'
          ? `Tube ${spec.id}: you wrote down a gas you never tested for`
          : `Tube ${spec.id}: your tests showed “${GAS_WORDS[tg]}”, not “${r.gas ? GAS_WORDS[r.gas] : '—'}”`,
      );
    }
    total += p1 + p2;
  });

  d.graded = graded;
  d.obsPts = total;
  d.held = null;
  d.step = STEP.conclusions;
  const full = graded.filter((c) => c.pts === 4).length;
  say(
    d,
    `${full} of 8 rows match what the tubes showed.` +
      (untested
        ? ` ${untested} gas${untested > 1 ? 'es were' : ' was'} never tested — a gas has to be identified, never assumed.`
        : '') +
      ' Now the conclusions.',
    full >= 7 ? 'good' : 'warn',
  );
}
