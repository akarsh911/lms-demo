import { VIVA_BANK } from './viva-bank';
import { logMistake } from '../marking';
import { vivaPaperFor } from '../viva';
import { clamp } from '../numbers';
import type { RichText, Tone } from '../types';

import {
  CONCLUSION,
  CONCL_POINTS,
  CRACK_PENALTY,
  DARK_MOUNT_PENALTY,
  HIGH_MOUNT_PENALTY,
  LABEL_MARKS,
  ORGANISM_MARKS,
  PER_SLIDE_TABLE_MARKS,
  PROCESS_MARKS,
  SEEN_MARKS,
  STEP,
  VIVA_POINTS,
} from './marking';
import {
  COARSE,
  FINE,
  H_MAX,
  LAMPS,
  MOVE_STEP,
  clearance,
  crashHeight,
  totalMagnification,
  type Objective,
} from './optics';
import {
  FEATURE_TEXT,
  SPECIMEN_BY_ID,
  type FeatureId,
  type Organism,
  type Process,
  type SpecimenId,
} from './specimens';
import {
  canLabel,
  locked,
  mountedSlide,
  nextUnlabelled,
  specimenOf,
  trayFull,
  viewThrough,
  type CellDivisionState,
  type TraySlide,
} from './state';

/**
 * Everything that can happen at this bench.
 *
 * Every action that depends on time carries `now` (ms since epoch), stamped by
 * the event handler that dispatches it, so the same state and action always
 * give the same result and the engine can be driven from plain Node.
 */
export type CellDivisionAction =
  /** Clip a slide to the stage, or take it off again by tapping the same one. */
  | { type: 'mountSlide'; index: number; now: number }
  | { type: 'takeOff'; now: number }
  | { type: 'rack'; knob: 'coarse' | 'fine'; dir: 1 | -1; now: number }
  | { type: 'setObjective'; objective: Objective; now: number }
  | { type: 'moveStage'; dir: 'l' | 'r' | 'u' | 'd' }
  /** Dragging the image itself: the field follows the hand. */
  | { type: 'panStage'; x: number; y: number }
  | { type: 'cycleLamp' }
  | { type: 'setIdentity'; field: 'organism'; value: Organism | '' }
  | { type: 'setIdentity'; field: 'process'; value: Process | '' }
  /** One tap on the reference plate: the organism and the process together. */
  | { type: 'identifyAs'; specimen: SpecimenId }
  | { type: 'selectPin'; pin: number }
  | { type: 'setLabel'; pin: number; part: string }
  | { type: 'selectRow'; index: number }
  | { type: 'setSeen'; index: number; feature: FeatureId }
  | { type: 'submitTable'; now: number }
  | { type: 'answerConclusion'; question: number; option: number; now: number }
  | { type: 'answerViva'; question: number; option: number; now: number }
  | { type: 'say'; text: RichText; tone: Tone };

export function cellDivisionReducer(
  state: CellDivisionState,
  action: CellDivisionAction,
): CellDivisionState {
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
function edit(state: CellDivisionState, fn: (draft: CellDivisionState) => void): CellDivisionState {
  const draft = structuredClone(state);
  fn(draft);
  return draft;
}

function say(d: CellDivisionState, text: RichText, tone: Tone = 'info'): void {
  d.message = { text, tone };
}

function mistake(d: CellDivisionState, now: number, what: string, pts = 0): void {
  logMistake(d.log, { now, t0: d.t0, what, pts });
}

/**
 * The best view of this slide the student ever managed at high power.
 *
 * Recorded after every touch of the instrument rather than at some moment of
 * submission, because focusing is a hunt: the sharp view exists for a fraction
 * of a turn and is gone again. What is marked is that they FOUND it.
 */
function noteBest(d: CellDivisionState): void {
  const slide = mountedSlide(d);
  if (!slide || slide.broken || d.objective !== 40) return;
  const q = viewThrough(d).q;
  if (q > slide.best) slide.best = q;
}

/** Advance out of the two steps that complete themselves. */
function progress(d: CellDivisionState): void {
  if (d.step === STEP.setup && d.lamp > 0 && d.objective === 10) {
    d.step = STEP.slides;
    say(
      d,
      'Lamp on and the low-power objective in place. Now take a slide from the box, clip it to the stage, and find the ' +
        'specimen at **10×** before you go anywhere near the 40×.',
      'good',
    );
    return;
  }
  if (d.step === STEP.slides && trayFull(d)) {
    d.step = STEP.record;
    d.row = 0;
    say(
      d,
      'All six slides examined. Write up the observation table: the organism, the process and **what you actually ' +
        'saw** in the field.',
      'good',
    );
  }
}

// ---------------------------------------------------------------------------
// Hands on the instrument
// ---------------------------------------------------------------------------

function breakSlide(d: CellDivisionState, now: number): void {
  const slide = mountedSlide(d);
  if (!slide || slide.broken) return;
  slide.broken = true;
  d.mounted = null;
  mistake(d, now, `Slide ${slide.n} cracked — the ${d.objective}× objective was racked down onto it`, CRACK_PENALTY);
  say(
    d,
    `**Crack.** The ${d.objective}× objective came down onto slide ${slide.n} and broke the coverslip. This is why you ` +
      'rack **down** while watching the objective from the side, and only ever focus **upwards**, away from the slide, ' +
      'while looking through the eyepiece. There is no spare of that slide.',
    'bad',
  );
}

function mount(d: CellDivisionState, index: number, now: number): void {
  if (locked(d)) {
    say(d, 'Your observations are already marked — the slides stay in the box.');
    return;
  }
  const slide = d.tray[index];
  if (!slide) return;

  if (d.mounted === index) {
    d.mounted = null;
    d.pos = { x: 0, y: 0 };
    say(d, 'Slide off the stage and back in the box.');
    return;
  }
  if (slide.broken) {
    say(d, `Slide ${slide.n} is cracked — the technician has no spare. Move on to the next one.`, 'warn');
    return;
  }
  if (clearance(d.objective, d.h) < 8) {
    say(
      d,
      'There is no room to get a slide in under the objective. Rack the body tube **up** first — and swing the **10×** ' +
        'back in before you do.',
      'warn',
    );
    return;
  }

  if (d.lamp === 0 && !d.flags.darkMount) {
    d.flags.darkMount = true;
    mistake(d, now, 'A slide went on the stage with the lamp still off', DARK_MOUNT_PENALTY);
  }
  if (d.objective === 40 && !d.flags.highMount) {
    d.flags.highMount = true;
    mistake(d, now, 'A slide went on the stage with the 40× objective already swung in', HIGH_MOUNT_PENALTY);
  }

  d.mounted = index;
  d.mounts += 1;
  d.pos = { x: 0, y: 0 };
  d.pin = nextUnlabelled(slide, 0);
  say(
    d,
    `Slide ${slide.n} clipped to the stage. Nothing is centred yet — find the specimen at **10×**, then swing in the ` +
      '40×.' + (d.lamp === 0 ? ' **The lamp is off**, so the field is dark.' : ''),
    d.lamp === 0 ? 'warn' : 'info',
  );
}

function rack(d: CellDivisionState, knob: 'coarse' | 'fine', dir: 1 | -1, now: number): void {
  if (locked(d)) return;
  const step = knob === 'coarse' ? COARSE : FINE;
  const limit = crashHeight(d.objective);
  const wanted = d.h + dir * step;

  if (wanted > limit) {
    d.h = limit;
    if (mountedSlide(d)) breakSlide(d, now);
    else say(d, 'The objective is touching the stage — it will not go any lower.', 'warn');
    return;
  }

  d.h = clamp(wanted, 0, H_MAX);
  const gap = clearance(d.objective, d.h);
  if (d.objective === 40 && knob === 'coarse' && dir > 0 && gap < 26 && !d.warned.coarse40) {
    d.warned.coarse40 = true;
    say(
      d,
      'Careful — that is the **coarse** adjustment at 40×, and the objective is close to the slide. At high power use ' +
        'the **fine** adjustment only.',
      'warn',
    );
  } else if (gap <= 6 && mountedSlide(d) && !d.warned.close) {
    d.warned.close = true;
    say(
      d,
      'The objective is almost touching the slide. One more turn of the coarse knob and the coverslip goes.',
      'warn',
    );
  }
}

function setObjective(d: CellDivisionState, objective: Objective, now: number): void {
  if (locked(d) || d.objective === objective) return;

  if (d.h > crashHeight(objective)) {
    d.objective = objective;
    d.h = crashHeight(objective);
    if (mountedSlide(d)) breakSlide(d, now);
    else say(d, 'The objective hit the stage as it swung in.', 'warn');
    return;
  }

  d.objective = objective;
  if (objective === 40) {
    const v = viewThrough(d);
    say(
      d,
      v.none
        ? 'The 40× objective is in. It has a much narrower field, so always find and centre the specimen at 10× first.'
        : v.f === 0
          ? 'The 40× field is about a quarter as wide as the 10× field, and there is **nothing in it**. Go back to 10×, ' +
            'centre the specimen, then swing the 40× back in.'
          : 'The 40× is in. It is also much shallower — the specimen goes out of focus in a fraction of a turn, so use ' +
            'the **fine** adjustment now.',
      !v.none && v.f === 0 ? 'warn' : 'info',
    );
  } else {
    say(d, 'Back to 10×: a wide field and plenty of depth. Use the coarse adjustment here.');
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Identifying and labelling
// ---------------------------------------------------------------------------

function afterIdentity(d: CellDivisionState, slide: TraySlide): void {
  const v = viewThrough(d);
  if (slide.org && slide.proc && !canLabel(d, v)) {
    say(
      d,
      slide.labels.every((l) => l)
        ? `Slide ${slide.n} is finished. Take it off and put the next one on.`
        : 'Recorded. The three pointers are only resolved on a sharp, centred view at **40×** — get there and name what ' +
          'each one sits on.',
    );
  }
  progress(d);
}

function setLabel(d: CellDivisionState, pin: number, part: string): void {
  const slide = mountedSlide(d);
  if (!slide || locked(d)) return;
  if (!canLabel(d, viewThrough(d))) return;
  if (pin < 0 || pin >= slide.labels.length) return;

  slide.labels[pin] = part;
  const next = nextUnlabelled(slide, pin + 1);
  d.pin = next;

  const left = slide.labels.filter((l) => !l).length;
  say(
    d,
    left === 0
      ? `All three pointers on slide ${slide.n} named. Nothing is marked yet — the table is marked when you submit it, ` +
        'against what the slide really carries.'
      : `Pointer ${pin + 1} recorded as **${part}**. ${left} left on this slide.`,
  );
  afterIdentity(d, slide);
}

// ---------------------------------------------------------------------------
// The marked steps
// ---------------------------------------------------------------------------

function submitTable(d: CellDivisionState, now: number): void {
  if (d.step !== STEP.record || d.graded) return;
  if (d.tray.some((slide) => !slide.seen)) {
    say(d, 'Every row needs the feature you actually saw in the field.', 'warn');
    return;
  }

  const cells: Record<number, { pts: number }> = {};
  let ident = 0;
  let label = 0;
  let seen = 0;

  d.tray.forEach((slide, i) => {
    const spec = specimenOf(slide);
    const o = slide.org === spec.organism ? ORGANISM_MARKS : 0;
    const p = slide.proc === spec.process ? PROCESS_MARKS : 0;
    const f = slide.seen === spec.feature ? SEEN_MARKS : 0;
    ident += o + p;
    seen += f;
    cells[i] = { pts: o + p + f };

    if (!o) {
      mistake(
        d,
        now,
        `Slide ${slide.n}: you recorded ${slide.org || 'no organism'}; the slide carries ${spec.organism}`,
      );
    }
    if (!p) {
      mistake(
        d,
        now,
        `Slide ${slide.n}: you recorded "${slide.proc || 'nothing'}"; that slide shows ${spec.process}`,
      );
    }
    if (!f) mistake(d, now, `Slide ${slide.n}: what was in the field was ${FEATURE_TEXT[spec.feature]}`);

    if (slide.broken) return;
    spec.pins.forEach((pin, k) => {
      const written = slide.labels[k];
      if (written === pin.part) label += LABEL_MARKS;
      else if (written) {
        mistake(d, now, `Slide ${slide.n}, pointer ${k + 1}: you labelled it "${written}"; it sits on the ${pin.part}`);
      }
    });
  });

  d.graded = { cells, ident, label, seen };
  const full = Object.values(cells).filter((c) => c.pts === PER_SLIDE_TABLE_MARKS).length;
  const pins = d.tray.reduce((a, slide) => a + (slide.broken ? 0 : slide.labels.length), 0);

  say(
    d,
    `${full} of ${d.tray.length} slides identified completely, and ${label} of ${pins} pointers labelled correctly.` +
      (full === d.tray.length
        ? ' Three of those slides carried no division at all — saying so is as much a part of the practical as ' +
          'spotting the ones that did.'
        : ' A slide with no bud on it is not a budding slide, however much it looks like the one in the book.') +
      ' Now the conclusion.',
    full >= d.tray.length - 1 ? 'good' : 'warn',
  );
  d.step = STEP.conclude;
}

// ---------------------------------------------------------------------------
// The bench's one dispatch table
// ---------------------------------------------------------------------------

function act(
  state: CellDivisionState,
  action: Exclude<CellDivisionAction, { type: 'say' }>,
): CellDivisionState {
  switch (action.type) {
    case 'mountSlide':
      return edit(state, (d) => {
        mount(d, action.index, action.now);
        noteBest(d);
      });

    case 'takeOff':
      return state.mounted === null
        ? state
        : edit(state, (d) => {
            mount(d, state.mounted!, action.now);
          });

    case 'rack':
      return edit(state, (d) => {
        rack(d, action.knob, action.dir, action.now);
        noteBest(d);
      });

    case 'setObjective':
      return state.objective === action.objective
        ? state
        : edit(state, (d) => {
            setObjective(d, action.objective, action.now);
            noteBest(d);
          });

    case 'moveStage':
      if (locked(state) || state.mounted === null) return state;
      return edit(state, (d) => {
        if (action.dir === 'l') d.pos.x -= MOVE_STEP;
        else if (action.dir === 'r') d.pos.x += MOVE_STEP;
        else if (action.dir === 'u') d.pos.y -= MOVE_STEP;
        else d.pos.y += MOVE_STEP;
        d.pos.x = round3(d.pos.x);
        d.pos.y = round3(d.pos.y);
        noteBest(d);
      });

    case 'panStage':
      if (locked(state) || state.mounted === null) return state;
      return edit(state, (d) => {
        d.pos.x = round3(action.x);
        d.pos.y = round3(action.y);
        noteBest(d);
      });

    case 'cycleLamp':
      if (locked(state)) return state;
      return edit(state, (d) => {
        d.lamp = (d.lamp + 1) % LAMPS.length;
        say(
          d,
          d.lamp === 0
            ? 'Lamp off — the field goes dark.'
            : `Lamp on ${LAMPS[d.lamp]}. ` +
              (d.objective === 40
                ? 'The 40× objective takes a small cone of light, so it needs the brighter settings.'
                : 'At 10× a medium setting gives the best contrast; full brightness washes the specimen out.'),
        );
        noteBest(d);
        progress(d);
      });

    case 'setIdentity': {
      const slide = mountedSlide(state);
      if (!slide || locked(state) || state.step !== STEP.slides) return state;
      return edit(state, (d) => {
        const mine = mountedSlide(d)!;
        if (action.field === 'organism') mine.org = action.value;
        else mine.proc = action.value;
        afterIdentity(d, mine);
      });
    }

    case 'identifyAs': {
      const slide = mountedSlide(state);
      if (!slide || locked(state) || state.step !== STEP.slides) return state;
      return edit(state, (d) => {
        const mine = mountedSlide(d)!;
        const ref = SPECIMEN_BY_ID[action.specimen];
        mine.org = ref.organism;
        mine.proc = ref.process;
        say(
          d,
          `Recorded as **${ref.organism}**, **${ref.process}**, at ${totalMagnification(d.objective)}× total ` +
            'magnification. Nothing is marked until the table is submitted.',
        );
        afterIdentity(d, mine);
      });
    }

    case 'selectPin':
      return state.pin === action.pin ? state : { ...state, pin: action.pin };

    case 'setLabel':
      return edit(state, (d) => {
        setLabel(d, action.pin, action.part);
      });

    case 'selectRow':
      return state.row === action.index || !state.tray[action.index]
        ? state
        : { ...state, row: action.index };

    case 'setSeen': {
      if (state.step !== STEP.record || state.graded) return state;
      if (!state.tray[action.index]) return state;
      return edit(state, (d) => {
        d.tray[action.index]!.seen = action.feature;
        d.row = action.index;
      });
    }

    case 'submitTable':
      return edit(state, (d) => submitTable(d, action.now));

    case 'answerConclusion': {
      const q = CONCLUSION[action.question];
      if (state.step !== STEP.conclude || !q || state.concl[action.question]) return state;
      return edit(state, (d) => {
        const ok = action.option === q.a;
        d.concl[action.question] = { pick: action.option, pts: ok ? CONCL_POINTS : 0 };
        if (!ok) mistake(d, action.now, `Conclusion: question ${action.question + 1}`);
        if (d.concl.every(Boolean)) {
          d.step = STEP.viva;
          say(d, 'That is the contrast the examiner is after. Five questions and the practical is done.', 'good');
        }
      });
    }

    case 'answerViva': {
      const q = vivaPaperFor(VIVA_BANK, state.seed, state.vivaShuffled)[action.question];
      if (state.step !== STEP.viva || !q || state.viva[action.question]) return state;
      return edit(state, (d) => {
        const ok = action.option === q.a;
        d.viva[action.question] = { pick: action.option, pts: ok ? VIVA_POINTS : 0 };
        if (!ok) mistake(d, action.now, `Viva: question ${action.question + 1}`);
        if (d.viva.every(Boolean)) {
          d.done = true;
          d.tEnd = action.now;
          d.step = STEP.viva + 1;
        }
      });
    }

    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled cell-division action: ${JSON.stringify(exhaustive)}`);
    }
  }
}
