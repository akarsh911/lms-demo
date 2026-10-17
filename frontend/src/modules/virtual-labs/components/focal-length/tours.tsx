'use client';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { OPT, cm1, opticsOf, screenView, setupFor } from '@labs/lib/focal-length/optics';
import type { FocalLengthAction } from '@labs/lib/focal-length/reducer';
import type { FocalLengthState } from '@labs/lib/focal-length/state';
import type { BenchTourContext } from '@labs/types/lab-bench';

import {
  BENCH_HEIGHT,
  BENCH_WIDTH,
  RG_MIRROR_RUN,
  RG_SCALE,
  RG_SCREEN_RUN,
  RG_SPARE,
  RG_WINDOW,
  RG_ZOOM,
  type Region,
} from './geometry';

/**
 * "How to play": every control on the optical bench, on a sandbox bench where
 * nothing is marked. It opens itself on a first visit.
 *
 * There is no separate guided build here. On the Ohm's law bench the build is
 * seven wires whose ORDER is the lesson; here the apparatus is four objects in
 * a line and the whole difficulty is the search for the sharp image — so the
 * tour spends its "your turn" steps on exactly that, and on the two readings
 * that come out of it.
 */
export type FocalLengthTourCtx = BenchTourContext<FocalLengthState, FocalLengthAction>;

/** Is the mirror's image sharp on the card right now? */
function mirrorView(s: FocalLengthState) {
  return screenView(setupFor('mirror', s), s.pos.mirror.scr);
}

export function createFocalLengthTours(
  ctx: FocalLengthTourCtx,
): { controls: TourStep<FocalLengthTourCtx>[] } {
  const bench = ctx.stage;
  const find = ctx.find;

  /**
   * A rectangle in BENCH centimetre-derived coordinates, mapped to where it
   * actually is on screen. The drawing is letterboxed inside its box whenever
   * the proportions differ, so scaling by width alone lands the spotlight in
   * the wrong place.
   */
  const region = ([x, y, w, h]: Region): TourTarget => ({
    element: bench,
    region: (box): TourRect => {
      const k = Math.min(box.width / BENCH_WIDTH, box.height / BENCH_HEIGHT);
      const originX = box.left + (box.width - BENCH_WIDTH * k) / 2;
      const originY = box.top + (box.height - BENCH_HEIGHT * k) / 2;
      return { left: originX + x * k, top: originY + y * k, width: w * k, height: h * k };
    },
  });
  const tagged = (name: string): TourTarget => ({ element: () => find(name), pad: 6 });

  const controls: TourStep<FocalLengthTourCtx>[] = [
    {
      title: 'Your bench',
      body:
        'A window with a view far away, a **concave mirror** on a stand, a **screen** on a stand, and a **metre scale** ' +
        'running the length of the bench. Everything you see is worked out from the real optics, so the image blurs ' +
        'exactly as far as the screen is from the focal plane. **Nothing in the tour is marked.**',
    },
    {
      title: 'The distant object',
      target: region(RG_WINDOW),
      body:
        'Rays from a tree 120 m away reach a 5 cm mirror spreading over about two hundredths of a degree — parallel, ' +
        'for this experiment. Parallel rays meet at the **principal focus**, so the sharp image lands in the focal ' +
        'plane and screen-to-pole distance = **f**.\n' +
        '**Never** use the Sun, and never look at it through a lens or a mirror.',
    },
    {
      title: 'Aim the mirror',
      target: tagged('console'),
      body:
        'The panel beside the bench always holds the step you are on and the one thing it asks for. Right now that ' +
        'is what the mirror is looking at.',
      task: 'Choose **Tree ≈ 120 m away**.',
      done: ({ state }) => state.obj.mirror === 'tree',
      doneMessage: 'The beam is now falling on the mirror.',
    },
    {
      title: 'The two stands',
      target: region(RG_SCREEN_RUN),
      highlight: ['comp', 'scr'],
      body:
        'Both the mirror and the screen sit on stands you can slide along the bench. Drag one, or select it and use ' +
        'the **← →** keys — 1 mm at a time, or 1 cm with **Shift**. The buttons under the bench do the same. A stand ' +
        'is pushed by hand, so it never lands on an exact millimetre.',
    },
    {
      title: 'Pick up a stand',
      target: region(RG_MIRROR_RUN),
      highlight: ['comp'],
      body: 'Whatever you tap last is what the arrow keys and the close-up follow.',
      task: 'Tap the **mirror** stand.',
      done: ({ state }) => state.sel === 'comp',
    },
    {
      title: 'Hunt for the sharp image',
      target: tagged('fl-closeup'),
      stay: true,
      body:
        'On the bench the card is a few pixels wide, which is exactly how much use it is from where you are standing. ' +
        'The close-up magnifies it fifty-five times. Away from the focal plane every point of the tree spreads into a ' +
        'blur circle that grows the further you go — either way.',
      task: 'Select the **screen** and move it until the close-up says **Sharp**.',
      done: ({ state }) => {
        const view = mirrorView(state);
        return view.lit && view.sharp;
      },
      doneMessage: 'That is the focal plane.',
      after: ({ state }) =>
        `The image is **real** — it is genuinely there on the card — **inverted**, and about ` +
        `**${cm1(opticsOf(setupFor('mirror', state)).h)} cm** tall, from a tree 8 m high. Move a centimetre either ` +
        'way and watch it go.',
    },
    {
      title: 'The zoom over the cone',
      target: region(RG_ZOOM),
      body:
        'The strip above the bench is **seven centimetres of it**, magnified about twelve times along and twenty ' +
        'across, centred on where the cone closes. It is the only place a blur circle of a few tenths of a ' +
        'millimetre is big enough to watch: the pale bar is the screen, the yellow stroke through it is the blur ' +
        'circle, and the bar in the corner is **one millimetre to the same scale**, so you can see how close you ' +
        'are rather than being told.\n' +
        'The green band is the stretch in which the blur is under a millimetre — as sharp as this bench goes. ' +
        'Whether you are sharp enough is still yours to judge.',
    },
    {
      title: 'The rays are drawn for you',
      target: tagged('teach-toggle'),
      body:
        'The beam coming in, the cone closing on the image and the cone opening out past it are a **teaching aid**. ' +
        'A real optical bench shows you none of them — there is no light in the air to see, only the patch on the ' +
        'card. **Rays** under the bench takes them away, and the zoom panel goes with them, because it is a ' +
        'magnified view of the same light. Nothing you are marked on goes: the card, the blur circle in the ' +
        'close-up and the scale are all still there.',
      task: 'Press **Rays** and watch the light go.',
      done: ({ state }) => !state.rays,
      doneMessage: 'That is the bench as it really is.',
      after: () =>
        'What is left is the card and whatever is falling on it, which is all you ever had to judge focus by. ' +
        'Press **Rays** again to bring them back — leave them on while you are learning the bench.',
    },
    {
      title: 'Read the metre scale',
      target: tagged('fl-scale'),
      body:
        'The bench scale is printed too coarse to read to a millimetre — that is what the magnifier is for. It sits ' +
        'under whichever stand is selected, each small division is 1 mm, and you read the red **index mark** against ' +
        'it. Select the mirror to read the mirror’s position, the screen to read the screen’s.',
    },
    {
      title: 'Record the trial',
      target: tagged('console'),
      body:
        'Type the two positions and press **Record**. **f = |a − b|**. Both readings are marked against where the ' +
        'stands really are, within one least count — 0.1 cm — and the focus is marked by the blur circle you left on ' +
        `the card: 4 marks under 1.0 mm, 2 under ${cm1(OPT.okBlur * 10)} mm, nothing beyond that.`,
    },
    {
      title: 'Three trials, then the lens',
      target: region(RG_SPARE),
      highlight: ['spare'],
      body:
        `Move the mirror at least ${OPT.moveBetweenTrials} cm and focus again for each trial, then take the mean. ` +
        'After that the **convex lens** lying at the front of the bench goes into the stand and the whole thing is ' +
        'done again — except that the screen now goes **behind** the lens, because light passes through it.',
    },
    {
      title: 'The scale runs the whole bench',
      target: region(RG_SCALE),
      body:
        'One metre scale, 0 to 100 cm, and both readings come off it. That is why the practical works at all: you ' +
        'never measure f directly, you measure two positions and subtract.',
    },
    {
      title: 'How you are marked',
      target: tagged('stats'),
      body:
        'Marks come from a safe, distant object, a genuinely sharp image, honest scale readings, means that follow ' +
        'from your own three trials, and a conclusion that follows from your means. Every bench has different focal ' +
        'lengths, drawn from the bench number, so there is nothing to copy.',
    },
  ];

  return { controls };
}
