'use client';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { POUR, SAMPLE_BY_ID, pHof, volume } from '@labs/lib/ph-samples/chemistry';
import type { PhAction } from '@labs/lib/ph-samples/reducer';
import { tubeOf, type PhState } from '@labs/lib/ph-samples/state';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { BENCH_HEIGHT, BENCH_WIDTH, REGION } from './bench';

/**
 * "How to play": one sample taken from bottle to reading, on a sandbox bench.
 *
 * The host swaps the practical out while it runs, so opening it mid-way loses
 * nothing and pauses the clock. Nothing done during the tour is marked, which
 * the first step says out loud — a student who is told that experiments more.
 */
export type PhTourCtx = BenchTourContext<PhState, PhAction>;

type Region = readonly [x: number, y: number, w: number, h: number];

export function createPhTours(ctx: PhTourCtx): { controls: TourStep<PhTourCtx>[] } {
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

  /** Where dilute HCl sits on THIS bench — the rack is arranged from the seed. */
  const acidTube = (c: PhTourCtx): number => tubeOf(c.state, 'HCl');

  const controls: TourStep<PhTourCtx>[] = [
    {
      title: 'Your bench',
      body:
        'Six samples, a colour chart and two ways to test. Every colour you see here is worked out from the actual pH ' +
        'of what is in the tube. This tour takes one sample from bottle to reading. **Nothing in the tour is marked.**',
    },
    {
      title: 'The six samples',
      target: region(REGION.bottles),
      body:
        'Dilute hydrochloric acid, dilute ethanoic acid, lemon juice, distilled water, dilute sodium hydrogen carbonate ' +
        'and dilute sodium hydroxide. Most of them look identical — that is the point of the test.',
    },
    {
      title: 'The colour chart',
      target: region(REGION.chart),
      body:
        'Universal indicator takes a different colour at every pH: **reds and oranges** for acids, **green** at neutral ' +
        'pH 7, **blues and violets** for bases. You read a pH by matching a colour against this chart.',
    },
    {
      title: 'Two ways to test',
      target: region(REGION.tools),
      body:
        'Dip a strip of **pH paper** and lay it on the tile, or drop **universal indicator** into the tube so the ' +
        'solution itself takes the colour. The syllabus accepts either.',
    },
    {
      title: 'Pick up a bottle',
      target: region(REGION.bottles),
      highlight: ['sample:HCl'],
      body: 'Tap a bottle to pick it up, and tap it again to put it down. Whatever is in your hand acts on the next tube you tap.',
      task: 'Tap the **dil. HCl** bottle.',
      done: ({ state }) => state.held?.kind === 'bottle' && state.held.id === 'HCl',
    },
    {
      title: 'Pour it',
      target: region(REGION.rack),
      // Resolved to a rack position by `highlightsFor`: which tube holds HCl
      // depends on the bench, so the step cannot name an index.
      highlight: ['tube@HCl'],
      body:
        'Each tube is labelled underneath with the sample that belongs in it — they are not in the same order on every ' +
        'bench, so read the labels. Pouring a sample into the wrong tube makes a mixture, and a mixture has its own pH.',
      task: `Tap the tube labelled **HCl** to add ${POUR} mL.`,
      done: (c) => volume(c.state.tubes[acidTube(c)] ?? { liq: {} }) > 0,
    },
    {
      title: 'Put it down',
      target: tagged('ph-hands'),
      body: 'The strip under the bench always says what is in your hand. Empty a tube and rinse it here too, if you spoil one.',
      task: 'Tap **Put down**, or press Esc.',
      done: ({ state }) => state.held === null,
    },
    {
      title: 'Dip the paper',
      target: region([48, 196, 930, 404]),
      highlight: ['tool:paper', 'tube@HCl'],
      stay: true,
      body: 'A fresh strip comes off the pad for every sample — a used one still carries the last solution and would lie to you.',
      task: 'Tap the **pH paper**, then tap that tube.',
      done: (c) => (c.state.tubes[acidTube(c)]?.strip ?? null) !== null,
      doneMessage: 'The strip is on the tile.',
      after: (c) => {
        const ph = pHof(c.state.tubes[acidTube(c)] ?? { liq: {} }) ?? 1;
        return (
          `The strip went **red**. Held against the chart, red sits at **pH ${ph.toFixed(0)}** — dilute hydrochloric ` +
          'acid is a strong acid. That is the whole method: colour in, pH out.'
        );
      },
    },
    {
      title: 'Or use the indicator',
      target: region(REGION.tools),
      body:
        'The other way round: pick up the **universal indicator** and drop it straight into a tube. The solution itself ' +
        'takes the colour, which is easier to see for pale samples. Either method counts as a test.',
    },
    {
      title: 'Match the colour',
      target: tagged('ph-chart'),
      body:
        'At the Record step this panel holds the colour from the tube you have selected, right against the chart — the ' +
        'same comparison you would make by holding a wet strip up to the card. **Tap the square that matches** and its ' +
        'pH goes into the box.',
    },
    {
      title: 'Your observation table',
      target: tagged('console'),
      body:
        'Under the task sit your **Observations**, the **Colour chart** and the **Theory** — the right one opens itself ' +
        'as you go. Readings are marked against the pH of what is really in that tube, and a reading within 1 pH still ' +
        'counts: colour matching is never exact.',
    },
    {
      title: 'How you are marked',
      target: tagged('stats'),
      body:
        'Marks come from the right sample in each tube, testing every one, reading the colours carefully, and an order ' +
        'that follows from your own readings. Every slip is logged so you can learn from it — pouring ' +
        `**${SAMPLE_BY_ID.NaOH.label}** into the lemon juice tube costs three marks and does not come back.`,
    },
  ];

  return { controls };
}
