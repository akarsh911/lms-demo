import { logMistake } from '../marking';
import { vivaPaperFor } from '../viva';
import type { RichText, Tone } from '../types';

import {
  CAP,
  RX,
  SP,
  TAGS,
  TAMB,
  THERMO_MAX,
  TYPES,
  VDEF,
  add,
  classify,
  fmtMin,
  newVessel,
  pHof,
  rebase,
  stepVessel,
  tempOf,
  tickIsRight,
  truthOf,
  typeLabel,
  vis,
  vol,
  showsAs,
  type ReagentKey,
  type RxId,
  type TagKey,
  type TypeKey,
  type Vessel,
  type VesselId,
} from './chemistry';
import {
  BAD_VESSEL_PENALTY,
  MAX,
  SETUP_STEPS,
  STEP,
  STOPPER_HEAT_PENALTY,
  VIVA_POINTS,
  WRONG_HEAT_PENALTY,
} from './marking';
import type { ClassifiedRow, GradedRow, ReactionTypesState, ToolKind } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * Everything that can happen at this bench.
 *
 * Every action that depends on time carries `now` (ms since epoch), stamped by
 * the handler that dispatched it, so the reducer never reads a clock and the
 * same state and action always give the same result.
 *
 * The LAB clock is a different clock: it only moves when the student asks it to
 * (`wait`), and `tick` runs that request off smoothly so the tubes are seen to
 * change rather than jumping.
 */
export type ReactionAction =
  | { type: 'tapReagent'; k: ReagentKey }
  | { type: 'tapTool'; tool: ToolKind }
  | { type: 'tapVessel'; k: number; now: number }
  | { type: 'drop' }
  | { type: 'select'; k: number }
  | { type: 'toggleFlame'; now: number }
  | { type: 'wait'; minutes: number }
  | { type: 'tick'; dt: number; now: number }
  | { type: 'smell'; k: number }
  | { type: 'empty'; k: number }
  | { type: 'focusReaction'; rx: RxId }
  | { type: 'toggleTick'; rx: RxId; tag: TagKey }
  | { type: 'submitObs'; now: number }
  | { type: 'setClass'; rx: RxId; value: TypeKey }
  | { type: 'submitClass'; now: number }
  | { type: 'answerViva'; question: number; option: number; now: number }
  | { type: 'say'; text: RichText; tone: Tone };

/** Simulated minutes of lab clock run off per real second while a wait plays. */
const WAIT_SECONDS = 1.2;
/** The clock is integrated in sub-steps this size, so a rate is never over-shot. */
const SUB_STEP = 0.05;

type State = ReactionTypesState;

export function reactionReducer(state: State, action: ReactionAction): State {
  switch (action.type) {
    case 'say':
      return { ...state, message: { text: action.text, tone: action.tone } };
    case 'tick': {
      if (state.pending <= 0) return state;
      return edit(state, (d) => {
        const run = Math.min(d.pending, Math.max(SUB_STEP, d.rate * action.dt));
        advanceClock(d, run, action.now);
        d.pending = Math.max(0, d.pending - run);
        if (d.pending <= 1e-9) {
          d.pending = 0;
          afterWait(d);
        }
      });
    }
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
function edit(state: State, fn: (draft: State) => void): State {
  const draft = structuredClone(state);
  fn(draft);
  return draft;
}

function say(d: State, text: RichText, tone: Tone = 'info'): void {
  d.message = { text, tone };
}

function mistake(d: State, now: number, what: string, pts = 0): void {
  logMistake(d.log, { now, t0: d.t0, what, pts });
}

const V = (d: State, id: VesselId): Vessel => d.vessels[VDEF.findIndex((x) => x.id === id)]!;

/** Once the table is marked the vessels stay as they are, exactly as they were judged. */
const locked = (d: State): boolean => d.graded !== null || d.done;

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const heatedNow = (d: State, v: Vessel): boolean => d.flame && d.burnerAt === v.k;

// ---------------------------------------------------------------------------
// Is each reaction set up? Computed from the vessels, never from clicks.
// ---------------------------------------------------------------------------

export const SETUP: Readonly<Record<RxId, (d: State) => boolean>> = {
  i: (d) => {
    const v = V(d, 'lime');
    return ((v.c.CaO ?? 0) > 0 || (v.c.CaOH2 ?? 0) > 0) && vol(v) > 0;
  },
  ii: (d) => {
    const v = V(d, 'fs');
    return ((v.c.FeSO4x7 ?? 0) > 0 || (v.c.FeSO4s ?? 0) > 0 || (v.c.Fe2O3 ?? 0) > 0) && !v.burst;
  },
  iii: (d) => {
    const n = V(d, 'nail');
    const c = V(d, 'ctrl');
    return n.nails > 0 && vol(n) > 0 && vol(c) > 0 && c.nails === 0;
  },
  iv: (d) => {
    const v = V(d, 'dd');
    return (v.c.BaSO4 ?? 0) > 0 || (vol(v) > 0 && v.added.includes('Na2SO4') && v.added.includes('BaCl2'));
  },
};

/** A setup step is finished when its reaction stands — (ii) also needs real heating. */
export function stepDone(d: State, i: number): boolean {
  if (i === STEP.lime) return SETUP.i(d);
  if (i === STEP.fs) return SETUP.ii(d) && d.fsHeatMin >= 0.5;
  if (i === STEP.nails) return SETUP.iii(d);
  if (i === STEP.dd) return SETUP.iv(d);
  return i < d.step;
}

/** The live step is the first reaction still unfinished. Later steps are explicit. */
function progress(d: State): void {
  if (d.step > STEP.dd) return;
  const was = d.step;
  let i = 0;
  while (i < SETUP_STEPS && stepDone(d, i)) i += 1;
  d.step = i;
  if (d.step === STEP.record && was < STEP.record) {
    say(
      d,
      'All four reactions are set up and (iv) is already done. Reaction (iii) is the slow one — **let the clock run** ' +
        'until the blue has plainly gone and the nails are coated, then fill in the observation table.',
      'good',
    );
  }
}

// ---------------------------------------------------------------------------
// The lab clock
// ---------------------------------------------------------------------------

function advanceClock(d: State, dt: number, now: number): void {
  let left = dt;
  while (left > 1e-9) {
    const h = Math.min(SUB_STEP, left);
    d.min = +(d.min + h).toFixed(4);
    if (d.flame && d.burnerAt !== null && VDEF[d.burnerAt]!.id === 'fs') d.fsHeatMin += h;
    for (const v of d.vessels) {
      stepVessel(v, h, heatedNow(d, v));
      if (v.wantBurst && !v.burst) burst(d, v, now);
      if (v.wantCrack && !v.cracked) crack(d, v, now);
    }
    checkThermo(d, now);
    left -= h;
  }
  d.min = Math.round(d.min * 100) / 100;
}

function afterWait(d: State): void {
  if (d.alert) {
    // A tube burst or cracked; that message stands.
    d.alert = false;
    progress(d);
    return;
  }
  const over = d.vessels.find((v) => v.overheat > 1 && !v.cracked);
  if (over && !d.warned.overheat) {
    d.warned.overheat = true;
    say(
      d,
      `There is nothing left in ${VDEF[over.k]!.name} for the flame to do, and it is sitting at ` +
        `**${tempOf(over).toFixed(0)} °C**. Glass does not last long like that — **turn the burner off**.`,
      'warn',
    );
    progress(d);
    return;
  }
  const lime = V(d, 'lime');
  let msg = `${fmtMin(d.min)} on the lab clock.`;
  if (d.flame && d.burnerAt !== null) {
    msg += ` The tube over the flame is at **${tempOf(d.vessels[d.burnerAt]!).toFixed(0)} °C**.`;
  }
  if (lime.dChem > 8) {
    msg +=
      ` The quicklime tube is at **${tempOf(lime).toFixed(0)} °C** — well above the ${TAMB} °C of the room,` +
      ' with no flame anywhere near it.';
  }
  msg += ' Tap any vessel for a close-up.';
  say(d, msg, 'info');
  progress(d);
}

// ---------------------------------------------------------------------------
// Things that go wrong
// ---------------------------------------------------------------------------

function burst(d: State, v: Vessel, now: number): void {
  v.burst = true;
  v.wantBurst = false;
  v.c = {};
  v.nails = 0;
  v.cu = 0;
  v.so2 = 0;
  v.dBurn = 0;
  v.dChem = 0;
  v.stopper = false;
  d.alert = true;
  if (d.thermoIn === v.k) d.thermoIn = null;
  d.flame = false;
  mistake(d, now, `${capitalise(VDEF[v.k]!.name)} burst — it was heated with the stopper in`, 0);
  say(
    d,
    'The corked tube has **burst**. Gas made by a reaction has to be able to get out; a closed tube over a flame ' +
      'becomes a bomb. Everything in it is lost — that reaction has to be set up again in a fresh tube.',
    'bad',
  );
}

function crack(d: State, v: Vessel, now: number): void {
  v.cracked = true;
  v.wantCrack = false;
  v.c = {};
  d.alert = true;
  mistake(d, now, 'Kept the empty residue over a full flame until the tube cracked', 5);
  say(
    d,
    'The tube has **cracked** and the residue is lost. Once the crystals have gone brown and no more gas comes off, ' +
      'the reaction is finished — **take the flame away**. Glass that is kept red hot with nothing left to heat gives way.',
    'bad',
  );
}

function checkHeating(d: State, now: number): void {
  if (!d.flame || d.burnerAt === null) return;
  const v = d.vessels[d.burnerAt]!;
  const def = VDEF[d.burnerAt]!;
  if (def.id !== 'fs' && !d.wrongHeat) {
    d.wrongHeat = true;
    mistake(d, now, `Held a flame under ${def.name}`, WRONG_HEAT_PENALTY);
    say(
      d,
      `Only **reaction (ii)** is heated in this practical. ${capitalise(def.name)} is not meant to go near a flame — ` +
        'it will boil dry and the reaction in it is spoiled.',
      'bad',
    );
  }
  if (v.stopper && !d.stopperHeat) {
    d.stopperHeat = true;
    mistake(d, now, 'Lit the burner under a stoppered tube', STOPPER_HEAT_PENALTY);
    say(
      d,
      'That tube is **corked** and you have just lit a flame under it. The gas inside has nowhere to escape to. ' +
        'Take the stopper out, now.',
      'bad',
    );
  }
}

function checkThermo(d: State, now: number): void {
  if (d.thermoIn === null || d.thermoBroken) return;
  const v = d.vessels[d.thermoIn]!;
  const T = tempOf(v);
  if (T >= 40 && v.id === 'lime') d.thermoSeen = true;
  if (T > 130) {
    d.thermoBroken = true;
    d.thermoIn = null;
    mistake(d, now, 'Left the thermometer in a tube over the burner until it burst', 0);
    say(
      d,
      `The thermometer has **burst** — a lab thermometer only reads to ${THERMO_MAX} °C and a burner takes a tube far ` +
        'past that. Never put one into something you are heating strongly.',
      'bad',
    );
  }
}

// ---------------------------------------------------------------------------
// Hands on the bench
// ---------------------------------------------------------------------------

function act(state: State, action: ReactionAction): State {
  switch (action.type) {
    case 'tapReagent':
      return edit(state, (d) => {
        const h = d.held;
        d.held = h && h.kind === 'bottle' && h.k === action.k ? null : { kind: 'bottle', k: action.k };
      });

    case 'tapTool':
      return edit(state, (d) => {
        const h = d.held;
        d.held = h && h.kind === action.tool ? null : ({ kind: action.tool } as State['held']);
      });

    case 'drop':
      return state.held === null ? state : { ...state, held: null };

    case 'select':
      return state.sel === action.k ? state : { ...state, sel: action.k };

    case 'tapVessel':
      return edit(state, (d) => applyHeld(d, action.k, action.now));

    case 'toggleFlame':
      return edit(state, (d) => {
        if (locked(d)) return;
        if (d.burnerAt === null && !d.flame) {
          say(d, 'Pick the burner up first and slide it under the vessel you want to heat.', 'warn');
          return;
        }
        d.flame = !d.flame;
        if (!d.flame) {
          say(d, 'Flame out.', 'info');
          return;
        }
        say(d, 'The burner is lit. Nothing happens until time passes — use **Wait 1 min** and watch the crystals.', 'info');
        checkHeating(d, action.now);
      });

    case 'wait':
      if (state.pending > 0 || locked(state)) return state;
      return { ...state, pending: action.minutes, rate: action.minutes / WAIT_SECONDS, held: null };

    case 'smell':
      return edit(state, (d) => smell(d, action.k));

    case 'empty':
      return edit(state, (d) => {
        if (locked(d)) return;
        const wasBurst = d.vessels[action.k]!.burst;
        d.vessels[action.k] = newVessel(action.k);
        if (d.thermoIn === action.k) d.thermoIn = null;
        say(
          d,
          wasBurst
            ? 'A fresh tube from the cupboard, clean and dry.'
            : 'Emptied into the waste jar and rinsed with distilled water.',
          'info',
        );
        progress(d);
      });

    case 'focusReaction':
      return edit(state, (d) => {
        d.focus = action.rx;
        const rx = RX.find((r) => r.id === action.rx);
        if (rx) d.sel = VDEF.findIndex((x) => x.id === rx.v);
      });

    case 'toggleTick':
      return edit(state, (d) => {
        if (d.graded || d.step !== STEP.record) return;
        const set = new Set(d.rec[action.rx]);
        if (set.has(action.tag)) set.delete(action.tag);
        else set.add(action.tag);
        // "No change at all" is the one tick that cannot share a row.
        if (action.tag === 'none' && set.has('none')) {
          set.clear();
          set.add('none');
        } else set.delete('none');
        d.rec[action.rx] = [...set];
      });

    case 'submitObs':
      return edit(state, (d) => submitObs(d, action.now));

    case 'setClass':
      return edit(state, (d) => {
        if (d.clsGraded) return;
        d.cls[action.rx] = action.value;
        const next = RX.find((r) => d.cls[r.id] === '');
        if (next) d.focus = next.id;
      });

    case 'submitClass':
      return edit(state, (d) => submitClass(d, action.now));

    case 'answerViva':
      return edit(state, (d) => answerViva(d, action.question, action.option, action.now));

    default:
      return state;
  }
}

/** What a tap on a vessel means depends on what is in the student's hand. */
function applyHeld(d: State, k: number, now: number): void {
  const h = d.held;
  if (!h) {
    d.sel = k;
    return;
  }
  if (h.kind === 'bottle') pourInto(d, k, h.k, now);
  else if (h.kind === 'nails') dropNails(d, k, now);
  else if (h.kind === 'litmusR' || h.kind === 'litmusB') dipLitmus(d, k, h.kind);
  else if (h.kind === 'thermo') putThermo(d, k, now);
  else if (h.kind === 'stopper') toggleStopper(d, k);
  else moveBurner(d, k, now);
}

function pourInto(d: State, k: number, id: ReagentKey, now: number): void {
  const v = d.vessels[k]!;
  const def = VDEF[k]!;
  const dose = d.dose[id];
  if (locked(d)) {
    say(d, 'Your observations are already marked — the vessels stay as they are.', 'info');
    return;
  }
  if (v.burst) {
    say(d, 'That tube burst. There is nothing left to pour into.', 'warn');
    return;
  }
  if (v.stopper) {
    say(d, 'That tube is corked. Take the stopper out before you pour anything in.', 'warn');
    return;
  }
  if (!SP[id].g && vol(v) + dose > CAP) {
    say(d, 'That tube is nearly full. Empty and rinse it if you want to start again.', 'warn');
    return;
  }
  add(v, id, dose);
  v.added.push(id);
  rebase(v); //  the baseline is the vessel as it was poured…
  stepVessel(v, 0, false); // …and instantaneous reactions land immediately after
  d.sel = k;

  if (!def.allow.includes(id)) {
    d.badSetup += 1;
    mistake(d, now, `Added ${SP[id].name} to ${def.name}`, BAD_VESSEL_PENALTY);
    say(
      d,
      `${capitalise(SP[id].name)} does not belong in **${def.name}**. Whatever that vessel shows now is a mixture, ` +
        'not the reaction you set out to do — press **Empty and rinse** in the close-up and start it again.',
      'bad',
    );
  } else if (id === 'H2O' && (v.c.CaO ?? 0) > 0) {
    say(
      d,
      'It **hisses** the moment the water lands and steam comes off. Stand the **thermometer** in it and let a minute ' +
        'go by — this one gives out a lot of heat.',
      'good',
    );
  } else if (id === 'BaCl2' && (v.c.BaSO4 ?? 0) > 0) {
    say(
      d,
      'A **dense white precipitate** appears the instant the two solutions meet, and it starts to settle. ' +
        'Nothing needed heating and nothing needed waiting.',
      'good',
    );
  } else {
    say(d, `Added ${dose}${SP[id].g ? ' g' : ' mL'} of ${SP[id].name} to ${def.name}.`, 'info');
  }
  progress(d);
}

function dropNails(d: State, k: number, now: number): void {
  const v = d.vessels[k]!;
  const def = VDEF[k]!;
  if (locked(d)) {
    say(d, 'Your observations are already marked — the vessels stay as they are.', 'info');
    return;
  }
  if (v.burst) {
    say(d, 'That tube burst.', 'warn');
    return;
  }
  if (v.nails) {
    say(d, 'Those nails are already in that tube.', 'warn');
    return;
  }
  v.nails = 2;
  add(v, 'Fe', 4);
  v.added.push('nails');
  v.nailsAt = d.min;
  rebase(v);
  d.sel = k;

  if (!def.nails) {
    d.badSetup += 1;
    mistake(d, now, `Dropped iron nails into ${def.name}`, BAD_VESSEL_PENALTY);
    say(
      d,
      def.id === 'ctrl'
        ? 'The **control tube** is the one with **no nail in it** — it is what you compare against, so that you know ' +
            'the colour change came from the iron and not from standing about. Press **Empty and rinse** and leave it ' +
            'as plain copper sulphate.'
        : `Iron nails do not belong in ${def.name}. Press **Empty and rinse**.`,
      'bad',
    );
  } else if (!vol(v)) {
    say(d, 'The nails are in, but there is no solution for them to react with. Pour the copper sulphate in.', 'warn');
  } else {
    say(
      d,
      'Two clean iron nails, half covered by the blue solution. This one is **slow** — use the lab clock. ' +
        'Set up the **control tube** of copper sulphate with no nail while you wait.',
      'good',
    );
  }
  progress(d);
}

function dipLitmus(d: State, k: number, kind: 'litmusR' | 'litmusB'): void {
  const v = d.vessels[k]!;
  if (locked(d)) return;
  const ph = pHof(v);
  if (ph === null) {
    say(d, 'There is no solution in that vessel to dip litmus into.', 'warn');
    return;
  }
  const res = kind === 'litmusR' ? (ph >= 8.3 ? 'blue' : 'red') : ph <= 5 ? 'red' : 'blue';
  v.litmus[kind] = res;
  d.sel = k;
  if (v.id === 'lime' && kind === 'litmusR' && (v.c.CaOH2 ?? 0) > 0) d.litmusSeen = true;
  const turned = (kind === 'litmusR' && res === 'blue') || (kind === 'litmusB' && res === 'red');
  const tail = turned
    ? res === 'blue'
      ? 'Red litmus turning blue means the solution is **basic** — the slaked lime has dissolved to make lime water.'
      : 'Blue litmus turning red means the solution is **acidic**.'
    : `No change, so that solution is not ${kind === 'litmusR' ? 'basic' : 'acidic'}.`;
  say(d, `The ${kind === 'litmusR' ? 'red' : 'blue'} strip came out **${res}**. ${tail}`, turned ? 'good' : 'info');
}

function putThermo(d: State, k: number, now: number): void {
  if (locked(d)) return;
  if (d.thermoBroken) {
    say(d, 'The thermometer is broken. There is not another one on this bench.', 'warn');
    return;
  }
  d.thermoIn = d.thermoIn === k ? null : k;
  d.held = null;
  d.sel = k;
  if (d.thermoIn === null) {
    say(d, 'Thermometer out and wiped dry.', 'info');
    return;
  }
  checkThermo(d, now);
  const T = tempOf(d.vessels[k]!);
  say(
    d,
    `Thermometer standing in ${VDEF[k]!.name}. It reads **${
      T > THERMO_MAX ? 'off the top of the scale' : `${T.toFixed(0)} °C`
    }**. Room temperature on this bench is ${TAMB} °C.`,
    'info',
  );
}

function toggleStopper(d: State, k: number): void {
  const v = d.vessels[k]!;
  if (locked(d) || v.burst) return;
  v.stopper = !v.stopper;
  if (!v.stopper) v.pressure = 0;
  d.sel = k;
  say(
    d,
    v.stopper
      ? `${capitalise(VDEF[k]!.name)} is corked. **Never heat a closed vessel** — the gas inside has nowhere to go.`
      : 'Stopper out.',
    v.stopper ? 'warn' : 'info',
  );
}

function moveBurner(d: State, k: number, now: number): void {
  if (locked(d)) return;
  d.burnerAt = d.burnerAt === k ? null : k;
  d.held = null;
  if (d.burnerAt === null) {
    say(d, 'Burner pulled back out of the way.', 'info');
    return;
  }
  say(
    d,
    `The burner is under ${VDEF[k]!.name}.` +
      (d.flame ? ' It is already lit.' : ' Press **Light the burner** when you are ready.'),
    'info',
  );
  checkHeating(d, now);
}

function smell(d: State, k: number): void {
  const v = d.vessels[k]!;
  d.sel = k;
  if (v.so2 > 0.03) {
    say(
      d,
      'You waft the gas towards your nose with your hand. It has a **sharp, choking smell, like a burning matchstick** ' +
        '— sulphur dioxide and sulphur trioxide. Never put your nose over the mouth of the tube.',
      'warn',
    );
    return;
  }
  if (v.so2 > 0.005) {
    say(d, 'There is the faintest catch at the back of your throat. Something is starting to come off, but very little of it yet.', 'info');
    return;
  }
  if (tempOf(v) > 60 && vol(v) > 0) {
    say(d, 'Only steam — hot, damp, and with no smell.', 'info');
    return;
  }
  say(d, 'You waft the air above the vessel towards you. **No smell at all.**', 'info');
}

// ---------------------------------------------------------------------------
// The observation table, the classification and the viva
// ---------------------------------------------------------------------------

function submitObs(d: State, now: number): void {
  if (d.graded || d.step !== STEP.record) return;
  if (RX.some((r) => d.rec[r.id].length === 0)) {
    say(d, 'Every reaction needs a row. Tick what each of the four vessels showed you — or tick **No change at all**.', 'warn');
    return;
  }
  const nail = V(d, 'nail');
  if (!d.readyWarned && nail.nails && vis(nail).colour < 1) {
    d.readyWarned = true;
    say(
      d,
      `The blue in the nail tube has **not plainly gone** yet — the nails have only been in it ` +
        `${fmtMin(d.min - nail.nailsAt)}. That reaction needs about fifteen minutes to be sure of. ` +
        'Press **Submit the table** again if you mean to record it as it stands.',
      'warn',
    );
    return;
  }

  const rows = {} as Record<RxId, GradedRow>;
  let pts = 0;
  for (const r of RX) {
    const v = V(d, r.v);
    const truth = truthOf(v);
    const picked = d.rec[r.id];
    let match = 0;
    for (const t of TAGS) if (tickIsRight(truth, t.k, picked.includes(t.k))) match += 1;
    const p = ((MAX.observe / RX.length) * match) / TAGS.length;
    rows[r.id] = { pts: p, match, truth, shown: showsAs(v), picked: [...picked] };
    pts += p;
    if (match < TAGS.length) {
      const missed = TAGS.filter((t) => truth.yes.includes(t.k) && !picked.includes(t.k) && !truth.maybe.includes(t.k))
        .map((t) => t.label);
      const extra = TAGS.filter((t) => !truth.yes.includes(t.k) && !truth.maybe.includes(t.k) && picked.includes(t.k))
        .map((t) => t.label);
      mistake(
        d,
        now,
        `${r.roman} ${r.title}: ` +
          [
            missed.length ? `missed ${missed.join(', ')}` : '',
            extra.length ? `recorded ${extra.join(', ')} that the vessel never showed` : '',
          ]
            .filter(Boolean)
            .join('; '),
        0,
      );
    }
  }

  d.graded = { rows, min: d.min };
  d.pts.observe = pts;
  d.held = null;
  const perfect = RX.filter((r) => rows[r.id].match === TAGS.length).length;
  const invented = RX.some((r) =>
    TAGS.some(
      (t) =>
        !rows[r.id].truth.yes.includes(t.k) && !rows[r.id].truth.maybe.includes(t.k) && rows[r.id].picked.includes(t.k),
    ),
  );
  say(
    d,
    `${perfect} of 4 rows recorded exactly as the vessel looked.` +
      (invented
        ? ' Somewhere you ticked something the vessel **did not show** — a practical record is what you saw, not what ' +
          'the book says should happen.'
        : '') +
      ' Now name the type of each reaction.',
    perfect === 4 ? 'good' : 'warn',
  );
  d.step = STEP.classify;
  d.focus = 'i';
}

function submitClass(d: State, now: number): void {
  if (d.clsGraded || d.step !== STEP.classify) return;
  if (RX.some((r) => d.cls[r.id] === '')) {
    say(d, 'All four need a type before this can be marked.', 'warn');
    return;
  }
  const rows = {} as Record<RxId, ClassifiedRow>;
  let pts = 0;
  for (const r of RX) {
    const truth = classify(r);
    const ok = d.cls[r.id] === truth;
    rows[r.id] = { picked: d.cls[r.id], truth, pts: ok ? MAX.classify / RX.length : 0 };
    pts += rows[r.id].pts;
    if (!ok) {
      mistake(
        d,
        now,
        `${r.roman} classified as ${typeLabel(d.cls[r.id])}; ${r.eq} is ${typeLabel(truth).toLowerCase()}`,
        MAX.classify / RX.length,
      );
    }
  }
  d.clsGraded = rows;
  d.pts.classify = pts;
  const right = RX.filter((r) => rows[r.id].pts > 0).length;
  say(
    d,
    right === 4
      ? 'All four correct: **(i) combination** — two things make one; **(ii) decomposition** — one thing breaks into ' +
          'three; **(iii) displacement** — one free element takes another’s place; **(iv) double displacement** — two ' +
          'compounds swap partners.'
      : `${right} of 4 correct. Count the formulas: two or more in and one out is **combination**; one in and two or ` +
          'more out is **decomposition**; a free element on each side is **displacement**; no free element and two ' +
          'compounds swapping ions is **double displacement**.',
    right === 4 ? 'good' : 'warn',
  );
  d.step = STEP.viva;
}

function answerViva(d: State, question: number, option: number, now: number): void {
  if (d.viva[question]) return;
  const q = vivaPaperFor(VIVA_BANK, d.seed, d.vivaShuffled)[question];
  if (!q) return;
  const ok = option === q.a;
  d.viva[question] = { pick: option, pts: ok ? VIVA_POINTS : 0 };
  if (!ok) mistake(d, now, `Viva: question ${question + 1}`, 0);
  if (d.viva.every((v) => v !== null)) {
    d.done = true;
    d.tEnd = now;
  }
}

/** The four type names, for a console that must not re-derive them. */
export const TYPE_OPTIONS = TYPES;
