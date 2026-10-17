'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { METAL, POUR, SALT } from '@labs/lib/reactivity-series/chemistry';
import { PATIENT_MINUTES, STAGE } from '@labs/lib/reactivity-series/marking';
import type { RxAction } from '@labs/lib/reactivity-series/reducer';
import type { RxState } from '@labs/lib/reactivity-series/state';
import {
  demoMetal,
  demoSalt,
  dropTheStripIn,
  handsDown,
  letFiveMinutesPass,
  lookAtATube,
  pourTheFirstOfTheGroup,
  pourTheSecondOfTheGroup,
  sandTheStrips,
  takeAStrip,
  takeTheBottle,
  tubesNeedingAStrip,
  type DemoCtx,
} from '@labs/lib/reactivity-series/trainer-demos';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { useLabFeature } from '../lab-features';

import {
  BENCH_HEIGHT,
  BENCH_WIDTH,
  HOT,
  RG_BOTTLES,
  RG_CLOCK,
  RG_RACK,
  RG_SAND,
  RG_TILE,
  cellRegion,
  columnRegion,
  rowRegion,
  type Region,
} from './geometry';

/**
 * THE VISUAL TRAINER: "Show me this step", on the rack as it stands.
 *
 * The tour takes one tube from an empty rack to a finished reaction on a
 * sandbox bench. This is the answer to "what do I do *here*", so it runs on the
 * student's own sixteen tubes and the workspace puts them back byte for byte
 * when it finishes.
 *
 * WHAT IT WILL NOT DO:
 *
 * - **It never writes a cell, never submits the table, and never ranks the
 *   metals.** Those decide 62 of the 100 marks. Deciding what a tube shows is
 *   the practical.
 * - **It never finishes a step.** The sixteenth pour and the sixteenth strip
 *   each carry the procedure on; both are left to the student and the
 *   narration says so.
 *
 * It DOES run the lab clock, which the reaction-types trainer will not. Nothing
 * on this bench is heated, and the watching stage is left only by pressing
 * **Record observations**, so five simulated minutes can hurt nothing.
 *
 * The teaching layer is this bench's "What's happening" panel, so the step that
 * opens it is dropped when the `teach` flag is off.
 */
export type RxTrainerCtx = BenchTourContext<RxState, RxAction>;
type Step = TourStep<RxTrainerCtx>;

// ---------------------------------------------------------------------------
// Doing the thing
// ---------------------------------------------------------------------------

/** Runs a step's actions once, as it opens. See the prism bench's trainer. */
function Demonstrate({ run, ctx }: { run: (ctx: DemoCtx) => void; ctx: RxTrainerCtx }): null {
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

/**
 * The demonstrations, keyed by procedure step.
 *
 * `teach` is a parameter rather than a hook call, so this stays a plain
 * function: the flag is read once, by the hook below, and the step that opens
 * the teaching panel is left OUT of the set rather than skipped when it runs.
 */
export function buildReactivityTrainer(
  ctx: RxTrainerCtx,
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

  /** The column this demonstration is working down, on the live bench. */
  const salt = (c: RxTrainerCtx) => demoSalt(c.state);

  // --- pouring the four solutions ------------------------------------------
  const fill: readonly Step[] = [
    does(
      {
        title: 'Pick a dropper bottle up',
        target: region(RG_BOTTLES),
        highlight: [HOT.bottle(demoSalt(ctx.state))],
        body: (c) =>
          `This is **${SALT[salt(c)].label}**, the solution named above one group of four tubes. Pick it up, then ` +
          'tap the tubes you want it in — tapping a tube with empty hands only opens its close-up.',
      },
      takeTheBottle,
    ),
    does(
      {
        title: 'The first tube of that group',
        target: region(columnRegion(demoSalt(ctx.state))),
        body: (c) => `${POUR} mL goes in. The bottle stays in your hand, so carry on down the column.`,
      },
      pourTheFirstOfTheGroup,
    ),
    does(
      {
        title: 'And the same solution into all four',
        target: region(columnRegion(demoSalt(ctx.state))),
        body:
          'Every tube in the group gets the **same solution**, so that each of the four metals meets it on equal ' +
          'terms. A column where one tube got 5 mL and another 10 is not a comparison.',
      },
      pourTheSecondOfTheGroup,
    ),
    {
      title: 'The letters underneath say which metal',
      target: region(RG_RACK),
      body:
        'Sixteen tubes: four solutions across, four metals down. The label under each tube is which **metal** goes ' +
        'in it later — the solution is decided by the column it is in.\n\nPouring one group’s solution into another ' +
        'group’s tube makes a mixture, costs three marks and does not come back. **Empty and rinse** gives you the ' +
        'tube back, but not the mark.',
    },
    {
      title: 'Then the next bottle into its own group',
      target: region(RG_BOTTLES),
      body:
        'Four solutions, sixteen tubes, and the last of them carries you on to the metals — so that one is yours to ' +
        'pour. I have left it deliberately.',
    },
    does(
      {
        title: 'Put the bottle down when you are finished with it',
        target: tagged('bench-controls'),
        body: 'Press **Put down**, press Esc, or tap an empty part of the bench.',
      },
      handsDown,
    ),
  ];

  // --- cleaning and adding the strips --------------------------------------
  const metals: readonly Step[] = [
    {
      title: 'Every strip starts at the sandpaper',
      target: region(RG_SAND),
      highlight: [HOT.sand],
      body:
        'Metal left in air grows a dull oxide coat. Until that layer is off, the solution cannot reach the metal ' +
        'underneath it — the reaction is slowed, or it does not start at all.\n\nTwo marks a metal ride on the ' +
        'strips being clean **when the first of them goes into a tube**, so cleaning one afterwards does not buy ' +
        'the mark back.',
    },
    does(
      {
        title: 'Hold the sandpaper, then tap a metal',
        target: region(RG_TILE),
        highlight: [HOT.sand, HOT.metal(demoMetal(ctx.state))],
        body: (c) =>
          `Here the **${METAL[demoMetal(c.state)].name}** on the tile — its strips are rubbed until they shine. ` +
          'One tap does the whole stack.',
      },
      sandTheStrips,
    ),
    does(
      {
        title: 'Now pick up a strip of the metal you cleaned',
        target: region(RG_TILE),
        highlight: [HOT.metal(demoMetal(ctx.state))],
        body: 'Tap it again with empty hands and a strip comes off the stack into your hand.',
      },
      takeAStrip,
    ),
    does(
      {
        title: 'One strip per tube',
        target: region(rowRegion(demoMetal(ctx.state))),
        body: (c) => {
          const m = demoMetal(c.state);
          return (
            `Every tube labelled **${m}** underneath takes a ${METAL[m].name} strip — one each, across all four ` +
            'solutions, because that row is how you find out which solutions this metal can displace.\n\nA strip in ' +
            'the wrong tube costs a mark and a half and has to be emptied out.'
          );
        },
      },
      dropTheStripIn,
    ),
    {
      title: 'Then clean the next metal and go again',
      target: region(RG_TILE),
      body: (c) => {
        const left = tubesNeedingAStrip(c.state).length;
        return (
          `Four metals, four rows, sixteen strips. ${
            left <= 1
              ? 'There is one tube left and it is the one that carries this step on, so that strip is yours.'
              : `**${left}** tubes still want theirs, and the last of them is yours to drop in — it is what moves the ` +
                'procedure on to the watching.'
          }`
        );
      },
    },
    does(
      {
        title: 'Put the strip down when that row is finished',
        target: tagged('bench-controls'),
        body: 'Anything still in your hand acts on the next tube you tap.',
      },
      handsDown,
    ),
  ];

  // --- waiting ---------------------------------------------------------------
  const watch: readonly Step[] = [
    {
      title: 'Displacement is not instant',
      target: region(RG_CLOCK),
      highlight: [HOT.clock],
      body:
        'That is what the lab clock on the bench is for. Zinc in copper sulphate shows within a minute or two; ' +
        'others take a quarter of an hour, and a few never start at all.',
    },
    does(
      {
        title: 'Wait moves all sixteen tubes on together',
        target: tagged('bench-controls'),
        body:
          'Five simulated minutes at once, and every tube on the rack reacts through them. Nothing on this bench is ' +
          'heated and nothing can be spoiled by time, so there is no reason to be sparing with it.',
      },
      letFiveMinutesPass,
    ),
    does(
      {
        title: 'Then tap a tube for the close-up',
        target: region(cellRegion('Zn', 'CuSO4')),
        highlight: [HOT.tube('Zn', 'CuSO4')],
        body:
          'The bench view is too small to judge a faint colour. The close-up shows one tube large, against a dark ' +
          'background, which is how you would hold a real one up to the light.',
      },
      lookAtATube,
    ),
    {
      title: 'Two things to look at, and only two',
      target: tagged('close-up'),
      body:
        'The **colour of the solution**, and the **surface of the strip**. Everything the observation table asks for ' +
        'is one of those two, and everything else on the bench is a distraction.',
    },
    {
      title: 'When to stop is your judgement',
      target: region(RG_CLOCK),
      body:
        `Some tubes change within minutes, others need far longer. **Record observations** will warn you once if it ` +
        `has been under ${PATIENT_MINUTES} minutes since the last strip went in — but it will let you through if you ` +
        'insist, and a slow reaction written down as "no change" is a wrong answer you chose.',
    },
    ...(teach
      ? [
          {
            title: 'And if you want the mechanism',
            target: tagged('teach-toggle'),
            body:
              'Open **What’s happening** under the bench for what a displacement actually is, and why some pairs go ' +
              'and others do not. It is a teaching aid, it is never marked, and it will not tell you what your ' +
              'tubes showed.',
          } satisfies Step,
        ]
      : []),
  ];

  // --- the observation table ------------------------------------------------
  const record: readonly Step[] = [
    {
      title: 'This step is marked on honest observation',
      body:
        'Thirty-two marks over sixteen tubes, so the bench fills nothing in for you — only the method. Both boxes ' +
        'are left empty on purpose: choosing what a tube showed is the part you are marked on.',
    },
    does(
      {
        title: 'Tap a tube on the rack, or its cell in the table',
        target: region(cellRegion('Zn', 'CuSO4')),
        body: 'Both open the same tube. The close-up shows that one large, with the bench dark behind it.',
      },
      lookAtATube,
    ),
    {
      title: 'Hold the colour against the dark bench',
      target: tagged('close-up'),
      body:
        'Then look along the strip for a deposit. A faint one is easy to miss and easy to imagine; compare the ' +
        'strip above the liquid with the part that is in it.',
    },
    {
      title: 'A cell takes two answers',
      target: tagged('console'),
      body:
        'The **colour change of the solution**, and **any deposit on the strip**. "No change" is a real answer and ' +
        'it is marked as one — most of these sixteen tubes did nothing, and saying so honestly is worth the same as ' +
        'spotting the ones that did.',
    },
    {
      title: 'Write what the tube shows, not what the book says',
      target: tagged('console'),
      body:
        'Every cell is marked against the state of its own tube **at the moment you submit**. A tube that was still ' +
        'changing will be marked as it is then, so if you are not sure, let the clock run a little further before ' +
        'you submit.',
    },
  ];

  // --- the order ------------------------------------------------------------
  const conclude: readonly Step[] = [
    {
      title: 'The order is read off your own table',
      target: tagged('console'),
      body:
        'The bench will not rank the metals for you. Half the marks here are for an order that **follows from your ' +
        'own sixteen cells** — you can get the true order wrong and still keep those.',
    },
    {
      title: 'Count along each metal’s row',
      target: region(RG_RACK),
      body:
        'How many of the four solutions did it visibly change? A metal that displaced more of the others stands ' +
        'higher in the series. That count is your evidence, and it is what "consistent" is checked against.',
    },
    {
      title: 'A metal never displaces itself',
      body:
        'Its own sulphate is in the row too, and nothing happens there — that tube is a control, not a failure. ' +
        'Four of the sixteen are like that.',
    },
    {
      title: 'Then tap the four chips in your order',
      target: tagged('console'),
      body: 'Most reactive first. Nothing here is tapped for you: twenty-two marks hang on this row.',
    },
    {
      title: 'Put one in the wrong slot?',
      target: tagged('console'),
      body: '**Clear** empties the row and you start again. There is no penalty for clearing, only for submitting.',
    },
  ];

  // --- the viva -------------------------------------------------------------
  const viva: readonly Step[] = [
    {
      title: 'Your first answer is the one that counts',
      target: tagged('console'),
      body: 'Five questions, twenty marks, and nothing here gets tapped for you.',
    },
    {
      title: 'So read all four options before you tap one',
      target: tagged('console'),
      body: 'None of them needs a guess.',
    },
    {
      title: 'Every question comes from what you just did',
      body: 'Why the strips are cleaned, why a blue solution fades, why one tube in each row can never react.',
    },
    {
      title: 'Then read the reason either way',
      target: tagged('console'),
      body:
        'It appears under the question whether you were right or wrong, with the passage from the chapter beside ' +
        'it. Read it even when you were right.',
    },
  ];

  return {
    [STAGE.fill]: fill,
    [STAGE.metals]: metals,
    [STAGE.watch]: watch,
    [STAGE.record]: record,
    [STAGE.conclude]: conclude,
    [STAGE.viva]: viva,
  };
}

/**
 * WHERE THE TEACH FLAG IS READ. A hook, and passed to the workspace by
 * reference so it is called as one: with the flag off there is no teaching
 * panel on the bench bar, and the step that opens it is never built.
 */
export function useReactivityTrainer(ctx: RxTrainerCtx): Readonly<Record<number, readonly Step[]>> {
  return buildReactivityTrainer(ctx, useLabFeature('teach'));
}
