'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { POUR } from '@labs/lib/acetic-acid/chemistry';
import { STEP } from '@labs/lib/acetic-acid/marking';
import { RACK, TUBE } from '@labs/lib/acetic-acid/rack';
import type { AceticAcidAction } from '@labs/lib/acetic-acid/reducer';
import type { AceticAcidState } from '@labs/lib/acetic-acid/state';
import {
  dipTheFirstStrip,
  fitTheDeliveryTube,
  handsDown,
  litmusStrip,
  lookAtTheGasTube,
  lookAtTheLimeWater,
  lookAtTheSample,
  openTheFirstRow,
  pourItIntoItsOwnTube,
  readThePhOfTheStrongAcid,
  setupTube,
  shakeOneOfThePair,
  shakeTube,
  takeABlueStrip,
  takeTheBottleItNeeds,
  takeTheDeliveryTube,
  takeTheJar,
  takeTheRod,
  takeTheWaft,
  waftTheSample,
  waftTube,
  type DemoCtx,
} from '@labs/lib/acetic-acid/trainer-demos';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { useLabFeature } from '../lab-features';

import { BENCH_HEIGHT, BENCH_WIDTH, REGION, TUBE_X } from './apparatus';

/**
 * THE VISUAL TRAINER: "Show me this step", on the rack as it stands.
 *
 * The tour takes one property from bottle to reading on a sandbox bench. This
 * is the answer to "what do I do *here*", so it runs on the student's own six
 * tubes and the workspace puts them back byte for byte when it finishes.
 *
 * WHAT IT WILL NOT DO:
 *
 * - **It never writes a row, never submits the table and never answers a
 *   conclusion or a viva question.** Those decide 60 of the 100 marks.
 * - **It never finishes a step.** Every stage here ends on a pair — both tubes
 *   smelled, both shaken, both litmus strips, the delivery tube AND the solid —
 *   so the demonstration always does one of the pair and hands the other over.
 * - **IT NEVER SNIFFS.** Choosing **SNIFF DIRECTLY** costs technique marks and
 *   is logged, and in a real lab it can burn an airway. The trainer wafts,
 *   every time, and names the other tool only to say so.
 *
 * The teaching layer is this bench's "What's happening" panel, so the step that
 * opens it is dropped when the `teach` flag is off.
 */
export type AceticTrainerCtx = BenchTourContext<AceticAcidState, AceticAcidAction>;
type Step = TourStep<AceticTrainerCtx>;

// ---------------------------------------------------------------------------
// Doing the thing
// ---------------------------------------------------------------------------

/** Runs a step's actions once, as it opens. See the prism bench's trainer. */
function Demonstrate({ run, ctx }: { run: (ctx: DemoCtx) => void; ctx: AceticTrainerCtx }): null {
  const fire = React.useEffectEvent(() => run(ctx));
  const done = React.useRef(false);
  React.useEffect(() => {
    if (done.current) return;
    done.current = true;
    fire();
  }, []);
  return null;
}

function does(step: Step, run: (ctx: DemoCtx) => void): Step {
  return {
    ...step,
    gated: false,
    content: ({ ctx }) => <Demonstrate run={run} ctx={ctx} />,
  };
}

// ---------------------------------------------------------------------------
// The demonstrations
// ---------------------------------------------------------------------------

type Region = readonly [x: number, y: number, w: number, h: number];

const tubeRegion = (k: number): Region => [TUBE_X[k]! - 48, 352, 96, 248];

/**
 * The demonstrations, keyed by procedure step.
 *
 * `teach` is a parameter rather than a hook call, so this stays a plain
 * function: the flag is read once, by the hook below, and the step that opens
 * the teaching panel is left OUT of the set rather than skipped when it runs.
 */
export function buildAceticTrainer(
  ctx: AceticTrainerCtx,
  teach: boolean,
): Readonly<Record<number, readonly Step[]>> {
  const bench = ctx.stage;
  const find = ctx.find;

  /** A rectangle in BENCH coordinates, mapped to where it actually is on screen. */
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

  // --- setting the rack up --------------------------------------------------
  const setup: readonly Step[] = [
    does(
      {
        title: 'Pick a bottle up',
        target: region(REGION.bottles),
        highlight: ['bottle:acid'],
        body:
          'Tap a bottle to pick it up and tap another to change bottles. Whatever is in your hand acts on the next ' +
          'tube you tap — the strip under the bench always says what that is.',
      },
      takeTheBottleItNeeds,
    ),
    does(
      {
        title: 'Read the label under the tube first',
        target: region(REGION.rack),
        body: (c) => {
          const k = setupTube(c.state);
          if (k === null) {
            return (
              'There is one tube left unfinished and filling it would carry this step on while I was still talking, ' +
              'so I will leave it to you. **Read its label** — that label is the whole instruction.'
            );
          }
          return (
            `**${RACK[k]!.label}**, so that is where ${POUR} mL goes. Every tube is labelled underneath with what ` +
            `belongs in it, and this one is there for **${RACK[k]!.job}**.`
          );
        },
      },
      pourItIntoItsOwnTube,
    ),
    {
      title: 'Some tubes want two pours',
      target: region(REGION.rack),
      highlight: ['tube:1', 'tube:2'],
      body:
        'Tube 2 is acid **and** water, tube 3 is oil **and** water: five of each, so the two are in equal amounts and ' +
        'the comparison between them is fair.\n\nPut something in a tube its label does not mention and whatever you ' +
        'test afterwards is the mixture, not the sample. It costs setup marks and it is logged.',
    },
    {
      title: 'Six tubes, six labels',
      target: region(REGION.rack),
      body:
        'And the last of them is the pour that finishes this step, so it is yours to make. If you do spoil one, ' +
        '**Empty and rinse** in the close-up gives you the tube back — though not the mark.',
    },
    does(
      {
        title: 'Then put the bottle down',
        target: tagged('benchbar'),
        body: 'Press **Put down** or press Esc.',
      },
      handsDown,
    ),
  ];

  // --- the smell ------------------------------------------------------------
  const odour: readonly Step[] = [
    {
      title: 'Smelling is the one step that can hurt you',
      target: region(REGION.smell),
      body: 'So watch this one closely. There are two tools here and only one of them is ever correct.',
    },
    does(
      {
        title: 'Pick up WAFT',
        target: region(REGION.smell),
        highlight: ['tool:waft'],
        body:
          'Hold the tube away from you and **fan the vapour to your nose with your hand**. That is the technique, in ' +
          'a real lab and here.',
      },
      takeTheWaft,
    ),
    does(
      {
        title: 'Then tap the tube',
        target: region(REGION.rack),
        highlight: ['tube:0'],
        body: (c) =>
          `A trace of vapour reaches you — never a lungful. Tube ${waftTube(c.state) + 1} is the one I am using; the ` +
          'other of the pair is yours, and it is the smell you compare this one against.',
      },
      waftTheSample,
    ),
    {
      title: 'SNIFF DIRECTLY sits beside it',
      target: region(REGION.smell),
      highlight: ['tool:sniff'],
      body:
        '**It is never demonstrated here.** It costs technique marks, it is written into your log, and in a real lab ' +
        'it can burn your airway.\n\nIt is on the bench because the choice is the lesson. Nobody learns not to do it ' +
        'from a tool that was never there.',
    },
    {
      title: 'Which word fits is your call',
      target: tagged('console'),
      body:
        'The bench records **that** you smelled it, not **what** you smelled. Vinegary, sharp, faint, none — the ' +
        'word goes in the table later, and it has to be your word for your tube.',
    },
    does(
      {
        title: 'Hands down when you are finished',
        target: tagged('benchbar'),
        body: 'Nothing acts on a tube unless you are holding it.',
      },
      handsDown,
    ),
  ];

  // --- solubility -----------------------------------------------------------
  const solubility: readonly Step[] = [
    does(
      {
        title: 'The glass rod stands for shaking',
        target: region(REGION.tools),
        highlight: ['tool:rod'],
        body:
          'Pick it up and tap a tube: the tube is shaken hard and then left to settle. What it settles **into** is ' +
          'the observation, not what it looks like mid-shake.',
      },
      takeTheRod,
    ),
    does(
      {
        title: 'Shake one of the pair',
        target: region(REGION.rack),
        highlight: ['tube:1', 'tube:2'],
        body: (c) =>
          `Tube ${shakeTube(c.state) + 1}. It goes cloudy for a moment whichever tube it is — an emulsion is not an ` +
          'answer, it is what you have to wait out.',
      },
      shakeOneOfThePair,
    ),
    {
      title: 'Then the other one, and that is yours',
      target: region(REGION.rack),
      highlight: ['tube:1', 'tube:2'],
      body:
        'Tube 2 is the acid with water and tube 3 is the oil with water. **The pair is the experiment**: one of them ' +
        'is what "soluble" looks like and the other is what "insoluble" looks like, and neither means anything on ' +
        'its own.\n\nShaking the second is what carries this step, so I am leaving it to you.',
    },
    {
      title: 'One layer, or two',
      target: region(REGION.rack),
      body:
        '**One layer**: no boundary anywhere, top to bottom, the same all the way down. **Two layers**: a sharp line ' +
        'across the tube with the lighter liquid floating on top.\n\nLook down the whole length of the glass before ' +
        'you decide which tube did which.',
    },
    does(
      {
        title: 'Then put the rod down',
        target: tagged('benchbar'),
        body: 'The emulsion settles on the bench clock, so give a shaken tube a moment before you judge it.',
      },
      handsDown,
    ),
  ];

  // --- litmus and pH --------------------------------------------------------
  const litmus: readonly Step[] = [
    does(
      {
        title: 'A fresh strip every time',
        target: region(REGION.tools),
        highlight: ['tool:blue'],
        body: 'A used one carries the last solution with it and would lie to you about this one.',
      },
      takeABlueStrip,
    ),
    does(
      {
        title: 'Dip it into tube 1',
        target: region(REGION.tube1),
        highlight: ['tube:0'],
        body: (c) =>
          `The **${litmusStrip(c.state)}** strip goes in and stays propped against the glass, so you can hold it ` +
          'against the chart on the bench and decide for yourself what colour it is.',
      },
      dipTheFirstStrip,
    ),
    {
      title: 'Then the other strip, and that one is yours',
      target: region(REGION.tube1),
      highlight: ['tube:0'],
      body:
        'Blue **and** red, into the same tube. **Two strips on one solution is a pair of readings, not one** — blue ' +
        'going red says it is an acid, and red staying red says it is not a base. You need both to have said ' +
        'anything.\n\nThe second strip is what carries this step on, so I am stopping short of it.',
    },
    does(
      {
        title: 'The pH paper goes in the same way',
        target: region(REGION.rack),
        highlight: ['tool:ph', 'tube:5'],
        body:
          'Here it is on **tube 6**, the strong acid, which is the only reason tube 6 is in the rack at all. It reads ' +
          'a number off the same scale rather than a colour.',
      },
      readThePhOfTheStrongAcid,
    ),
    {
      title: 'Now do tube 1 yourself and compare',
      target: region(REGION.tube1),
      highlight: ['tube:0'],
      body:
        'That gap between the two numbers is the whole point of tube 6. Both are acids; one of them is only partly ' +
        'ionised, and the pH is where you can see it.',
    },
    ...(teach
      ? [
          {
            title: 'And if you want the mechanism',
            target: tagged('teach-toggle'),
            body:
              'Open **What’s happening** on the bench bar and it will tell you what the dye responds to — **never ' +
              'what colour it went**. It is a teaching aid and it is not marked.',
          } satisfies Step,
        ]
      : []),
    does(
      {
        title: 'Then put the paper down',
        target: tagged('benchbar'),
        body: 'Strips stay in the tubes they were dipped into, so the rack itself is part of your record.',
      },
      handsDown,
    ),
  ];

  // --- the gas --------------------------------------------------------------
  const carbonate: readonly Step[] = [
    {
      title: 'Order matters here',
      target: region(REGION.pipe),
      body:
        'The delivery tube goes on **before** the solid, or the gas is lost to the room. This is the single thing ' +
        'most often got wrong in this practical, and there is no way to get it back afterwards: gas that has gone ' +
        'into the air cannot be tested.',
    },
    does(
      {
        title: 'Pick up the delivery tube',
        target: region(REGION.pipe),
        highlight: ['tool:pipe'],
        body: 'It takes two taps: the tube that will **make** the gas, then the tube the gas should bubble **through**.',
      },
      takeTheDeliveryTube,
    ),
    does(
      {
        title: 'Tube 4, then tube 5',
        target: region(REGION.tubes45),
        highlight: ['tube:3', 'tube:4'],
        body:
          'Tube 4 is the acid that will make the gas. Tube 5 is the **lime water**, and the far end of the delivery ' +
          'tube goes under its surface so the gas has to bubble through it rather than past it.',
      },
      fitTheDeliveryTube,
    ),
    does(
      {
        title: 'Only now, the solid — and that spatula is yours',
        target: region(REGION.jar),
        highlight: ['tool:jar', 'tube:3'],
        body:
          'Pick up the **NaHCO₃** jar and tip one spatula into tube 4. I am putting it in your hand and stopping ' +
          'there: that spatula is the act that finishes this step, and it is the moment the whole order lesson is ' +
          'about.',
      },
      takeTheJar,
    ),
    does(
      {
        title: 'Watch tube 4',
        target: region(tubeRegion(TUBE.carbonate)),
        highlight: ['tube:3'],
        body:
          '**How hard it bubbles is an observation in itself** — a strong acid and a weak one do not fizz the same ' +
          'way with a carbonate. Tap the tube for the close-up and look at it while it is still going.',
      },
      lookAtTheGasTube,
    ),
    does(
      {
        title: 'And watch tube 5',
        target: region(tubeRegion(TUBE.lime)),
        highlight: ['tube:4'],
        body:
          'What the lime water does there is what **identifies** the gas, and that judgement is yours. Nothing else ' +
          'on this bench names it for you.',
      },
      lookAtTheLimeWater,
    ),
    {
      title: 'Then the second test',
      target: region(REGION.pipe),
      highlight: ['tool:splint', 'tool:pipe'],
      body:
        'When the gas has been through, take the delivery tube off with **Remove delivery tube**, then try the ' +
        '**burning splinter** in whichever tube has gas standing in it. Two tests, one gas — and a gas named by only ' +
        'one of them is named less well.',
    },
    does(
      {
        title: 'Hands down',
        target: tagged('benchbar'),
        body: 'That is the last of the four tests. Everything after this is reading and writing.',
      },
      handsDown,
    ),
  ];

  // --- the observation table ------------------------------------------------
  const record: readonly Step[] = [
    {
      title: 'Every row is marked against your own tube',
      body: 'So here is where to look — not what to write. Thirty-two marks, eight rows, and none of them filled in for you.',
    },
    {
      title: 'The rack itself is the record',
      target: region(REGION.rack),
      body:
        'Strips still propped on tube 1, the layers standing in tubes 2 and 3, the lime water in tube 5. Nothing has ' +
        'been cleared away, so every test you did is still in front of you.',
    },
    does(
      {
        title: 'Tap any tube for the close-up',
        target: tagged('console'),
        body:
          'It lists what that tube has actually had done to it, magnified. Take them one at a time and answer each ' +
          'row from the tube it is about.',
      },
      openTheFirstRow,
    ),
    does(
      {
        title: 'One row at a time, in order',
        target: region(REGION.tube1),
        highlight: ['tube:0'],
        body:
          'The table follows the practical: smell, then solubility, then litmus, then the gas. Work down it and the ' +
          'rack works with you.',
      },
      lookAtTheSample,
    ),
    {
      title: 'A test you never carried out has an honest answer',
      target: tagged('console'),
      body:
        '**Not tested.** It is a real option and it is marked as one. Guessing costs more than admitting it — a ' +
        'wrong answer is worth nothing and puts a line in your log, where "not tested" only costs the row.',
    },
  ];

  // --- the two conclusions --------------------------------------------------
  const conclusion: readonly Step[] = [
    {
      title: 'Two conclusions, and both from your bench',
      target: tagged('console'),
      body:
        'Not from the textbook. Twelve marks, and your first tap on each is the one that counts — so decide before ' +
        'you tap.',
    },
    {
      title: 'The first: is it an acid, and how strong',
      target: region(REGION.tube1),
      highlight: ['tube:0'],
      body:
        'Look at the litmus strips on tube 1 and at the number the pH paper gave you. **Litmus says whether it is an ' +
        'acid at all; the pH number says how strong.** They are two different questions and this one asks both.',
    },
    {
      title: 'Read them against the chart',
      target: region(REGION.card),
      body:
        'The chart is on the bench, beside the rack. A weak acid sits around pH 3, a strong one near 1 — and you ' +
        'measured both, so you do not have to take anyone’s word for it.',
    },
    does(
      {
        title: 'The second: the gas',
        target: region(tubeRegion(TUBE.lime)),
        highlight: ['tube:4'],
        body:
          'Your own two tests were the **lime water** and the **splinter**. The close-up still shows both results, ' +
          'so nothing has to be remembered.',
      },
      lookAtTheLimeWater,
    ),
    {
      title: 'Weigh them up and choose',
      target: tagged('console'),
      body:
        'The choice is not mine to make. If one of the two tests was never done, say what the one you did do ' +
        'establishes — and no more than that.',
    },
  ];

  return {
    [STEP.setup]: setup,
    [STEP.odour]: odour,
    [STEP.solubility]: solubility,
    [STEP.litmus]: litmus,
    [STEP.carbonate]: carbonate,
    [STEP.record]: record,
    [STEP.conclusion]: conclusion,
  };
}

/**
 * WHERE THE TEACH FLAG IS READ. A hook, and passed to the workspace by
 * reference so it is called as one: with the flag off there is no teaching
 * panel on the bench bar, and the step that opens it is never built.
 */
export function useAceticTrainer(ctx: AceticTrainerCtx): Readonly<Record<number, readonly Step[]>> {
  return buildAceticTrainer(ctx, useLabFeature('teach'));
}
