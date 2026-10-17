import { formatClock } from '../numbers';
import { vivaPaperFor } from '../viva';
import type { RichText, Tone } from '../types';

import {
  ABSORB,
  analyse,
  CAP,
  EMULSION_HALFLIFE,
  headCap,
  KRATE,
  liquidsFor,
  litmusHue,
  type Liquids,
  type LiquidId,
  MLGAS,
  POUR,
  SMELL_TEXT,
  smellWord,
  SPAT,
  volume,
} from './chemistry';
import { CONCLUSION_POINTS, PENALTY, ROW_POINTS, STEP, VIVA_POINTS } from './marking';
import { CONCLUSIONS, labelOf, ROWS } from './observations';
import { RACK, TUBE, tubeReady, wantedIds } from './rack';
import { newTube, type AceticAcidState, type GradedCell, type HeldItem, type StripKind, type TubeState } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * Everything that can happen at this bench.
 *
 * Every action that depends on time carries `now` (ms since epoch), stamped by
 * the handler that dispatched it. The reducer never reads a clock, so the same
 * state and action always give the same result — which is how the whole
 * practical can be driven from a script.
 *
 * `applyTo` is the one that does the work: what happens to a tube is decided by
 * what is in the student's hand, exactly as on the bench. The apparatus only
 * has to say "this tube was tapped".
 */
export type AceticAcidAction =
  | { type: 'hold'; item: HeldItem | null }
  | { type: 'selectTube'; tube: number }
  | { type: 'applyTo'; tube: number; now: number }
  | { type: 'emptyTube'; tube: number; now: number }
  | { type: 'removeDelivery'; now: number }
  | { type: 'recordRow'; row: number; value: string; now: number }
  | { type: 'goToRow'; row: number }
  | { type: 'submitObservations'; now: number }
  | { type: 'answerConclusion'; index: number; option: string; now: number }
  | { type: 'answerViva'; question: number; option: number; now: number }
  | { type: 'tick'; dt: number; now: number }
  | { type: 'say'; text: RichText; tone: Tone };

export function aceticAcidReducer(state: AceticAcidState, action: AceticAcidAction): AceticAcidState {
  switch (action.type) {
    case 'tick':
      return tick(state, action.dt, action.now);
    case 'say':
      return { ...state, message: { text: action.text, tone: action.tone } };
    case 'selectTube':
      return state.sel === action.tube ? state : { ...state, sel: action.tube };
    case 'hold':
      return edit(state, (d) => {
        d.held = action.item;
        if (!action.item || action.item.kind !== 'pipe') d.pend = null;
        if (action.item) d.picks += 1;
      });
    default:
      // Nothing is marked once the viva is over; the bench is inert until a new one.
      if (state.done) return state;
      return act(state, action);
  }
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

/** Clone, mutate the clone, return it. The given state is never touched. */
function edit(state: AceticAcidState, fn: (draft: AceticAcidState) => void): AceticAcidState {
  const draft = structuredClone(state);
  fn(draft);
  return draft;
}

function say(d: AceticAcidState, text: RichText, tone: Tone = 'info'): void {
  d.message = { text, tone };
}

function mistake(d: AceticAcidState, now: number, what: string, pts: number): void {
  d.log.push({ t: formatClock(now - d.t0), what, pts });
}

/** The bench is inert once the observations have been handed in. */
function locked(s: AceticAcidState): boolean {
  return s.graded !== null || s.done;
}

function liquids(d: AceticAcidState): Liquids {
  return liquidsFor(d.acidConc);
}

function wantedText(index: number, L: Liquids): string {
  return wantedIds(index)
    .map((id) => L[id].short)
    .join(' + ');
}

// ---------------------------------------------------------------------------
// The bench clock: a reaction proceeds whether or not anyone is watching
// ---------------------------------------------------------------------------

/**
 * One tick of bench time: a spatula of NaHCO₃ in an acid gives CO₂ at a rate
 * set by how much acid is left and how readily that acid gives up its H⁺, and
 * a tube shaken into an emulsion separates out again.
 */
function tick(state: AceticAcidState, dt: number, now: number): AceticAcidState {
  const L = liquidsFor(state.acidConc);
  const reacting = state.tubes.some((t) => {
    const a = analyse(t, L);
    return t.solid > 1e-6 && a.acidM > 1e-6 && a.vAq > 0;
  });
  // Idle: nothing fizzing, no gas standing anywhere, no stale bubbles to clear
  // and nothing still cloudy from a shake. The common case returns the SAME
  // state, so an idle bench ticking ten times a second renders nothing.
  if (!reacting && state.tubes.every((t) => t.head === 0 && t.rate === 0 && t.emul === 0)) return state;

  return edit(state, (d) => {
    for (const t of d.tubes) t.inflow = 0;
    for (const t of d.tubes) {
      const a = analyse(t, L);
      let rate = 0;
      if (t.solid > 1e-6 && a.acidM > 1e-6 && a.vAq > 0) {
        rate = KRATE * (a.acidM / a.vAq) * a.speed;
        const dn = Math.min(rate * dt, a.acidM, t.solid);
        t.acidUsed += dn;
        t.solid -= dn;
        t.gasMade += dn;
        t.peakRate = Math.max(t.peakRate, rate);
        const via = d.delivery;
        if (via && via.from === t.i && via.to !== t.i) receive(d.tubes[via.to]!, dn, L);
        else t.head = Math.min(t.head + dn * MLGAS, headCap(t));
      }
      t.rate = rate;
      // Gas drifts out of an open tube.
      t.head *= Math.pow(0.5, dt / 25);
      if (t.head < 0.05) t.head = 0;
      // The two liquids find each other again and the cloudiness clears.
      t.emul *= Math.pow(0.5, dt / EMULSION_HALFLIFE);
      if (t.emul < 0.02) t.emul = 0;
    }
    // What arrived through a delivery tube, as a rate rather than as a helping:
    // `receive` is called per tube and cannot see the tick it was called for.
    if (dt > 0) for (const t of d.tubes) t.inflowRate = t.inflow / dt;

    const lime = d.tubes.find((t) => t.gasIn > 0 && analyse(t, L).caM > 0);
    if (lime && lime.milkyMax > 0.3 && !d.warned.milky) {
      d.warned.milky = true;
      say(
        d,
        'The lime water has gone **milky** — a white suspension of calcium carbonate. Only carbon dioxide does that. The gas is CO₂.',
        'good',
      );
    }
    // The gas test finishes on the bench clock, not on a click, so the
    // procedure has to notice it here too.
    progress(d);
  });
}

/**
 * Gas bubbled into another tube. Lime water fixes about half of what bubbles
 * through, and can take at most two CO₂ per Ca(OH)₂ (CaCO₃, then Ca(HCO₃)₂);
 * everything else rises and collects above the liquid.
 */
function receive(dst: TubeState, dn: number, L: Liquids): void {
  dst.gasIn += dn;
  dst.inflow += dn;
  const a = analyse(dst, L);
  const room = Math.max(0, 2 * a.caM - dst.co2In);
  const taken = Math.min(dn * ABSORB, room);
  dst.co2In += taken;
  dst.head = Math.min(dst.head + (dn - taken) * MLGAS, headCap(dst));
  dst.milkyMax = Math.max(dst.milkyMax, analyse(dst, L).milky);
}

// ---------------------------------------------------------------------------
// Hands on the bench
// ---------------------------------------------------------------------------

function act(
  state: AceticAcidState,
  action: Exclude<AceticAcidAction, { type: 'tick' | 'say' | 'hold' | 'selectTube' }>,
): AceticAcidState {
  switch (action.type) {
    case 'applyTo':
      return state.held ? edit(state, (d) => applyTo(d, action.tube, action.now)) : state;

    case 'emptyTube':
      return edit(state, (d) => emptyTube(d, action.tube));

    case 'removeDelivery':
      if (!state.delivery && state.pend === null) return state;
      return edit(state, (d) => {
        d.delivery = null;
        d.pend = null;
        say(d, 'Delivery tube taken off. Any gas made now escapes into the air.');
      });

    case 'recordRow':
      return edit(state, (d) => recordRow(d, action.row, action.value));

    case 'goToRow':
      return edit(state, (d) => {
        d.row = Math.max(0, Math.min(ROWS.length - 1, action.row));
      });

    case 'submitObservations':
      return state.graded || state.step !== STEP.record ? state : edit(state, (d) => submitObservations(d, action.now));

    case 'answerConclusion':
      return edit(state, (d) => answerConclusion(d, action.index, action.option, action.now));

    case 'answerViva':
      return edit(state, (d) => answerViva(d, action.question, action.option, action.now));

    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled acetic-acid action: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** What happens to a tube is decided by what is in the student's hand. */
function applyTo(d: AceticAcidState, k: number, now: number): void {
  const held = d.held;
  if (!held) return;
  if (locked(d)) {
    say(d, 'Your observations are already marked — the tubes stay as they are.');
    return;
  }
  switch (held.kind) {
    case 'bottle':
      return pour(d, k, held.id, now);
    case 'jar':
      return addSolid(d, k);
    case 'blue':
    case 'red':
      return dipStrip(d, k, held.kind);
    case 'ph':
      return dipPaper(d, k);
    case 'rod':
      return stir(d, k, now);
    case 'waft':
      return smell(d, k, 'waft', now);
    case 'sniff':
      return smell(d, k, 'sniff', now);
    case 'pipe':
      return deliver(d, k);
    case 'splint':
      return splinter(d, k);
  }
}

function pour(d: AceticAcidState, k: number, id: LiquidId, now: number): void {
  const t = d.tubes[k]!;
  if (volume(t) + POUR > CAP) {
    say(d, `That tube already holds ${volume(t)} mL — any more and it will not shake safely.`, 'warn');
    return;
  }
  t.liq[id] = (t.liq[id] ?? 0) + POUR;
  t.added.push(id);
  d.sel = k;
  const L = liquids(d);
  if (!RACK[k]!.want[id]) {
    mistake(d, now, `Poured ${L[id].label} into tube ${k + 1}, which is for ${wantedText(k, L)}`, PENALTY.spoiled);
    say(
      d,
      `Tube ${k + 1} is for **${wantedText(k, L)}**, and you have put **${L[id].short}** in it. ` +
        'Whatever you test now is the mixture, not the sample — empty and rinse it, and start that tube again.',
      'bad',
    );
  } else {
    say(d, `${POUR} mL of ${L[id].label} into tube ${k + 1}. You are still holding the bottle.`);
  }
  progress(d);
}

function addSolid(d: AceticAcidState, k: number): void {
  const t = d.tubes[k]!;
  if (!volume(t)) {
    say(d, 'There is nothing in that tube for the solid to react with.', 'warn');
    return;
  }
  t.solid += SPAT;
  t.solidAdded += SPAT;
  d.sel = k;
  const a = analyse(t, liquids(d));
  if (a.acidM > 1e-6) {
    say(
      d,
      `One spatula of NaHCO₃ into tube ${k + 1}. Watch the tube — and remember the gas is only worth anything if you catch it.`,
    );
  } else {
    say(
      d,
      `One spatula of NaHCO₃ into tube ${k + 1}. There is no acid in that tube for it to react with, so it simply sits ` +
        'there and dissolves. Keep watching: nothing you cannot see counts as an observation.',
      'warn',
    );
  }
  progress(d);
}

function dipStrip(d: AceticAcidState, k: number, kind: StripKind): void {
  const t = d.tubes[k]!;
  const a = analyse(t, liquids(d));
  if (!volume(t)) {
    say(d, 'That tube is empty — pour the sample in first.', 'warn');
    return;
  }
  if (a.ph === null) {
    say(d, 'There is no aqueous solution in that tube, so litmus has nothing to respond to.', 'warn');
    return;
  }
  const hue = litmusHue(a.ph);
  t.strips[kind] = { hue, ph: a.ph };
  d.sel = k;
  const changed = hue !== kind;
  const note =
    changed && hue === 'red'
      ? ' Blue litmus going red is the standard test for an acid.'
      : hue === 'purple'
        ? ' Purple is litmus’s own colour — the solution is close to neutral.'
        : '';
  say(
    d,
    `A fresh **${kind}** strip into tube ${k + 1}: it ${changed ? `turns **${hue}**` : `stays **${kind}**`}.${note}`,
  );
  progress(d);
}

function dipPaper(d: AceticAcidState, k: number): void {
  const t = d.tubes[k]!;
  const a = analyse(t, liquids(d));
  if (!volume(t) || a.ph === null) {
    say(d, 'There is no aqueous solution in that tube to test.', 'warn');
    return;
  }
  t.phPaper = a.ph;
  d.sel = k;
  say(d, `pH paper in tube ${k + 1} reads about **${a.ph.toFixed(1)}**.`);
  progress(d);
}

function stir(d: AceticAcidState, k: number, now: number): void {
  const t = d.tubes[k]!;
  if (!volume(t)) {
    say(d, 'That tube is empty — there is nothing to shake.', 'warn');
    return;
  }
  const L = liquids(d);
  const ids = (Object.keys(t.liq) as LiquidId[]).filter((id) => (t.liq[id] ?? 0) > 0);
  const immiscible = ids.filter((id) => !L[id].aqueous).length;
  const hasAqueous = ids.some((id) => L[id].aqueous);
  const n = immiscible + (hasAqueous ? 1 : 0);
  t.stirs += 1;
  t.stirAt = now;
  // Two liquids that will not mix are driven into an emulsion; one that does
  // mix has nothing to cloud. The bench clock separates it again.
  t.emul = n > 1 ? 1 : 0;
  t.layersSeen = n > 1 ? 'two' : 'one';
  d.sel = k;
  say(
    d,
    n > 1
      ? `You shake tube ${k + 1} hard. For a moment it is a cloudy emulsion, then it settles back into **two layers** ` +
          'with a sharp boundary — the two liquids are not soluble in one another.'
      : `You shake tube ${k + 1}. It stays a **single clear layer** with no boundary anywhere — the contents mix ` +
          'completely, in any proportion.',
  );
  progress(d);
}

function smell(d: AceticAcidState, k: number, how: 'waft' | 'sniff', now: number): void {
  const t = d.tubes[k]!;
  if (!volume(t)) {
    say(d, 'That tube is empty.', 'warn');
    return;
  }
  const word = smellWord(analyse(t, liquids(d)).smell);
  t.smelled = how;
  t.smellSeen = word;
  d.sel = k;
  if (how === 'sniff') {
    d.sniffs += 1;
    mistake(d, now, `Put your nose to the mouth of tube ${k + 1} instead of wafting`, PENALTY.sniff);
    say(
      d,
      `You lean over tube ${k + 1} and breathe in. ` +
        (word === 'none'
          ? 'Nothing, as it happens — but you had no way of knowing that before you did it. '
          : 'A full lungful of acid vapour catches the back of your throat and makes you cough. ') +
        '**Never smell a chemical this way.** Hold the tube away from you and fan the vapour towards your nose with your hand.',
      'bad',
    );
  } else {
    say(
      d,
      `You hold tube ${k + 1} away from you and fan the vapour towards your nose: **${SMELL_TEXT[word]}**.` +
        (word === 'none' ? '' : ' That is the smell of vinegar.'),
    );
  }
  progress(d);
}

function deliver(d: AceticAcidState, k: number): void {
  if (d.delivery && (d.delivery.from === k || d.delivery.to === k)) {
    d.delivery = null;
    d.pend = null;
    say(d, 'Delivery tube taken off. Any gas made now escapes into the air.');
    return;
  }
  if (d.pend === null) {
    d.pend = k;
    d.sel = k;
    say(d, `Delivery tube corked into **tube ${k + 1}**. Now tap the tube the gas should bubble through — the lime water.`);
    return;
  }
  if (d.pend === k) {
    d.pend = null;
    say(d, 'Delivery tube taken off again.');
    return;
  }
  d.delivery = { from: d.pend, to: k };
  d.pend = null;
  d.sel = k;
  say(
    d,
    `The delivery tube now runs from tube ${d.delivery.from + 1} into tube ${k + 1}, with its end under the liquid. ` +
      `Any gas made in tube ${d.delivery.from + 1} will bubble through.`,
    'good',
  );
  progress(d);
}

function splinter(d: AceticAcidState, k: number): void {
  const t = d.tubes[k]!;
  t.splinter = t.head >= 2 ? 'out' : 'burns';
  d.sel = k;
  say(
    d,
    t.head >= 2
      ? `You lower the burning splinter into the mouth of tube ${k + 1}. The flame **goes out at once** — the gas ` +
          'standing in that tube does not support burning.'
      : `You lower the burning splinter into tube ${k + 1}. It **keeps burning** — there is no collected gas in there, only air.`,
  );
  progress(d);
}

function emptyTube(d: AceticAcidState, k: number): void {
  if (locked(d)) return;
  if (d.delivery && (d.delivery.from === k || d.delivery.to === k)) d.delivery = null;
  if (d.pend === k) d.pend = null;
  d.tubes[k] = newTube(k);
  d.empties += 1;
  d.sel = k;
  say(d, 'Emptied into the waste beaker and rinsed with distilled water.');
  progress(d);
}

// ---------------------------------------------------------------------------
// The procedure
// ---------------------------------------------------------------------------

/**
 * Move along the procedure when the work of the current part is done.
 *
 * Part (d) moves on once a carbonate has gone into SOME tube and some gas has
 * been caught — not only when it was the right tube. Putting it in the wrong
 * one is caught by the marking, not by a lock on the bench.
 */
function progress(d: AceticAcidState): void {
  const T = d.tubes;
  if (d.step === STEP.setup && T.every((t, i) => tubeReady(i, t))) {
    d.step += 1;
    say(
      d,
      'All six tubes are ready. Start with the smell: pick up **WAFT** and fan the vapour from tube 1 towards you. ' +
        'Never put your nose over the tube.',
      'good',
    );
  }
  if (d.step === STEP.odour && T[TUBE.sample]!.smelled && T[TUBE.diluted]!.smelled) {
    d.step += 1;
    say(
      d,
      'Odour done. Now the solubility: take the **glass rod** and shake tube 2 (acid and water) and tube 3 (oil and water). ' +
        'Watch what each one settles into.',
      'good',
    );
  }
  if (d.step === STEP.solubility && T[TUBE.diluted]!.stirs > 0 && T[TUBE.oil]!.stirs > 0) {
    d.step += 1;
    say(
      d,
      'Now litmus. Dip a fresh **blue** strip and a fresh **red** strip into tube 1, and read them against the chart on the bench.',
      'good',
    );
  }
  if (d.step === STEP.litmus && T[TUBE.sample]!.strips.blue && T[TUBE.sample]!.strips.red) {
    d.step += 1;
    say(
      d,
      'Last test. Fit the **delivery tube** from tube 4 into the lime water in tube 5 _first_, then tip a spatula of ' +
        '**NaHCO₃** into tube 4 so none of the gas is wasted.',
      'good',
    );
  }
  if (d.step === STEP.carbonate && T.some((t) => t.solidAdded > 0) && T.some((t) => t.gasIn > 0)) {
    d.step += 1;
    d.held = null;
    d.pend = null;
    say(
      d,
      'Every test is done. Now write up the observation table, one row at a time — **what you actually saw**. ' +
        'A row you never tested is recorded as not tested.',
      'good',
    );
  }
}

function recordRow(d: AceticAcidState, index: number, value: string): void {
  const row = ROWS[index];
  if (!row || d.graded || d.step !== STEP.record) return;
  d.rec[row.id] = value;
  const next = ROWS.findIndex((r, i) => i > index && !d.rec[r.id]);
  d.row = next >= 0 ? next : Math.min(index + 1, ROWS.length - 1);
  const filled = ROWS.filter((r) => d.rec[r.id]).length;
  say(
    d,
    filled === ROWS.length
      ? 'All eight rows are written up. Look them over in the table — you can go back and change any of them — then hand them in.'
      : `Row ${index + 1} written up. ${ROWS.length - filled} to go.`,
  );
}

function submitObservations(d: AceticAcidState, now: number): void {
  const cells: Record<string, GradedCell> = {};
  let pts = 0;
  for (const row of ROWS) {
    const truth = row.truth(d);
    const pick = d.rec[row.id] ?? null;
    const ok = pick === truth;
    cells[row.id] = { truth, pick, ok, pts: ok ? ROW_POINTS : 0 };
    if (ok) pts += ROW_POINTS;
    else {
      mistake(
        d,
        now,
        `${row.q}: you recorded “${labelOf(row.o, pick)}”, the tube showed “${labelOf(row.o, truth)}”`,
        PENALTY.row,
      );
    }
  }
  d.graded = { cells, pts };
  d.held = null;
  const right = Object.values(cells).filter((c) => c.ok).length;
  say(
    d,
    `${right} of ${ROWS.length} rows match what your tubes showed.` +
      (right === ROWS.length
        ? ' Every row is an honest reading of your own bench. Now the conclusion.'
        : ' The rows marked in red are ones where the table and the tube disagree — the tube wins. Now the conclusion.'),
    right === ROWS.length ? 'good' : 'warn',
  );
  d.step = STEP.conclusion;
}

function answerConclusion(d: AceticAcidState, index: number, option: string, now: number): void {
  const c = CONCLUSIONS[index];
  if (!c || d.concl[c.id] || d.step !== STEP.conclusion) return;
  d.concl[c.id] = option;
  if (option !== c.truth(d)) mistake(d, now, `Conclusion: ${c.q}`, PENALTY.conclusion);
  if (!CONCLUSIONS.every((x) => d.concl[x.id])) return;

  d.conclPts = CONCLUSIONS.reduce((a, x) => a + (d.concl[x.id] === x.truth(d) ? CONCLUSION_POINTS : 0), 0);
  const perfect = d.conclPts === CONCLUSION_POINTS * CONCLUSIONS.length;
  const paper = d.tubes[TUBE.sample]!.phPaper;
  say(
    d,
    'Acetic acid turns blue litmus red, so it is an acid — but ' +
      (paper !== null ? `your pH paper read ${paper.toFixed(1)}` : 'its pH sits near 3') +
      ', not 1, because it is only partly ionised. With NaHCO₃ it gives carbon dioxide: ' +
      '**CH₃COOH + NaHCO₃ → CH₃COONa + H₂O + CO₂**. Five questions to finish.',
    perfect ? 'good' : 'warn',
  );
  d.step = STEP.viva;
}

function answerViva(d: AceticAcidState, question: number, option: number, now: number): void {
  const q = vivaPaperFor(VIVA_BANK, d.seed, d.vivaShuffled)[question];
  if (!q || d.viva[question] || d.step !== STEP.viva) return;
  const ok = option === q.a;
  d.viva[question] = { pick: option, pts: ok ? VIVA_POINTS : 0 };
  if (!ok) mistake(d, now, `Viva: question ${question + 1}`, VIVA_POINTS);
  if (d.viva.every(Boolean)) {
    d.done = true;
    d.tEnd = now;
    d.step += 1;
  }
}
