import { VIVA_BANK } from './viva-bank';
import { logMistake } from '../marking';
import { vivaPaperFor } from '../viva';
import type { RichText, Tone } from '../types';

import {
  GRAM,
  GRAM_CAP,
  LIME_CAP,
  POUR,
  SEED,
  SETUPS,
  SETUP_A,
  SETUP_B,
  SETUP_KOH,
  VIS,
  APPEARANCE_ORDER,
  deliveredFrac,
  detected,
  dips,
  explainClear,
  flaskReady,
  look,
  milkiness,
  newFlask,
  stepFlask,
  type Appearance,
  type Flask,
  type SeedKind,
} from './biology';
import {
  APPEARANCE_MARKS,
  CONCL,
  CONCLUSION_HALF,
  DETECTION_MARKS,
  EARLY_MIN,
  MAX,
  STEP,
  TRUE_CONCLUSION,
  VIVA_POINTS,
  appearanceLabel,
  appearanceMarksFor,
} from './marking';
import {
  CLOCK_SPEED,
  bathTemp,
  builtForRecording,
  entryAt,
  markedFlasks,
  nameOf,
  type ClockMode,
  type GradedCell,
  type Held,
  type RespirationState,
} from './state';

/**
 * Everything that can happen at this bench.
 *
 * Every action that depends on time carries `now` (ms since epoch), stamped by
 * the event handler that dispatches it, so the same state and action always
 * give the same result and the engine can be driven from plain Node. The lab
 * clock is separate: it advances only through `tick`, in simulated minutes.
 */
export type RespirationAction =
  | { type: 'tick'; dt: number; now: number }
  | { type: 'pickUp'; held: Held }
  | { type: 'putDown' }
  | { type: 'selectSetup'; index: number }
  /** Whatever is in hand, applied to a flask. */
  | { type: 'tapFlask'; index: number; now: number }
  /** Whatever is in hand, applied to a test tube or beaker. */
  | { type: 'tapTube'; index: number; now: number }
  | { type: 'testSeal'; index: number }
  | { type: 'takeApart'; index: number }
  | { type: 'toggleBath' }
  | { type: 'doneBuilding'; now: number }
  | { type: 'startClock'; now: number }
  | { type: 'setClock'; mode: ClockMode }
  | { type: 'skip'; minutes: number }
  | { type: 'goRecord' }
  | { type: 'setEntry'; index: number; field: 'app' | 'det'; value: string }
  | { type: 'submitObservations'; now: number }
  | { type: 'pickConclusion'; index: number }
  | { type: 'submitConclusion'; now: number }
  | { type: 'answerViva'; question: number; option: number; now: number }
  | { type: 'say'; text: RichText; tone: Tone };

export function respirationReducer(state: RespirationState, action: RespirationAction): RespirationState {
  switch (action.type) {
    case 'tick':
      return tick(state, action.dt);
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
function edit(state: RespirationState, fn: (draft: RespirationState) => void): RespirationState {
  const draft = structuredClone(state);
  fn(draft);
  return draft;
}

function say(d: RespirationState, text: RichText, tone: Tone = 'info'): void {
  d.message = { text, tone };
}

function mistake(d: RespirationState, now: number, what: string, pts = 0): void {
  logMistake(d.log, { now, t0: d.t0, what, pts });
}

/** Observations already marked: the apparatus stays exactly as it was graded. */
function locked(d: RespirationState): boolean {
  return d.graded !== null || d.done;
}

const LOCKED_LINE = 'Your observations are already marked — the apparatus stays as it is.';

function flask(d: RespirationState, index: number): Flask | null {
  return d.flasks[index] ?? null;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------------------------------------------------------------------------
// The lab clock
// ---------------------------------------------------------------------------

/**
 * `dt` real seconds of a running clock.
 *
 * A paused clock returns the SAME state, so a bench sitting at the build step
 * ticking ten times a second renders nothing.
 */
function tick(state: RespirationState, dt: number): RespirationState {
  if (state.clock === 'paused' || state.done || state.graded !== null) return state;
  const delta = CLOCK_SPEED[state.clock] * dt;
  if (delta <= 0) return state;
  return edit(state, (d) => {
    advance(d, delta);
  });
}

/** Integrate `minutes` of simulated time through every flask on the bench. */
function advance(d: RespirationState, minutes: number): void {
  for (const f of d.flasks) stepFlask(f, minutes, d.tempC);
  d.min = Math.round((d.min + minutes) * 100) / 100;
}

/**
 * The student comes back and looks.
 *
 * What each tube has done SINCE THE LAST LOOK is the thing a five-minute wait
 * is meant to teach and the thing a running clock hides: lime water clouds too
 * slowly to watch. So every pause records what the tubes showed, and says what
 * changed while the student was away.
 *
 * IT SAYS THAT A TUBE MOVED, NEVER WHAT IT MOVED TO. How milky the lime water
 * has gone is the 8-mark observation, and the 4-mark "was CO₂ given out?"
 * follows straight out of it — so the assistant naming it would be the assistant
 * dictating about a quarter of the paper. The tube is drawn on the bench and
 * magnified in the close-up next to a strip of reference tubes; reading it is
 * the practical, and this line only says which tube is worth walking back to.
 * `f.seen` still stores the appearance, because the comparison has to be made
 * against something — it is simply not spoken.
 */
function noteLooks(d: RespirationState): string {
  const lines: string[] = [];
  markedFlasks(d).forEach((f, i) => {
    if (!builtForRecording(f)) return;
    const before = f.seen;
    const now: Appearance = look(f);
    const name = i === SETUP_B ? 'The control' : nameOf(i);
    lines.push(
      before === null
        ? `${name}: look at it.`
        : before.app === now
          ? `${name}: unchanged in ${Math.round(d.min - before.min)} min.`
          : `${name}: **it has changed** — look again.`,
    );
    f.seen = { min: d.min, milk: milkiness(f), app: now };
  });
  d.looks += 1;
  return lines.join(' ');
}

function pauseAndLook(d: RespirationState, lead: string, tone: Tone = 'info'): void {
  d.clock = 'paused';
  const changes = noteLooks(d);
  say(d, changes ? `${lead} ${changes}` : `${lead} No flask is closed with seeds inside, so nothing can be collected.`, tone);
}

// ---------------------------------------------------------------------------
// Hands on the bench
// ---------------------------------------------------------------------------

function sameHold(a: Held | null, b: Held): boolean {
  if (!a || a.kind !== b.kind) return false;
  return a.kind !== 'seed' || b.kind !== 'seed' || a.seed === b.seed;
}

function addSeeds(d: RespirationState, index: number, kind: SeedKind, now: number): void {
  const f = flask(d, index);
  if (!f) return;
  if (locked(d)) {
    say(d, LOCKED_LINE);
    return;
  }
  if (f.cork) {
    say(d, 'The cork is already in. Press **Take apart** if you want to change what is in that flask.', 'warn');
    return;
  }
  if (f.seeds && f.seeds.kind !== kind) {
    say(
      d,
      `That flask already holds ${SEED[f.seeds.kind].name}. Two kinds of seed in one flask would tell you nothing — ` +
        'take it apart first.',
      'warn',
    );
    return;
  }
  if (f.seeds && f.seeds.g >= GRAM_CAP) {
    say(d, `${GRAM_CAP} g is as much seed as that flask takes.`, 'warn');
    return;
  }

  f.seeds = { kind, g: (f.seeds ? f.seeds.g : 0) + GRAM };
  d.sel = index;

  const want = SETUPS[index]?.want ?? 'germ';
  const warnKey = `${index}${kind}`;
  if (kind !== want && !d.warned.seed[warnKey]) {
    d.warned.seed[warnKey] = true;
    mistake(d, now, `Put ${SEED[kind].name} into ${nameOf(index)}`);
    say(
      d,
      index === SETUP_B
        ? `The control flask needs **boiled** seeds — dead seeds that cannot respire. You have put ${SEED[kind].name} ` +
            'in it, so it will not act as a control.'
        : `Set-up A is meant to hold **germinating** seeds. ${capitalise(SEED[kind].name)} ` +
            `${kind === 'boiled' ? 'are dead and will release nothing' : 'are dormant and release almost nothing'}.`,
      'warn',
    );
    return;
  }
  say(d, `${f.seeds.g} g of ${SEED[kind].name} in ${nameOf(index)}. More seed means more carbon dioxide per minute.`);
}

function addLime(d: RespirationState, index: number): void {
  const f = flask(d, index);
  if (!f) return;
  if (locked(d)) {
    say(d, LOCKED_LINE);
    return;
  }
  if (index === SETUP_KOH) {
    say(
      d,
      'The method 2 set-up uses a beaker of coloured water, not lime water. Its answer is the **rise of the water column**.',
      'warn',
    );
    return;
  }
  if (f.lime.ml >= LIME_CAP) {
    say(d, 'That test tube is full enough.', 'warn');
    return;
  }

  f.lime.ml = Math.min(LIME_CAP, f.lime.ml + POUR);
  d.sel = index;
  if (!dips(f)) {
    say(
      d,
      `${f.lime.ml} mL of lime water. Look at the close-up: the mouth of the bent tube is still **above the liquid**, ` +
        'so the gas would bubble into the empty space and never react. Add more.',
      'warn',
    );
    return;
  }
  say(d, `${f.lime.ml} mL of lime water in the ${nameOf(index)} test tube — the delivery tube now dips below the surface.`);
}

function fitCork(d: RespirationState, index: number): void {
  const f = flask(d, index);
  if (!f) return;
  if (locked(d)) {
    say(d, LOCKED_LINE);
    return;
  }
  if (f.cork) {
    say(d, 'That flask is already corked.', 'warn');
    return;
  }
  if (!f.seeds) {
    say(d, 'Put the seeds in first — once the cork is in, the flask is closed.', 'warn');
    return;
  }
  f.cork = true;
  d.sel = index;
  say(
    d,
    `Cork and bent delivery tube fitted to ${nameOf(index)}, with the far end ${
      index === SETUP_KOH ? 'dipping into the beaker of water' : 'in the test tube'
    }. It is only resting in the neck — **seal the joint with vaseline** or the gas will escape.`,
    'warn',
  );
}

function sealCork(d: RespirationState, index: number): void {
  const f = flask(d, index);
  if (!f) return;
  if (locked(d)) {
    say(d, LOCKED_LINE);
    return;
  }
  if (!f.cork) {
    say(d, 'Nothing to seal yet — fit the cork and delivery tube first.', 'warn');
    return;
  }
  if (f.sealed) {
    say(d, 'That joint is already sealed.');
    return;
  }
  f.sealed = true;
  d.sel = index;
  say(
    d,
    `Vaseline smeared round the cork of ${nameOf(index)}. The joint is airtight, so the only way out for the gas is ` +
      'down the delivery tube.',
    'good',
  );
}

function addKoh(d: RespirationState, index: number): void {
  const f = flask(d, index);
  if (!f) return;
  if (locked(d)) {
    say(d, LOCKED_LINE);
    return;
  }
  if (f.cork) {
    say(d, 'The flask is closed. Press **Take apart** first if you want to hang the KOH tube inside.', 'warn');
    return;
  }
  if (f.koh) {
    say(d, 'There is already a KOH tube in that flask.');
    return;
  }
  f.koh = true;
  d.sel = index;
  say(
    d,
    index === SETUP_KOH
      ? 'KOH tube hung inside the method 2 flask. It will soak up the carbon dioxide as fast as the seeds make it, so ' +
          'the gas inside shrinks by the oxygen used and water climbs the tube.'
      : `KOH inside ${nameOf(index)} will absorb the carbon dioxide **before it can reach the lime water**. That is the ` +
          'method 2 trick, not what you want here — the lime water will stay clear however hard the seeds respire.',
    index === SETUP_KOH ? 'good' : 'warn',
  );
}

function testSeal(d: RespirationState, index: number): void {
  const f = flask(d, index);
  if (!f) return;
  if (!f.cork) {
    say(d, 'There is no cork in that flask, so there is nothing to test — any gas simply leaves by the neck.', 'warn');
    return;
  }
  const frac = deliveredFrac(f);
  const tight = frac > 0.5;
  d.sel = index;
  f.sealTest = tight
    ? `Seal test at ${Math.round(d.min)} min: bubbles rose steadily — airtight`
    : `Seal test at ${Math.round(d.min)} min: no bubbles — the joint leaks`;
  say(
    d,
    tight
      ? `You squeezed the flask gently and a stream of bubbles came up through ${
          index === SETUP_KOH ? 'the water' : 'the lime water'
        }. **The joint is airtight** — about ${Math.round(frac * 100)}% of the gas goes down the tube.`
      : 'You squeezed the flask and almost nothing came through — you can hear air hissing past the cork instead. ' +
          `**The joint leaks**: only about ${Math.round(frac * 100)}% of the gas takes the delivery tube. Pick up the ` +
          '**vaseline** and seal it.',
    tight ? 'good' : 'bad',
  );
}

// ---------------------------------------------------------------------------
// The marked steps
// ---------------------------------------------------------------------------

function doneBuilding(d: RespirationState, now: number): void {
  if (d.step !== STEP.build) return;
  const control = d.flasks[SETUP_B];
  const a = d.flasks[SETUP_A];

  if (!control || !flaskReady(control)) {
    if (!d.warned.control) {
      d.warned.control = true;
      say(
        d,
        '**Set-up B is not ready.** Without a second flask of boiled seeds standing beside the first, a milky test tube ' +
          'could just as well be carbon dioxide that was already in the air inside the flask. Set the control up, or ' +
          'press the button again to go on without it.',
        'bad',
      );
      return;
    }
    mistake(d, now, 'Went on without a control flask of boiled seeds');
  }
  if (a && a.seeds && a.seeds.kind !== 'germ') {
    mistake(d, now, `Set-up A was built with ${SEED[a.seeds.kind].name} instead of germinating seeds`);
  }
  if (control && flaskReady(control) && control.seeds && control.seeds.kind !== 'boiled') {
    mistake(d, now, `The control flask was built with ${SEED[control.seeds.kind].name} instead of boiled seeds`);
  }

  d.step = STEP.seal;
  say(
    d,
    'Now the seals. Pick up the **vaseline** and smear it round each cork, then squeeze a flask to check that bubbles ' +
      'come through.',
  );
}

function startClock(d: RespirationState, now: number): void {
  if (d.step !== STEP.seal) return;
  const leaky = markedFlasks(d)
    .map((f, i) => (f.cork && !f.sealed ? i : -1))
    .filter((i) => i >= 0);

  if (leaky.length && !d.warned.leak) {
    d.warned.leak = true;
    say(
      d,
      `${leaky.map((i) => nameOf(i)).join(' and ')} ${leaky.length > 1 ? 'are' : 'is'} corked but **not sealed**. The ` +
        'gas will escape past the cork and the lime water will barely change. Seal ' +
        `${leaky.length > 1 ? 'them' : 'it'} with vaseline, or press **Start the clock** again to run it as it is.`,
      'bad',
    );
    return;
  }
  if (leaky.length) mistake(d, now, `Started the clock with ${leaky.map((i) => nameOf(i)).join(' and ')} not sealed`);

  d.step = STEP.watch;
  d.clock = 'run';
  say(
    d,
    'The clock is yours. Let it run, fast-forward it, or jump five minutes at a time — then **pause** and the bench ' +
      'will tell you what each tube has done while you were away.',
  );
}

function goRecord(d: RespirationState): void {
  if (d.step !== STEP.watch) return;
  if (d.min < EARLY_MIN && !d.warned.early) {
    d.warned.early = true;
    d.clock = 'paused';
    say(
      d,
      `Only **${Math.round(d.min)} minutes** have passed. Enough carbon dioxide has to bubble through before calcium ` +
        'carbonate shows as milkiness — give it longer, or press **Record observations** again if you are sure.',
      'warn',
    );
    return;
  }
  d.clock = 'paused';
  noteLooks(d);
  d.step = STEP.record;
  say(
    d,
    'Write down what each test tube looks like **now**. Both rows are marked against what that lime water has really done.',
  );
}

function submitObservations(d: RespirationState, now: number): void {
  if (d.step !== STEP.record || d.graded) return;

  const cells: Record<number, GradedCell> = {};
  let pts = 0;

  markedFlasks(d).forEach((f, i) => {
    const r = entryAt(d, i);
    const ready = builtForRecording(f);
    const trueApp = look(f);
    const trueDet = detected(f);
    let appPts = 0;
    let detPts = 0;
    if (ready && r.app) {
      const shades = Math.abs(APPEARANCE_ORDER.indexOf(r.app) - APPEARANCE_ORDER.indexOf(trueApp));
      appPts = appearanceMarksFor(shades);
    }
    if (ready && r.det) detPts = r.det === trueDet ? DETECTION_MARKS : 0;

    pts += appPts + detPts;
    cells[i] = { pts: appPts + detPts, ready, trueApp, trueDet, milk: milkiness(f) };

    if (!ready) {
      mistake(d, now, `${nameOf(i)} was never a working set-up, so its row scores nothing`);
    } else if (appPts < APPEARANCE_MARKS || detPts < DETECTION_MARKS) {
      mistake(
        d,
        now,
        `${nameOf(i)}: you wrote “${appearanceLabel(r.app)}” / CO₂ ${r.det || '—'}; the tube showed ` +
          `“${appearanceLabel(trueApp)}” / CO₂ ${trueDet}`,
      );
    }
  });

  d.graded = { cells, min: d.min };
  d.pts.observe = pts;
  d.held = null;
  d.clock = 'paused';

  const a = cells[SETUP_A];
  const b = cells[SETUP_B];
  const aLine = !a
    ? ''
    : a.ready && a.milk >= VIS.milky
      ? 'Set-up A’s lime water is plainly milky — calcium carbonate has come down. '
      : a.ready
        ? `Set-up A’s lime water is ${a.trueApp === 'faint' ? 'only just clouding' : 'still clear'} — ${explainClear(
            d.flasks[SETUP_A] ?? newFlask(SETUP_A),
          )} `
        : '';
  const bLine = !b
    ? ''
    : b.ready
      ? b.milk >= VIS.faint
        ? 'The control has gone milky too, which means something is wrong with it. '
        : 'The control stayed clear, as it must. '
      : 'There was no control to compare against. ';

  say(d, `${pts} of ${MAX.observe} for the observations. ${aLine}${bLine}Now say what follows from your table.`, pts >= 20 ? 'good' : 'warn');
  d.step = STEP.concl;
}

/**
 * The conclusion the student's OWN two rows point at, or null when their table
 * cannot support one. This is what "follows from the table" is marked against.
 */
export function impliedConclusion(d: RespirationState): number | null {
  const control = d.flasks[SETUP_B];
  if (!control || !builtForRecording(control)) return null;
  const a = entryAt(d, SETUP_A).det;
  const b = entryAt(d, SETUP_B).det;
  if (!a || !b) return null;
  return a === 'yes' ? (b === 'no' ? 0 : 1) : b === 'no' ? 2 : 3;
}

function submitConclusion(d: RespirationState, now: number): void {
  if (d.step !== STEP.concl || d.pick === null) return;
  const implied = impliedConclusion(d);
  const consistent = implied !== null && implied === d.pick;
  const truth = d.pick === TRUE_CONCLUSION;

  d.concl = {
    picked: d.pick,
    text: CONCL[d.pick] ?? '',
    followsFromTable: consistent,
    trueConclusion: truth,
  };
  d.pts.conclude = (consistent ? CONCLUSION_HALF : 0) + (truth ? CONCLUSION_HALF : 0);

  if (!consistent) {
    mistake(
      d,
      now,
      implied === null
        ? 'The conclusion does not follow — there was no control row to draw it from'
        : 'The conclusion does not follow from your own observation table',
    );
  }
  if (!truth) mistake(d, now, 'The conclusion is not the one this experiment supports');

  say(
    d,
    consistent && truth
      ? 'Correct, and it follows from your own table. **Germinating seeds give out carbon dioxide during respiration.** ' +
          'The boiled seeds in the identical control flask gave out none, so the gas cannot have come from the air already ' +
          'in the apparatus or from the lime water itself — it came from the living seeds.'
      : consistent
        ? 'That does follow from your table — good reasoning — but it is not what this experiment shows. Something in the ' +
            'apparatus hid the real result: check the seeds, the seal, and whether the delivery tube dipped under the lime ' +
            'water. The true conclusion is that **germinating seeds give out carbon dioxide, and the boiled-seed control ' +
            'shows it came from respiration**.'
        : implied === null
          ? 'You cannot get there from your table. **With no control flask, a milky test tube proves nothing** — the carbon ' +
              'dioxide might have been in the air inside the flask all along. The boiled seeds are what rule that out.'
          : 'That does not match your own table. Read your two rows again: the flask where CO₂ was detected, and the one ' +
              'where it was not, are what the conclusion has to rest on.',
    consistent && truth ? 'good' : 'warn',
  );
  d.step = STEP.viva;
}

// ---------------------------------------------------------------------------
// The bench's one dispatch table
// ---------------------------------------------------------------------------

function act(
  state: RespirationState,
  action: Exclude<RespirationAction, { type: 'say' } | { type: 'tick' }>,
): RespirationState {
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

    case 'selectSetup':
      return state.sel === action.index || !state.flasks[action.index]
        ? state
        : { ...state, sel: action.index };

    case 'tapFlask': {
      const held = state.held;
      if (!state.flasks[action.index]) return state;
      if (!held) return state.sel === action.index ? state : { ...state, sel: action.index };
      return edit(state, (d) => {
        if (held.kind === 'seed') addSeeds(d, action.index, held.seed, action.now);
        else if (held.kind === 'cork') fitCork(d, action.index);
        else if (held.kind === 'vas') sealCork(d, action.index);
        else if (held.kind === 'koh') addKoh(d, action.index);
        else {
          d.sel = action.index;
          say(d, 'Lime water goes in the **test tube**, not the flask — tap the test tube beside it.', 'warn');
        }
      });
    }

    case 'tapTube': {
      const held = state.held;
      if (!state.flasks[action.index]) return state;
      if (!held) return state.sel === action.index ? state : { ...state, sel: action.index };
      return edit(state, (d) => {
        if (held.kind === 'lime') addLime(d, action.index);
        else if (held.kind === 'seed') {
          d.sel = action.index;
          say(d, 'The seeds go in the **conical flask**, not the test tube.', 'warn');
        } else if (held.kind === 'vas') {
          d.sel = action.index;
          say(d, 'The vaseline seals the **cork** — tap the flask, not the test tube.', 'warn');
        } else {
          d.sel = action.index;
        }
      });
    }

    case 'testSeal':
      return edit(state, (d) => testSeal(d, action.index));

    case 'takeApart': {
      if (locked(state) || !state.flasks[action.index]) return state;
      return edit(state, (d) => {
        d.flasks[action.index] = newFlask(action.index);
        d.sel = action.index;
        say(d, `${capitalise(nameOf(action.index))} taken apart, emptied and rinsed. Start that set-up again.`);
      });
    }

    case 'toggleBath': {
      if (locked(state)) return state;
      return edit(state, (d) => {
        const warm = d.tempC > d.roomC;
        d.tempC = warm ? d.roomC : bathTemp(d);
        say(
          d,
          warm
            ? `Water bath off — back to room temperature, ${d.roomC} °C.`
            : `Water bath on: every flask is now at **${d.tempC} °C**. Respiration roughly doubles for each 10 °C, so ` +
                'the lime water will change about twice as fast — both flasks alike, so the comparison still holds.',
        );
      });
    }

    case 'doneBuilding':
      return edit(state, (d) => doneBuilding(d, action.now));

    case 'startClock':
      return edit(state, (d) => startClock(d, action.now));

    case 'setClock': {
      if (state.step < STEP.watch || locked(state) || state.clock === action.mode) return state;
      return edit(state, (d) => {
        if (action.mode === 'paused') {
          pauseAndLook(d, `${Math.round(d.min)} min on the clock.`);
          return;
        }
        d.clock = action.mode;
        say(
          d,
          action.mode === 'fast'
            ? 'Fast-forwarding. Every simulated minute still passes through the apparatus — a leak leaks for all of them.'
            : 'The clock is running. Come back and **pause** it to see what has changed.',
        );
      });
    }

    case 'skip': {
      if (state.step < STEP.watch || locked(state)) return state;
      return edit(state, (d) => {
        advance(d, action.minutes);
        pauseAndLook(d, `${action.minutes} minutes later — ${Math.round(d.min)} min on the clock.`);
      });
    }

    case 'goRecord':
      return edit(state, (d) => goRecord(d));

    case 'setEntry': {
      if (state.step !== STEP.record || state.graded) return state;
      return edit(state, (d) => {
        const r = entryAt(d, action.index);
        if (action.field === 'app') {
          r.app = action.value as Appearance | '';
          // The obvious reading, offered rather than demanded: still editable.
          if (r.app && !r.det) r.det = r.app === 'clear' ? 'no' : 'yes';
        } else {
          r.det = action.value as 'yes' | 'no' | '';
        }
        d.rec[action.index] = r;
      });
    }

    case 'submitObservations':
      return edit(state, (d) => submitObservations(d, action.now));

    case 'pickConclusion':
      return state.step !== STEP.concl || state.pick === action.index
        ? state
        : { ...state, pick: action.index };

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
          d.clock = 'paused';
          d.step += 1;
        }
      });
    }

    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled respiration bench action: ${JSON.stringify(exhaustive)}`);
    }
  }
}
