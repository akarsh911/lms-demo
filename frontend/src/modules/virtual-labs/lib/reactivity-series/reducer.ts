import { formatClock } from '../numbers';
import { vivaPaperFor } from '../viva';
import type { RichText, Tone } from '../types';

import {
  CAP,
  METAL,
  METALS,
  POUR,
  SALT,
  SALTS,
  TRUE_ORDER,
  beginIfReady,
  newTube,
  react,
  reacted,
  shouldReact,
  truthOf,
  truthSignature,
  tubeKey,
  volumeOf,
  type ColourCode,
  type DepositCode,
  type Metal,
  type Salt,
} from './chemistry';
import {
  CLEAN_POINTS,
  CONCLUDE_HALF,
  MAX,
  PATIENT_MINUTES,
  PENALTY,
  STAGE,
  STRIP_POINTS,
  VIVA_POINTS,
  describe,
} from './marking';
import type { GradedCell, Held, RxState } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * Everything that can happen at the bench.
 *
 * Every action that depends on time carries `now` (ms since epoch), stamped by
 * the handler that dispatched it. The reducer never reads a clock, so the same
 * state and action always give the same result — which is what lets the whole
 * practical be driven from plain Node.
 */
export type RxAction =
  | { type: 'hold'; held: Held | null }
  | { type: 'tapBottle'; salt: Salt }
  | { type: 'tapSand' }
  | { type: 'tapMetal'; metal: Metal; now: number }
  | { type: 'tapTube'; index: number; now: number }
  | { type: 'empty'; index: number; now: number }
  | { type: 'wait'; minutes: number; now: number }
  | { type: 'tick'; dt: number; now: number }
  | { type: 'readyToRecord'; now: number }
  | { type: 'recordCell'; index: number; c?: ColourCode; d?: DepositCode; now: number }
  | { type: 'submitObs'; now: number }
  | { type: 'pickOrder'; metal: Metal }
  | { type: 'clearOrder' }
  | { type: 'submitOrder'; now: number }
  | { type: 'answerViva'; question: number; option: number; now: number }
  | { type: 'say'; text: RichText; tone: Tone };

/**
 * How fast the lab clock runs while a wait is playing out: two simulated
 * minutes a second, so five minutes of chemistry takes two and a half seconds
 * of a student's life but is still visibly a passage of time.
 */
export const SIM_MINUTES_PER_SECOND = 2;

export function rxReducer(state: RxState, action: RxAction): RxState {
  switch (action.type) {
    case 'tick':
      return tick(state, action.dt);
    case 'say':
      return { ...state, message: { text: action.text, tone: action.tone } };
    default:
      // Nothing is marked after the viva; the bench is evidence until a new one.
      if (state.done) return state;
      return act(state, action);
  }
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

/** Clone, mutate the clone, return it. The given state is never touched. */
function edit(state: RxState, fn: (draft: RxState) => void): RxState {
  const draft: RxState = structuredClone(state);
  fn(draft);
  return draft;
}

function say(d: RxState, text: RichText, tone: Tone = 'info'): void {
  d.message = { text, tone };
}

function mistake(d: RxState, now: number, what: string, pts = 0): void {
  d.log.push({ t: formatClock(now - d.t0), what, pts });
}

/** Once the observations are marked, the tubes stay exactly as they are. */
function locked(d: RxState): boolean {
  return d.graded !== null || d.done;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const solutionsDone = (d: RxState): boolean =>
  d.tubes.every((t) => t.added.length > 0 && t.added.every((s) => s === t.salt));

const stripsDone = (d: RxState): boolean => d.tubes.every((t) => t.strip?.metal === t.metal);

/** The tube is now in the close-up, so what it shows is what was last seen. */
function look(d: RxState, index: number): void {
  d.sel = index;
  const t = d.tubes[index];
  if (!t) return;
  t.seen = truthSignature(truthOf(t));
  t.fresh = false;
}

/** Minutes since the last strip went into a tube that can react. */
export function minutesSinceLastStrip(d: RxState): number {
  const started = d.tubes.filter((t) => t.start).map((t) => t.start!.min);
  return started.length ? Math.max(0, d.min - Math.max(...started)) : 0;
}

// ---------------------------------------------------------------------------
// The lab clock
// ---------------------------------------------------------------------------

function tick(state: RxState, dt: number): RxState {
  if (state.waitTo === null) return state;
  return edit(state, (d) => {
    const target = d.waitTo!;
    const dm = Math.min(SIM_MINUTES_PER_SECOND * dt, target - d.min);
    for (const t of d.tubes) react(t, dm);
    d.min = Math.round((d.min + dm) * 100) / 100;

    let changed = 0;
    for (const t of d.tubes) {
      if (t.seen !== null && truthSignature(truthOf(t)) !== t.seen) t.fresh = true;
      if (t.fresh) changed += 1;
    }
    if (d.lastWait) d.lastWait.changed = changed;

    if (d.min >= target - 1e-6) {
      d.min = Math.round(target);
      d.waitTo = null;
      afterWait(d, changed);
    }
  });
}

function afterWait(d: RxState, changed: number): void {
  const active = d.tubes.filter((t) => t.start).length;
  if (!active) {
    say(
      d,
      `${d.min} minutes on the clock, but no tube has both a solution and a strip in it yet — nothing can react.`,
      'warn',
    );
    return;
  }
  const changedLine = changed
    ? `**${changed} tube${changed === 1 ? '' : 's'}** look${changed === 1 ? 's' : ''} different from when you last looked at ${changed === 1 ? 'it' : 'them'}.`
    : 'Nothing has visibly changed since you last looked. Slow reactions need longer than this.';
  say(d, `${d.min} minutes on the clock. ${changedLine} Tap a tube for the close-up — look at the colour of the solution and at the surface of the strip.`);
}

// ---------------------------------------------------------------------------
// Hands on the bench
// ---------------------------------------------------------------------------

function act(state: RxState, action: Exclude<RxAction, { type: 'tick' } | { type: 'say' }>): RxState {
  switch (action.type) {
    case 'hold':
      return edit(state, (d) => {
        d.held = action.held;
      });

    case 'tapBottle':
      return edit(state, (d) => {
        d.held = d.held?.kind === 'bottle' && d.held.salt === action.salt ? null : { kind: 'bottle', salt: action.salt };
      });

    case 'tapSand':
      return edit(state, (d) => {
        d.held = d.held?.kind === 'sand' ? null : { kind: 'sand' };
      });

    case 'tapMetal':
      return edit(state, (d) => {
        if (d.held?.kind === 'sand') {
          cleanMetal(d, action.metal);
          return;
        }
        d.held =
          d.held?.kind === 'strip' && d.held.metal === action.metal ? null : { kind: 'strip', metal: action.metal };
      });

    case 'tapTube':
      return edit(state, (d) => {
        const held = d.held;
        if (held?.kind === 'bottle') pour(d, action.index, held.salt, action.now);
        else if (held?.kind === 'strip') dropStrip(d, action.index, held.metal, action.now);
        else if (held?.kind === 'sand') say(d, 'Sandpaper cleans the metal strips, not the tubes. Tap a metal on the tile.');
        else look(d, action.index);
      });

    case 'empty':
      return edit(state, (d) => {
        if (locked(d)) return;
        const t = d.tubes[action.index];
        if (!t) return;
        d.tubes[action.index] = newTube(t.metal, t.salt);
        look(d, action.index);
        say(d, 'Emptied into the waste beaker and rinsed with distilled water. The tube is ready to use again.');
      });

    case 'wait':
      return edit(state, (d) => {
        if (d.waitTo !== null) return;
        d.waitTo = d.min + action.minutes;
        d.lastWait = { from: d.min, to: d.waitTo, changed: 0 };
      });

    case 'readyToRecord':
      return edit(state, (d) => {
        if (d.step !== STAGE.watch) return;
        const since = minutesSinceLastStrip(d);
        if (since < PATIENT_MINUTES && !d.readyWarned) {
          d.readyWarned = true;
          say(
            d,
            `It has only been **${since} minutes**. Some of these reactions are slow — a tube that shows nothing now may change later. Press **Record observations** again if you are sure.`,
            'warn',
          );
          return;
        }
        d.step = STAGE.record;
        look(d, 0);
        say(
          d,
          'Describe every tube: pick one on the rack, then choose what you see. Record what the tube **shows**, not what you expect.',
        );
      });

    case 'recordCell':
      return edit(state, (d) => {
        if (locked(d) || d.step !== STAGE.record) return;
        const t = d.tubes[action.index];
        if (!t) return;
        const key = tubeKey(t.metal, t.salt);
        const cell = { ...(d.rec[key] ?? { c: '' as const, d: '' as const }) };
        if (action.c !== undefined) cell.c = action.c;
        if (action.d !== undefined) cell.d = action.d;
        d.rec[key] = cell;
        look(d, action.index);
        // Filling one cell moves the close-up to the next tube still to describe.
        if (cell.c && cell.d) {
          const next = d.tubes.findIndex((u) => {
            const r = d.rec[tubeKey(u.metal, u.salt)];
            return !r || !r.c || !r.d;
          });
          if (next >= 0) look(d, next);
        }
      });

    case 'submitObs':
      return edit(state, (d) => submitObs(d, action.now));

    case 'pickOrder':
      return edit(state, (d) => {
        if (d.step !== STAGE.conclude || d.order.includes(action.metal)) return;
        d.order.push(action.metal);
      });

    case 'clearOrder':
      return state.order.length ? edit(state, (d) => { d.order = []; }) : state;

    case 'submitOrder':
      return edit(state, (d) => submitOrder(d, action.now));

    case 'answerViva':
      return edit(state, (d) => answerViva(d, action.question, action.option, action.now));

    default:
      return state;
  }
}

function pour(d: RxState, index: number, salt: Salt, now: number): void {
  const t = d.tubes[index];
  if (!t) return;
  if (locked(d)) {
    say(d, 'Your observations are already marked — the tubes stay as they are.');
    return;
  }
  if (volumeOf(t) + POUR > CAP) {
    say(d, 'That tube already holds 10 mL — plenty. Pour into the next one.', 'warn');
    return;
  }
  t.liq[salt] = (t.liq[salt] ?? 0) + POUR;
  t.added.push(salt);
  beginIfReady(t, d.min);
  look(d, index);

  if (salt !== t.salt) {
    d.contam += 1;
    mistake(d, now, `Poured ${SALT[salt].label} into a tube meant for ${SALT[t.salt].label}`, PENALTY.contaminated);
    say(
      d,
      `That tube belongs to the **${SALT[t.salt].label}** group, but you added **${SALT[salt].label}**. The mixture will spoil its result — press **Empty and rinse** in the close-up, then pour the right solution.`,
      'bad',
    );
  } else if (t.strip) {
    say(d, `Added ${POUR} mL of ${SALT[salt].label}. The strip is already in, so the clock is running for this tube.`);
  } else {
    say(d, `Added ${POUR} mL of ${SALT[salt].label} to the ${t.metal} tube.`);
  }
  progress(d);
}

function dropStrip(d: RxState, index: number, metal: Metal, now: number): void {
  const t = d.tubes[index];
  if (!t) return;
  if (locked(d)) {
    say(d, 'Your observations are already marked — the tubes stay as they are.');
    return;
  }
  if (t.strip) {
    say(d, 'That tube already has a strip in it. One strip per tube.', 'warn');
    return;
  }
  if (!(metal in d.cleanAtFirstUse)) d.cleanAtFirstUse[metal] = d.clean[metal];
  t.strip = { metal, clean: d.clean[metal] };
  beginIfReady(t, d.min);
  look(d, index);

  if (metal !== t.metal) {
    d.wrongStrip += 1;
    mistake(d, now, `Dropped a ${METAL[metal].name} strip into the ${METAL[t.metal].name} tube`, PENALTY.wrongStrip);
    say(
      d,
      `That tube is labelled **${t.metal}**, but you dropped in **${METAL[metal].name}**. Press **Empty and rinse**, refill it, and use the right strip.`,
      'bad',
    );
  } else if (!volumeOf(t)) {
    say(d, 'The strip is in, but the tube has no solution yet. Pour the solution first next time.', 'warn');
  } else if (!d.clean[metal] && !d.warned[`dirty${metal}`]) {
    d.warned[`dirty${metal}`] = true;
    say(
      d,
      `That ${METAL[metal].name} strip went in **without being cleaned**. Its surface is coated with oxide, which slows the reaction — or stops it.`,
      'warn',
    );
  } else {
    say(
      d,
      `${capitalise(METAL[metal].name)} strip in. You are still holding ${METAL[metal].name} strips — drop one into each tube labelled ${metal}.`,
    );
  }
  progress(d);
}

function cleanMetal(d: RxState, metal: Metal): void {
  if (d.clean[metal]) {
    say(d, `The ${METAL[metal].name} strips are already clean and shiny.`);
    return;
  }
  d.clean[metal] = true;
  const inUse = d.tubes.some((t) => t.strip?.metal === metal);
  say(
    d,
    `You rubbed the ${METAL[metal].name} strips with sandpaper until they shine — the dull oxide layer is gone.${
      inUse ? ' Strips already in tubes stay as they were.' : ''
    }`,
    'good',
  );
}

/** Stage progress and the marks each stage carries with it. */
function progress(d: RxState): void {
  if (d.step === STAGE.fill && solutionsDone(d)) {
    d.pts.setup = Math.max(0, MAX.setup - PENALTY.contaminated * d.contam);
    d.step = STAGE.metals;
    say(
      d,
      'All sixteen tubes hold the right solution. Now the metals: **clean each metal’s strips with sandpaper**, then drop one strip into every tube labelled with that metal.',
      'good',
    );
  }
  if (d.step === STAGE.metals && solutionsDone(d) && stripsDone(d)) {
    d.pts.metals =
      METALS.reduce((a, m) => a + (d.cleanAtFirstUse[m] ? CLEAN_POINTS : 0), 0) +
      Math.max(0, STRIP_POINTS - PENALTY.wrongStrip * d.wrongStrip);
    d.step = STAGE.watch;
    say(
      d,
      'Every tube has its strip. Now leave them — some reactions show within a minute or two, others take a quarter of an hour. Use **Wait** and tap tubes to look closely.',
      'good',
    );
  }
}

// ---------------------------------------------------------------------------
// Marking
// ---------------------------------------------------------------------------

/** True once every tube has both a colour and a deposit written against it. */
export function allDescribed(d: RxState): boolean {
  return d.tubes.every((t) => {
    const r = d.rec[tubeKey(t.metal, t.salt)];
    return Boolean(r && r.c && r.d);
  });
}

function submitObs(d: RxState, now: number): void {
  if (d.step !== STAGE.record || d.graded || !allDescribed(d)) return;
  const cells: Record<string, GradedCell> = {};
  let pts = 0;
  let dirty = 0;
  let early = 0;
  let textbook = 0;

  for (const t of d.tubes) {
    const key = tubeKey(t.metal, t.salt);
    const r = d.rec[key]!;
    const tr = truthOf(t);
    const trReact = reacted(tr);
    const rReact = r.c !== 'none' || r.d !== 'none';
    // A change only just visible: either answer is fair.
    const either = Boolean(tr.cMaybe) && tr.d === 'none' && tr.c === 'none';
    const p1 = rReact === trReact || either ? 1 : 0;
    const colourOk = r.c === tr.c || (Boolean(tr.cMaybe) && (r.c === 'none' || r.c === tr.cMaybe));
    const p2 = colourOk && r.d === tr.d ? 1 : 0;

    cells[key] = { pts: p1 + p2, truth: tr };
    pts += p1 + p2;

    if (p1 + p2 < 2) {
      if (rReact && !trReact && shouldReact(t.metal, t.salt)) textbook += 1;
      mistake(
        d,
        now,
        `${t.metal} in ${SALT[t.salt].label}: you recorded “${describe(r)}”, the tube showed “${describe(tr)}”`,
      );
    }
    if (t.strip && !t.strip.clean && t.strip.metal !== 'Cu') dirty += 1;
    if (tr.cMaybe) early += 1;
  }

  d.graded = { cells, min: d.min };
  d.pts.observe = pts;
  d.held = null;
  d.step = STAGE.conclude;

  const right = Object.values(cells).filter((c) => c.pts === 2).length;
  say(
    d,
    `${right} of 16 tubes described exactly as they looked.` +
      (textbook
        ? ` In ${textbook} tube${textbook > 1 ? 's' : ''} you recorded a reaction the tube **did not show** — write what you see, not what the book says should happen.`
        : '') +
      (early ? ' Some solutions were only just starting to change colour — waiting longer makes slow reactions clear.' : '') +
      (dirty ? ' Some strips went in without being cleaned, which slowed or stopped their reactions.' : '') +
      ' Now use your table to rank the metals.',
    right === 16 ? 'good' : 'warn',
  );
}

/** How many of the four solutions each metal visibly reacted in, by the STUDENT's table. */
export function displacementCounts(d: RxState): Record<Metal, number> {
  const counts = {} as Record<Metal, number>;
  for (const m of METALS) {
    counts[m] = SALTS.filter((s) => {
      const r = d.rec[tubeKey(m, s)];
      return Boolean(r) && (r!.c !== 'none' || r!.d !== 'none');
    }).length;
  }
  return counts;
}

/**
 * Why a real reaction never showed: an oxide layer, or the clock.
 *
 * Read off the tubes as they were marked, never assumed, so the sentence names
 * what this student actually did.
 */
export function whatHidIt(d: RxState): string {
  if (!d.graded) return '';
  const oxide: Partial<Record<Metal, number>> = {};
  let slow = 0;
  for (const t of d.tubes) {
    if (!shouldReact(t.metal, t.salt)) continue;
    const cell = d.graded.cells[tubeKey(t.metal, t.salt)];
    if (!cell || reacted(cell.truth) || cell.truth.cMaybe) continue;
    if (t.strip && !t.strip.clean) oxide[t.strip.metal] = (oxide[t.strip.metal] ?? 0) + 1;
    else slow += 1;
  }

  const parts: string[] = [];
  if (oxide.Al) {
    parts.push(
      `The **aluminium** strips went in uncleaned, and aluminium’s oxide film stops the reaction completely — all ${oxide.Al} of its tubes sat there looking inert.`,
    );
  }
  const dulled = (['Zn', 'Fe'] as const).filter((m) => oxide[m]);
  if (dulled.length) {
    const n = dulled.reduce((a, m) => a + (oxide[m] ?? 0), 0);
    parts.push(
      `Uncleaned ${dulled.map((m) => METAL[m].name).join(' and ')} strips react at a third of the rate, so ${n} more tube${n === 1 ? '' : 's'} had not visibly changed yet.`,
    );
  }
  if (slow) {
    parts.push(
      `${slow} reaction${slow === 1 ? '' : 's'} simply needed longer than the ${d.graded.min} minutes on your clock.`,
    );
  }
  return parts.join(' ');
}

function submitOrder(d: RxState, now: number): void {
  if (d.step !== STAGE.conclude || d.order.length !== METALS.length || d.concl) return;
  const counts = displacementCounts(d);
  const o = d.order;
  const consistent = o.every((m, k) => o.slice(k + 1).every((n) => counts[m] >= counts[n]));
  const truth = o.join() === TRUE_ORDER.join();

  d.concl = { order: [...o], counts, consistent, truth };
  d.pts.conclude = (consistent ? CONCLUDE_HALF : 0) + (truth ? CONCLUDE_HALF : 0);
  if (!consistent) mistake(d, now, `Order ${o.join(' > ')} does not follow from your own table`);
  if (!truth) mistake(d, now, `Order ${o.join(' > ')} is not the true order Al > Zn > Fe > Cu`);

  const tally = METALS.map((m) => `${m} ${counts[m]}`).join(', ');
  const hidden = whatHidIt(d);
  const verdict =
    truth && consistent
      ? 'Your order follows from it and is correct: **Al > Zn > Fe > Cu**. Aluminium displaced the other three; copper displaced none.'
      : consistent
        ? `Your order follows from your table — good reasoning — but the true order is **Al > Zn > Fe > Cu**. Something in the procedure hid a reaction. ${hidden}`
        : truth
          ? `That is the true order, **Al > Zn > Fe > Cu**, but it does not follow from your own table. A conclusion has to come from your observations, so the thing to fix is the procedure. ${hidden}`
          : `Rank the metals by how many of the other metals each one displaced in your table. The true order is **Al > Zn > Fe > Cu**. ${hidden}`;

  say(d, `Your table shows these displacements: **${tally}**. ${verdict}`.trim(), truth && consistent ? 'good' : 'warn');
  d.step = STAGE.viva;
}

function answerViva(d: RxState, question: number, option: number, now: number): void {
  const v = vivaPaperFor(VIVA_BANK, d.seed, d.vivaShuffled)[question];
  if (!v || d.viva[question]) return;
  const ok = option === v.a;
  d.viva[question] = { pick: option, pts: ok ? VIVA_POINTS : 0 };
  if (!ok) mistake(d, now, `Viva: question ${question + 1}`);
  if (d.viva.every(Boolean)) {
    d.done = true;
    d.tEnd = now;
    d.step = STAGE.viva + 1;
  }
}
