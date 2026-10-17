'use client';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { DROPS, LEAST_COUNT, POUR, SHAKES_MIN } from '@labs/lib/soap/chemistry';
import { TUBE_A, TUBE_B } from '@labs/lib/soap/marking';
import type { SoapAction } from '@labs/lib/soap/reducer';
import { latherIn, tubeAt, volumeIn, type SoapState } from '@labs/lib/soap/state';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { BENCH_HEIGHT, BENCH_WIDTH, REGION } from './bench';

/**
 * "How to play": one comparison, start to finish, on a sandbox bench.
 *
 * The host swaps the practical out while it runs, so opening it mid-way loses
 * nothing and pauses the clock. Nothing done during the tour is marked, which
 * the first step says out loud — a student who is told that experiments more.
 */
export type SoapTourCtx = BenchTourContext<SoapState, SoapAction>;

type Region = readonly [x: number, y: number, w: number, h: number];

export function createSoapTours(ctx: SoapTourCtx): { controls: TourStep<SoapTourCtx>[] } {
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

  const controls: TourStep<SoapTourCtx>[] = [
    {
      title: 'Your bench',
      body:
        'Two waters that look identical, one soap solution, and a scale. Every bubble you will see here is worked out ' +
        'from what is actually in the tube — the water’s hardness, the soap you add and how hard you shake. ' +
        '**Nothing in the tour is marked.**',
    },
    {
      title: 'The two waters',
      target: region(REGION.waters),
      body:
        'Distilled water carries no calcium or magnesium. Hard water carries dissolved **Ca²⁺ and Mg²⁺** salts. ' +
        'Boiled hard water is the third bottle — boiling drives off the temporary hardness, and it is optional and ' +
        'unmarked.',
    },
    {
      title: 'The soap',
      target: region(REGION.soap),
      body:
        `Soap is the sodium salt of a fatty acid, C₁₇H₃₅COONa. One squeeze of the dropper gives **${DROPS} drops**. ` +
        'The card on the bench shows what those ions do to it.',
    },
    {
      title: 'Pick up the distilled water',
      target: region(REGION.waters),
      highlight: ['water:soft'],
      body: 'Tap a bottle to pick it up, and tap it again to put it down. Whatever is in your hand acts on the next tube you tap.',
      task: 'Tap the **distilled water** bottle.',
      done: ({ state }) => state.held?.kind === 'water' && state.held.id === 'soft',
    },
    {
      title: 'Fill tube A',
      target: region(REGION.tubeA),
      highlight: ['tube:0'],
      body: 'The label under each tube says which water belongs in it. Pouring the wrong one spoils that tube until it is rinsed.',
      task: `Tap tube **A** to add ${POUR} mL.`,
      done: ({ state }) => volumeIn(state, TUBE_A) > 0,
    },
    {
      title: 'Now the same volume of hard water',
      target: region(REGION.tubesAB),
      highlight: ['water:hard', 'tube:1'],
      stay: true,
      task: 'Tap the **hard water** bottle, then tube **B**.',
      body:
        'Equal volumes matter. If one tube held more water, the soap in it would be more dilute, and you could not ' +
        'tell hardness from dilution.',
      done: ({ state }) => volumeIn(state, TUBE_B) > 0,
      doneMessage: 'Equal volumes in both tubes.',
    },
    {
      title: 'Equal soap in each',
      target: region(REGION.tubesAB),
      highlight: ['tool:soap', 'tube:0', 'tube:1'],
      stay: true,
      body: 'The same soap, the same amount, into both tubes — different amounts would make any difference in froth meaningless.',
      task: 'Tap the **soap dropper**, then tube A, then tube B.',
      done: ({ state }) => tubeAt(state, TUBE_A).drops > 0 && tubeAt(state, TUBE_B).drops > 0,
      doneMessage: 'Same number of drops in both.',
      after: ({ state }) =>
        `A has ${tubeAt(state, TUBE_A).drops} drops and B has ${tubeAt(state, TUBE_B).drops}. Keep them equal.`,
    },
    {
      title: 'Shake both, equally',
      target: region(REGION.tubesAB),
      highlight: ['tool:cork', 'tube:0', 'tube:1'],
      stay: true,
      body: 'Shaking is what turns free soap into froth, so it has to be the same in both tubes.',
      task: `Tap the **corks**, then tap tube A ${SHAKES_MIN} times and tube B ${SHAKES_MIN} times.`,
      done: ({ state }) =>
        tubeAt(state, TUBE_A).shakes >= SHAKES_MIN && tubeAt(state, TUBE_B).shakes >= SHAKES_MIN,
      doneMessage: 'Both corked and shaken the same way.',
      after: ({ state }) => {
        const a = latherIn(state, TUBE_A);
        const b = latherIn(state, TUBE_B);
        return (
          `Tube A has ${a.lather > 0.05 ? 'a head of froth standing above the water' : 'no froth'}; tube B has ` +
          `${b.lather > 0.05 ? 'some froth' : 'almost none'}${
            b.scumSeen ? ', and the water has gone cloudy with **curdy scum**' : ''
          }. The soap in B was precipitated by the Ca²⁺ and Mg²⁺ ions before it could foam.`
        );
      },
    },
    {
      title: 'The scale',
      target: region(REGION.scale),
      highlight: ['tool:scale', 'tube:0'],
      stay: true,
      body: 'It stands with its **zero at the water line**, so the froth height reads straight off it.',
      task: 'Tap the **scale**, then tap tube A.',
      done: ({ state }) => tubeAt(state, TUBE_A).measured,
      doneMessage: 'The scale is against tube A.',
      after: () =>
        `Each small division is ${LEAST_COUNT} cm — that is the least count, and a reading within one of them scores ` +
        'full marks.',
    },
    {
      title: 'Read it in the close-up',
      target: tagged('soap-closeup'),
      body:
        'The bench view is too small to read millimetres — use this magnified tube, exactly as you would lean in over ' +
        'the real one. It sits right beside the box you type into: **tap the scale where the froth ends** and the ' +
        'reading goes in. Measure the froth, not the scummy layer sitting in the water.',
    },
    {
      title: 'Your hands, and the waste beaker',
      target: tagged('soap-hands'),
      body:
        'The strip under the bench always says what is in your hand. Spoil a tube with the wrong water and **Empty and ' +
        'rinse** gives you it back, marks included.',
    },
    {
      title: 'The notebook',
      target: tagged('console'),
      body:
        'Under the task sit your **Observations**, the **Fair test** check and the **Theory**. You are marked against ' +
        'what your tube actually showed, so an honest reading of an odd-looking tube still scores.',
    },
    {
      title: 'Then make the hard water lather',
      target: region(REGION.rack),
      highlight: ['tube:1'],
      body:
        'After the table comes the extension: keep soaping tube B. Once every Ca²⁺ and Mg²⁺ ion has been thrown out ' +
        'as scum, the next soap you add stays in solution and **hard water lathers too** — which is the real lesson of ' +
        'this practical, and worth 8 marks.',
    },
    {
      title: 'How you are marked',
      target: tagged('stats'),
      body:
        'Marks come from setting the tubes up, keeping the test fair, reading the scale carefully, seeing the scum, ' +
        'the extension, the conclusion and the viva. Every slip is logged so you can learn from it.',
    },
  ];

  return { controls };
}
