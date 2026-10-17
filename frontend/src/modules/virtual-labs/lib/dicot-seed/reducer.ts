import { VIVA_BANK } from './viva-bank';
import { logMistake } from '../marking';
import { vivaPaperFor } from '../viva';
import type { RichText, Tone } from '../types';

import {
  CONCL,
  LABELS,
  LABEL_MARKS,
  PART_NAME,
  STEP,
  TABLE_ROWS,
  VIVA_POINTS,
  type ConclId,
  type ConclSide,
  type LabelId,
} from './marking';
import {
  MUSH_HOURS,
  OVERSOAK_HOURS,
  PEEL_SOFT,
  SPECIES,
  SPLIT_SOFT,
  germState,
  newSeed,
  partAt,
  softness,
  swellFrac,
  swollenPercent,
  trySplit,
  tryPeel,
  type PartId,
  type Seed,
  type SeedView,
  type SpeciesId,
} from './seed-model';
import {
  conclFilled,
  placedCount,
  reach,
  tableFilled,
  type DicotSeedState,
  type Held,
  type LabelGrade,
  type ToolId,
} from './state';

/**
 * Everything that can happen at this bench.
 *
 * Every action that depends on time carries `now` (ms since epoch), stamped by
 * the event handler that dispatches it, so the same state and action always
 * give the same result and the engine can be driven from plain Node.
 */
export type DicotSeedAction =
  | { type: 'takeSeed'; sp: SpeciesId; now: number }
  | { type: 'tapBeaker'; now: number }
  | { type: 'tapGerm'; now: number }
  /** The white tile, tapped with the soaked seed in hand. */
  | { type: 'tapTile'; now: number }
  | { type: 'hold'; held: Held | null }
  /** The one gesture at the seed: whatever is in hand, applied where it was tapped. */
  | { type: 'tapFigure'; view: SeedView; x: number; y: number; now: number }
  /** The same move from a button, for a keyboard or a phone. */
  | { type: 'useTool'; id: ToolId; now: number }
  | { type: 'press'; now: number }
  | { type: 'setLens'; view: 'ext' | 'cut' }
  | { type: 'clearLabels' }
  | { type: 'submitLabels'; now: number }
  | { type: 'selectRow'; index: number }
  | { type: 'setTableCell'; row: PartId; field: 'is' | 'does'; value: string }
  | { type: 'submitTable'; now: number }
  | { type: 'setConcl'; id: ConclId; side: ConclSide; value: string }
  | { type: 'submitConcl'; now: number }
  /** Put the lab clock forward. Drained by `tick`, so the seed is seen to swell. */
  | { type: 'wait'; hours: number }
  | { type: 'tick'; dt: number; now: number }
  | { type: 'answerViva'; question: number; option: number; now: number }
  | { type: 'say'; text: RichText; tone: Tone };

/** Lab hours that run off per real second while a wait is in progress. */
export const HOURS_PER_SECOND = 8;

export function dicotSeedReducer(state: DicotSeedState, action: DicotSeedAction): DicotSeedState {
  switch (action.type) {
    case 'say':
      return { ...state, message: { text: action.text, tone: action.tone } };
    case 'tick':
      return tick(state, action.dt);
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
function edit(state: DicotSeedState, fn: (draft: DicotSeedState) => void): DicotSeedState {
  const draft = structuredClone(state);
  fn(draft);
  return draft;
}

function say(d: DicotSeedState, text: RichText, tone: Tone = 'info'): void {
  d.message = { text, tone };
}

function mistake(d: DicotSeedState, now: number, what: string, pts = 0): void {
  logMistake(d.log, { now, t0: d.t0, what, pts });
}

const n2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * The specimen is evidence from the labelling step on: whatever the student
 * did to it is what they are marked on, and they cannot quietly fetch a better
 * seed after seeing the pins go red.
 */
function locked(d: DicotSeedState): boolean {
  return d.step >= STEP.label || d.done;
}

/**
 * Advance through the five steps that complete themselves. The step is derived
 * from the specimen, never incremented by a button, so a seed ruined at the
 * split step drops nobody back to soaking a fresh one by accident.
 */
function progress(d: DicotSeedState): void {
  if (d.step > STEP.label) return;
  const r = reach(d);
  if (r > d.step) d.step = r;
}

function sameHold(a: Held | null, b: Held | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'seed' && b.kind === 'seed') return a.sp === b.sp;
  if (a.kind === 'tool' && b.kind === 'tool') return a.id === b.id;
  if (a.kind === 'label' && b.kind === 'label') return a.id === b.id;
  return true;
}

// ---------------------------------------------------------------------------
// The bench clock
// ---------------------------------------------------------------------------

/**
 * One tick of bench time. Nothing is waiting: return the SAME state, so an idle
 * bench ticking ten times a second renders nothing.
 */
function tick(state: DicotSeedState, dt: number): DicotSeedState {
  if (state.pending <= 0) return state;
  const run = Math.min(state.pending, dt * HOURS_PER_SECOND);

  return edit(state, (d) => {
    d.pending = n2(Math.max(0, d.pending - run));
    d.clock = n2(d.clock + run);
    if (d.specimen && d.specimen.inWater && !d.specimen.ruined) d.specimen.h = n2(d.specimen.h + run);
    if (d.germ) d.germ.g = n2(d.germ.g + run);
    if (d.pending === 0) afterWait(d);
  });
}

/** What the assistant says once the clock has stopped turning. */
function afterWait(d: DicotSeedState): void {
  const sd = d.specimen;
  if (sd && sd.inWater) {
    const sf = softness(sd.h);
    const coat =
      sf < PEEL_SOFT
        ? '**still hard** — give it longer'
        : sf < SPLIT_SOFT
          ? 'softening, but the halves will still crumble if you force them'
          : '**soft, and it has stopped swelling**. It is ready';
    const over =
      sd.h >= MUSH_HOURS
        ? ' The water has gone cloudy and the cotyledons are waterlogged: this one will fall apart under the needle. Take a fresh seed.'
        : sd.h >= OVERSOAK_HOURS
          ? ' It has been in far longer than overnight, though — the coat has begun to split on its own. Much more and it will go to mush.'
          : '';
    say(
      d,
      `${n2(d.clock)} h on the clock. The seed has soaked ${n2(sd.h)} h and swollen to **${swollenPercent(sd)}%** of ` +
        `its dry size; its coat is ${coat}.${over}`,
      sd.h >= MUSH_HOURS ? 'bad' : sf >= SPLIT_SOFT ? 'good' : 'info',
    );
    return;
  }
  if (d.germ) {
    const gs = germState(d.germ);
    say(
      d,
      `${n2(d.clock)} h on the clock. In the cotton dish, ` +
        (gs.radicle > 0
          ? `the **radicle** has pushed out through the micropyle${gs.plumule > 0 ? ' and the **plumule** is now greening above it' : ' — the root comes out first'}`
          : 'nothing has come out yet') +
        '.',
    );
    return;
  }
  say(d, `${n2(d.clock)} h on the clock — but nothing is soaking or germinating.`, 'warn');
}

// ---------------------------------------------------------------------------
// Hands on the bench
// ---------------------------------------------------------------------------

function takeSeed(d: DicotSeedState, sp: SpeciesId): void {
  if (locked(d)) {
    say(d, 'Your seed is already recorded — the drawing under the lens is your evidence now.');
    return;
  }
  const old = d.specimen;
  const soaking = Boolean(old && !old.onTile && old.inWater && !old.ruined && old.h > 0);
  d.specimen = newSeed(sp);
  d.found = { hilum: false, micropyle: false };
  d.held = { kind: 'seed', sp };
  d.pickUps += 1;
  // A fresh seed really does put you back at the beginning: this is the one
  // place the step falls BACK, because leaving a student on "Split it open"
  // with a dry seed between their fingers is a lie the strip should not tell.
  d.step = Math.min(d.step, reach(d));
  say(
    d,
    (soaking ? 'The one in the beaker goes back in the jar. ' : '') +
      `A dry **${SPECIES[sp].name}** seed in your fingers. It is hard: dropped on the bench it would rattle. Put it ` +
      'in the **beaker of water** and leave it overnight.',
    soaking ? 'warn' : 'info',
  );
  progress(d);
}

function tapBeaker(d: DicotSeedState): void {
  const h = d.held;
  if (h && h.kind === 'seed') {
    if (locked(d) || !d.specimen) return;
    d.specimen.inWater = true;
    d.specimen.onTile = false;
    d.held = null;
    say(
      d,
      'The seed is under water. Now let the clock run — use **Wait 12 h** for an overnight soak, or **Wait 2 h** at a ' +
        'time and watch it swell.',
      'good',
    );
    progress(d);
    return;
  }
  if (d.specimen && d.specimen.inWater) {
    if (locked(d)) return;
    d.specimen.inWater = false;
    d.held = { kind: 'wet' };
    say(
      d,
      `Out of the water and dripping. It has swollen to **${swollenPercent(d.specimen)}%** of its dry size. Tap the ` +
        '**white tile** to put it down.',
    );
    return;
  }
  say(d, 'The beaker is full of water. Pick up a seed from a dish first, then tap here to soak it.', 'warn');
}

function tapGerm(d: DicotSeedState): void {
  const h = d.held;
  if (h && h.kind === 'wet' && d.specimen && !locked(d)) {
    if (swellFrac(d.specimen.h) < 0.4) {
      say(d, 'That seed has hardly taken any water up. A dry seed will not germinate — soak it first.', 'warn');
      return;
    }
    d.germ = { ...newSeed(d.specimen.sp), h: d.specimen.h, g: 0 };
    d.held = null;
    say(
      d,
      'Sown on wet cotton. Leave it a day or two on the clock and watch which part comes out of the seed first.',
      'good',
    );
    return;
  }
  if (d.germ) {
    const gs = germState(d.germ);
    say(
      d,
      `That seed has been on the cotton for **${n2(d.germ.g)} h**. ` +
        (gs.radicle > 0
          ? 'The **radicle** is out — the root always comes first.'
          : 'Nothing yet — give it a day.'),
    );
    return;
  }
  say(
    d,
    'This dish has wet cotton in it. Put a **soaked** seed here and let a day or two pass to watch it germinate.',
    'warn',
  );
}

function putOnTile(d: DicotSeedState): void {
  if (!d.specimen || locked(d)) return;
  d.specimen.onTile = true;
  d.specimen.inWater = false;
  d.held = null;
  say(
    d,
    'The seed is on the tile and under the lens. Look along its flattened edge — there is a scar there, and a pore ' +
      'beside it. Tap each one in the magnified view.',
    'good',
  );
  progress(d);
}

// ---------------------------------------------------------------------------
// The lens, the forceps and the needle
// ---------------------------------------------------------------------------

function examine(d: DicotSeedState, p: { x: number; y: number }, view: SeedView, now: number): void {
  const sd = d.specimen;
  if (!sd) return;
  if (!sd.coat) {
    say(
      d,
      'The coat is already off — the hilum and the micropyle went with it. They are marks on the **seed coat**, not ' +
        'parts of the embryo.',
      'warn',
    );
    return;
  }
  const hit = partAt(sd, p, view);

  if (hit === 'hilum') {
    if (d.found.hilum) {
      say(d, 'You already have the hilum. Now find the **micropyle** — a tiny pore a little way along the same edge.');
      return;
    }
    d.found.hilum = true;
    say(
      d,
      'Found it: the **hilum**, the oval scar where the seed was attached to the pod by its stalk. Now look just along ' +
        'the edge from it for a pinprick — the **micropyle**.',
      'good',
    );
    progress(d);
    return;
  }
  if (hit === 'micropyle') {
    if (d.found.micropyle) {
      say(d, 'You already have the micropyle.');
      return;
    }
    d.found.micropyle = true;
    say(
      d,
      'Found it: the **micropyle**, the pore the water went in through — and the one the radicle will come out of. ' +
        'Press the seed and you can squeeze a drop of water back out of it.',
      'good',
    );
    progress(d);
    return;
  }

  d.misses += 1;
  if (d.misses === 3) mistake(d, now, 'Hunting blindly with the lens over the seed coat');
  say(
    d,
    hit === 'testa'
      ? 'That is just the **seed coat**. Look along the **flattened edge**: the hilum is an oval scar there, and the ' +
          `micropyle is a pinprick a little way along from it${d.misses > 2 ? ', on the side the seed is more pointed' : ''}.`
      : 'That is the tile, not the seed.',
    d.misses > 2 ? 'warn' : 'info',
  );
}

function pressSeed(d: DicotSeedState): void {
  const sd = d.specimen;
  if (!sd || !sd.coat || sd.ruined) return;
  sd.pressed = true;
  const wet = swellFrac(sd.h) > 0.5;
  say(
    d,
    wet
      ? 'Squeezed between finger and thumb, a bead of water is forced out of the **micropyle** — proof that this pore ' +
          'is the way water got in.'
      : 'You squeeze, and nothing comes out. There is no water in this seed to squeeze: it has not soaked.',
    wet ? 'good' : 'warn',
  );
}

function peel(d: DicotSeedState, now: number): void {
  const sd = d.specimen;
  if (!sd || locked(d)) return;
  const r = tryPeel(sd);
  d.specimen = r.seed;
  if (r.ok) {
    say(
      d,
      'The testa lifts away in one piece and underneath are the two **cotyledons**, pale and fleshy, still held ' +
        'together. Now take the **needle** and part them along their natural plane.',
      'good',
    );
    progress(d);
    return;
  }
  if (r.why === 'brittle') {
    d.tornCount += 1;
    mistake(d, now, 'Tried to peel the coat of a seed that had not soaked enough', 1);
    say(
      d,
      `The coat is still hard and it tears into flakes instead of lifting off — the seed has only soaked **${n2(sd.h)} h**. ` +
        'Put it back in the beaker and give it more time.',
      'bad',
    );
    return;
  }
  if (r.why === 'already') {
    say(d, 'The coat is already off.');
    return;
  }
  say(d, 'That seed is ruined. Take a fresh one from a dish.', 'warn');
}

function split(d: DicotSeedState, plane: 'natural' | 'transverse', now: number): void {
  const sd = d.specimen;
  if (!sd || locked(d)) return;
  const r = trySplit(sd, plane);
  d.specimen = r.seed;

  if (r.ok) {
    d.dissected = structuredClone(r.seed);
    d.lens = 'cut';
    say(
      d,
      'It comes apart cleanly into **two cotyledons**, and on one of them, clinging along the edge, is the **embryo ' +
        'axis** — a pointed **radicle** at one end, a feathery **plumule** at the other. Now label what you can see.',
      'good',
    );
    progress(d);
    return;
  }
  if (r.why === 'coat') {
    say(
      d,
      'It will not part — the **seed coat** is still wrapped round both halves and holding them together. Take it off ' +
        'with the forceps first.',
      'warn',
    );
    return;
  }
  if (r.why === 'plane') {
    d.ruinedCount += 1;
    mistake(d, now, 'Cut the seed straight across with the blade instead of parting it along its natural plane', 3);
    say(
      d,
      'The blade goes straight through the seed **across** the cotyledons — and straight through the embryo axis with ' +
        'them. A dicot seed opens along a natural plane between its two cotyledons; you part it, you do not cut it. ' +
        'Take a fresh seed.',
      'bad',
    );
    return;
  }
  if (r.why === 'hard') {
    d.ruinedCount += 1;
    mistake(d, now, `Tried to split a seed that had soaked only ${n2(sd.h)} h`, 3);
    say(
      d,
      `It does not open — it **${r.seed.ruined}**. This is exactly what happens to a student who forgot to put the ` +
        'seeds in water the night before: there is no practical to do. Take a fresh seed from a dish and soak it properly.',
      'bad',
    );
    return;
  }
  if (r.why === 'mush') {
    d.ruinedCount += 1;
    mistake(d, now, `Tried to split a seed that had soaked ${n2(sd.h)} h — far past overnight`, 3);
    say(
      d,
      'The needle sinks in and the whole thing **mushes**: soaked this long the cotyledons are waterlogged and there ' +
        'is no firm embryo axis left to find. Overnight is the instruction, not all weekend. Take a fresh seed.',
      'bad',
    );
    return;
  }
  if (r.why === 'already') {
    say(d, 'That seed has already been opened.');
    return;
  }
  say(d, 'That seed is ruined — take a fresh one from a dish.', 'warn');
}

function placeLabel(d: DicotSeedState, id: LabelId, view: SeedView, p: { x: number; y: number }): void {
  const sd = d.dissected;
  if (!sd || d.labelGrade) {
    say(d, 'Your labelling is already marked.');
    return;
  }
  if (view === 'live') return;
  const hit = partAt(sd, p, view);
  if (!hit) {
    say(d, 'That is the bare tile. Drop the label **on the drawing**, on the part it names.', 'warn');
    return;
  }
  d.labels[id] = { fig: view, x: n2(p.x), y: n2(p.y) };
  d.held = null;
  const n = placedCount(d);
  say(
    d,
    `**${id}** placed. ${n}/6 labels down.` +
      (n === 6
        ? ' Check them against the drawing, then submit — a label is marked against what is actually underneath it.'
        : ''),
    n === 6 ? 'good' : 'info',
  );
}

// ---------------------------------------------------------------------------
// The marked steps
// ---------------------------------------------------------------------------

function gradeLabels(d: DicotSeedState): Record<LabelId, LabelGrade> {
  const sd = d.dissected;
  const out = {} as Record<LabelId, LabelGrade>;
  for (const id of LABELS) {
    const pin = d.labels[id];
    const got = pin && sd ? partAt(sd, { x: pin.x, y: pin.y }, pin.fig) : null;
    out[id] = { placed: Boolean(pin), got, ok: got === id };
  }
  return out;
}

function submitLabels(d: DicotSeedState, now: number): void {
  if (d.step !== STEP.label || d.labelGrade) return;
  if (placedCount(d) < LABELS.length) {
    say(d, 'All six labels have to be down before the drawing can be marked.', 'warn');
    return;
  }
  const g = gradeLabels(d);
  d.labelGrade = g;
  d.pts.label = LABELS.reduce((a, k) => a + (g[k].ok ? LABEL_MARKS : 0), 0);
  for (const k of LABELS) {
    if (!g[k].ok) {
      mistake(d, now, `Label “${k}” was dropped on the ${g[k].got ? PART_NAME[g[k].got] : 'bare tile'}`, LABEL_MARKS);
    }
  }
  const right = LABELS.filter((k) => g[k].ok).length;
  d.held = null;
  say(
    d,
    right === 6
      ? 'All six labels are on the right structures. That is the whole point of this practical — you can now recognise ' +
          'every part of a dicot embryo.'
      : `${right} of 6 labels are on the right part. The red pins say what is really underneath them.` +
          (g.plumule.ok || g.radicle.ok
            ? ''
            : ' Remember: the **radicle** is the pointed one nearest the micropyle end, the **plumule** is the feathery ' +
              'one at the other end of the axis.'),
    right === 6 ? 'good' : right >= 4 ? 'warn' : 'bad',
  );
  d.step = STEP.table;
}

function submitTable(d: DicotSeedState, now: number): void {
  if (d.step !== STEP.table || d.tableGrade) return;
  if (tableFilled(d) < TABLE_ROWS.length) {
    say(d, 'Every row needs both cells: what the part is, and what it does or becomes.', 'warn');
    return;
  }
  const grade: DicotSeedState['tableGrade'] = {};
  let pts = 0;
  for (const r of TABLE_ROWS) {
    const e = d.rec[r.id] ?? { is: '', does: '' };
    const is = e.is === r.is;
    const does = e.does === r.does;
    const rowPts = (is ? 1 : 0) + (does ? 1 : 0);
    grade[r.id] = { is, does, pts: rowPts };
    pts += rowPts;
    if (rowPts < 2) mistake(d, now, `Observation table: ${r.part}`, 2 - rowPts);
  }
  d.tableGrade = grade;
  d.pts.table = pts;
  const full = TABLE_ROWS.filter((r) => grade[r.id]?.pts === 2).length;
  say(
    d,
    `${full} of 7 rows completely right — ${pts}/14. ` +
      (full === TABLE_ROWS.length
        ? 'The table now reads as a proper record of the dissection.'
        : 'The answers are under the wrong cells.'),
    full === TABLE_ROWS.length ? 'good' : 'warn',
  );
  d.step = STEP.concl;
}

function submitConcl(d: DicotSeedState, now: number): void {
  if (d.step !== STEP.concl || d.conclGrade) return;
  if (!conclFilled(d)) {
    say(d, 'Every blank has to be filled before the conclusion can be marked.', 'warn');
    return;
  }
  const grade: DicotSeedState['conclGrade'] = {};
  let pts = 0;
  for (const c of CONCL) {
    const e = d.concl[c.id] ?? { a: '', b: '' };
    const a = e.a === c.a.k;
    const b = e.b === c.b.k;
    grade[c.id] = { a, b };
    pts += (a ? 1 : 0) + (b ? 1 : 0);
    if (!(a && b)) mistake(d, now, `Conclusion: “${c.pre} …”`);
  }
  d.conclGrade = grade;
  d.pts.concl = pts;
  const gs = d.germ ? germState(d.germ) : null;
  say(
    d,
    pts === 6
      ? 'Correct on all six blanks. **Two cotyledons → dicot**; the food is in the cotyledons, so the seed is ' +
          '**non-endospermic**; and the **radicle** comes out first, through the **micropyle**.' +
          (gs && gs.radicle > 0 ? ' Your cotton dish showed you that last one.' : '')
      : `${pts}/6 blanks. Two cotyledons make it a **dicot**; the food sits in the cotyledons themselves, so it is ` +
          '**non-endospermic**; and on germination the **radicle** comes out first, through the **micropyle**.',
    pts === 6 ? 'good' : 'warn',
  );
  d.step = STEP.viva;
}

// ---------------------------------------------------------------------------
// The bench's one dispatch table
// ---------------------------------------------------------------------------

function act(state: DicotSeedState, action: Exclude<DicotSeedAction, { type: 'say' | 'tick' }>): DicotSeedState {
  switch (action.type) {
    case 'takeSeed':
      return edit(state, (d) => takeSeed(d, action.sp));

    case 'tapBeaker':
      return edit(state, (d) => tapBeaker(d));

    case 'tapGerm':
      return edit(state, (d) => tapGerm(d));

    case 'tapTile':
      if (state.held?.kind === 'wet') return edit(state, (d) => putOnTile(d));
      if (!state.specimen?.onTile) {
        return edit(state, (d) =>
          say(
            d,
            'The tile is empty. Soak a seed in the beaker, then tap the beaker to lift it out and put it here.',
            'warn',
          ),
        );
      }
      return state;

    case 'hold': {
      const next = action.held;
      if (sameHold(state.held, next) || (state.held === null && next === null)) {
        return state.held === null ? state : { ...state, held: null };
      }
      return { ...state, held: next, pickUps: state.pickUps + (next ? 1 : 0) };
    }

    case 'setLens':
      return state.lens === action.view ? state : { ...state, lens: action.view };

    case 'tapFigure': {
      const held = state.held;
      if (held?.kind === 'wet') return edit(state, (d) => putOnTile(d));
      if (!state.specimen) {
        return edit(state, (d) =>
          say(
            d,
            'The tile is empty. Soak a seed in the beaker first, then tap the beaker to lift it out and put it here.',
            'warn',
          ),
        );
      }
      if (held?.kind === 'label') {
        return edit(state, (d) => placeLabel(d, held.id, action.view, { x: action.x, y: action.y }));
      }
      if (state.step >= STEP.label) {
        return edit(state, (d) => say(d, 'Pick a label from the list first, then tap the part it belongs to.'));
      }
      if (held?.kind === 'tool') return edit(state, (d) => useTool(d, held.id, action.now));
      return edit(state, (d) => examine(d, { x: action.x, y: action.y }, action.view, action.now));
    }

    case 'useTool':
      if (!state.specimen || !state.specimen.onTile) {
        return edit(state, (d) =>
          say(d, 'There is nothing on the tile yet. Soak a seed and put it down first.', 'warn'),
        );
      }
      return edit(state, (d) => useTool(d, action.id, action.now));

    case 'press':
      return edit(state, (d) => pressSeed(d));

    case 'clearLabels':
      return state.labelGrade || placedCount(state) === 0
        ? state
        : { ...state, labels: {}, held: null, message: { text: 'Labels cleared. Start again.', tone: 'info' } };

    case 'submitLabels':
      return edit(state, (d) => submitLabels(d, action.now));

    case 'selectRow':
      return state.selRow === action.index || !TABLE_ROWS[action.index]
        ? state
        : { ...state, selRow: action.index };

    case 'setTableCell': {
      if (state.step !== STEP.table || state.tableGrade) return state;
      return edit(state, (d) => {
        const e = d.rec[action.row] ?? { is: '', does: '' };
        if (action.field === 'is') e.is = action.value;
        else e.does = action.value;
        d.rec[action.row] = e;
      });
    }

    case 'submitTable':
      return edit(state, (d) => submitTable(d, action.now));

    case 'setConcl': {
      if (state.step !== STEP.concl || state.conclGrade) return state;
      return edit(state, (d) => {
        const e = d.concl[action.id] ?? { a: '', b: '' };
        e[action.side] = action.value;
        d.concl[action.id] = e;
      });
    }

    case 'submitConcl':
      return edit(state, (d) => submitConcl(d, action.now));

    case 'wait':
      // One wait at a time: the clock is already turning.
      return state.pending > 0 ? state : { ...state, pending: action.hours };

    case 'answerViva': {
      const { question, option, now } = action;
      const q = vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled)[question];
      if (state.step !== STEP.viva || !q || state.viva[question]) return state;
      return edit(state, (d) => {
        const ok = option === q.a;
        d.viva[question] = { pick: option, pts: ok ? VIVA_POINTS : 0 };
        if (!ok) mistake(d, now, `Viva: question ${question + 1}`, VIVA_POINTS);
        if (d.viva.every(Boolean)) {
          d.done = true;
          d.tEnd = now;
          d.step = STEP.viva + 1;
        }
      });
    }

    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled dicot seed action: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function useTool(d: DicotSeedState, id: ToolId, now: number): void {
  if (locked(d)) {
    say(d, 'Your seed is already recorded — the drawing under the lens is your evidence now.');
    return;
  }
  if (id === 'forceps') peel(d, now);
  else if (id === 'needle') split(d, 'natural', now);
  else split(d, 'transverse', now);
}

/** Exported for the harness and the guided tour: what a seed in hand would do. */
export function toolVerb(id: ToolId): string {
  return id === 'forceps' ? 'peel the seed coat' : id === 'needle' ? 'split along the natural plane' : 'cuts, but across the seed';
}

/** The label a pin would earn, without changing anything. */
export function wouldLand(sd: Seed | null, view: SeedView, p: { x: number; y: number }): PartId | null {
  return sd ? partAt(sd, p, view) : null;
}
