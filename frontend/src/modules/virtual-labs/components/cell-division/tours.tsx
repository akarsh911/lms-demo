'use client';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { totalMagnification } from '@labs/lib/cell-division/optics';
import type { CellDivisionAction } from '@labs/lib/cell-division/reducer';
import { viewThrough, type CellDivisionState } from '@labs/lib/cell-division/state';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { BENCH_HEIGHT, BENCH_WIDTH, REGION } from './microscope';

/**
 * "How to play": one slide, from the box to a labelled view, on a sandbox
 * microscope.
 *
 * The host swaps the practical out while it runs, so opening it mid-way loses
 * nothing and pauses the clock. Nothing done during the tour is marked, which
 * the first step says out loud — a student who is told that experiments more.
 *
 * Every step that asks for something watches the real instrument for it: the
 * tour cannot be clicked past by a student who has not actually focused.
 */
export type CellDivisionTourCtx = BenchTourContext<CellDivisionState, CellDivisionAction>;

type Region = readonly [x: number, y: number, w: number, h: number];

export function createCellDivisionTours(ctx: CellDivisionTourCtx): {
  controls: TourStep<CellDivisionTourCtx>[];
} {
  const bench = ctx.stage;
  const find = ctx.find;

  /**
   * A rectangle in BENCH coordinates, mapped to where it actually is on screen.
   * The drawing scales to fit and centres, so it is letterboxed whenever its box
   * has different proportions; scaling by width alone lands the spotlight well
   * away from the thing it is naming.
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

  const controls: TourStep<CellDivisionTourCtx>[] = [
    {
      title: 'Your bench',
      body:
        'A compound microscope and a box of six prepared slides, each labelled only by a number. Everything you see ' +
        'through the eyepiece is worked out from where the specimen is on the slide, which objective is swung in, and ' +
        'how far the tube is racked down. **Nothing in the tour is marked.**',
    },
    {
      title: 'The microscope',
      target: region(REGION.scope),
      body:
        'Eyepiece at the top, a nosepiece carrying **10×** and **40×** objectives, the stage with its clips, the lamp ' +
        'in the base, and on the arm the **coarse** and **fine** adjustments that rack the body tube up and down.',
    },
    {
      title: 'The box of slides',
      target: region(REGION.tray),
      body:
        'Six slides. Some carry a cell or an animal caught in the middle of reproducing; some carry the same organism ' +
        'doing nothing at all. The numbers tell you nothing — identifying them is the practical, and the box is dealt ' +
        'from your bench number, so your neighbour’s slide 3 is not yours.',
    },
    {
      title: 'Light first',
      target: region(REGION.lamp),
      highlight: ['lamp'],
      body: 'The dial on the base has four positions: off, low, medium and bright.',
      task: 'Turn the lamp dial to **medium** (press it twice).',
      done: ({ state }) => state.lamp >= 2,
      doneMessage: 'The field is lit.',
      after: () =>
        'A dark field is not an empty slide. At 40× the objective takes in a narrower cone of light, so high power ' +
        'needs the brighter settings — and at 10× the brightest setting washes the specimen out.',
    },
    {
      title: 'Put a slide on',
      target: region(REGION.tray),
      highlight: ['slide:0'],
      body: 'The stage clips hold it down. Take it off again by tapping it a second time.',
      task: 'Tap slide 1 to clip it to the stage.',
      done: ({ state }) => state.mounted !== null,
      doneMessage: 'Clipped under the stage clips.',
    },
    {
      title: 'Through the eyepiece',
      target: region(REGION.eye),
      body:
        'Blurred, and the specimen is not under the objective yet — a mounted specimen is almost never in the middle ' +
        'of the slide. The three meters under the circle read **sharpness**, **how much of the specimen is in the ' +
        'field**, and **light**. They read the instrument, not the answer.',
    },
    {
      title: 'Coarse focus, at low power',
      target: region(REGION.knobs),
      highlight: ['rack:coarse'],
      body: 'Press and hold a knob to keep turning it.',
      task: 'Turn the **coarse** knob until the sharpness meter is past halfway.',
      done: (c) => viewThrough(c.state).sharp >= 0.5,
      doneMessage: 'In focus at 10×.',
      after: () =>
        'The 10× objective has a deep focus and a long working distance — it is almost impossible to hit the slide ' +
        'with it. That is why low power goes first.',
    },
    {
      title: 'Centre it',
      target: region(REGION.stage),
      highlight: ['move'],
      body: 'The mechanical stage carries the slide 0.12 mm at a press.',
      task: 'Use the stage arrows — or drag the image itself — to bring the specimen into the middle.',
      done: (c) => viewThrough(c.state).d <= 0.25,
      doneMessage: 'Centred.',
      after: () =>
        'It looked centred enough already at 10×. It was not: the 40× field is about a **quarter** as wide, and ' +
        'anything off-centre now simply vanishes.',
    },
    {
      title: 'Swing in the 40×',
      target: region(REGION.nose),
      highlight: ['obj:40'],
      body: 'The two objectives are nearly parfocal, so what was sharp at 10× is close at 40× — close, not sharp.',
      task: 'Tap **40× objective**.',
      done: ({ state }) => state.objective === 40,
      doneMessage: 'High power is in.',
    },
    {
      title: 'Fine adjustment only',
      target: region(REGION.knobs),
      highlight: ['rack:fine'],
      body: 'At 40× the depth of field is a quarter of what it was.',
      task: 'Bring it back to a sharp view with the **fine** knob.',
      done: (c) => viewThrough(c.state).q >= 0.6,
      doneMessage: 'Sharp at 400×.',
      stay: true,
      after: (c) =>
        `That is ${totalMagnification(c.state.objective)}× total magnification — the objective times the 10× ` +
        'eyepiece. One click of the **coarse** knob here would have thrown it completely out of focus, and two more ' +
        'would have put the objective through the coverslip. That crack is logged and costs four marks.',
    },
    {
      title: 'Identify it against the plate',
      target: tagged('cd-plate'),
      body:
        'The six stages sit beside the box you write into, so you compare rather than guess — the same thing you do ' +
        'holding a figure in the book against the eyepiece. **Tap the figure your field matches** and the organism and ' +
        'the process go down together. The lists underneath include organisms that are **not** in the box: calling a ' +
        'Paramecium an Amoeba is a mistake, exactly as it would be in the record book.',
    },
    {
      title: 'Then label the pointers',
      target: region(REGION.eye),
      body:
        'On a sharp, centred view at 40× the three numbered pointers appear on the image itself, and the one you are ' +
        'naming glows white. Name what each sits on. The choices include structures that are not on that slide — a ' +
        'pseudopodium is not a bud.',
    },
    {
      title: 'Your observation table',
      target: tagged('console'),
      body:
        'Under the task sit your **Observations**, **The six stages** and the **Theory** — the right one opens itself ' +
        'as you go. Each row is marked against what that slide really carries, so a slide with no bud on it scores ' +
        'nothing for "budding".',
    },
    {
      title: 'How you are marked',
      target: tagged('stats'),
      body:
        'Setting up, a sharp high-power view of each slide, keeping the slides intact, the identifications, eighteen ' +
        'labels, the table, the conclusion and the viva — 100 marks in all, with the rule for each part shipped in ' +
        'your attempt record.',
    },
  ];

  return { controls };
}
