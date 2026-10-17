'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { POUR, SAMPLE_BY_ID } from '@labs/lib/ph-samples/chemistry';
import { STEP } from '@labs/lib/ph-samples/marking';
import type { PhAction } from '@labs/lib/ph-samples/reducer';
import type { PhState } from '@labs/lib/ph-samples/state';
import {
  DEMO_SAMPLE,
  DEMO_SAMPLE_LABEL,
  bringTubeIntoTheCloseUp,
  demoTube,
  dipAFreshStrip,
  dropTheIndicatorIn,
  handsDown,
  pourItIntoItsOwnTube,
  pourWouldFinish,
  takeTheAcidBottle,
  type DemoCtx,
} from '@labs/lib/ph-samples/trainer-demos';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { useLabFeature } from '../lab-features';

import { BENCH_HEIGHT, BENCH_WIDTH, REGION } from './bench';

/**
 * THE VISUAL TRAINER: "Show me this step", on the rack as it stands.
 *
 * The tour is one sample from bottle to reading on a sandbox bench. This is the
 * answer to "what do I do *here*", so it runs on the student's own rack and the
 * workspace puts that rack back byte for byte when it finishes.
 *
 * WHAT IT WILL NOT DO:
 *
 * - **It never writes a pH, never picks acidic / neutral / basic, never taps a
 *   sample into the order and never submits.** Those four are where all 68
 *   non-viva marks on this bench are decided. Reading a colour off a chart is
 *   the practical; a demonstration that read one would have taken it away.
 * - **It never finishes a step.** The sixth pour and the sixth test both carry
 *   the procedure forward, so neither is ever the one the demonstration makes.
 *
 * The teaching layer is this bench's "What's happening" panel, so the one step
 * that opens it is dropped when the `teach` flag is off — there is no switch on
 * the bench bar to point at.
 */
export type PhTrainerCtx = BenchTourContext<PhState, PhAction>;
type Step = TourStep<PhTrainerCtx>;

// ---------------------------------------------------------------------------
// Doing the thing
// ---------------------------------------------------------------------------

/** Runs a step's actions once, as it opens. See the prism bench's trainer. */
function Demonstrate({ run, ctx }: { run: (ctx: DemoCtx) => void; ctx: PhTrainerCtx }): null {
  // `useEffectEvent` so the effect can stay a genuine once-per-step effect: it
  // always sees the latest closure without listing one as a dependency.
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

/**
 * The demonstrations, keyed by procedure step.
 *
 * `teach` is a parameter rather than a hook call, so this stays a plain
 * function: the flag is read once, by the hook below, and the step that opens
 * the teaching panel is left OUT of the set rather than skipped when it runs.
 */
export function buildPhTrainer(
  ctx: PhTrainerCtx,
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

  const acidTube = (c: PhTrainerCtx): number => demoTube(c.state) + 1;

  // --- pouring --------------------------------------------------------------
  const pour: readonly Step[] = [
    does(
      {
        title: 'Pick a bottle up',
        target: region(REGION.bottles),
        highlight: [`sample:${DEMO_SAMPLE}`],
        body:
          `Tap a bottle to pick it up — this one is the **${DEMO_SAMPLE_LABEL}**. Whatever is in your hand is what ` +
          'acts on the next tube you tap, and the strip under the bench always says what that is.',
      },
      takeTheAcidBottle,
    ),
    does(
      {
        title: 'Into the tube with its own label',
        target: region(REGION.rack),
        highlight: [`tube@${DEMO_SAMPLE}`],
        body: (c) =>
          pourWouldFinish(c.state, demoTube(c.state))
            ? `That is the last empty tube on your rack, so I will leave it for you — pouring it would finish the ` +
              `step while I was still talking. It is **tube ${acidTube(c)}**, labelled **${SAMPLE_BY_ID[DEMO_SAMPLE].short}** ` +
              'underneath, and that label is the whole instruction.'
            : `Each tube is labelled underneath with the sample that belongs in it, and the labels are not in the same ` +
              `order on every bench. Here **${SAMPLE_BY_ID[DEMO_SAMPLE].short}** is **tube ${acidTube(c)}**, so that is where ` +
              `${POUR} mL goes.\n\nI run it from clean first, so the demonstration is the same every time.`,
      },
      pourItIntoItsOwnTube,
    ),
    {
      title: 'One bottle at a time, all the way along',
      target: region(REGION.rack),
      body:
        'You are still holding it, so carry on to any other tube that carries the same label before you change ' +
        'bottles. Six bottles, six tubes.\n\nPouring a sample into the wrong tube makes a **mixture**, and a mixture ' +
        'has its own pH — that costs three marks and does not come back.',
    },
    does(
      {
        title: 'Then put it down',
        target: tagged('ph-hands'),
        body:
          'Tap **Put down**, or press Esc, or tap the bottle again. If you do spoil a tube, **Empty and rinse** is ' +
          'here too — a rinsed tube is a fresh start, though the slip stays in the log.',
      },
      handsDown,
    ),
  ];

  // --- testing --------------------------------------------------------------
  const test: readonly Step[] = [
    does(
      {
        title: 'A fresh strip for every tube',
        target: region(REGION.tools),
        highlight: ['tool:paper'],
        body:
          'Pick the **pH paper** up. Every dip tears a new strip off the pad — a used one still carries the last ' +
          'solution and would lie to you about this one.',
      },
      dipAFreshStrip,
    ),
    {
      title: 'The strip is on the tile',
      target: region(REGION.tile),
      stay: true,
      body:
        'Tap a tube while you are holding the pad and a strip goes in, comes out and is laid on the tile. It is ' +
        'frozen at the pH it was dipped into: paper does not change its mind afterwards.\n\n**What colour it went is ' +
        'yours to read.**',
    },
    does(
      {
        title: 'Or drop the indicator in',
        target: region(REGION.tools),
        highlight: ['tool:ui'],
        body:
          'The other way round: pick up the **universal indicator** and tap a tube, and the solution itself takes the ' +
          'colour. Easier to see on a pale sample. The syllabus accepts either, and one test per tube is all that is ' +
          'asked for.',
      },
      dropTheIndicatorIn,
    ),
    {
      title: 'The chart is the reference',
      target: region(REGION.chart),
      body:
        'Reds and oranges for acids, **green** at neutral pH 7, blues and violets for bases. Every colour on this ' +
        'bench is worked out from the actual pH of what is in the tube, so the chart is a real reference and not a ' +
        'decoration.',
    },
    ...(teach
      ? [
          {
            title: 'And if you want the mechanism',
            target: tagged('teach-toggle'),
            body:
              'Open **What’s happening** under the bench for what the dye is actually responding to. It is a ' +
              'teaching aid, it is never marked, and it will not read a colour for you.',
          } satisfies Step,
        ]
      : []),
    does(
      {
        title: 'Then put the dropper down',
        target: tagged('ph-hands'),
        body: 'Same as before — **Put down**, or Esc. Hands free before you start reading.',
      },
      handsDown,
    ),
  ];

  // --- reading the colours --------------------------------------------------
  const record: readonly Step[] = [
    {
      title: 'Reading a colour is your judgement',
      body:
        'So this one is the method and not the answer. Thirty-six of the marks on this bench are the six pH values, ' +
        'and not one of them gets typed in for you.',
    },
    does(
      {
        title: 'One tube at a time',
        target: region(REGION.rack),
        highlight: [`tube@${DEMO_SAMPLE}`],
        body:
          'Tap a tube on the rack, or its row in the table — both open the same one. Look at the strip lying on the ' +
          'tile for it, or at the colour of the solution itself if you used the indicator.',
      },
      bringTubeIntoTheCloseUp,
    ),
    {
      title: 'Hold it against the chart',
      target: tagged('ph-chart'),
      body:
        'The panel beside the box holds that tube’s colour right against the chart — the same comparison you would ' +
        'make with a wet strip and a card. **Tap the square that matches** and its pH drops into the box; type over ' +
        'it if you would rather.',
    },
    {
      title: 'Then say what it is',
      target: tagged('console'),
      body:
        'A pH, and whether the sample is **acidic**, **neutral** or **basic**. The nature follows from the number ' +
        'you wrote, so it is offered for you — but check it, because it is worth two marks a row of its own.',
    },
    {
      title: 'Within 1 pH still counts',
      target: tagged('console'),
      body:
        'Colour matching is never exact and the marking knows it: within 0.5 scores six, within 1 scores four, ' +
        'within 2 scores two. Every row is marked against the pH of what is **really** in that tube, so a tube you ' +
        'never tested is a guess, and it will read as one.',
    },
  ];

  // --- the order ------------------------------------------------------------
  const order: readonly Step[] = [
    {
      title: 'Out of your own table, and nowhere else',
      target: tagged('console'),
      body:
        'The order comes from the six numbers **you** wrote down, not from the textbook. Half the marks here are for ' +
        'an order that follows from your own readings — you can lose the other half and still keep those.',
    },
    {
      title: 'Lowest pH first',
      target: tagged('console'),
      body:
        'Tap the samples in order, most acidic to most basic. Read down your own pH column and take them in the ' +
        'order the numbers actually sit in, even where two of them came out close together.',
    },
    {
      title: 'Nothing here is tapped for you',
      target: tagged('console'),
      body:
        'Fourteen marks hang on this row and they are yours to earn, so the bench stops at the method. Put one in ' +
        'the wrong slot and **Clear** empties the row to start again — there is no penalty for clearing, only for ' +
        'submitting.',
    },
  ];

  return {
    [STEP.pour]: pour,
    [STEP.test]: test,
    [STEP.record]: record,
    [STEP.order]: order,
  };
}

/**
 * WHERE THE TEACH FLAG IS READ. A hook, and passed to the workspace by
 * reference so it is called as one: with the flag off there is no teaching
 * panel on the bench bar, and the step that opens it is never built.
 */
export function usePhTrainer(ctx: PhTrainerCtx): Readonly<Record<number, readonly Step[]>> {
  return buildPhTrainer(ctx, useLabFeature('teach'));
}
