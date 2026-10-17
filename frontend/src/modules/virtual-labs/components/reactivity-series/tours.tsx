'use client';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { tubeIndex, volumeOf } from '@labs/lib/reactivity-series/chemistry';
import type { RxAction } from '@labs/lib/reactivity-series/reducer';
import type { RxState } from '@labs/lib/reactivity-series/state';
import type { BenchTourContext } from '@labs/types/lab-bench';

import {
  BENCH_HEIGHT,
  BENCH_WIDTH,
  HOT,
  RG_BOTTLES,
  RG_CLOCK,
  RG_RACK,
  RG_TILE,
  RG_TOOLS,
  cellRegion,
  columnRegion,
  type Region,
} from './geometry';

/**
 * "How to play": one tube taken from an empty rack to a finished reaction, on a
 * SANDBOX bench the workspace swaps in, so nothing here is marked and the
 * student's own practical is untouched.
 *
 * Every "your turn" step watches the real bench — the tour never simulates a
 * tap. The one that matters is *Let time pass*: it is the first time a student
 * sees that a reaction has a rate, which is the whole lesson of this practical.
 */
export type RxTourCtx = BenchTourContext<RxState, RxAction>;

/** The zinc tube of the copper sulphate column: the fastest reaction on the bench. */
const ZN_IN_CU = tubeIndex('Zn', 'CuSO4');

export function createReactivityTours(ctx: RxTourCtx): { controls: TourStep<RxTourCtx>[] } {
  const bench = ctx.stage;
  const find = ctx.find;

  /**
   * A rectangle in BENCH coordinates, mapped to where it actually is on screen.
   * The drawing scales to fit and centres, so it is letterboxed whenever the
   * box's proportions differ from the bench's; scaling by width alone would
   * land the spotlight well away from the tube it is naming.
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

  const controls: TourStep<RxTourCtx>[] = [
    {
      title: 'Your chemistry bench',
      body: 'Everything here comes from the chemistry itself — each colour you see is worked out from what is actually in that tube. This short tour takes one tube from start to finish. **Nothing in the tour is marked.**',
    },
    {
      title: 'Salt solutions',
      target: region(RG_BOTTLES),
      body: 'Four dropper bottles. Zinc sulphate and aluminium sulphate are **colourless**, iron(II) sulphate is **pale green**, and copper sulphate is **blue**.',
    },
    {
      title: 'Metal strips and sandpaper',
      target: region(RG_TOOLS),
      body: 'Strips of zinc, iron, copper and aluminium. Left in air, metal grows a dull oxide coat — these strips need **sandpaper** before they will react properly.',
    },
    {
      title: 'The rack is your table',
      target: region(RG_RACK),
      body: 'Sixteen tubes: a **row** for each metal, a **column** for each solution — the same grid as the observation table you will fill in. Each column gets the solution named above it; each row takes the metal named beside it.',
    },
    {
      title: 'The lab clock',
      target: region(RG_CLOCK),
      body: 'The reactions here take **minutes**, not seconds, and they are all going on at different rates. This clock is the experiment’s own: you run it forward from the bench edge, and every tube reacts while it moves.',
    },
    {
      title: 'Pick up a bottle',
      target: region(RG_BOTTLES),
      highlight: [HOT.bottle('CuSO4')],
      body: 'Tap a bottle to pick it up, and tap it again to put it down. Whatever is in your hand is named along the bench edge.',
      task: 'Tap the **CuSO₄** bottle.',
      done: ({ state }) => state.held?.kind === 'bottle' && state.held.salt === 'CuSO4',
    },
    {
      title: 'Pour into a tube',
      target: region(columnRegion('CuSO4')),
      highlight: [HOT.tube('Zn', 'CuSO4')],
      body: 'With a bottle in your hand, a tap on a tube adds **5 mL**.',
      task: 'Tap the **Zn** tube in the **CuSO₄** column — top row, third along.',
      done: ({ state }) => (state.tubes[ZN_IN_CU]?.liq.CuSO4 ?? 0) > 0,
    },
    {
      title: 'Put it down',
      target: tagged('bench-controls'),
      body: 'The bench edge always says what is in your hand, and it is where the lab clock lives.',
      task: 'Tap **Put down**.',
      done: ({ state }) => state.held === null,
    },
    {
      title: 'Clean the zinc',
      target: region(RG_TILE),
      highlight: [HOT.sand, HOT.metal('Zn')],
      body: 'Sandpaper takes the dull oxide coat off a metal. Do it **before** the strip goes in: cleaning the tile afterwards does nothing for a strip already in a tube.',
      task: 'Tap the **sandpaper**, then tap the **Zn** strips.',
      done: ({ state }) => state.clean.Zn,
    },
    {
      title: 'Drop in a strip',
      target: region(cellRegion('Zn', 'CuSO4')),
      highlight: [HOT.metal('Zn'), HOT.tube('Zn', 'CuSO4')],
      body: 'One strip per tube. The moment a strip meets a solution, that tube’s clock starts.',
      task: 'Pick up a **zinc** strip, then tap the same tube.',
      done: ({ state }) => state.tubes[ZN_IN_CU]?.strip?.metal === 'Zn',
    },
    {
      title: 'Let time pass',
      target: tagged('bench-controls'),
      stay: true,
      body: 'Displacement is not instant. **Wait** runs the lab clock forward and every tube reacts while it does.',
      task: 'Tap **Wait 5 min** on the bench edge.',
      done: ({ state }, entry) => state.min >= entry.state.min + 5 && state.waitTo === null,
      doneMessage: 'Five lab minutes later…',
      after: () =>
        'The blue is fading and the zinc is turning **reddish-brown**. Zinc is pushing copper out of the solution, and the copper is settling on the strip. Aluminium in zinc sulphate would still look untouched — it needs about nine minutes.',
    },
    {
      title: 'Look closely',
      target: tagged('close-up'),
      highlight: [HOT.tube('Zn', 'CuSO4')],
      body: 'A tube in the rack is 46 pixels wide; this is the same tube four times the size. Tap any tube — or any cell of the table — to bring it here.',
      task: 'Tap that tube to bring it into the close-up.',
      done: ({ state }) => state.sel === ZN_IN_CU && volumeOf(state.tubes[ZN_IN_CU]!) > 0,
    },
    {
      title: 'Your observation table',
      target: tagged('console'),
      body: 'At the **Record** step you describe every tube here: the colour of the solution and any deposit on the strip. Each one is marked against what that tube **really shows** — not against what the book says should happen.',
    },
    {
      title: 'How you are marked',
      body: 'Marks come from careful work: the right solution and strip in every tube, clean strips, patient observation, honest recording, and a conclusion that follows from your own table. Every slip is logged so you can learn from it.',
    },
  ];

  return { controls };
}
