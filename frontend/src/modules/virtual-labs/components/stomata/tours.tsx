'use client';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { visibleStomata } from '@labs/lib/stomata/peel';
import type { StomataAction } from '@labs/lib/stomata/reducer';
import type { StomataState } from '@labs/lib/stomata/state';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { BENCH_HEIGHT, BENCH_WIDTH, REGIONS } from './bench';

/**
 * The bench's two tours, written as content for the generic tour engine.
 *
 *   controls  "How to play": every control on the real bench, before anything
 *             is marked. Opens by itself on a first visit.
 *   build     "Guided mount": one peel, start to finish — peel it, float it,
 *             mount it, stain it, cover it, and find the stomata at 40×.
 *
 * Both run on a SANDBOX bench (the host swaps it in), so starting one part way
 * through the practical loses nothing and pauses the clock.
 */
export type StomataTourCtx = BenchTourContext<StomataState, StomataAction>;

type Region = readonly [x: number, y: number, w: number, h: number];

export function createStomataTours(ctx: StomataTourCtx): Record<'controls' | 'build', TourStep<StomataTourCtx>[]> {
  const bench = ctx.stage;
  const find = ctx.find;

  /**
   * A rectangle in BENCH coordinates, mapped to where it actually is on screen.
   * The drawing scales to fit and centres, so it is letterboxed whenever its
   * box has different proportions; scaling by width alone puts the spotlight in
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

  const controls: TourStep<StomataTourCtx>[] = [
    {
      title: 'Your bench',
      body: 'A leaf, a slide, and a microscope that really has to be focused. Nothing here is scripted: what you see down the eyepiece is drawn from the peel that is actually on the slide, stained however you stained it, blurred by however far the stage is from focus. **Nothing you do in this tour is marked.**',
    },
    {
      title: 'The leaf',
      target: region(REGIONS.leaf),
      body: 'A dicot leaf, folded and snapped. A **thin transparent flap** of epidermis is hanging off the torn edge — that is the bit you want: one cell thick, and you can see through it. The green lamina beside it is the whole leaf, far too thick. The leaf is lying **lower surface up**, and on a dicot leaf that is the surface with the stomata on it.',
    },
    {
      title: 'Pick a tool up',
      target: region(REGIONS.tools),
      highlight: ['tool:forceps'],
      body: 'Nothing happens by itself: you pick a tool up, then tap what to use it on. Tapping the same tool again puts it down, and so does **Put down** under the bench.',
      task: 'Tap the **forceps**.',
      done: ({ state }) => state.held?.kind === 'forceps',
      doneMessage: 'The forceps are in your hand.',
    },
    {
      title: 'Pull the flap off',
      target: region(REGIONS.leaf),
      highlight: ['obj:leafFlap'],
      stay: true,
      task: 'Tap the transparent flap at the torn edge.',
      done: ({ state }) => state.held?.kind === 'peel',
      doneMessage: 'The peel is in the forceps.',
      body: 'With the forceps in hand, the flap comes away as a clean sheet of epidermis.',
      after: ({ state }) =>
        state.held?.kind === 'peel'
          ? `That is a sheet of **${state.held.peel.surface} epidermis**. Grab the green part instead and you get a lump several cells thick, which never comes into focus — worth trying once, to see what that looks like.`
          : '',
    },
    {
      title: 'Float it in water',
      target: region(REGIONS.dish),
      highlight: ['obj:dish'],
      body: 'A peel that goes straight from the forceps to the slide curls up on itself, and a fold is two layers thick. Floating it relaxes it flat.',
      task: 'Tap the **watch glass of water**.',
      done: ({ state }) => state.dish !== null,
      doneMessage: 'It is floating flat.',
    },
    {
      title: 'The slide',
      target: region(REGIONS.slide),
      body: 'Everything goes on here, in order: a drop of **water**, then the peel, then a drop of **safranin**, then the **coverslip**, then the **blotting paper**. The slide shows what is really on it — the drop, the peel, and every bubble you trap.',
    },
    {
      title: 'The microscope',
      target: region(REGIONS.scope),
      body: 'Tap an objective to swing it round, the **coarse** and **fine** knobs to move the stage up and down, and the arrow pad to move the slide about under the lens. The stage is where the slide goes, once the coverslip is on it.',
    },
    {
      title: 'Watch the gap',
      target: region(REGIONS.gauge),
      body: 'This is your view from the side: the front lens above, the slide below, and the gap between them. The red band on the scale is where the lens is **into** the slide. At 40× the whole safe range is less than half a turn of the coarse knob, which is why high power is the fine knob only.',
    },
    {
      title: 'Down the eyepiece',
      target: region(REGIONS.eye),
      body: 'What the lens can actually see: 1.52 mm across at 10×, 0.38 mm at 40×. It is blurred when the stage is off the focal plane, colourless if you did not stain, and every air bubble is a thick black ring hiding whatever is under it. Once the slide is on the stage, a **magnified copy** of this view sits in the panel beside the box you type your count into.',
    },
    {
      title: 'Your notebook',
      target: tagged('console'),
      body: 'The top of this panel always shows the step you are on and the one thing to do for it. Underneath, **Observations**, **Drawing** and **Theory** hold your table, the labelled drawing and the textbook — the right one opens itself as you go.',
    },
    {
      title: 'How you are marked',
      target: tagged('stats'),
      body: 'The peel itself, the mounting, the focusing habit (low power first, centred, then high), the observation table, the count, the four labels, the conclusion and the viva. The table is marked against **what your field of view really showed**, not against the textbook — so record what you see. Want to see one mount made properly first? Choose **Guided mount**.',
    },
  ];

  const build: TourStep<StomataTourCtx>[] = [
    {
      title: 'One mount, start to finish',
      body: 'This is a different leaf from your own, so nothing here is marked and nothing is given away. You will make one temporary mount the way the practical asks for it, and find the stomata at 40×.',
    },
    {
      title: 'Pull the flap off',
      target: region(REGIONS.leaf),
      highlight: ['tool:forceps', 'obj:leafFlap'],
      stay: true,
      body: 'The epidermis is one cell thick and almost colourless — that is what makes it worth looking through.',
      task: 'Tap the **forceps**, then the transparent flap on the leaf.',
      done: ({ state }) => state.held?.kind === 'peel' || state.dish !== null || state.slide.peel !== null,
      doneMessage: 'A clean sheet of lower epidermis.',
    },
    {
      title: 'Float it',
      target: region(REGIONS.dish),
      highlight: ['obj:dish'],
      body: 'Straight onto glass it curls, and a fold never comes into focus. In water it relaxes flat.',
      task: 'Tap the **watch glass of water**.',
      done: ({ state }) => state.dish !== null || state.slide.peel !== null,
      doneMessage: 'Floating flat.',
    },
    {
      title: 'Water on the slide FIRST',
      target: region(REGIONS.slide),
      highlight: ['tool:water', 'obj:slide'],
      stay: true,
      body: 'The drop goes down **before** the specimen. A peel laid on dry glass starts drying out at once, and the cells shrivel.',
      task: 'Tap the **water dropper**, then the slide.',
      done: ({ state }) => state.slide.water > 0,
      doneMessage: 'A drop of water is on the slide.',
    },
    {
      title: 'Lay the peel in the drop',
      target: region(REGIONS.tools),
      highlight: ['tool:brush', 'obj:dish', 'obj:slide'],
      stay: true,
      body: 'The brush, not the forceps — a wet peel folds and tears on metal points.',
      task: 'Tap the **brush**, then the water dish, then the slide.',
      done: ({ state }) => state.slide.peel !== null,
      doneMessage: 'The peel is lying flat in the drop.',
    },
    {
      title: 'Stain it with safranin',
      target: region(REGIONS.slide),
      highlight: ['tool:safranin', 'obj:slide'],
      stay: true,
      body: 'The cells are almost colourless on their own. Safranin reddens the walls and the nuclei so the outlines show. One or two drops — flood it and everything goes dark red together, chloroplasts included.',
      task: 'Tap the **safranin**, then the slide.',
      done: ({ state }) => state.slide.stain > 0,
      doneMessage: 'Stained.',
    },
    {
      title: 'Lower the coverslip at an angle',
      target: region(REGIONS.cover),
      highlight: ['tool:needle', 'tool:cover'],
      stay: true,
      body: 'Hold it on the point of the **needle** and let one edge touch the drop first: the liquid runs across and drives the air out ahead of it.',
      task: 'Tap the **needle**, then the coverslip.',
      done: ({ state }) => state.slide.cover !== null,
      after: ({ state }) =>
        state.slide.bubbles.length
          ? `**${state.slide.bubbles.length} bubbles** got trapped. Each one is a thick black ring in the field, hiding whatever is under it.`
          : 'The liquid ran across and drove the air out: **no bubbles**. Tap the coverslip with empty hands instead and it falls flat — try that some time and count the bubbles.',
    },
    {
      title: 'Blot the excess',
      target: region(REGIONS.tools),
      highlight: ['tool:blot', 'obj:slide'],
      stay: true,
      body: 'Too much liquid and the coverslip floats: the mount drifts while you are trying to focus on it.',
      task: 'Tap the **blotting paper**, then the slide.',
      done: ({ state }) => state.slide.blotted,
      doneMessage: 'The excess is drawn off from the edge.',
    },
    {
      title: 'On to the stage',
      target: region(REGIONS.scope),
      highlight: ['obj:slide', 'obj:stage'],
      stay: true,
      body: 'Never do this without the coverslip on — the objective would go straight into the liquid.',
      task: 'Put the blotting paper down, tap the **slide** to pick it up, then the microscope **stage**.',
      done: ({ state }) => state.slide.onStage,
      doneMessage: 'Under the clips.',
    },
    {
      title: 'Find it on low power',
      target: region(REGIONS.knobs),
      highlight: ['mic:coarseUp'],
      body: 'Always 10× first: the field is four times wider and the depth of focus five times deeper, so there is something to find. Watch the gap gauge as you rack up.',
      task: 'Rack the stage up with the **coarse** knob until the image is sharp.',
      done: ({ state }) => state.mic.foundLow,
      doneMessage: 'There it is.',
    },
    {
      title: 'Centre it',
      target: region(REGIONS.stagepad),
      highlight: ['mic:panU', 'mic:panD', 'mic:panL', 'mic:panR'],
      body: 'At 40× you only see the middle of this. Whatever is not in the centre now will not be in the field at all.',
      task: 'Move the stage until the peel fills the field.',
      done: ({ state }) => state.mic.centredLow,
      doneMessage: 'Centred.',
    },
    {
      title: 'High power, fine knob only',
      target: region(REGIONS.objectives),
      highlight: ['mic:obj40'],
      stay: true,
      body: 'Swing the **40×** round and the image barely moves — but the depth of focus collapses to about a fifth. One turn of the coarse knob here drives the lens into the coverslip and cracks the slide.',
      task: 'Tap the **40×** objective, then bring it back with the **fine** knob.',
      done: ({ state }) => state.mic.obj === 40 && state.mic.bestHigh >= 0.6,
      doneMessage: 'A sharp high-power field.',
      after: ({ state }) =>
        `Guard cells, the pore between them, and the chloroplasts inside the guard cells only — that is what you are looking at. This field holds **${
          state.mic.bestHigh >= 0.6 ? visibleStomata(state).length : '—'
        }** stomata; on your own bench you will count them for real.`,
    },
    {
      title: 'That is the whole practical',
      body: 'Peel, float, water, peel, stain, coverslip at an angle, blot; then 10× to find it, centre it, 40× to look at it. Everything after that is recording what you actually saw: the table, the count, the four labels and the conclusion.',
    },
  ];

  return { controls, build };
}
