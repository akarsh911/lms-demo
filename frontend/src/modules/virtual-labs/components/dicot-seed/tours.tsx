'use client';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import type { DicotSeedAction } from '@labs/lib/dicot-seed/reducer';
import { SPECIES, swollenPercent } from '@labs/lib/dicot-seed/seed-model';
import type { DicotSeedState } from '@labs/lib/dicot-seed/state';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { BENCH_HEIGHT, BENCH_WIDTH, REGION } from './bench';

/**
 * "How to play": one seed from the dish to the lens, on a sandbox bench.
 *
 * The host swaps the practical out while it runs, so opening it mid-way loses
 * nothing and pauses the clock. Nothing done during the tour is marked, which
 * the first step says out loud — a student who is told that experiments more.
 */
export type DicotSeedTourCtx = BenchTourContext<DicotSeedState, DicotSeedAction>;

type Region = readonly [x: number, y: number, w: number, h: number];

export function createDicotSeedTours(ctx: DicotSeedTourCtx): { controls: TourStep<DicotSeedTourCtx>[] } {
  const bench = ctx.stage;
  const find = ctx.find;

  /**
   * A rectangle in BENCH coordinates, mapped to where it actually is on screen.
   * The drawing scales to fit and centres, so it is letterboxed whenever its
   * box has different proportions; scaling by width alone lands the spotlight
   * well away from the thing it is naming.
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

  /** The dish the tour asks for: whichever position the bench seed put gram in. */
  const firstDish = (c: DicotSeedTourCtx): string => c.state.dishes[0] ?? 'gram';

  const controls: TourStep<DicotSeedTourCtx>[] = [
    {
      title: 'Your bench',
      body:
        'A dicot seed has a coat, two cotyledons and an embryo axis — and you cannot see any of it until the seed has ' +
        'soaked. Everything here is worked out from the seed’s own state: how long it has drunk, whether its coat is ' +
        'off, and whether it was opened along the right plane. **Nothing in this tour is marked.**',
    },
    {
      title: 'Three dicot seeds',
      target: region(REGION.dishes),
      body:
        '**Gram**, **pea** and **red kidney bean** — the three the syllabus names. They differ in size and shape; the ' +
        'parts inside are the same in all three, so take whichever you like.',
    },
    {
      title: 'Pick one up',
      target: region(REGION.dishes),
      highlight: [`dish:${firstDish(ctx)}`],
      body: 'Tap a dish to take a dry seed from it. Whatever is in your hand acts on the next thing you tap.',
      task: 'Tap a **dish of seeds**.',
      done: ({ state }) => state.held?.kind === 'seed',
      doneMessage: 'A dry seed, hard as a pebble.',
    },
    {
      title: 'Into the water',
      target: region(REGION.beaker),
      highlight: ['well:beaker'],
      body: 'Water enters through the micropyle, softens the testa and swells the cotyledons. Nothing else does.',
      task: 'Tap the **beaker of water**.',
      done: ({ state }) => state.specimen?.inWater === true,
      doneMessage: 'Under water. Now time has to pass.',
    },
    {
      title: 'Leave it overnight',
      target: tagged('console'),
      body:
        'The lab clock does the waiting for you. The seed only takes up water while it is **in the beaker**, and it ' +
        'swells on a curve that flattens off after about eight hours.',
      task: 'Press **Wait 12 h**.',
      done: ({ state }) => state.clock >= 12 && state.pending === 0,
      doneMessage: 'Twelve hours on the clock.',
      after: ({ state }) =>
        state.specimen
          ? `The seed has swollen to **${swollenPercent(state.specimen)}%** of its dry size and its coat has gone soft. ` +
            'A seed dissected dry simply shatters, and there is no practical to do — which is the single most common ' +
            'way this one goes wrong.'
          : 'Twelve hours of soaking is what makes the rest of this possible.',
    },
    {
      title: 'Onto the tile',
      target: region(REGION.tile),
      highlight: ['well:beaker'],
      stay: true,
      body: 'The white tile is where the dissection happens, under the lamp.',
      task: 'Tap the **beaker** to lift the seed out, then tap the **white tile**.',
      done: ({ state }) => state.specimen?.onTile === true,
      doneMessage: 'The seed is on the tile — and a magnified view of it has appeared in the console.',
    },
    {
      title: 'The lens is where the work is',
      target: tagged('seed-lens'),
      stay: true,
      body:
        'On the bench the whole seed is about a centimetre across. This is the same seed magnified, docked beside the ' +
        'box you answer in — and it is the drawing you are **marked against**. Along the flattened edge there is a ' +
        'whitish oval scar.',
      task: 'Tap the **oval scar** in the magnified view.',
      done: ({ state }) => state.found.hilum,
      doneMessage: 'That is the hilum.',
      after: () =>
        'The **hilum** is the scar where the seed was attached inside the pod. A short way along the same edge is a ' +
        'pinprick — the **micropyle**, the pore the water entered by. Both are marks on the _coat_, so you must find ' +
        'them **before** you peel it off.',
    },
    {
      title: 'Forceps, needle, blade',
      target: region(REGION.tools),
      body:
        '**Forceps** lift the softened testa off in one piece. The **needle** parts the two cotyledons along the seed’s ' +
        'natural plane — it opens like a book, and the embryo axis stays attached to one half. The **blade** also opens ' +
        'a seed, straight _across_ the cotyledons, cutting the embryo axis in two. That is a ruined specimen, and the ' +
        'bench will let you do it.',
    },
    {
      title: 'The lab clock',
      target: region(REGION.clock),
      body:
        'Every wait is real. Waiting much longer than overnight is not free either: past a day the coat splits on its ' +
        'own, and past a day and a half the cotyledons are waterlogged and mush under the needle. “Overnight” is the ' +
        'instruction for a reason.',
    },
    {
      title: 'The cotton dish',
      target: region(REGION.germ),
      body:
        'Optional, and worth doing. Sow a soaked seed on the wet cotton and let a day pass: the **radicle** pushes out ' +
        'through the micropyle first, and only later does the **plumule** green up above it. That is the last line of ' +
        'the conclusion, seen rather than remembered.',
    },
    {
      title: 'Labelling is the marked part',
      target: tagged('seed-lens'),
      body:
        'Once the seed is open you drop six labels in this view — and you can switch it between the seed **as you ' +
        'found it** and the seed **split open**, because the hilum and micropyle went away with the coat. Each pin is ' +
        'marked against **what is actually under it**: the bench works out where every part lies on _your_ seed, at ' +
        'its size and shape. A label in roughly the right area is wrong.',
    },
    {
      title: 'How you are marked',
      target: tagged('stats'),
      body:
        'Soaking 10, finding the hilum and micropyle 10, the dissection 10, the six labels 30, the observation table ' +
        '14, the conclusion 6 and the viva 20. Ruining a seed costs 3 and does not come back; tearing a coat costs 1; ' +
        'so does hunting blindly with the lens.',
    },
  ];

  return { controls };
}
