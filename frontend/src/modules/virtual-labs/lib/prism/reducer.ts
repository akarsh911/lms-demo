import { VIVA_BANK } from './viva-bank';
import { clamp, formatClock } from '../numbers';
import { vivaPaperFor } from '../viva';
import type { RichText, Tone } from '../types';

import {
  IMAX,
  SWEEP_FROM,
  SWEEP_TO,
  aimAt,
  atMinimum,
  demoMinimum,
  demoRay,
  firstEmerging,
  sweepNext,
  sweepOver,
} from './demo';
import {
  ANGLE_NAMES,
  ANGLE_ORDER,
  CONCLUSIONS,
  CONCL_POINTS,
  PER_RAY,
  RAYS,
  READINGS,
  STEP,
  VIVA_POINTS,
  conclusionKey,
  leastDeviationRay,
  sumRule,
} from './marking';
import {
  APEX,
  FACE,
  OUTMIN,
  PAPER,
  SEP,
  V,
  angBetween,
  criticalAngle,
  firstHit,
  inPaper,
  insidePrism,
  isect,
  lineLine,
  nFromMinDeviation,
  trace,
  vdot,
  vlen,
  vmul,
  vnorm,
  vsub,
  type Vec,
} from './optics';
import {
  currentTrial,
  measureGeometry,
  measuredRays,
  readingsTaken,
  type AngleId,
  type PrismState,
  type Trial,
} from './state';

/**
 * Everything a pair of hands can do at this bench.
 *
 * Every action that depends on time carries `now`, stamped by the handler that
 * dispatched it, so the reducer never reads a clock and the same state and
 * action always give the same result.
 */
export type PrismAction =
  | { type: 'traceOutline'; now: number }
  | { type: 'setTool'; tool: 'pin' | null }
  | { type: 'moveCross'; x: number; y: number }
  | { type: 'placePin'; x: number; y: number; now: number }
  | { type: 'dragPin'; index: number; x: number; y: number; now: number }
  | { type: 'pullPin'; index: number | null; now: number }
  | { type: 'joinPins'; now: number }
  | { type: 'nextRay'; now: number }
  | { type: 'reveal' }
  | { type: 'toggleWhite' }
  // The ray box. Never marked, so these four are allowed even when the
  // practical is over, exactly as the white-light demonstration is.
  | { type: 'demoOn'; on?: boolean }
  | { type: 'setAim'; i: number; quiet?: boolean }
  | { type: 'sweep'; instant: boolean }
  | { type: 'tick'; dt: number; now: number }
  | { type: 'selectRay'; k: number }
  | { type: 'armMeasure'; k: number; which: AngleId; now: number }
  | { type: 'unarm' }
  | { type: 'setProtractor'; deg: number }
  | { type: 'commitRead'; deg: number; now: number }
  | { type: 'pickLeast'; k: number }
  | { type: 'submitLeast'; now: number }
  | { type: 'answerConclusion'; question: number; option: number; now: number }
  | { type: 'answerViva'; question: number; option: number; now: number }
  | { type: 'say'; text: RichText; tone: Tone };

export function prismReducer(state: PrismState, action: PrismAction): PrismState {
  switch (action.type) {
    case 'say':
      return { ...state, message: { text: action.text, tone: action.tone } };
    case 'selectRay':
      return state.sel === action.k ? state : { ...state, sel: clamp(action.k, 0, RAYS - 1) };
    case 'setProtractor': {
      const deg = Math.max(0, Math.min(180, Math.round(action.deg)));
      if (!state.arm || deg === state.prov) return state;
      return { ...state, prov: deg, protMoves: state.protMoves + 1 };
    }
    case 'moveCross': {
      const x = clamp(action.x, PAPER.x + 8, PAPER.x + PAPER.w - 8);
      const y = clamp(action.y, PAPER.y + 8, PAPER.y + PAPER.h - 8);
      if (x === state.cx && y === state.cy) return state;
      return { ...state, cx: x, cy: y };
    }
    // --- the ray box ------------------------------------------------------
    // Before the `done` gate below, because a demonstration is not part of the
    // practical: it is as available after the viva as before the first pin, and
    // it moves no mark either way.
    case 'tick':
      return tickSweep(state, action.dt);
    case 'demoOn':
      return edit(state, (d) => demoOn(d, action.on ?? !d.demo.on));
    case 'setAim':
      return edit(state, (d) => {
        d.demo.sweep = 0;
        aimAt(d.demo, action.i, d.n);
        if (!action.quiet) noteAim(d);
      });
    case 'sweep':
      return edit(state, (d) => startSweep(d, action.instant));

    case 'toggleWhite':
      return edit(state, (d) => {
        d.white = !d.white;
        say(
          d,
          d.white
            ? 'White light on. Each colour has its own refractive index — about **1.513 for red, 1.532 for violet** — ' +
                'so each is deviated by a different amount and the single ray opens into a spectrum. That splitting is ' +
                '**dispersion**; the turning of any one colour is **deviation**. This demonstration is not marked.'
            : 'Back to a single narrow ray.',
        );
      });
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
function edit(state: PrismState, fn: (draft: PrismState) => void): PrismState {
  const draft = structuredClone(state);
  fn(draft);
  return draft;
}

function say(d: PrismState, text: RichText, tone: Tone = 'info'): void {
  d.message = { text, tone };
}

function mistake(d: PrismState, now: number, what: string, pts: number): void {
  d.log.push({ t: formatClock(now - d.t0), what, pts });
}

const one = (x: number): string => x.toFixed(1);
const nought = (x: number): string => x.toFixed(0);

function act(
  state: PrismState,
  action: Exclude<
    PrismAction,
    {
      type:
        | 'say'
        | 'moveCross'
        | 'toggleWhite'
        | 'selectRay'
        | 'setProtractor'
        | 'tick'
        | 'demoOn'
        | 'setAim'
        | 'sweep';
    }
  >,
): PrismState {
  switch (action.type) {
    case 'traceOutline':
      return edit(state, (d) => traceOutline(d));

    case 'setTool':
      if (state.tool === action.tool) return state;
      return edit(state, (d) => {
        d.tool = action.tool;
        if (action.tool === 'pin' && d.step === STEP.trace) {
          const t = currentTrial(d);
          say(
            d,
            t.pins.length < 2
              ? `A pin in hand. Fix **P${t.pins.length + 1}** on the paper to the **left** of the prism.`
              : t.pins.length < 4
                ? `A pin in hand. Look through face **AC** and fix **P${t.pins.length + 1}** in line with the two images.`
                : 'All four pins are in — now join them up.',
          );
        }
      });

    case 'placePin':
      return edit(state, (d) => placePin(d, V(action.x, action.y), action.now));

    case 'dragPin':
      return edit(state, (d) => dragPin(d, action.index, V(action.x, action.y)));

    case 'pullPin':
      return edit(state, (d) => pullPin(d, action.index));

    case 'joinPins':
      return edit(state, (d) => joinPins(d, action.now));

    case 'nextRay':
      return edit(state, (d) => nextRay(d));

    case 'reveal':
      return edit(state, (d) => {
        const t = currentTrial(d);
        if (!t.tir) return;
        t.reveal = true;
        say(
          d,
          'Inside the glass the ray struck face AC at more than the critical angle, so none of it got out there: it ' +
            'was reflected off AC and left through the **base**. Nothing was reflected away by choice — the ' +
            'refraction equation simply has no solution when sin r would exceed 1.',
        );
      });

    case 'armMeasure':
      return edit(state, (d) => armMeasure(d, action.k, action.which, true));

    case 'unarm':
      return state.arm === null ? state : { ...state, arm: null };

    case 'commitRead':
      return state.arm === null ? state : edit(state, (d) => commitRead(d, action.deg, action.now));

    case 'pickLeast':
      if (state.graded || state.step !== STEP.concl) return state;
      return { ...state, minPick: clamp(action.k, 0, RAYS - 1), sel: clamp(action.k, 0, RAYS - 1) };

    case 'submitLeast':
      return state.graded || state.minPick === null ? state : edit(state, (d) => submitLeast(d, action.now));

    case 'answerConclusion': {
      const { question, option, now } = action;
      if (!state.graded || state.concl[question] || !CONCLUSIONS[question]) return state;
      return edit(state, (d) => answerConclusion(d, question, option, now));
    }

    case 'answerViva': {
      const { question, option, now } = action;
      if (state.step !== STEP.viva || state.viva[question] || !vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled)[question]) return state;
      return edit(state, (d) => {
        const ok = option === vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled)[question]!.a;
        d.viva[question] = { pick: option, pts: ok ? VIVA_POINTS : 0 };
        if (!ok) mistake(d, now, `Viva: question ${question + 1}`, 0);
        if (d.viva.every(Boolean)) {
          d.done = true;
          d.tEnd = now;
          d.step += 1;
        }
      });
    }

    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled prism action: ${JSON.stringify(exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// The ray box: a demonstration, marked nowhere
// ---------------------------------------------------------------------------

/**
 * The sweep, one clock tick at a time.
 *
 * It rides on the workspace's 10 Hz `tick` rather than on a frame loop of its
 * own, so it stops when a guided tour parks the bench, it cannot outlive the
 * bench that started it, and it stays where the rest of the physics is: in a
 * pure reducer that plain Node can drive. An idle tick returns the SAME state
 * object, so nothing re-renders while the box is still.
 */
function tickSweep(state: PrismState, dt: number): PrismState {
  if (!state.demo.on || !state.demo.sweep) return state;
  return edit(state, (d) => {
    const next = sweepNext(d.demo, dt);
    if (sweepOver(next)) {
      aimAt(d.demo, SWEEP_TO, d.n);
      d.demo.sweep = 0;
      const m = demoMinimum(d.n);
      // Quote the curve from where it actually starts. On glass this dense the
      // ray is still trapped at the foot of the sweep, and D is not a number
      // there — printing a 0° that no one measured would be the one dishonest
      // line on a bench whose whole point is that nothing is scripted.
      const firstOut = firstEmerging(d.n);
      const trapped = firstOut !== null && firstOut > SWEEP_FROM + 0.05;
      const startD = firstOut === null ? null : demoRay(firstOut, d.n).D;
      say(
        d,
        'Sweep finished. ' +
          (trapped
            ? `Nothing came out at all below i = **${one(firstOut)}°** — that far from the normal the ray inside ` +
              `meets the second face beyond the critical angle and is turned back into the glass. From there D fell ` +
              `from **${one(startD ?? 0)}°**, `
            : `D fell from **${one(startD ?? 0)}°** at i = ${SWEEP_FROM}°, `) +
          `bottomed out at **Dm = ${one(m.D)}°** near i = ${nought(m.i)}°, and rose again all the way to ` +
          `${nought(IMAX)}°. **One minimum, and at it i = e** — the symmetric passage. Every other deviation is ` +
          'reached at two different angles of incidence, one on each side of it.',
        'good',
      );
    } else {
      aimAt(d.demo, next, d.n);
    }
  });
}

function demoOn(d: PrismState, on: boolean): void {
  d.demo.on = on;
  if (!on) {
    d.demo.sweep = 0;
    say(d, 'Ray box off — back to the real bench, where all you have is four pins and a pencil.');
    return;
  }
  aimAt(d.demo, d.demo.i, d.n);
  say(
    d,
    '**Ray box on.** The beam, the path inside the glass and the angle of deviation are drawn from the same tracer ' +
      'your own trace is marked against. **A real bench shows you none of this** — the glass is clear and the ray ' +
      'inside it is invisible, which is exactly why the pin method exists. Drag the box round, or use the arrow ' +
      'keys. **Nothing here is marked.**',
  );
}

/**
 * Start or stop the sweep.
 *
 * `instant` is the reduced-motion path: there is no point inviting a student to
 * watch a curve draw itself when their machine has been told not to animate, so
 * the whole range is marked as swept in one go, the box is parked at the
 * minimum, and the message states the result instead of promising a show.
 */
function startSweep(d: PrismState, instant: boolean): void {
  if (!d.demo.on) demoOn(d, true);
  if (d.demo.sweep) {
    d.demo.sweep = 0;
    say(d, `Sweep stopped at **i = ${one(d.demo.i)}°**.`);
    return;
  }
  const m = demoMinimum(d.n);
  if (instant) {
    d.demo.lo = SWEEP_FROM;
    d.demo.hi = SWEEP_TO;
    aimAt(d.demo, m.i, d.n);
    d.demo.seenMin = true;
    say(
      d,
      `Swept. Over i = ${SWEEP_FROM}° to ${nought(SWEEP_TO)}°, D falls to a single minimum of ` +
        `**Dm = ${one(m.D)}°** at **i = ${one(m.i)}°**, where i = e. The whole curve is on the plot and the ray ` +
        'box is parked at that minimum.',
      'good',
    );
    return;
  }
  aimAt(d.demo, SWEEP_FROM, d.n);
  d.demo.sweep = 1;
  say(
    d,
    `Sweeping the ray box round from ${SWEEP_FROM}°. Watch the deviation **fall, bottom out and rise again** — the ` +
      'curve plots itself as the box turns.',
  );
}

/** What the assistant says about wherever the box is now pointing. */
function noteAim(d: PrismState): void {
  const r = demoRay(d.demo.i, d.n);
  if (r.tir) {
    say(
      d,
      `At **i = ${one(d.demo.i)}°** nothing comes out of face AC at all. Inside the glass the ray meets AC at ` +
        `**r₂ = ${one(r.tirAt ? r.tirAt.ang : 0)}°**, past the **critical angle ${one(criticalAngle(d.n))}°**, so it ` +
        'is **totally internally reflected** and leaves through the base.',
      'warn',
    );
    return;
  }
  if (!r.clean) return;
  if (atMinimum(r)) {
    say(
      d,
      `**Minimum deviation.** i = e = **${one(r.i)}°**, r₁ = r₂ = **${one(r.r1!)}°** = A/2, and the ray inside runs ` +
        `**parallel to the base**. D has bottomed out at **Dm = ${one(r.D!)}°**, which gives ` +
        `n = sin((${APEX} + ${one(r.D!)})/2) ÷ sin 30° = **${nFromMinDeviation(r.D!).toFixed(3)}**.`,
      'good',
    );
    return;
  }
  say(
    d,
    `i = **${one(r.i)}°** → r₁ = ${one(r.r1!)}° → r₂ = ${one(r.r2!)}° → e = **${one(r.e!)}°**, so ` +
      `D = i + e − A = **${one(r.D!)}°**. ${
        r.i < demoMinimum(d.n).i
          ? 'Swing it further round and watch D fall.'
          : 'Swing it back and watch D fall towards the minimum.'
      }`,
  );
}

// ---------------------------------------------------------------------------
// Fixing the paper and the prism
// ---------------------------------------------------------------------------

function traceOutline(d: PrismState): void {
  if (d.outline) {
    say(d, 'The outline is already on the paper. Pick up a pin and fix the first two.');
    return;
  }
  d.outline = true;
  say(
    d,
    'Prism pinned down and its outline traced — **A** at the apex, **B** and **C** at the base, the refracting angle ' +
      '**A = 60°**. Now take a pin from the tray.',
    'good',
  );
  advanceIf(d);
}

// ---------------------------------------------------------------------------
// The pin method
// ---------------------------------------------------------------------------

function placePin(d: PrismState, p: Vec, now: number): void {
  const t = currentTrial(d);
  if (d.step !== STEP.trace) return;
  if (!d.outline) {
    say(d, 'Trace the outline of the prism first — without it you cannot mark where the ray met the glass.', 'warn');
    return;
  }
  if (t.traced) {
    say(
      d,
      `Ray ${t.k + 1} is already joined up. ${
        d.trial < RAYS - 1 ? 'Press **Next ray**.' : 'All three rays are traced — now measure the angles.'
      }`,
    );
    return;
  }
  if (t.pins.length >= 4) {
    say(d, 'Four pins are already in for this ray. Join them up, or pull one out.', 'warn');
    return;
  }
  if (!inPaper(p)) {
    say(d, 'That is off the paper.', 'warn');
    return;
  }
  if (insidePrism(p)) {
    say(d, 'You cannot push a pin through the glass — the pins go on the paper around it.', 'warn');
    return;
  }
  const k = t.pins.length;
  if (k < 2 && vdot(vsub(p, FACE.AB.p), FACE.AB.n) <= 4) {
    say(
      d,
      'The first two pins mark the **incident** ray, so they go on the paper in front of face **AB** — to the left of the prism.',
      'warn',
    );
    return;
  }
  if (k >= 2 && vdot(vsub(p, FACE.AC.p), FACE.AC.n) <= 4) {
    say(
      d,
      'You sight the emergent ray through face **AC**, so the last two pins go on the paper beyond that face — to the right of the prism.',
      'warn',
    );
    return;
  }

  t.pins.push(snap(p));
  d.pinsPlaced += 1;
  d.cx = p.x;
  d.cy = p.y;

  if (t.pins.length === 2) {
    afterIncident(d, t, now);
  } else if (t.pins.length === 4) {
    say(d, 'Four pins in. Now **lift the prism** and join the pins with the ruler — that is your trace.');
  } else if (t.pins.length === 3) {
    const close = t.phys && t.phys.exitFace ? vlen(vsub(t.pins[2]!, t.phys.exitPt)) < OUTMIN : false;
    say(
      d,
      'P3 is in. Keep your eye in line with both images and fix **P4** further out — pins at least **3 cm** apart ' +
        `give a much truer line.${close ? ' That pin is rather close to the glass, by the way.' : ''}`,
    );
  } else {
    say(d, 'P1 is in. Fix **P2** at least **3 cm** further along the line you want the ray to take.');
  }
}

/** Pins go in at half a drawing unit, which is as finely as a pin can be stuck. */
const snap = (p: Vec): Vec => V(Math.round(p.x * 2) / 2, Math.round(p.y * 2) / 2);

function dragPin(d: PrismState, index: number, p: Vec): void {
  const t = currentTrial(d);
  if (d.step !== STEP.trace || t.traced || !t.pins[index]) return;
  if (!inPaper(p) || insidePrism(p)) return;
  if (index < 2 && vdot(vsub(p, FACE.AB.p), FACE.AB.n) <= 4) return;
  if (index >= 2 && vdot(vsub(p, FACE.AC.p), FACE.AC.n) <= 4) return;
  t.pins[index] = snap(p);
  d.cx = p.x;
  d.cy = p.y;
  if (index < 2 && t.pins.length >= 2) recomputeIncident(t, d.n);
}

function pullPin(d: PrismState, index: number | null): void {
  const t = currentTrial(d);
  if (d.step !== STEP.trace || t.traced) return;
  const k = index ?? t.pins.length - 1;
  if (k < 0 || !t.pins[k]) return;
  t.pins.splice(k, 1);
  if (t.pins.length < 2) {
    t.P = null;
    t.dinc = null;
    t.phys = null;
    t.i = null;
    t.tir = false;
    t.reveal = false;
    say(d, `Pin pulled. Fix **P${t.pins.length + 1}** where you want the incident ray to run.`);
  } else {
    recomputeIncident(t, d.n);
    say(d, 'Pin pulled — the incident ray has been redrawn through the pins that are left.');
  }
}

/** The line through P1 and P2, produced until it meets the glass. */
function recomputeIncident(t: Trial, n: number): void {
  let d = vnorm(vsub(t.pins[1]!, t.pins[0]!));
  let h = firstHit(t.pins[0]!, d);
  if (!h) {
    const back = firstHit(t.pins[0]!, vmul(d, -1));
    if (back) {
      d = vmul(d, -1);
      h = back;
    }
  }
  if (!h || h.f.id !== 'AB') {
    t.P = null;
    t.dinc = null;
    t.phys = null;
    t.i = null;
    t.tir = false;
    return;
  }
  t.dinc = d;
  t.P = h.pt;
  t.i = angBetween(vmul(d, -1), FACE.AB.n);
  t.phys = trace(t.pins[0]!, d, n);
  t.tir = t.phys.ev.some((e) => e.type === 'tir');
}

function afterIncident(d: PrismState, t: Trial, now: number): void {
  recomputeIncident(t, d.n);
  if (!t.P) {
    say(
      d,
      'The line through those two pins misses face **AB** altogether. Pull a pin and aim the ray at the first face of the prism.',
      'bad',
    );
    return;
  }
  const clash = d.trials.find((x) => x.k !== t.k && x.traced && x.i !== null && Math.abs(x.i - t.i!) < 5);

  if (t.tir) {
    say(
      d,
      'You have drawn the incident ray to P, but looking through face **AC** you can see nothing of the pins — the ' +
        `face looks like a mirror. Inside the glass the ray met AC beyond the **critical angle (${one(
          criticalAngle(d.n),
        )}°)**, so it was **totally internally reflected** and left through the base. Pull these pins and come in at ` +
        'a larger angle to the normal.',
      'bad',
    );
    mistake(d, now, `Ray ${t.k + 1}: total internal reflection at face AC — the angle of incidence was too small`, 0);
  } else if (clash) {
    say(
      d,
      `That ray is at almost the same angle as ray ${clash.k + 1}. The point of the experiment is **three different ` +
        'angles of incidence** — pull a pin and open the angle up by at least 5°.',
      'warn',
    );
  } else {
    say(
      d,
      'Incident ray drawn and produced to **P** on face AB, with the **normal** dashed in blue. Now move your eye to ' +
        'the other side and look through face **AC**: you will see the images of P1 and P2. Fix **P3** and **P4** so ' +
        'all four line up.',
      'good',
    );
  }
}

function joinPins(d: PrismState, now: number): void {
  const t = currentTrial(d);
  if (d.step !== STEP.trace || t.traced || t.pins.length < 4) return;
  if (!t.P || !t.dinc) {
    say(d, 'The incident ray does not even reach the prism — fix that first.', 'bad');
    return;
  }
  if (t.tir) {
    say(
      d,
      'There is no emergent ray through face AC to join to: the light was totally internally reflected. Pull the pins ' +
        'and try a larger angle of incidence.',
      'bad',
    );
    return;
  }
  const other = d.trials.find((x) => x.k !== t.k && x.traced && x.i !== null && Math.abs(x.i - t.i!) < 5);
  if (other) {
    say(
      d,
      `Ray ${other.k + 1} was already at ${nought(other.i!)}° — this one is within 5° of it. Pull a pin and choose a ` +
        'clearly different angle.',
      'warn',
    );
    return;
  }

  let dir = vnorm(vsub(t.pins[3]!, t.pins[2]!));
  // Produced back through the paper, the line of the last two pins must meet
  // the second face; otherwise those pins are not a trace of anything.
  const hit = [isect(t.pins[2]!, dir, FACE.AC, true), isect(t.pins[2]!, vmul(dir, -1), FACE.AC, true)].find(
    (x) => x,
  );
  if (!hit) {
    say(
      d,
      'Produced backwards, the line through P3 and P4 does not meet face **AC** at all. Those pins cannot be a trace ' +
        'of the emergent ray — pull them and sight again.',
      'bad',
    );
    return;
  }

  t.Mp = hit.pt;
  if (vdot(dir, vsub(t.pins[2]!, t.Mp)) < 0) dir = vmul(dir, -1);
  t.demg = dir;
  t.e = angBetween(dir, FACE.AC.n);
  t.D = angBetween(t.dinc, dir);
  t.X = lineLine(t.P, t.dinc, t.Mp, dir);
  t.err = angBetween(dir, t.phys!.exitDir);
  t.pinPts =
    (vlen(vsub(t.pins[0]!, t.pins[1]!)) >= SEP ? PER_RAY.pinsEach : 0) +
    (vlen(vsub(t.pins[2]!, t.pins[3]!)) >= SEP ? PER_RAY.pinsEach : 0);
  t.tracePts = t.err <= 1 ? PER_RAY.trace.within1 : t.err <= 2 ? PER_RAY.trace.within2 : 0;
  t.traced = true;
  d.sel = t.k;
  d.tool = null;

  if (t.pinPts < 2 * PER_RAY.pinsEach) {
    mistake(d, now, `Ray ${t.k + 1}: pins closer than 3 cm — a short base makes the line unreliable`, 3 - t.pinPts);
  }
  if (t.tracePts < PER_RAY.trace.within1) {
    mistake(
      d,
      now,
      `Ray ${t.k + 1}: emergent line ${one(t.err)}° away from the line of the images`,
      PER_RAY.trace.within1 - t.tracePts,
    );
  }

  const good = t.tracePts === PER_RAY.trace.within1 && t.pinPts === 2 * PER_RAY.pinsEach;
  say(
    d,
    'Prism lifted, pins joined. The trace shows the incident ray meeting AB at P, the path inside the glass, and the ' +
      'emergent ray leaving AC at M — clearly turned **towards the base**.' +
      (good
        ? ' Your emergent line sits right on the line of the images.'
        : t.tracePts < PER_RAY.trace.within1
          ? ` Your emergent line is **${one(t.err)}° off** the line the images actually lay on, so every angle you ` +
            'measure from it will be off too.'
          : ' The pins were a little close together, which is where trace errors come from.'),
    good ? 'good' : 'warn',
  );
  advanceIf(d);
}

function nextRay(d: PrismState): void {
  if (d.step !== STEP.trace || d.trial >= RAYS - 1 || !currentTrial(d).traced) return;
  d.trial += 1;
  d.sel = d.trial;
  d.tool = 'pin';
  say(
    d,
    `Ray ${d.trial + 1}. Fix two fresh pins for a **clearly different** angle of incidence — the deviation curve only ` +
      'shows its minimum if your three angles are well spread (try something near 35°, 50° and 65°).',
  );
}

// ---------------------------------------------------------------------------
// The protractor
// ---------------------------------------------------------------------------

/** The next angle still to be read, in ray order. */
export function nextUnread(s: PrismState): { k: number; which: AngleId } | null {
  for (const t of s.trials) {
    for (const which of ANGLE_ORDER) {
      if (t.traced && t.meas[which] === null) return { k: t.k, which };
    }
  }
  return null;
}

function armMeasure(d: PrismState, k: number, which: AngleId, announce: boolean): void {
  const t = d.trials[k];
  if (d.step !== STEP.measure || !t) return;
  if (!t.traced) {
    say(d, 'That ray is not traced yet.', 'warn');
    return;
  }
  if (t.meas[which] !== null) {
    say(d, 'You have already read that angle — the first reading counts, as in the lab.', 'warn');
    return;
  }
  d.arm = { k, which };
  d.prov = 0;
  d.sel = k;
  const g = measureGeometry(d);
  if (!g || !announce) return;
  say(
    d,
    `Protractor placed at **${g.at}**, with its baseline along ${
      which === 'D' ? 'the **produced incident ray**' : 'the **normal**'
    }. Read off where the **${g.rayName}** crosses the scale. Your first reading of each angle counts.`,
  );
}

/**
 * Lay the protractor down for whatever is still unread.
 *
 * Silent on purpose: the assistant's one line belongs to the feedback on the
 * reading just taken, and what the protractor is centred on is written beside
 * the protractor itself, where the student is already looking.
 */
function armNextIfIdle(d: PrismState): void {
  if (d.step !== STEP.measure || d.arm) return;
  const next = nextUnread(d);
  if (next) armMeasure(d, next.k, next.which, false);
}

function commitRead(d: PrismState, raw: number, now: number): void {
  const g = measureGeometry(d);
  if (!g || !d.arm) return;
  const { k, which } = d.arm;
  const t = d.trials[k]!;
  const deg = Math.max(0, Math.min(180, Math.round(raw)));
  const err = Math.abs(deg - g.truth);
  const pts = err <= 1 ? PER_RAY.angle.within1 : err <= 2 ? PER_RAY.angle.within2 : 0;

  t.meas[which] = deg;
  t.mp[which] = pts;
  if (pts < PER_RAY.angle.within1) {
    mistake(
      d,
      now,
      `Ray ${k + 1}: read ${which === 'D' ? 'D' : `∠${which}`} as ${deg}°; your own trace gives ${one(g.truth)}°`,
      PER_RAY.angle.within1 - pts,
    );
  }

  if (t.meas.i !== null && t.meas.e !== null && t.meas.D !== null) {
    const slip = Math.abs(t.meas.D - sumRule(t.meas.i, t.meas.e));
    t.consist = slip <= 2 ? PER_RAY.consist : 0;
    if (!t.consist) {
      mistake(
        d,
        now,
        `Ray ${k + 1}: D = ${t.meas.D}° but i + e − A = ${sumRule(t.meas.i, t.meas.e)}° — the three readings do not agree`,
        PER_RAY.consist,
      );
    }
  }

  d.arm = null;
  const tone: Tone = pts === PER_RAY.angle.within1 ? 'good' : 'warn';
  const checks =
    t.consist && t.meas.i !== null && t.meas.e !== null
      ? ` And your three readings for that ray check out: D = i + e − A = ${t.meas.i} + ${t.meas.e} − ${APEX} = ${sumRule(
          t.meas.i,
          t.meas.e,
        )}°.`
      : '';
  const surface = Math.abs(deg - (90 - g.truth)) <= 2;
  say(
    d,
    pts === PER_RAY.angle.within1
      ? `Recorded **${deg}°**. That is within a degree of the angle on your paper.${checks}`
      : `Recorded **${deg}°**. Your trace actually shows **${one(g.truth)}°** — ${
          surface
            ? 'that looks like the angle from the **surface** rather than from the normal.'
            : 'check you are reading the right scale and from the right baseline.'
        }`,
    tone,
  );

  advanceIf(d);
}

// ---------------------------------------------------------------------------
// The conclusion
// ---------------------------------------------------------------------------

function submitLeast(d: PrismState, now: number): void {
  const rays = measuredRays(d);
  const least = leastDeviationRay(rays);
  if (least === null || d.minPick === null) return;

  const pickOk = d.minPick === least;
  if (!pickOk) {
    mistake(
      d,
      now,
      `Least deviation picked as ray ${d.minPick + 1}; your own table has ray ${least + 1} smallest`,
      CONCL_POINTS.least,
    );
  }
  const Dm = rays[least]!.D!;
  const nEst = nFromMinDeviation(Dm);
  d.result = { least, picked: d.minPick, Dm, nFromDm: +nEst.toFixed(3) };
  d.graded = true;
  d.arm = null;

  say(
    d,
    `Your least deviation was **${Dm}°** on ray ${least + 1}. Put that into n = sin((A + Dm)/2) ÷ sin(A/2): ` +
      `n = sin(${one((APEX + Dm) / 2)}°) ÷ sin(30°) = **${nEst.toFixed(2)}**, against the ${d.n} of this glass — ` +
      (Math.abs(nEst - d.n) < 0.04
        ? 'a good result for three points and a protractor.'
        : 'the gap is your trace and reading error, carried through.') +
      ' The true curve is now drawn on the graph beside your points. Three things to read off it, then the viva.',
    pickOk ? 'good' : 'warn',
  );
}

function answerConclusion(d: PrismState, question: number, option: number, now: number): void {
  const rays = measuredRays(d);
  const key = conclusionKey(question, rays);
  const ok = option === key;
  d.concl[question] = { pick: option, pts: ok ? CONCL_POINTS.question : 0 };
  if (!ok) {
    mistake(
      d,
      now,
      `Conclusion ${question + 1}: you answered “${CONCLUSIONS[question]!.o[option]}”`,
      CONCL_POINTS.question,
    );
  }
  if (d.concl.every(Boolean)) {
    advanceIf(d);
  }
}

// ---------------------------------------------------------------------------
// Moving through the practical
// ---------------------------------------------------------------------------

function advanceIf(d: PrismState): void {
  if (d.step === STEP.fix && d.outline) d.step += 1;

  if (d.step === STEP.trace && d.trials.every((t) => t.traced)) {
    d.step += 1;
    d.tool = null;
    say(
      d,
      'Three rays traced. Now take the **protractor** and measure, on each ray, the angle of incidence **i**, the ' +
        'angle of emergence **e** and the angle of deviation **D** — nine readings.',
      'good',
    );
  }

  if (d.step === STEP.measure && readingsTaken(d) >= READINGS) {
    d.step += 1;
    d.arm = null;
    say(
      d,
      'The table is full and the deviation curve is plotted. Read it: which of your rays was deviated least, and what ' +
        'happened to D as you increased i?',
      'good',
    );
  } else {
    armNextIfIdle(d);
  }

  if (d.step === STEP.concl && d.graded && d.concl.every(Boolean)) {
    d.step += 1;
    say(d, 'Conclusion recorded. Last, the viva — five questions, and your first answer counts.');
  }
}
