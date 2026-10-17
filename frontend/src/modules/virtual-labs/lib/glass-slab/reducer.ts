import { logMistake } from '../marking';
import { vivaPaperFor } from '../viva';
import type { RichText, Tone } from '../types';

import {
  CONCL,
  CONCL_POINTS,
  LATE_OUTLINE_PENALTY,
  VIVA_POINTS,
} from './marking';
import {
  OX,
  PX_CM,
  angleFromReading,
  emergentMissMm,
  inPaper,
  mm,
  protractorReading,
  sightOff,
  traceOf,
  type Vec,
} from './optics';
import { meanIndex, scorePins } from './score';
import { VIVA_BANK } from './viva-bank';
import {
  RAY_LIMIT,
  SLAB_CHOICES,
  currentTrial,
  newTrial,
  nextTrialIndex,
  protractorPose,
  setupDone,
  slabLocked,
  traceOfCurrent,
  trialDone,
  type AngleKey,
  type GlassSlabState,
  type ToolId,
  type Trial,
} from './state';

/**
 * Everything that can happen at this bench.
 *
 * Every action that depends on time carries `now` (ms since epoch), stamped by
 * the event handler that dispatches it, so the same state and action always
 * give the same result and the engine can be driven from plain Node.
 *
 * The crosshair is the one gesture the sheet has: `aim` moves it — with a
 * pointer or with the arrow keys, it makes no difference here — and `useTool`
 * applies whatever is in the student's hand at that point.
 */
export type GlassSlabAction =
  | { type: 'pickUp'; tool: ToolId }
  | { type: 'putDown' }
  | { type: 'aim'; at: Vec }
  | { type: 'useTool'; at: Vec; now: number }
  /** Lay the protractor's sight line on the scale, from a point on it. */
  | { type: 'aimProtractor'; at: Vec }
  /** Nudge the sight line by whole degrees, for the keyboard. */
  | { type: 'nudgeProtractor'; by: number }
  /** Draw the incident ray, or write down the angle the sight line reads. */
  | { type: 'commitProtractor'; now: number }
  | { type: 'measure'; which: AngleKey }
  | { type: 'pullPin' }
  | { type: 'join'; now: number }
  | { type: 'selectTrial'; k: number }
  /**
   * Draw the path the light really takes, or stop drawing it. `on` is explicit
   * so the bench bar's switch and the drawing can never disagree; omitted, it
   * toggles, for a caller that only has the one gesture.
   */
  | { type: 'reveal'; on?: boolean }
  /** Swing the teaching view's ray box, in signed degrees from the normal. */
  | { type: 'aimRay'; deg: number }
  /** Draw every finished trace together, or go back to one at a time. */
  | { type: 'showAll'; on?: boolean }
  /** Take a different slab out of the cupboard, while nothing is drawn yet. */
  | { type: 'setSlabThickness'; cm: number }
  | { type: 'answerConclusion'; question: number; option: number; now: number }
  | { type: 'answerViva'; question: number; option: number; now: number }
  | { type: 'say'; text: RichText; tone: Tone };

export function glassSlabReducer(state: GlassSlabState, action: GlassSlabAction): GlassSlabState {
  switch (action.type) {
    case 'say':
      return { ...state, message: { text: action.text, tone: action.tone } };
    // The teaching view, before the `done` gate below. It is not part of the
    // practical: it takes no reading, logs no slip and moves no mark, so it is
    // as available after the viva — when the whole trace is worth looking at —
    // as it is before the first pin.
    case 'reveal': {
      const on = action.on ?? !state.reveal;
      if (on === state.reveal) return state;
      return edit(state, (d) => {
        d.reveal = on;
        // One picture at a time: the light path is one ray of this student's
        // choosing, the comparison is three traces they have already made, and
        // drawn together they are simply illegible.
        if (on) d.showAll = false;
        say(
          d,
          on
            ? 'Teaching view on. This is the path the light really takes, worked out from **Snell’s law at both ' +
                'faces** — **drag the ray box** across the paper, or use the slider, and watch ∠r and the shift ' +
                '**d** follow. In a real lab you would see none of it, and **none of it is marked**.'
            : 'Teaching view off. Back to what a real bench shows you: a slab, a sheet of paper, and four pins to ' +
                'find the ray with.',
        );
      });
    }
    // The ray box is aimed at 60 Hz while it is dragged, so this stays as cheap
    // as moving the crosshair: no clone, no message, nothing logged.
    case 'aimRay': {
      const deg = Math.max(-RAY_LIMIT, Math.min(RAY_LIMIT, +action.deg.toFixed(2)));
      return deg === state.rayA ? state : { ...state, rayA: deg };
    }
    case 'showAll': {
      const on = action.on ?? !state.showAll;
      if (on === state.showAll) return state;
      return edit(state, (d) => {
        d.showAll = on;
        if (on) d.reveal = false;
        say(
          d,
          on
            ? 'All your finished traces are drawn together, one colour each. Look along them: every emergent ray ' +
                'runs **parallel** to its own incident ray, and the sideways shift **d** gets bigger as ∠i gets ' +
                'bigger.'
            : 'Back to one trace at a time.',
        );
      });
    }
    /**
     * Swapping the slab. Before the first pencil line this is choosing which
     * slab to work with, which is a real thing to do and changes no mark:
     * every angle comes from the two faces being parallel, and the thickness
     * appears only in d = t·sin(i − r)/cos r, which nothing is marked on.
     * `slabLocked` closes it the moment the outline or a pin fixes the trace to
     * the slab it was drawn round.
     */
    case 'setSlabThickness': {
      const cm = SLAB_CHOICES.find((c) => Math.abs(c - action.cm) < 1e-6);
      if (cm === undefined || slabLocked(state) || Math.abs(state.slab.t - cm * PX_CM) < 1e-6) {
        return state;
      }
      return edit(state, (d) => {
        d.slab = { ...d.slab, t: cm * PX_CM };
        say(
          d,
          `Slab swapped for a **${cm.toFixed(1)} cm** one. d = t·sin(i − r)/cos r, so the thickness scales the ` +
            'sideways shift directly — same angles, more displacement.',
        );
      });
    }
    default:
      // Nothing is marked after the viva; the sheet stays exactly as it is.
      if (state.done) return state;
      return act(state, action);
  }
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

/** Clone, mutate the clone, return it. The given state is never touched. */
function edit(state: GlassSlabState, fn: (draft: GlassSlabState) => void): GlassSlabState {
  const draft = structuredClone(state);
  fn(draft);
  return draft;
}

function say(d: GlassSlabState, text: RichText, tone: Tone = 'info'): void {
  d.message = { text, tone };
}

function mistake(d: GlassSlabState, now: number, what: string, pts = 0): void {
  logMistake(d.log, { now, t0: d.t0, what, pts });
}

function here(d: GlassSlabState): Trial {
  return d.trials[d.trial] ?? newTrial(0);
}

const ANGLE_NAMES: Record<AngleKey, string> = {
  i: 'angle of incidence',
  r: 'angle of refraction',
  e: 'angle of emergence',
};

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

function placeSlab(d: GlassSlabState): void {
  if (d.slabOn) {
    say(d, 'The slab is already on the paper.');
    return;
  }
  d.slabOn = true;
  d.held = null;
  say(
    d,
    'The slab is squared on the paper. Now take the **pencil** and trace round it — that outline is the only record ' +
      'of where the faces were once the slab is lifted off.',
    'good',
  );
}

function usePencil(d: GlassSlabState, at: Vec, now: number): void {
  if (!d.slabOn) {
    say(d, 'Put the **glass slab** on the paper first.', 'warn');
    return;
  }
  if (!d.outline) {
    d.outline = true;
    if (d.trials.some((t) => t.pins.length)) {
      d.setupDed = LATE_OUTLINE_PENALTY;
      mistake(d, now, 'Outline traced after the pins were already in', LATE_OUTLINE_PENALTY);
    }
    say(
      d,
      'Outline traced, **ABCD**. Now mark the **point of incidence O** on the upper face AB and draw the normal ' +
        'through it — tap the upper face with the pencil.',
      'good',
    );
    return;
  }
  if (!d.origin) {
    if (Math.abs(at.y - d.slab.y) > 26) {
      say(
        d,
        'The point of incidence goes on the **upper face AB**, where the light will meet the glass. Tap closer to ' +
          'that edge.',
        'warn',
      );
      return;
    }
    d.origin = true;
    say(
      d,
      'O is marked at the middle of AB and the **normal NN′** is drawn through it, dashed and perpendicular to the ' +
        'face. Every angle in this experiment is measured from that normal.',
      'good',
    );
    return;
  }
  say(d, 'The outline and the normal are already drawn.');
}

function placePin(d: GlassSlabState, at: Vec, now: number): void {
  const tr = here(d);
  if (!setupDone(d)) {
    say(d, 'Finish the setup first: slab on the paper, outline traced, O and the normal drawn.', 'warn');
    return;
  }
  if (tr.joined) {
    say(d, 'This trace is finished. Switch to another trial, or measure the angles.');
    return;
  }
  if (tr.drawn === null) {
    say(
      d,
      `Draw the incident ray first: pick up the **protractor**, lay its centre on **O** and mark the direction ` +
        `**${tr.target}°** from the normal.`,
      'warn',
    );
    return;
  }
  if (!inPaper(at)) {
    say(d, 'That is off the sheet.', 'warn');
    return;
  }

  const n = tr.pins.length;
  const first = tr.pins[0];
  const third = tr.pins[2];
  if (n < 2) {
    if (at.y > d.slab.y - 12) {
      say(
        d,
        'P₁ and P₂ go on the **incident ray**, on the near side of the slab — above the upper face.',
        'warn',
      );
      return;
    }
    if (n === 1 && first && Math.abs(at.y - first.y) < 34) {
      say(
        d,
        'Those two pins are almost level. Keep them well apart along the ray, or the line you draw through them ' +
          'will be badly out.',
        'warn',
      );
      return;
    }
  } else {
    if (at.y < d.slab.y + d.slab.t + 12) {
      say(
        d,
        'P₃ and P₄ go on the **far side** of the slab, below the lower face — that is where you look through the ' +
          'glass from.',
        'warn',
      );
      return;
    }
    if (!traceOf(tr, d.slab).real) {
      say(d, 'Stick P₁ and P₂ in first.', 'warn');
      return;
    }
    if (n === 3 && third && Math.abs(at.y - third.y) < 34) {
      say(
        d,
        'P₃ and P₄ are almost level with each other. Spread them out — two close pins fix a direction very poorly.',
        'warn',
      );
      return;
    }
  }

  tr.pins.push({ x: +at.x.toFixed(2), y: +at.y.toFixed(2) });
  const m = tr.pins.length;

  if (m === 1) {
    say(d, 'P₁ is in. Put **P₂** further along the same drawn line, a few centimetres away.');
    return;
  }
  if (m === 2) {
    const o = traceOf(tr, d.slab);
    if (!o.inc || o.inc.O.x < d.slab.x + 12 || o.inc.O.x > d.slab.x + d.slab.w - 12) {
      say(
        d,
        'Careful — the line through your two pins misses the slab. Pull a pin out and put it back on the drawn ray.',
        'bad',
      );
      return;
    }
    say(
      d,
      'Both incident pins are in. Now go round to the **far side** and look through the glass: you will see P₁ and ' +
        'P₂ through it. Put **P₃** where it lines up with those images — the **sighting view** beside the task tells ' +
        'you how close you are.',
      'good',
    );
    return;
  }
  if (m === 3) {
    say(d, 'P₃ is in. Put **P₄** further from the slab, still in line with P₃ and the two images.');
    return;
  }

  const worst = emergentMissMm(tr, d.slab) ?? 0;
  const p3off = Math.abs(sightOff(tr, d.slab, tr.pins[2] ?? at) ?? 0) / mm(1);
  const p4off = Math.abs(sightOff(tr, d.slab, tr.pins[3] ?? at) ?? 0) / mm(1);
  say(
    d,
    `All four pins are in. ${
      worst <= 1
        ? 'They line up well.'
        : `P₃ is ${p3off.toFixed(1)} mm and P₄ ${p4off.toFixed(1)} mm off the line the light really takes — you can ` +
          'still pull them out and sight again.'
    } When you are happy, **lift the slab off and join the points**.`,
    worst <= 1 ? 'good' : 'warn',
  );
}

function placeProtractor(d: GlassSlabState, at: Vec): void {
  if (!d.origin) {
    say(d, 'Mark the point of incidence **O** first, with the pencil.', 'warn');
    return;
  }
  const o = traceOfCurrent(d);
  const atO = { x: o.inc ? o.inc.O.x : OX, y: d.slab.y };
  const atE = o.emg ? o.emg.O2 : null;
  const dO = Math.hypot(at.x - atO.x, at.y - atO.y);
  const dE = atE ? Math.hypot(at.x - atE.x, at.y - atE.y) : Number.POSITIVE_INFINITY;
  if (Math.min(dO, dE) > 70) {
    say(
      d,
      'Lay the **centre of the protractor** on the point you are measuring from — **O** on the upper face, or **O′** ' +
        'where the ray leaves the lower face.',
      'warn',
    );
    return;
  }
  d.prot = dO <= dE ? 'O' : 'E';
  d.protAim = null;
  d.held = null;
  say(
    d,
    d.prot === 'O'
      ? 'Protractor on **O**, its straight edge along the face. The normal is the 90° mark, so an angle from the ' +
        'normal is **90° minus the scale reading**. Lay the sight line where the ray crosses the scale — the ' +
        'magnified view beside the task shows every degree.'
      : 'Protractor on **O′**, along the lower face. Read where the emergent ray crosses the scale; the angle from ' +
        'the normal is **90° minus that reading**.',
  );
}

function useRuler(d: GlassSlabState): void {
  const tr = here(d);
  const o = traceOfCurrent(d);
  if (!tr.joined || !o.emg || o.lat === null) {
    say(d, 'Join the points first — there is nothing to measure yet.', 'warn');
    return;
  }
  tr.lat = +(o.lat / PX_CM).toFixed(1);
  d.held = null;
  say(
    d,
    `Perpendicular distance between the emergent ray and the incident ray produced: **${tr.lat.toFixed(1)} cm**. ` +
      'That is the **lateral displacement** — the ray comes out going the same way, just shifted sideways.',
    'good',
  );
}

// ---------------------------------------------------------------------------
// The protractor
// ---------------------------------------------------------------------------

function drawIncident(d: GlassSlabState, reading: number, now: number): void {
  const tr = here(d);
  const ang = angleFromReading(reading);
  if (reading === 90) {
    say(
      d,
      'That is along the normal itself — 0° of incidence. Pick a direction to one side of the 90° mark.',
      'warn',
    );
    return;
  }
  if (ang > 75) {
    say(
      d,
      'That is a very slanting ray; keep the angle of incidence below about 70° so the trace stays on the sheet.',
      'warn',
    );
    return;
  }
  if (Math.abs(ang - tr.target) > 2) {
    tr.tries += 1;
    mistake(d, now, `Trial ${tr.k + 1}: incident ray set at ${ang}° instead of ${tr.target}°`);
    say(
      d,
      `That direction is **${ang}°** from the normal. This trial wants **${tr.target}°** — the normal is the 90° ` +
        `mark, so set the sight line to **${90 + tr.target}°** (or ${90 - tr.target}° for a ray from the other ` +
        'side) and draw the line from O through it.',
      'warn',
    );
    return;
  }
  tr.drawn = reading;
  tr.pins = [];
  d.prot = null;
  d.protAim = null;
  say(
    d,
    `Incident ray drawn at **${ang}°** to the normal. Now take a **pin** and stick **P₁** and **P₂** anywhere along ` +
      'that line, well apart.',
    'good',
  );
}

function recordAngle(d: GlassSlabState, which: AngleKey, reading: number, now: number): void {
  const tr = here(d);
  const o = traceOfCurrent(d);
  if (!o.ang) return;
  const truth = o.ang[which];
  const ang = angleFromReading(reading);
  tr.meas[which] = ang;
  const err = Math.abs(ang - truth);
  if (err > 2) {
    mistake(
      d,
      now,
      `Trial ${tr.k + 1}: ∠${which} read as ${ang}°, your own trace shows ${truth.toFixed(1)}°`,
    );
  }

  const next = (['i', 'r', 'e'] as const).find((k) => tr.meas[k] === null) ?? null;
  d.pending = next;
  if (!next) {
    d.prot = null;
    d.protAim = null;
  }

  const onward = next
    ? ` Next: **∠${next}**${
        next === 'r'
          ? ' — turn the protractor over at O so its scale lies over the glass'
          : next === 'e'
            ? ', with the protractor on O′'
            : ''
      }.`
    : ` All three angles are down for this trace.${
        tr.lat === null ? ' Take the **ruler** and measure the lateral displacement too' : ''
      }${
        nextTrialIndex(d) >= 0
          ? `, then go on to the **${d.trials[nextTrialIndex(d)]?.target ?? 0}°** trace`
          : ', then interpret the table'
      }.`;

  say(
    d,
    `Scale reading ${reading}°, so the **${ANGLE_NAMES[which]}** is 90 − ${reading} = **${ang}°**. ${
      err <= 2
        ? 'That matches your trace.'
        : `Your drawing actually makes **${truth.toFixed(1)}°** there — look again at where the ray crosses the scale.`
    }${onward}`,
    err <= 2 ? 'good' : 'warn',
  );
}

function commitProtractor(d: GlassSlabState, now: number): void {
  const pose = protractorPose(d);
  const reading = d.protAim;
  if (!pose || reading === null) {
    say(d, 'Lay the sight line out on the **scale**, where the ray crosses it — not at the centre.', 'warn');
    return;
  }
  const tr = here(d);
  if (!tr.joined) {
    drawIncident(d, reading, now);
    return;
  }
  if (!d.pending) {
    say(d, 'Say which angle you are measuring first — ∠i, ∠r or ∠e.', 'warn');
    return;
  }
  const wantAtO = d.pending !== 'e';
  if (wantAtO !== (d.prot === 'O')) {
    say(
      d,
      d.pending === 'e'
        ? '∠e is the angle the ray makes as it **leaves** the slab. Put the protractor on **O′**, on the lower face.'
        : `∠${d.pending} is measured at the **point of incidence O**, on the upper face. Move the protractor there.`,
      'warn',
    );
    return;
  }
  recordAngle(d, d.pending, reading, now);
}

// ---------------------------------------------------------------------------
// Joining the points
// ---------------------------------------------------------------------------

function joinPoints(d: GlassSlabState, now: number): void {
  const tr = here(d);
  const o = traceOf(tr, d.slab);
  if (tr.pins.length < 4 || tr.joined) return;
  if (!o.emg) {
    say(d, 'Those pins do not give a usable line.', 'warn');
    return;
  }
  if (o.emg.O2.x < d.slab.x + 4 || o.emg.O2.x > d.slab.x + d.slab.w - 4) {
    say(
      d,
      'The line through P₃ and P₄ leaves the outline past its corner — that cannot be the emergent ray. Pull the ' +
        'pins out and sight again.',
      'bad',
    );
    return;
  }

  tr.joined = true;
  d.prot = null;
  d.protAim = null;
  d.pending = 'i';
  const marks = scorePins(tr, d.slab);
  tr.pinPts = marks;
  if (marks.inc < 2) {
    mistake(
      d,
      now,
      `Trial ${tr.k + 1}: incident pins ${marks.offInc.toFixed(1)} mm off the ray you drew`,
      +(2 - marks.inc).toFixed(2),
    );
  }
  if (marks.emg < 3) {
    mistake(
      d,
      now,
      `Trial ${tr.k + 1}: emergent pins ${marks.offEmg.toFixed(1)} mm off the line of sight`,
      +(3 - marks.emg).toFixed(2),
    );
  }

  const lined = (emergentMissMm(tr, d.slab) ?? 0) <= 1;
  say(
    d,
    'Slab lifted off. P₁P₂ produced meets AB at **O**, P₃P₄ produced back meets DC at **O′**, and joining O to O′ ' +
      `gives the ray inside the glass. ${
        lined
          ? 'Your four pins were in line, so this trace is the real path.'
          : 'Your last two pins were off the line, so this trace is not quite the path the light took — the angles ' +
            'will show it.'
      } Now measure **∠i**, **∠r** and **∠e** with the protractor.`,
    lined ? 'good' : 'warn',
  );
}

// ---------------------------------------------------------------------------
// Interpretation and viva
// ---------------------------------------------------------------------------

/** Mean of (∠e − ∠i) over the traces that have both angles down. */
export function meanEminusI(s: GlassSlabState): number {
  const d = s.trials
    .filter((t) => t.meas.i !== null && t.meas.e !== null)
    .map((t) => (t.meas.e ?? 0) - (t.meas.i ?? 0));
  return d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0;
}

/**
 * The option that is right for THIS student.
 *
 * The first statement is marked against their own three rows, not the textbook:
 * a student whose pins were out really did measure ∠e larger than ∠i, and the
 * honest reading of their own table is the answer that earns the marks.
 */
export function conclusionAnswer(s: GlassSlabState, question: number): number {
  const c = CONCL[question];
  if (!c) return 0;
  if (!c.own) return c.a ?? 0;
  const mean = meanEminusI(s);
  return mean > 3 ? 0 : mean < -3 ? 2 : 1;
}

function answerConclusion(d: GlassSlabState, question: number, option: number, now: number): void {
  const c = CONCL[question];
  if (!c || d.concl[question]) return;
  const a = conclusionAnswer(d, question);
  const ok = option === a;
  const mean = meanEminusI(d);
  const why = c.own
    ? `Your own rows give a mean ∠e − ∠i of **${mean >= 0 ? '+' : ''}${mean.toFixed(1)}°**. ${c.why}`
    : c.why;
  d.concl[question] = { pick: option, a, pts: ok ? CONCL_POINTS : 0, why };
  if (!ok) mistake(d, now, `Interpretation ${question + 1} answered wrongly`);

  if (d.concl.every(Boolean)) {
    const n = meanIndex(d);
    say(
      d,
      `Interpretation done. Your three traces give a mean **sin i / sin r = ${
        n === null ? '—' : n.toFixed(2)
      }** against the slab’s real **n = 1.50**. Last part: the viva.`,
      n !== null && Math.abs(n - 1.5) <= 0.05 ? 'good' : 'warn',
    );
  }
}

// ---------------------------------------------------------------------------
// The bench's one dispatch table
// ---------------------------------------------------------------------------

function act(
  state: GlassSlabState,
  action: Exclude<
    GlassSlabAction,
    { type: 'say' | 'reveal' | 'aimRay' | 'showAll' | 'setSlabThickness' }
  >,
): GlassSlabState {
  switch (action.type) {
    case 'pickUp':
      return edit(state, (d) => {
        if (d.held === action.tool) {
          d.held = null;
          return;
        }
        if (action.tool === 'slab' && d.slabOn) {
          say(d, 'The slab is already on the paper.');
          return;
        }
        d.held = action.tool;
        d.pickUps += 1;
      });

    case 'putDown':
      return state.held === null ? state : { ...state, held: null };

    case 'aim':
      return state.cross.x === action.at.x && state.cross.y === action.at.y
        ? state
        : { ...state, cross: action.at };

    case 'useTool':
      return edit(state, (d) => {
        d.cross = action.at;
        if (!d.held) {
          say(
            d,
            'Pick a tool up first — the slab, a pin, the pencil, the protractor or the ruler, from the tray at the ' +
              'top of the board.',
          );
          return;
        }
        if (d.held === 'slab') placeSlab(d);
        else if (d.held === 'pencil') usePencil(d, action.at, action.now);
        else if (d.held === 'pin') placePin(d, action.at, action.now);
        else if (d.held === 'protractor') placeProtractor(d, action.at);
        else useRuler(d);
      });

    case 'aimProtractor': {
      const pose = protractorPose(state);
      if (!pose) return state;
      const reading = protractorReading(pose.c, pose.up, action.at);
      return reading === null || reading === state.protAim ? state : { ...state, protAim: reading };
    }

    case 'nudgeProtractor': {
      if (!state.prot) return state;
      const from = state.protAim ?? 90;
      const next = Math.max(0, Math.min(180, from + action.by));
      return next === state.protAim ? state : { ...state, protAim: next };
    }

    case 'commitProtractor':
      return edit(state, (d) => commitProtractor(d, action.now));

    case 'measure': {
      const tr = currentTrial(state);
      if (!tr.joined) return state;
      return edit(state, (d) => {
        d.pending = action.which;
        say(
          d,
          `Measuring **∠${action.which}**. Lay the protractor on **${
            action.which === 'e' ? 'O′, along the lower face' : 'O, along the upper face'
          }**${
            action.which === 'r' ? ' **turned over**, so its scale lies on the glass side' : ''
          }, and set the sight line where the ray crosses the scale.`,
        );
      });
    }

    case 'pullPin': {
      const tr = currentTrial(state);
      if (!tr.pins.length || tr.joined) return state;
      return edit(state, (d) => {
        here(d).pins.pop();
        say(d, 'Pin pulled out. Sight again and put it back.');
      });
    }

    case 'join':
      return edit(state, (d) => joinPoints(d, action.now));

    case 'selectTrial': {
      const t = state.trials[action.k];
      if (!t || action.k === state.trial) return state;
      return edit(state, (d) => {
        d.trial = action.k;
        d.prot = null;
        d.protAim = null;
        d.pending = t.joined ? 'i' : null;
        if (!t.joined && t.drawn === null) {
          say(
            d,
            `The slab goes back inside the outline ABCD and a fresh trace begins at **${t.target}°**. Draw the new ` +
              'incident ray with the protractor at O.',
          );
        }
      });
    }

    case 'answerConclusion':
      return edit(state, (d) => answerConclusion(d, action.question, action.option, action.now));

    case 'answerViva': {
      const q = vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled)[action.question];
      if (!q || state.viva[action.question]) return state;
      return edit(state, (d) => {
        const ok = action.option === q.a;
        d.viva[action.question] = { pick: action.option, pts: ok ? VIVA_POINTS : 0 };
        if (!ok) mistake(d, action.now, `Viva: question ${action.question + 1}`);
        if (d.viva.every(Boolean)) {
          d.done = true;
          d.tEnd = action.now;
        }
      });
    }

    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled glass slab action: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Whether the trace on the board is finished, for the console's buttons. */
export const currentTrialDone = (s: GlassSlabState): boolean => trialDone(currentTrial(s));
