import { clamp, formatClock, parseDecimal } from '../numbers';
import { vivaPaperFor } from '../viva';
import type { RichText, Tone } from '../types';

import {
  LABEL_POINTS,
  MAX,
  OBS,
  PINS,
  STEP,
  STEPS,
  VIVA_POINTS,
  labelName,
  type LabelId,
} from './marking';
import {
  COARSE,
  FINE,
  PAN,
  Z0,
  fieldCells,
  hiddenStomata,
  liquidOn,
  makeBubbles,
  micTick,
  moveZ,
  panStage,
  setObjective,
  sharpness,
  visibleStomata,
  type Magnification,
  type Peel,
  type Surface,
} from './peel';
import { countPts, focusPts, mountPts, peelPts } from './score';
import { newMic, newSlide, type Graded, type StomataState, type ToolId } from './state';
import { VIVA_BANK } from './viva-bank';

/**
 * Everything that can happen at this bench.
 *
 * Every action that depends on time carries `now`, stamped by the handler that
 * dispatched it, so the reducer never reads a clock and the same state and
 * action always give the same result. Nothing here draws anything: what the
 * student sees is derived from the slide and the microscope in `peel.ts`.
 */
export type MicCommand =
  | 'obj10'
  | 'obj40'
  | 'coarseUp'
  | 'coarseDown'
  | 'fineUp'
  | 'fineDown'
  | 'panU'
  | 'panD'
  | 'panL'
  | 'panR';

export type StomataAction =
  | { type: 'pickTool'; tool: ToolId; now: number }
  | { type: 'dropHeld'; now: number }
  | { type: 'flipLeaf'; now: number }
  | { type: 'peelLeaf'; where: 'flap' | 'body'; now: number }
  | { type: 'tapDish'; now: number }
  | { type: 'tapSlide'; now: number }
  | { type: 'tapCover'; now: number }
  | { type: 'tapStage'; now: number }
  | { type: 'mic'; cmd: MicCommand; now: number }
  /**
   * A point in the field, brought to the centre of it: `dx`/`dy` are that
   * point's offset from the middle of the field, in millimetres on the slide.
   *
   * The same movement the four arrows make, in one go — which is why it goes
   * through `panStage` and records itself exactly as they do. Tapping where you
   * want to look is how a mechanical stage is really driven, and on a 0.38 mm
   * high-power field the arrows alone are a dozen presses.
   */
  | { type: 'bringToCentre'; dx: number; dy: number; now: number }
  | { type: 'discardMount'; now: number }
  | { type: 'goRecord'; now: number }
  | { type: 'setCount'; count: string }
  | { type: 'setObs'; id: string; value: string }
  | { type: 'setLabel'; pin: string; value: string }
  | { type: 'submitObs'; now: number }
  | { type: 'setConcl'; field: 'mine' | 'truth'; value: string }
  | { type: 'submitConcl'; now: number }
  | { type: 'answerViva'; question: number; option: number; now: number }
  | { type: 'say'; text: RichText; tone: Tone };

export function stomataReducer(state: StomataState, action: StomataAction): StomataState {
  if (action.type === 'say') return { ...state, message: { text: action.text, tone: action.tone } };
  // Nothing is marked after the viva; the bench is inert until a new one.
  if (state.done) return state;
  return edit(state, (d) => act(d, action));
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

/** Clone, change the clone, return it. The given state is never touched. */
function edit(state: StomataState, fn: (draft: StomataState) => void): StomataState {
  const draft = structuredClone(state);
  fn(draft);
  return draft;
}

function say(d: StomataState, text: RichText, tone: Tone = 'info'): void {
  d.message = { text, tone };
}

function mistake(d: StomataState, now: number, what: string, pts = 0): void {
  d.log.push({ t: formatClock(now - d.t0), what, pts });
}

const locked = (d: StomataState): boolean => d.frozen !== null || d.done;

const stepId = (d: StomataState): string => STEPS[d.step]?.id ?? 'viva';

/**
 * Advance when the work of the current step has actually been done. One step
 * per action at most, which is what keeps a single tap from skipping a stage.
 */
function progress(d: StomataState): void {
  const id = stepId(d);
  if (id === 'peel' && (d.dish || d.held?.kind === 'peel' || d.slide.peel)) {
    d.step++;
  } else if (id === 'mount' && d.slide.cover) {
    d.step++;
    say(
      d,
      d.slide.bubbles.length
        ? `The mount is covered, with ${d.slide.bubbles.length} bubbles in it. Look at the slide close up: you can remake it, or take it to the microscope and record honestly what it shows.`
        : 'The mount is covered and clean. Pick the slide up and put it on the **microscope stage**.',
      d.slide.bubbles.length ? 'warn' : 'good',
    );
  } else if (id === 'check' && d.slide.onStage) {
    d.step++;
  } else if (id === 'low' && (d.mic.obj === 40 || (d.mic.foundLow && d.mic.centredLow))) {
    d.step++;
    if (d.mic.obj === 10) say(d, 'Focused and centred on low power. Now swing the **40×** objective round.', 'good');
  } else if (id === 'high' && d.mic.obj === 40 && sharpness(d) >= 0.8) {
    d.step++;
    say(
      d,
      'That is a sharp high-power field. Count the stomata in it, fill in the observation table, and name the four pinned parts on the drawing.',
      'good',
    );
  }
}

// ---------------------------------------------------------------------------
// The bench
// ---------------------------------------------------------------------------

function act(d: StomataState, a: StomataAction): void {
  switch (a.type) {
    case 'pickTool':
      return pickTool(d, a.tool);
    case 'dropHeld':
      return dropHeld(d);
    case 'flipLeaf':
      return flipLeaf(d);
    case 'peelLeaf':
      return peelLeaf(d, a.where, a.now);
    case 'tapDish':
      return tapDish(d, a.now);
    case 'tapSlide':
      return tapSlide(d, a.now);
    case 'tapCover':
      return tapCover(d, a.now);
    case 'tapStage':
      return tapStage(d);
    case 'mic':
      return micTap(d, a.cmd, a.now);
    case 'bringToCentre':
      return bringToCentre(d, a.dx, a.dy);
    case 'discardMount':
      return discardMount(d, a.now);
    case 'goRecord':
      if (d.step < STEP.record) d.step = STEP.record;
      return;
    case 'setCount':
      if (!locked(d)) d.count = a.count;
      return;
    case 'setObs':
      if (!locked(d)) d.rec[a.id] = a.value;
      return;
    case 'setLabel':
      if (!locked(d)) d.labels[a.pin] = a.value;
      return;
    case 'submitObs':
      return submitObs(d, a.now);
    case 'setConcl':
      if (!d.conclDone) d.concl[a.field] = a.value;
      return;
    case 'submitConcl':
      return submitConcl(d, a.now);
    case 'answerViva':
      return answerViva(d, a.question, a.option, a.now);
    default:
      return;
  }
}

function hold(d: StomataState, held: StomataState['held']): void {
  d.held = held;
}

function pickTool(d: StomataState, tool: ToolId): void {
  if (locked(d)) return;
  if (d.held?.kind === 'peel') {
    return say(d, 'You are holding the peel — put it in the water or on the slide before picking anything else up.', 'warn');
  }
  hold(d, d.held?.kind === tool ? null : { kind: tool });
}

function dropHeld(d: StomataState): void {
  if (locked(d)) return;
  if (d.held?.kind === 'peel') return say(d, 'Put the peel down somewhere: the water, or the slide.', 'warn');
  hold(d, null);
}

function flipLeaf(d: StomataState): void {
  if (locked(d)) return;
  d.faceUp = d.faceUp === 'lower' ? 'upper' : 'lower';
  say(
    d,
    d.faceUp === 'lower'
      ? 'Lower surface up. On a dicot leaf this is the surface that carries the stomata — this is the one to peel.'
      : 'Upper surface up. You **can** peel this one, and it is worth seeing what it shows: on a dicot leaf the upper epidermis carries very few stomata.',
    d.faceUp === 'lower' ? 'info' : 'warn',
  );
}

function peelLeaf(d: StomataState, where: 'flap' | 'body', now: number): void {
  if (locked(d)) return;
  const h = d.held;
  if (!h || (h.kind !== 'forceps' && h.kind !== 'needle')) {
    return say(
      d,
      'Pick up the **forceps** first. The leaf has already been folded and snapped; a thin transparent flap of epidermis is hanging off the torn edge.',
      'warn',
    );
  }
  if (d.slide.peel || d.dish) {
    return say(d, 'You already have a peel. Use that one, or **discard the mount** to start the slide again.', 'warn');
  }

  const surface: Surface = d.faceUp;
  const torn = h.kind === 'needle';
  const thick = h.kind === 'forceps' && where === 'body';
  d.peelN += 1;
  const peel: Peel = {
    surface,
    torn,
    thick,
    floated: false,
    curled: false,
    seed: (d.seed + 1013 * d.peelN) >>> 0,
  };
  // Either way it comes away in the forceps: the needle only decides how badly.
  hold(d, { kind: 'peel', by: 'forceps', peel });

  if (torn) {
    mistake(d, now, 'Tore at the leaf with the needle instead of pulling the flap with forceps');
    say(
      d,
      'The needle shredded it. What came away is a small **torn** scrap — usable, but there is little of it to look at. The forceps on the transparent flap would have given a clean sheet.',
      'bad',
    );
  } else if (thick) {
    mistake(d, now, 'Gripped the whole lamina, so the piece is several cells thick');
    say(
      d,
      'You have pinched off a piece of the **whole leaf**, not just the epidermis. It is several cells thick, so no single plane of it will ever be in focus. The thin transparent flap at the torn edge is the epidermis.',
      'bad',
    );
  } else {
    say(
      d,
      `A clean, almost colourless sheet of **${surface} epidermis** in the forceps. Drop it into the **watch glass of water** so it relaxes and does not curl up.`,
      'good',
    );
  }
  progress(d);
}

function tapDish(d: StomataState, now: number): void {
  if (locked(d)) return;
  const h = d.held;

  if (h?.kind === 'peel') {
    h.peel.floated = true;
    d.dish = h.peel;
    hold(d, { kind: h.by });
    say(
      d,
      'The peel is floating flat in the water. Now pick it up with the **brush** — a wet peel folds and tears on forceps — and lay it on the slide.',
      'good',
    );
    return progress(d);
  }
  if (!d.dish) {
    return say(
      d,
      'The watch glass holds clean water. It is where a peel is floated so it relaxes flat before mounting.',
    );
  }
  if (h?.kind === 'brush') {
    hold(d, { kind: 'peel', by: 'brush', peel: d.dish });
    d.dish = null;
    return say(d, 'The peel is on the brush, still flat. Lay it on the drop of water on the slide.');
  }
  if (h?.kind === 'forceps') {
    const peel = { ...d.dish, torn: true };
    hold(d, { kind: 'peel', by: 'forceps', peel });
    d.dish = null;
    mistake(d, now, 'Lifted the wet peel with forceps and tore it');
    return say(d, 'The wet peel folded and **tore** on the forceps. That is what the fine brush is for.', 'bad');
  }
  say(d, 'Pick up the **brush** to lift the floating peel out.', 'warn');
}

function tapSlide(d: StomataState, now: number): void {
  if (locked(d)) return;
  const h = d.held;
  const sl = d.slide;

  if (!h) {
    if (!sl.onStage) {
      hold(d, { kind: 'slide' });
      say(d, 'The slide is in your hand. Tap the **microscope stage** to put it on — but only once the coverslip is on.');
    }
    return;
  }
  if (h.kind === 'slide') return hold(d, null);
  if (sl.onStage) {
    return say(d, 'The slide is on the microscope stage. Take it off first if you want to change the mount.', 'warn');
  }

  if (h.kind === 'peel') {
    if (sl.cover) return say(d, 'The coverslip is already down on this slide.', 'warn');
    if (sl.peel) return say(d, 'There is already a peel on this slide.', 'warn');
    sl.peel = h.peel;
    sl.waterFirst = sl.water + (sl.glyc ? 1 : 0) > 0;
    if (!h.peel.floated) {
      sl.peel.curled = true;
      mistake(d, now, 'Put the peel straight on the slide without floating it in water');
    }
    hold(d, { kind: h.by });
    if (!sl.waterFirst) {
      say(
        d,
        'The peel is on a **dry** slide. It will start to curl and dry out — a temporary mount needs a drop of water under the specimen, put there first.',
        'bad',
      );
    } else if (sl.peel.curled) {
      say(
        d,
        'It went on without being floated, so it has **curled and folded** on itself. A fold is two layers thick, and no focus setting shows both.',
        'warn',
      );
    } else {
      say(
        d,
        'The peel is lying flat in the drop of water. Now add a drop of **safranin** — the cells are almost colourless without it.',
        'good',
      );
    }
    return progress(d);
  }

  if (h.kind === 'water') {
    sl.water++;
    const flooded = liquidOn(sl) >= 4;
    return say(
      d,
      sl.peel
        ? `Another drop of water on the slide. ${flooded ? 'That is getting flooded — the coverslip will float and drift.' : 'Enough to keep the peel wet.'}`
        : 'A drop of water on the clean slide. The peel goes into this drop.',
      flooded ? 'warn' : 'info',
    );
  }

  if (h.kind === 'safranin') {
    if (!sl.peel) return say(d, 'Put the peel on the slide first — there is nothing to stain yet.', 'warn');
    if (sl.cover) return say(d, 'The coverslip is down; the stain cannot get under it now.', 'warn');
    sl.stain++;
    if (sl.stain === 4) mistake(d, now, 'Flooded the peel with safranin — the detail is drowned in red');
    return say(
      d,
      sl.stain <= 3
        ? 'A drop of safranin. The cell walls and the nuclei are taking up the red, so the outlines will show.'
        : 'That is **too much stain**. Everything is going dark red together and the chloroplasts in the guard cells will be lost in it. One or two drops is all it takes.',
      sl.stain <= 3 ? 'good' : 'bad',
    );
  }

  if (h.kind === 'glycerine') {
    sl.glyc = true;
    return say(
      d,
      'A drop of glycerine. It stops the mount drying out, so the slide keeps for a few days — optional here, but good practice.',
    );
  }

  if (h.kind === 'blot') {
    if (!sl.cover) {
      if (sl.water > 0) sl.water = Math.max(0, sl.water - 2);
      return say(
        d,
        'You have blotted the liquid off before the coverslip went on. That only dries the mount out — blotting comes **after** the coverslip, to draw away what squeezes out at the edges.',
        'warn',
      );
    }
    sl.blotted = true;
    return say(d, 'The excess is drawn off from the edge of the coverslip. The mount sits flat now.', 'good');
  }

  say(d, 'Nothing to do to the slide with that. Water first, then the peel, then safranin, then the coverslip.');
}

function tapCover(d: StomataState, now: number): void {
  if (locked(d)) return;
  const sl = d.slide;
  if (sl.cover) return say(d, 'The coverslip is already on this mount.', 'warn');
  if (sl.onStage) return;
  if (!sl.peel) return say(d, 'There is nothing to cover yet — put the peel on the slide first.', 'warn');

  const angle = d.held?.kind === 'needle';
  const liq = liquidOn(sl);
  sl.cover = { angle };
  sl.dry = liq === 0;
  sl.bubbles = makeBubbles(sl, liq);
  const n = sl.bubbles.length;

  if (!angle) mistake(d, now, `Dropped the coverslip flat, trapping ${n} air bubbles`);
  if (sl.dry) mistake(d, now, 'Covered a dry mount — there was no liquid under the coverslip');
  // Safranin cannot get under a coverslip, so an unstained mount is settled
  // here, not later: it costs 4 marks and the field will be nearly colourless.
  if (sl.stain === 0) {
    mistake(d, now, 'Covered the peel unstained — nothing can be added under the coverslip now', 4);
  }

  say(
    d,
    sl.stain === 0 && !sl.dry
      ? `The coverslip is down on an **unstained** peel. Nothing can get under it now, and an epidermal peel without safranin is almost colourless — you will be hunting for outlines that barely show.${
          n ? ` ${n} bubbles are trapped as well.` : ''
        }`
      : angle && !n
      ? 'Lowered on the needle, one edge first. The liquid ran across and pushed the air out ahead of it: **no bubbles**. Now draw off the excess with the **blotting paper**.'
      : sl.dry
        ? `The coverslip is down on a **dry** mount. Air is trapped all through it — ${n} bubbles — and the cells will shrivel. A temporary mount needs liquid under the coverslip.`
        : `The coverslip fell **flat** onto the drop and slapped the air in with it: **${n} bubbles** are trapped. Each one will be a thick black ring in the field of view, hiding whatever is under it. Lower it on the point of the needle, one edge first.`,
    angle && !n && sl.stain > 0 ? 'good' : 'bad',
  );
  progress(d);
}

function tapStage(d: StomataState): void {
  if (locked(d)) return;
  const sl = d.slide;
  if (sl.onStage) {
    if (!d.held) {
      sl.onStage = false;
      hold(d, { kind: 'slide' });
      say(d, 'The slide is off the stage and back in your hand.');
    }
    return;
  }
  if (d.held?.kind !== 'slide') return say(d, 'Pick the **slide** up first, then tap the stage.', 'warn');
  if (!sl.cover) {
    return say(
      d,
      'Never put an uncovered wet mount on the stage — the objective would go straight into the liquid. Lower the coverslip first.',
      'bad',
    );
  }
  sl.onStage = true;
  d.mic.z = Z0;
  hold(d, null);
  micTick(d);
  say(
    d,
    'The slide is under the clips. Start on the **10× objective**: rack the stage up with the **coarse** knob until something appears, then centre it with the stage controls.',
  );
  progress(d);
}

function micTap(d: StomataState, cmd: MicCommand, now: number): void {
  if (locked(d)) return;
  const m = d.mic;

  if (cmd === 'obj10' || cmd === 'obj40') {
    const want: Magnification = cmd === 'obj40' ? 40 : 10;
    const wasLow = m.foundLow;
    const wasCentred = m.centredLow;
    const r = setObjective(d, want);
    if (r === 'same') return;
    if (r === 'crash') {
      d.broken++;
      return say(
        d,
        'The 40× lens is much longer than the 10×. Swinging it round while the stage was that high drove it straight into the slide. **The slide is cracked.** Focus properly on low power before you change objective.',
        'bad',
      );
    }
    micTick(d);
    progress(d);
    if (want === 40 && !wasLow) {
      mistake(d, now, 'Went to 40× before finding the peel on 10×', 4);
      return say(
        d,
        'You have gone to **40×** without ever having the peel in focus on 10×. The high-power field is a sixteenth of the area — there is almost nothing to find. Go back to 10×.',
        'bad',
      );
    }
    if (want === 40 && !wasCentred) {
      mistake(d, now, 'Went to 40× without centring the peel', 4);
      return say(
        d,
        'At 40× you only see the middle of what you had at 10×. The peel was not centred, so it may be right outside the field now. Go back to 10×, centre it, then come back.',
        'warn',
      );
    }
    return say(
      d,
      want === 40
        ? 'On 40×. Use the **fine** adjustment only — one turn of the coarse knob here and the lens is into the slide.'
        : 'Back on 10×: a wide field and a forgiving focus.',
    );
  }

  if (cmd.startsWith('pan')) {
    if (!d.slide.onStage) return say(d, 'There is no slide on the stage to move.', 'warn');
    panStage(d, cmd === 'panL' ? -PAN : cmd === 'panR' ? PAN : 0, cmd === 'panU' ? -PAN : cmd === 'panD' ? PAN : 0);
    d.panMoves++;
    micTick(d);
    return progress(d);
  }

  const dz = cmd === 'coarseUp' ? COARSE : cmd === 'coarseDown' ? -COARSE : cmd === 'fineUp' ? FINE : -FINE;
  const r = moveZ(d, dz);
  if (r === 'noslide') return say(d, 'There is no slide on the stage yet.', 'warn');
  d.focusMoves++;
  if (r === 'crash') {
    d.broken++;
    return say(
      d,
      'You racked the stage up until the objective pressed into the coverslip. **The slide is cracked** and the mount is ruined. Watch the gap gauge while you rack up, and on high power use the fine adjustment only.',
      'bad',
    );
  }
  micTick(d);
  progress(d);

  const sh = sharpness(d);
  if (cmd.startsWith('coarse') && m.obj === 40 && !d.slide.broken) {
    say(
      d,
      'That was the **coarse** knob on high power — there is less than half a turn between focus and a broken slide. Use the fine knob.',
      'warn',
    );
  } else if (sh > 0.9) say(d, 'Sharp.', 'good');
  else if (sh > 0.5) say(d, 'Nearly — keep turning the same way, a little at a time.');
  else if (d.slide.peel?.thick) {
    say(
      d,
      'Still a blur. Every setting shows a different layer of it: the piece is **too thick** to focus. Nothing here will fix that but a thinner peel.',
      'warn',
    );
  } else if (fieldCells(d).length === 0) {
    say(d, 'Nothing in the field at all — the peel is somewhere else. Move the stage, or go back to **10×** and find it again.', 'warn');
  } else say(d, 'Out of focus. Keep going in one direction until it sharpens, then come back.');
}

/**
 * Drive the stage until the point that was tapped sits in the middle.
 *
 * It is the arrows' movement, not a new power: it goes through the same
 * `panStage` (so it is clamped by the same travel limits), counts as the same
 * `panMoves`, and runs the same `micTick`, so centring the field this way earns
 * `centredLow` exactly as walking there with the arrows does — and cannot earn
 * it on a field that is not also sharp.
 */
function bringToCentre(d: StomataState, dx: number, dy: number): void {
  if (locked(d)) return;
  if (!d.slide.onStage) return say(d, 'There is no slide on the stage to move.', 'warn');
  if (dx === 0 && dy === 0) return;
  panStage(d, dx, dy);
  d.panMoves++;
  micTick(d);
  progress(d);
}

function discardMount(d: StomataState, now: number): void {
  if (locked(d)) return;
  if (d.slide.peel || d.slide.cover) {
    d.wasted++;
    mistake(d, now, 'Discarded a mount and started again', 2);
  }
  d.slide = newSlide(d.seed, d.wasted);
  d.dish = null;
  d.held = null;
  // Only the stage resets: a focusing habit already shown stays shown, and
  // `wasted` has already taken its 2 marks off the mount.
  d.mic.z = Z0;
  d.mic.obj = 10;
  if (d.step > STEP.peel) d.step = STEP.peel;
  say(
    d,
    `A clean slide and a clean coverslip. Peel again, and this time ${
      d.broken ? 'watch the gap gauge as you rack up.' : 'take it slowly.'
    }`,
  );
}

// ---------------------------------------------------------------------------
// Recording, the conclusion and the viva
// ---------------------------------------------------------------------------

/** Everything the record step needs before it can be submitted. */
export function recordReady(s: StomataState): boolean {
  const count = parseDecimal(s.count);
  return (
    OBS.every((o) => s.rec[o.id]) &&
    PINS.every((p) => s.labels[p]) &&
    Number.isFinite(count) &&
    count >= 0
  );
}

function submitObs(d: StomataState, now: number): void {
  if (d.frozen || !recordReady(d)) return;

  const obsCells: Graded['obsCells'] = {};
  let obs = 0;
  for (const o of OBS) {
    const truth = o.truth(d);
    const mine = d.rec[o.id] ?? '';
    const ok = mine === truth;
    obsCells[o.id] = { ok, truth, mine };
    if (ok) obs += MAX.obs / OBS.length;
    else mistake(d, now, `Observation “${o.q}”: you wrote “${mine}”, the field showed “${truth}”`);
  }

  const trueCount = visibleStomata(d).length;
  const said = Math.round(clamp(parseDecimal(d.count), 0, 999));
  const cpts = countPts(said, trueCount);
  if (cpts < MAX.count) mistake(d, now, `Counted ${said} stomata; the field held ${trueCount}`);

  const labelCells: Graded['labelCells'] = {};
  let label = 0;
  for (const p of PINS) {
    const truth = d.labelMap[p] as LabelId;
    const mine = d.labels[p] ?? '';
    const ok = mine === truth;
    labelCells[p] = { ok, truth, mine };
    if (ok) label += LABEL_POINTS;
    else mistake(d, now, `Label ${p}: you called it the ${labelName(mine).toLowerCase()}`);
  }

  d.frozen = { peel: peelPts(d), mount: mountPts(d), focus: focusPts(d) };
  d.graded = {
    obsCells,
    obs,
    count: cpts,
    said,
    trueCount,
    hidden: hiddenStomata(d).length,
    label,
    labelCells,
    sharp: +sharpness(d).toFixed(2),
  };

  const wrong = OBS.length - Object.values(obsCells).filter((c) => c.ok).length;
  say(
    d,
    `${
      wrong
        ? `${wrong} of the ${OBS.length} lines did not match what the field showed. `
        : 'Every line matches what the field showed. '
    }${
      cpts === MAX.count
        ? 'Your count was exact.'
        : `The field held **${trueCount}** stomata${
            d.graded.hidden ? ` you could see, with ${d.graded.hidden} more hidden under bubbles` : ''
          }; you wrote ${said}.`
    } Now the conclusion.`,
    wrong === 0 && cpts === MAX.count ? 'good' : 'warn',
  );
  d.step = STEP.concl;
}

function submitConcl(d: StomataState, now: number): void {
  if (d.conclDone || !d.concl.mine || !d.concl.truth) return;
  const real = d.slide.peel ? d.slide.peel.surface : 'lower';
  const consistent = d.concl.mine === real;
  const truthOk = d.concl.truth === 'lower';
  d.conclDone = {
    mine: d.concl.mine,
    truth: d.concl.truth,
    consistent,
    truthOk,
    pts: (consistent ? 4 : 0) + (truthOk ? 4 : 0),
  };
  if (!consistent) mistake(d, now, `The conclusion names the ${d.concl.mine} epidermis, but you peeled the ${real}`);
  if (!truthOk) mistake(d, now, 'Conclusion: stomata are more numerous on the lower epidermis of a dicot leaf');

  say(
    d,
    consistent && truthOk
      ? `Both right: you mounted the **${real}** epidermis, and on a dicot leaf the **lower** epidermis carries far more stomata — it is shaded, so losing water through it costs less.`
      : consistent
        ? 'You have named your own peel correctly. The second half is **lower**: in a dorsiventral dicot leaf almost all the stomata are on the shaded under-surface.'
        : `You peeled the **${real}** epidermis, whatever the conclusion says — a conclusion has to match what you actually did. And on a dicot leaf it is the **lower** epidermis that carries most of the stomata.`,
    consistent && truthOk ? 'good' : 'warn',
  );
  d.step = STEP.viva;
}

function answerViva(d: StomataState, question: number, option: number, now: number): void {
  if (d.viva[question]) return;
  const v = vivaPaperFor(VIVA_BANK, d.seed, d.vivaShuffled)[question];
  if (!v) return;
  const ok = option === v.a;
  d.viva[question] = { pick: option, pts: ok ? VIVA_POINTS : 0 };
  if (!ok) mistake(d, now, `Viva: question ${question + 1}`);
  if (d.viva.every(Boolean)) {
    d.done = true;
    d.tEnd = now;
    d.step = STEPS.length;
  }
}
