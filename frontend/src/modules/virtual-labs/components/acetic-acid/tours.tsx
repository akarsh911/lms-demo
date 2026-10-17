'use client';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { MLGAS, SMELL_TEXT, volume } from '@labs/lib/acetic-acid/chemistry';
import { TUBE } from '@labs/lib/acetic-acid/rack';
import type { AceticAcidAction } from '@labs/lib/acetic-acid/reducer';
import type { AceticAcidState } from '@labs/lib/acetic-acid/state';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { BENCH_HEIGHT, BENCH_WIDTH, REGION } from './apparatus';

/**
 * The bench's two tours, written as content for the generic tour engine.
 *
 *   controls  "How to play": every control, one property taken from bottle to
 *             reading. Opens by itself on a first visit.
 *   build     "Guided build": part (d) done properly — lime water and delivery
 *             tube fitted BEFORE the carbonate goes in, which is the one thing
 *             students lose the gas to.
 *
 * Both run on a SANDBOX bench (the workspace swaps it in), so opening one
 * half-way through the practical loses nothing and pauses the clock.
 */
export type AceticTourCtx = BenchTourContext<AceticAcidState, AceticAcidAction>;

type Region = readonly [x: number, y: number, w: number, h: number];

export function createAceticAcidTours(ctx: AceticTourCtx): {
  controls: TourStep<AceticTourCtx>[];
  build: TourStep<AceticTourCtx>[];
} {
  const bench = ctx.stage;
  const find = ctx.find;

  /**
   * A rectangle in BENCH coordinates, mapped to where it actually is on screen.
   * The drawing scales to fit and centres, so it is letterboxed whenever its
   * box has different proportions; scaling by width alone would put the
   * spotlight beside the bottle it is naming rather than on it.
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

  const tube = (c: AceticTourCtx, n: number) => c.state.tubes[n]!;
  const filled = (c: AceticTourCtx, n: number) => volume(tube(c, n)) > 0;

  const controls: TourStep<AceticTourCtx>[] = [
    {
      title: 'Your bench',
      body:
        'One acid, four properties. Every smell, layer, colour and bubble you will see here is worked out from what is ' +
        'actually in the tube — nothing is on a script. This tour takes one property from bottle to reading. ' +
        '**Nothing in the tour is marked.**',
    },
    {
      title: 'The reagents',
      target: region(REGION.bottles),
      body:
        'Dilute acetic acid, distilled water, lime water, vegetable oil, and dilute hydrochloric acid. The oil is there ' +
        'as a contrast for the solubility test, and the HCl so you can see what a **strong** acid reads compared with a weak one.',
    },
    {
      title: 'The solid',
      target: region(REGION.jar),
      body:
        'A jar of solid **sodium hydrogen carbonate**. One spatula tipped into an acid gives carbon dioxide. Tip it into ' +
        'something that is not an acid and nothing happens — the bench works that out from what is in the tube.',
    },
    {
      title: 'Litmus against pH',
      target: region(REGION.card),
      body:
        'Litmus is a pH indicator: **red** below about pH 5, **blue** above about pH 8, its own purple in between. The ' +
        'strips you dip take their colour from the tube’s computed pH, so this chart is a real reference.',
    },
    {
      title: 'Your tools',
      target: region(REGION.tools),
      body:
        'Blue and red litmus, pH paper, a glass rod for shaking, two ways to smell, a delivery tube for carrying gas from ' +
        'one tube to another, and a lighted splinter. Pick one up, then tap the tube you want to use it on.',
    },
    {
      title: 'Pick up the acid',
      target: region(REGION.bottles),
      highlight: ['bottle:acid'],
      body: 'Everything starts the same way: take something in your hand, then tap a tube with it.',
      task: 'Tap the **dil. CH₃COOH** bottle.',
      done: ({ state }) => state.held?.kind === 'bottle' && state.held.id === 'acid',
    },
    {
      title: 'Pour it',
      target: region(REGION.tube1),
      highlight: ['tube:0'],
      body: 'Each tap pours 5 mL. The bottle stays in your hand, so you can fill several tubes without picking it up again.',
      task: 'Tap tube 1 to add 5 mL.',
      done: (c) => filled(c, TUBE.sample),
    },
    {
      title: 'Put it down',
      target: tagged('benchbar'),
      body: 'The bar under the bench always says what is in your hand, and it is where you put it down again.',
      task: 'Tap **Put down**, press Esc, or tap an empty part of the bench.',
      done: ({ state }) => state.held === null,
    },
    {
      title: 'Smell it — safely',
      target: region(REGION.smell),
      highlight: ['tool:waft', 'tube:0'],
      stay: true,
      body:
        'Never put your nose over a tube. Hold it away from you and fan the vapour towards your nose with your hand — ' +
        'that brings you a trace instead of a lungful.',
      task: 'Tap **WAFT**, then tap tube 1.',
      done: (c) => Boolean(tube(c, TUBE.sample).smelled),
      doneMessage: 'You wafted it.',
      after: (c) =>
        `That is ${SMELL_TEXT[tube(c, TUBE.sample).smellSeen ?? 'none']} — the smell of vinegar, worked out from how much ` +
        'un-ionised acid is in the tube. Dilute it and it fades. **SNIFF DIRECTLY** is on the bench beside it: it costs ' +
        'technique marks and it is logged, because in a real lab it can burn your airway.',
    },
    {
      title: 'Test it with litmus',
      target: region(REGION.tube1),
      highlight: ['tool:blue', 'tube:0'],
      stay: true,
      body: 'A fresh strip each time. Read the colour against the chart on the bench, not against what you expected.',
      task: 'Tap **BLUE LITMUS**, then tap tube 1.',
      done: (c) => Boolean(tube(c, TUBE.sample).strips.blue),
      doneMessage: 'The strip is in.',
      after: (c) => {
        const strip = tube(c, TUBE.sample).strips.blue;
        return (
          `The strip went **${strip?.hue ?? 'red'}**. That tube’s pH is ${strip?.ph.toFixed(1) ?? '3'}, which lands in the ` +
          'red band on the chart. Try **pH PAPER** on tube 1 and on tube 6 later — a weak acid and a strong one at the ' +
          'same concentration read about two pH units apart.'
        );
      },
    },
    {
      title: 'Carrying the gas',
      target: region(REGION.pipe),
      body:
        'For part (d) the **delivery tube** goes from the tube making the gas into the tube of lime water: tap it, tap the ' +
        'source tube, then tap the destination. Fit it **before** you add the NaHCO₃, or most of the gas escapes into the room.',
    },
    {
      title: 'Your observation table',
      target: tagged('console'),
      body:
        'This panel asks for one row at a time, with the tube it is about magnified beside it. Each row is marked against ' +
        '**what that tube actually showed**, not against the textbook: a row you never tested is recorded as not tested, ' +
        'and writing down effervescence in a tube that never fizzed is a mistake.',
    },
    {
      title: 'How you are marked',
      target: tagged('stats'),
      body:
        'Marks come from setting the tubes up correctly, smelling safely, actually carrying out all eight tests, an honest ' +
        'observation table, a conclusion that follows from your own results, and the viva. Want to see the trickiest part ' +
        'done once first? Choose **Guided build**.',
    },
  ];

  const build: TourStep<AceticTourCtx>[] = [
    {
      title: 'Part (d), done properly',
      body:
        'An acid on a carbonate gives carbon dioxide — but a gas is only evidence if you **catch** it. This is the whole ' +
        'test, in the order that works, on a sandbox bench. **Nothing here is marked.**',
    },
    {
      title: 'The acid goes in first',
      target: region(REGION.tubes45),
      highlight: ['bottle:acid', 'tube:3'],
      body: 'Tube 4 is the reaction tube: the acid waits in it while everything else is set up.',
      task: 'Pick up **dil. CH₃COOH** and tap tube 4.',
      done: (c) => filled(c, TUBE.carbonate),
    },
    {
      title: 'Lime water in the next tube',
      target: region(REGION.tubes45),
      highlight: ['bottle:lime', 'tube:4'],
      body:
        'Lime water is calcium hydroxide solution. Carbon dioxide turns it milky because insoluble calcium carbonate forms ' +
        'in it — that white cloud is the test.',
      task: 'Pick up **lime water** and tap tube 5.',
      done: (c) => filled(c, TUBE.lime),
    },
    {
      title: 'Fit the delivery tube',
      target: region(REGION.tubes45),
      highlight: ['tool:pipe', 'tube:3', 'tube:4'],
      body:
        'Cork it into the tube that will make the gas, and put its far end **under** the lime water. Do this now, while ' +
        'nothing is fizzing: fit it afterwards and the first and best of the gas is already in the room.',
      task: 'Tap **DELIVERY TUBE**, then tube 4, then tube 5.',
      done: ({ state }) => state.delivery?.from === TUBE.carbonate && state.delivery.to === TUBE.lime,
      doneMessage: 'Corked in, end under the liquid.',
    },
    {
      title: 'Now the carbonate',
      target: region(REGION.tubes45),
      highlight: ['tool:jar', 'tube:3'],
      stay: true,
      body: 'One spatula. Watch tube 4 fizz, then watch the far end of the delivery tube bubbling under the lime water.',
      task: 'Tap the **NaHCO₃ jar**, then tube 4.',
      done: (c) => tube(c, TUBE.lime).milkyMax > 0.25,
      doneMessage: 'The lime water has gone milky.',
      after: (c) => {
        const source = tube(c, TUBE.carbonate);
        const lime = tube(c, TUBE.lime);
        return (
          `Tube 4 gave off about **${(source.gasMade * MLGAS).toFixed(0)} mL** of gas, and ` +
          `**${(lime.gasIn * MLGAS).toFixed(0)} mL** of it reached the lime water, which is now ` +
          `${(lime.milkyMax * 100).toFixed(0)}% of the way to fully milky.\n` +
          'CH₃COOH + NaHCO₃ → CH₃COONa + H₂O + **CO₂**, and the CO₂ then gives Ca(OH)₂ + CO₂ → **CaCO₃** + H₂O — the white ' +
          'solid you are looking at.'
        );
      },
    },
    {
      title: 'The second test',
      target: region(REGION.tubes45),
      highlight: ['tool:splint', 'tube:3'],
      body:
        'Milky lime water names the gas; a lighted splinter confirms it. Carbon dioxide does not support burning, so a ' +
        'flame lowered into a tube of it goes straight out.',
      task: 'Tap **BURNING SPLINTER**, then a tube with gas standing in it.',
      done: (c) => c.state.tubes.some((t) => t.splinter !== null),
      stay: true,
      after: (c) => {
        const lit = c.state.tubes.find((t) => t.splinter !== null)!;
        return lit.splinter === 'out'
          ? 'The flame went out at once. Milky lime water **and** a splinter going out: the gas is carbon dioxide.'
          : 'It kept burning — there was no collected gas in that tube, only air. Gas standing above the liquid is drawn as a ' +
              'pale band with **CO₂** written in it; that is the tube to try.';
      },
    },
    {
      title: 'That is part (d)',
      body:
        'Lime water ready, delivery tube fitted, then the carbonate — in that order, every time. On your own bench you ' +
        'will do the other three properties first, and this one last.',
    },
  ];

  return { controls, build };
}
