import { clamp, formatClock, parseDecimal } from '../numbers';
import { vivaPaperFor } from '../viva';
import { mulberry32 } from '../seed';
import type { RichText, Tone } from '../types';

import { CONCLUSIONS, MAX, STEP, TRIALS, VIVA_POINTS } from './marking';
import {
  LIMITS,
  OBJECTS,
  OPT,
  cm1,
  cm2,
  meanOf,
  screenView,
  setupFor,
  type ObjectId,
  type PartId,
  type StandId,
} from './optics';
import { benchLive, type FocalLengthState } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * Everything that can happen at the optical bench.
 *
 * Every action that depends on time carries `now`, stamped by the handler that
 * dispatched it. The reducer never reads a clock and never calls `Math.random`,
 * so the same state and the same actions always give the same bench — which is
 * what lets a teacher replay an attempt from the seed in its record.
 */
export type FocalLengthAction =
  | { type: 'selectStand'; stand: StandId }
  /** A push on the selected stand, in centimetres. Never lands on an exact mm. */
  | { type: 'nudge'; delta: number; now: number }
  /** A stand dragged to an absolute position on the scale. */
  | { type: 'dragStand'; stand: StandId; cm: number; now: number }
  | { type: 'chooseObject'; id: ObjectId; now: number }
  | { type: 'mountLens'; now: number }
  | { type: 'startFocusing'; now: number }
  | { type: 'record'; comp: string; scr: string; now: number }
  | { type: 'submitMeans'; mirror: string; lens: string; now: number }
  | { type: 'submitConclusion'; pick: number; now: number }
  | { type: 'answerViva'; question: number; option: number; now: number }
  /**
   * Draw the light rays over the bench, or stop drawing them. The teaching
   * layer, and nothing else: it takes no reading and moves no mark, which is
   * why it is handled before the `done` gate, like selecting a stand.
   */
  | { type: 'showRays'; on: boolean }
  | { type: 'say'; text: RichText; tone: Tone };

/** The part being MARKED at a step, which is not always what is on the bench. */
export function partOfStep(step: number): PartId {
  return step === STEP.setupL || step === STEP.lens ? 'lens' : 'mirror';
}

export function focalLengthReducer(state: FocalLengthState, action: FocalLengthAction): FocalLengthState {
  if (action.type === 'say') return { ...state, message: { text: action.text, tone: action.tone } };
  if (action.type === 'selectStand') {
    return state.sel === action.stand ? state : { ...state, sel: action.stand };
  }
  if (action.type === 'showRays') {
    if (state.rays === action.on) return state;
    // The switch says what it did. Taking the drawn light away is the moment
    // the bench becomes the real one, and a student who is not told that reads
    // it as something having broken.
    return {
      ...state,
      rays: action.on,
      message: {
        text: action.on
          ? 'Rays back on. The cone is the light from **one point** of the object; where it is narrowest, that ' +
            'point is in focus.'
          : 'Rays off — just the apparatus now. The close-up still shows the patch on the card, and the blur ' +
            'circle it measures is what you judge focus by.',
        tone: 'info',
      },
    };
  }
  // Nothing is marked after the viva; the bench is inert until a new one.
  if (state.done) return state;
  return act(state, action);
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

/** Clone, mutate the clone, return it. The given state is never touched. */
function edit(state: FocalLengthState, fn: (draft: FocalLengthState) => void): FocalLengthState {
  const draft = structuredClone(state);
  fn(draft);
  return draft;
}

function say(d: FocalLengthState, text: RichText, tone: Tone = 'info'): void {
  d.message = { text, tone };
}

function mistake(d: FocalLengthState, now: number, what: string, pts = 0): void {
  d.log.push({ t: formatClock(now - d.t0), what, pts });
}

/**
 * The hand that pushes a stand is not a micrometer: it lands a few hundredths
 * of a centimetre either side of where it was aimed. That is what makes reading
 * the scale a real task rather than reading back the number just typed.
 */
function handWobble(d: FocalLengthState): number {
  const r = mulberry32(d.seed * 7919 + d.nudges);
  d.nudges += 1;
  return (r() - 0.5) * 0.06;
}

function advance(d: FocalLengthState): void {
  d.step += 1;
}

const componentWord = (part: PartId): string => (part === 'mirror' ? 'mirror' : 'lens');

// ---------------------------------------------------------------------------
// Hands on the bench
// ---------------------------------------------------------------------------

function act(
  state: FocalLengthState,
  action: Exclude<FocalLengthAction, { type: 'say' | 'selectStand' | 'showRays' }>,
): FocalLengthState {
  switch (action.type) {
    case 'nudge': {
      if (!benchLive(state) || !action.delta) return state;
      return edit(state, (d) => {
        const limit = LIMITS[d.part][d.sel];
        d.pos[d.part][d.sel] = clamp(d.pos[d.part][d.sel] + action.delta + handWobble(d), limit[0], limit[1]);
        d.moves += 1;
      });
    }

    case 'dragStand': {
      if (!benchLive(state)) return state;
      const limit = LIMITS[state.part][action.stand];
      const next = clamp(action.cm, limit[0], limit[1]);
      if (Math.abs(next - state.pos[state.part][action.stand]) < 1e-4 && state.sel === action.stand) return state;
      return edit(state, (d) => {
        d.sel = action.stand;
        d.pos[d.part][action.stand] = next;
        d.moves += 1;
      });
    }

    case 'chooseObject':
      return edit(state, (d) => chooseObject(d, action.id, action.now));

    case 'mountLens':
      if (state.step !== STEP.setupL || state.mounted === 'lens') return state;
      return edit(state, (d) => {
        d.mounted = 'lens';
        d.part = 'lens';
        d.sel = 'scr';
        say(
          d,
          'Convex lens in the stand, the mirror back on the bench. The screen now goes on the **far side** of the lens — ' +
            'light passes through it and converges behind. Aim it at a distant object again.',
        );
      });

    case 'startFocusing': {
      const part = partOfStep(state.step);
      const objId = state.obj[part];
      if (state.step !== STEP.setupM && state.step !== STEP.setupL) return state;
      if (state.mounted !== part || !objId || !OBJECTS[objId].far) return state;
      return edit(state, (d) => {
        advance(d);
        d.sel = 'scr';
        say(
          d,
          `Move the screen along the bench until the image of ${OBJECTS[objId].name} is as sharp as you can get it, ` +
            `then read **both** positions off the metre scale with the close-up and record the trial. ` +
            `Three trials, moving the ${componentWord(part)} between them.`,
        );
      });
    }

    case 'record': {
      if (state.step !== STEP.mirror && state.step !== STEP.lens) return state;
      return edit(state, (d) => record(d, action.comp, action.scr, action.now));
    }

    case 'submitMeans':
      if (state.step !== STEP.mean) return state;
      return edit(state, (d) => submitMeans(d, action.mirror, action.lens, action.now));

    case 'submitConclusion':
      if (state.step !== STEP.concl || !CONCLUSIONS[action.pick]) return state;
      return edit(state, (d) => submitConclusion(d, action.pick, action.now));

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
          advance(d);
        }
      });
    }

    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled focal-length action: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function chooseObject(d: FocalLengthState, id: ObjectId, now: number): void {
  const part = partOfStep(d.step);
  if (d.step !== STEP.setupM && d.step !== STEP.setupL) return;
  const spec = OBJECTS[id];

  if (spec.refuse) {
    d.badObj[part] += 1;
    d.objChoices += 1;
    mistake(d, now, 'Tried to use the Sun as the distant object', 4);
    say(
      d,
      '**No.** Never look at the Sun through a lens or a mirror, and never use it as the object for this experiment. ' +
        'A lens concentrates sunlight enough to char paper; focused on the retina it burns it permanently, and there is ' +
        'no pain to warn you. Use the **tree about 120 m away** or the **water tank across the road**.',
      'bad',
    );
    return;
  }

  d.obj[part] = id;
  d.objChoices += 1;

  if (!spec.far) {
    d.badObj[part] += 1;
    mistake(d, now, `Used a near object (the candle) for the ${componentWord(part)}`, 4);
    say(
      d,
      `The candle is on the bench, a few tens of centimetres away — its rays reach the ${componentWord(part)} ` +
        'spreading out, not parallel. The sharp image then forms where **1/v = 1/f − 1/u** puts it, **not** at the focus, ' +
        'so the distance you measure is v and not f. Watch what happens, then aim at something distant.',
      'warn',
    );
    return;
  }

  say(
    d,
    `Aimed at ${spec.name}. Rays from it reach the ${componentWord(part)} parallel to the principal axis, ` +
      'so the sharp image will land in the focal plane.',
    'good',
  );
}

/** A scale reading: full marks within one least count, half within two. */
function readMark(entered: number, truth: number): number {
  const e = Math.abs(entered - truth);
  return e <= OPT.lc + 1e-9 ? 2 : e <= 2 * OPT.lc + 1e-9 ? 1 : 0;
}

function record(d: FocalLengthState, rawComp: string, rawScr: string, now: number): void {
  const part = partOfStep(d.step);
  const a = parseDecimal(rawComp);
  const b = parseDecimal(rawScr);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    say(d, 'Type both positions in centimetre, read off the metre scale with the close-up.', 'warn');
    return;
  }

  const p = d.pos[part];
  const view = screenView(setupFor(part, d), p.scr);
  if (!view.lit) {
    say(
      d,
      view.why === 'side'
        ? `Nothing is falling on the card — it is on the wrong side of the ${componentWord(part)}. ` +
            (part === 'mirror'
              ? 'The reflected light travels back towards the object, so the screen belongs between the object and the mirror.'
              : 'Light goes through the lens and converges behind it, so the screen belongs on the far side.')
        : 'No real image can form: the object is nearer than the focus, or its image falls beyond the end of the bench. Aim at a distant object.',
      'warn',
    );
    return;
  }

  const last = d.lastComp[part];
  if (last !== null && Math.abs(p.comp - last) < OPT.moveBetweenTrials) {
    say(
      d,
      `Move the **${componentWord(part)}** at least ${OPT.moveBetweenTrials} cm along the bench and focus again before ` +
        'you record another trial — reading the same set-up twice is not a repeat.',
      'warn',
    );
    return;
  }

  const focusPts = view.blur <= OPT.sharp ? 4 : view.blur <= OPT.okBlur ? 2 : 0;
  const pa = readMark(a, p.comp);
  const pb = readMark(b, p.scr);
  const pts = focusPts + pa + pb;

  d.trials[part].push({
    comp: a,
    scr: b,
    trueComp: p.comp,
    trueScr: p.scr,
    f: Math.abs(a - b),
    trueF: view.o.di,
    blur: view.blur,
    defocus: view.defocus,
    focusPts,
    readPts: pa + pb,
    pts,
  });
  d.lastComp[part] = p.comp;

  const n = d.trials[part].length;
  const Part = part === 'mirror' ? 'Mirror' : 'Lens';
  if (focusPts < 4) {
    mistake(
      d,
      now,
      `${Part} trial ${n}: recorded with the screen ${cm1(view.defocus)} cm off the focal plane ` +
        `(blur circle ${cm1(view.blur * 10)} mm)`,
    );
  }
  if (pa + pb < 4) {
    mistake(
      d,
      now,
      `${Part} trial ${n}: scale misread — you wrote ${cm2(a)} cm and ${cm2(b)} cm; ` +
        `the stands were at ${cm2(p.comp)} cm and ${cm2(p.scr)} cm`,
    );
  }

  let fb = '';
  if (focusPts < 4) {
    fb +=
      `The card was **${cm1(view.defocus)} cm** off the focal plane, so what you measured was a blur circle ` +
      `**${cm1(view.blur * 10)} mm** across, not an image. `;
  }
  if (pa + pb < 4) {
    fb +=
      `The stands were really at **${cm2(p.comp)} cm** and **${cm2(p.scr)} cm**; a metre scale reads to 0.1 cm — ` +
      'line your eye up over the index mark. ';
  }
  fb = fb
    ? `${fb}This trial gives f = **${cm2(Math.abs(a - b))} cm**. `
    : `Sharp image, both positions read within a millimetre. f = **${cm2(Math.abs(a - b))} cm** from this trial. `;

  if (n >= TRIALS) {
    const mf = meanOf(d.trials[part].map((t) => t.f));
    say(
      d,
      `${fb}Three trials done — your mean is **${cm2(mf)} cm**. ` +
        (part === 'mirror' ? 'Now change over to the convex lens.' : 'Now write up the observation table.'),
      pts === 8 ? 'good' : 'warn',
    );
    advance(d);
  } else {
    say(
      d,
      `${fb}Move the ${componentWord(part)} along the bench and find the sharp image again for trial ${n + 1}.`,
      pts === 8 ? 'good' : 'warn',
    );
  }
}

function submitMeans(d: FocalLengthState, rawM: string, rawL: string, now: number): void {
  const a = parseDecimal(rawM);
  const b = parseDecimal(rawL);
  if (Number.isNaN(a) || Number.isNaN(b) || a <= 0 || b <= 0) {
    say(d, 'Write both means in centimetre.', 'warn');
    return;
  }
  const tm = meanOf(d.trials.mirror.map((t) => t.f));
  const tl = meanOf(d.trials.lens.map((t) => t.f));
  // Marked against the student's OWN three values, not against the true focal
  // length: taking a mean correctly is a different skill from measuring well,
  // and the accuracy is marked in the conclusion.
  const grade = (x: number, truth: number): number => {
    const e = Math.abs(x - truth);
    return e <= 0.2 + 1e-9 ? 4 : e <= 0.5 + 1e-9 ? 2 : 0;
  };

  d.means = { mirror: a, lens: b };
  d.meanPts = { mirror: grade(a, tm), lens: grade(b, tl) };
  if (d.meanPts.mirror < 4) mistake(d, now, `Mean f for the mirror written as ${cm2(a)} cm; your three trials mean ${cm2(tm)} cm`);
  if (d.meanPts.lens < 4) mistake(d, now, `Mean f for the lens written as ${cm2(b)} cm; your three trials mean ${cm2(tl)} cm`);

  const full = d.meanPts.mirror + d.meanPts.lens === MAX.mean;
  say(
    d,
    full
      ? `Both means follow from your trials: mirror **${cm2(a)} cm**, lens **${cm2(b)} cm**. Now the conclusion.`
      : `Your own trials average **${cm2(tm)} cm** for the mirror and **${cm2(tl)} cm** for the lens. ` +
          'Add the three values and divide by three. Now the conclusion.',
    full ? 'good' : 'warn',
  );
  advance(d);
}

function submitConclusion(d: FocalLengthState, pick: number, now: number): void {
  const a = d.means.mirror ?? Number.NaN;
  const b = d.means.lens ?? Number.NaN;
  // Which statement their OWN two means support.
  const own = Math.abs(a - b) < 0.05 ? 2 : a < b ? 0 : 1;
  const cmpPts = pick === own ? 4 : 0;
  const eM = Math.abs(a - d.fM);
  const eL = Math.abs(b - d.fL);
  const accPts = (eM <= 1.0 ? 2 : 0) + (eL <= 1.0 ? 2 : 0);

  d.concl = { pick, own, pts: cmpPts + accPts, accPts, cmpPts, statement: CONCLUSIONS[pick]!, eM, eL };
  if (!cmpPts) mistake(d, now, 'The conclusion does not follow from your own two means');
  if (accPts < 4) mistake(d, now, `Measured f off by ${cm1(eM)} cm (mirror) and ${cm1(eL)} cm (lens)`);

  const off: string[] = [];
  if (eM > 1) off.push(`the mirror’s true focal length is **${cm1(d.fM)} cm**`);
  if (eL > 1) off.push(`the lens’s is **${cm1(d.fL)} cm**`);

  say(
    d,
    (cmpPts
      ? 'That is what your two means say. '
      : 'That is not what your own two means say — compare the numbers again. ') +
      (accPts === 4
        ? `Both results are within a centimetre of this bench’s true values (mirror ${cm1(d.fM)} cm, ` +
          `lens ${cm1(d.fL)} cm): a distant object really does put the image in the focal plane. `
        : `On this bench ${off.join(' and ')}. ` +
          (d.badObj.mirror + d.badObj.lens
            ? 'Using a near object is what pushed the image out beyond the focus. '
            : 'Check the focusing: a blurred image measures the wrong distance. ')) +
      'Now the viva.',
    cmpPts + accPts === MAX.concl ? 'good' : 'warn',
  );
  advance(d);
}
