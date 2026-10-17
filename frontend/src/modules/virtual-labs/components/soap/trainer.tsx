'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { DROPS, LEAST_COUNT, POUR, SHAKES_MIN } from '@labs/lib/soap/chemistry';
import { STEP, TUBE_A, TUBE_B, TUBES } from '@labs/lib/soap/marking';
import type { SoapAction } from '@labs/lib/soap/reducer';
import type { SoapState } from '@labs/lib/soap/state';
import {
  andAShake,
  emptyBothTubes,
  fillTube,
  handsDown,
  lookAtTheHardTube,
  lookAtTheSoftTube,
  measureTubeIndex,
  oneMoreRoundOfSoap,
  partnerOf,
  pourIntoItsOwnTube,
  shakeTubeIndex,
  soapTube,
  standTheScaleAgainstOne,
  takeACork,
  takeTheDistilledWater,
  takeTheDropper,
  takeTheHardWater,
  takeTheScale,
  thenACork,
  threeShakesOnOne,
  twoSqueezesIntoOne,
  type DemoCtx,
} from '@labs/lib/soap/trainer-demos';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { useLabFeature } from '../lab-features';

import { BENCH_HEIGHT, BENCH_WIDTH, REGION } from './bench';

/**
 * THE VISUAL TRAINER: "Show me this step", on the two tubes as they stand.
 *
 * The tour is one comparison start to finish on a sandbox bench. This is the
 * answer to "what do I do *here*", so it runs on the student's own pair and the
 * workspace puts them back byte for byte when it finishes.
 *
 * WHAT IT WILL NOT DO:
 *
 * - **It never types a froth height, never picks scum or none, never writes the
 *   extension's number of drops, never chooses a conclusion and never submits
 *   any of them.** That is 88 of the 100 marks.
 * - **It never finishes a step.** Four stages here end when a PAIR has been
 *   done, and the demonstration always does one and hands the other over. On
 *   this bench that is more than a technicality: **the pair is the fair test**,
 *   and a student who watched both halves done for them has watched the
 *   experiment rather than run it.
 *
 * The teaching layer is this bench's "What's happening" panel, so the step that
 * opens it is dropped when the `teach` flag is off.
 */
export type SoapTrainerCtx = BenchTourContext<SoapState, SoapAction>;
type Step = TourStep<SoapTrainerCtx>;

// ---------------------------------------------------------------------------
// Doing the thing
// ---------------------------------------------------------------------------

/** Runs a step's actions once, as it opens. See the prism bench's trainer. */
function Demonstrate({ run, ctx }: { run: (ctx: DemoCtx) => void; ctx: SoapTrainerCtx }): null {
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

/** A tube by the letter printed on the rack, which is how every step names one. */
const nameOf = (index: number): string => TUBES[index]?.id ?? '?';

/**
 * The demonstrations, keyed by procedure step.
 *
 * `teach` is a parameter rather than a hook call, so this stays a plain
 * function: the flag is read once, by the hook below, and the step that opens
 * the teaching panel is left OUT of the set rather than skipped when it runs.
 */
export function buildSoapTrainer(
  ctx: SoapTrainerCtx,
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

  // --- equal volumes --------------------------------------------------------
  const fill: readonly Step[] = [
    does(
      {
        title: 'Both tubes start empty and rinsed',
        target: region(REGION.rack),
        highlight: ['tube:0', 'tube:1'],
        body:
          'Nothing left over from an earlier run. Anything already in a tube is part of what you are about to ' +
          'compare, and you would have no way of knowing how much of it there was.',
      },
      emptyBothTubes,
    ),
    does(
      {
        title: 'Pick a water up',
        target: region(REGION.waters),
        highlight: ['water:soft'],
        body: (c) =>
          `The two look identical, which is the whole reason this practical exists. Tube **${nameOf(fillTube(c.state))}** ` +
          `is the ${fillTube(c.state) === TUBE_A ? 'soft' : 'hard'}-water tube — the label is under the tube.`,
      },
      takeTheDistilledWater,
    ),
    does(
      {
        title: 'Tap the tube and it goes in',
        target: region(REGION.tubeA),
        highlight: ['tube:0'],
        body: `${POUR} mL. The bottle stays in your hand until you put it down.`,
      },
      pourIntoItsOwnTube,
    ),
    does(
      {
        title: 'Then the other water, and that pour is yours',
        target: region(REGION.waters),
        highlight: ['water:hard'],
        body: (c) =>
          `The same **${POUR} mL** into tube **${nameOf(partnerOf(fillTube(c.state)))}**. **Equal volumes**, or a ` +
          'difference in froth could be dilution rather than hardness.\n\nI am putting the bottle in your hand and ' +
          'stopping there: that pour is the act that finishes this step, and the equality of the two is the whole ' +
          'experiment.',
      },
      takeTheHardWater,
    ),
    {
      title: 'The two tubes now differ in exactly one thing',
      target: region(REGION.tubesAB),
      highlight: ['tube:0', 'tube:1'],
      body:
        'The water in them. Everything that follows — the soap, the shaking, the reading — is done identically to ' +
        'both, so that whatever difference turns up at the end can only be the water.',
    },
    does(
      {
        title: 'Put the bottle down when you have finished with it',
        target: tagged('soap-hands'),
        body: 'Press **Put down**, or press Esc.',
      },
      handsDown,
    ),
  ];

  // --- equal soap -----------------------------------------------------------
  const soap: readonly Step[] = [
    does(
      {
        title: 'Pick up the dropper',
        target: region(REGION.soap),
        highlight: ['tool:soap'],
        body: `One squeeze is **${DROPS} drops** — a fixed dose, so it is easy to keep the two tubes equal.`,
      },
      takeTheDropper,
    ),
    does(
      {
        title: 'Two squeezes into one tube',
        target: region(REGION.tubesAB),
        highlight: ['tube:0', 'tube:1'],
        body: (c) => `Tube **${nameOf(soapTube(c.state))}**. ${DROPS * 2} drops, counted.`,
      },
      twoSqueezesIntoOne,
    ),
    {
      title: 'And the same two into the other',
      target: region(REGION.tubesAB),
      highlight: ['tube:0', 'tube:1'],
      body: (c) =>
        `Tube **${nameOf(partnerOf(soapTube(c.state)))}** takes exactly the same: same soap, same dose, same ` +
        'everything.\n\nThat squeeze is yours — it finishes this step, and it is the half of the pair that makes ' +
        'the first half mean anything.',
    },
    does(
      {
        title: 'Watch the hard-water tube as they land',
        target: region(REGION.tubesAB),
        highlight: ['tube:1'],
        body:
          'It goes cloudy before it is even shaken: the **Ca²⁺ and Mg²⁺ ions are throwing that soap out as scum**, ' +
          'and soap that is sitting at the bottom as scum is soap that cannot make froth.',
      },
      lookAtTheHardTube,
    ),
    {
      title: 'Keep the count equal',
      target: tagged('console'),
      body:
        'Give one tube more soap and any difference in froth proves nothing — it could be the extra soap. **Twelve ' +
        'marks are for the fair test alone**, and they are judged on the volumes, the drops and the shakes being ' +
        'the same in both.',
    },
    ...(teach
      ? [
          {
            title: 'And if you want the mechanism',
            target: tagged('teach-toggle'),
            body:
              'Open **What’s happening** under the bench for what the ions are doing to the soap. It is a teaching ' +
              'aid, it is never marked, and it will not read a froth height for you.',
          } satisfies Step,
        ]
      : []),
    does(
      {
        title: 'Then put the dropper down',
        target: tagged('soap-hands'),
        body: 'Hands free before you pick up a cork.',
      },
      handsDown,
    ),
  ];

  // --- equal shaking --------------------------------------------------------
  const shake: readonly Step[] = [
    does(
      {
        title: 'Pick up a cork',
        target: region(REGION.corks),
        highlight: ['tool:cork'],
        body:
          'Each tap corks that tube and shakes it once. The cork appears on top of the tube while it is being ' +
          'shaken — soap that is not mixed in cannot foam.',
      },
      takeACork,
    ),
    does(
      {
        title: `${SHAKES_MIN} shakes for one tube`,
        target: region(REGION.tubesAB),
        highlight: ['tube:0', 'tube:1'],
        body: (c) =>
          `Tube **${nameOf(shakeTubeIndex(c.state))}**, three times — that is the minimum this practical asks for.`,
      },
      threeShakesOnOne,
    ),
    {
      title: 'And the same number for the other',
      target: region(REGION.tubesAB),
      highlight: ['tube:0', 'tube:1'],
      body: (c) =>
        `Tube **${nameOf(partnerOf(shakeTubeIndex(c.state)))}**, the **same number of times** — shaking is what turns ` +
        'soap into froth, so a tube shaken more has been given an advantage the other did not get.\n\nThat one is ' +
        'yours. It finishes the step, and it is the half that makes this a comparison.',
    },
    {
      title: 'Same volume, same soap, same shaking',
      target: region(REGION.tubesAB),
      body:
        'Only the hardness is left to explain any difference in the froth. **That is the fair test**, and it is what ' +
        'the twelve marks for it are actually checking.',
    },
    does(
      {
        title: 'Put the cork down before you pick up the scale',
        target: tagged('soap-hands'),
        body: 'One thing in your hand at a time, as on a real bench.',
      },
      handsDown,
    ),
  ];

  // --- measuring ------------------------------------------------------------
  const measure: readonly Step[] = [
    does(
      {
        title: 'Pick up the centimetre scale',
        target: region(REGION.scale),
        highlight: ['tool:scale'],
        body: `Its least count is **${LEAST_COUNT} cm** — one millimetre. Every small division on it is worth that.`,
      },
      takeTheScale,
    ),
    does(
      {
        title: 'Stand it against one tube',
        target: region(REGION.tubesAB),
        highlight: ['tube:0', 'tube:1'],
        body: (c) =>
          `Tube **${nameOf(measureTubeIndex(c.state))}**. The scale stands beside it with its **zero at the water ` +
          'line**, which is what makes the two readings comparable at all.',
      },
      standTheScaleAgainstOne,
    ),
    {
      title: 'Then the other, exactly the same way',
      target: region(REGION.tubesAB),
      body: (c) =>
        `Tube **${nameOf(partnerOf(measureTubeIndex(c.state)))}**, so both readings start from the same place. That ` +
        'one is yours — it carries this step on.',
    },
    does(
      {
        title: 'The bench view is too small for millimetres',
        target: tagged('soap-closeup'),
        body:
          'Lean in with the close-up instead. It shows one tube with the scale standing against it, large enough to ' +
          'count divisions on.',
      },
      lookAtTheSoftTube,
    ),
    {
      title: 'Count from zero to the top of the froth',
      target: tagged('soap-closeup'),
      body:
        '**Not to the scummy layer in the water** — that is not froth, and it is the mistake this experiment ' +
        'collects.\n\n**Reading the number is your job.** Twenty-four marks are the two heights, and the bench will ' +
        'not read a scale for you.',
    },
    does(
      {
        title: 'Then put the scale down',
        target: tagged('soap-hands'),
        body: 'If a tube changes after you measure it, pick the scale up and measure it again.',
      },
      handsDown,
    ),
  ];

  // --- the table ------------------------------------------------------------
  const record: readonly Step[] = [
    {
      title: 'Everything in this table is marked',
      body: 'So the bench writes none of it. Here is the method.',
    },
    does(
      {
        title: 'One tube at a time in the close-up',
        target: tagged('soap-closeup'),
        body: 'With the scale still standing against it. Tap the other tube on the rack to swap.',
      },
      lookAtTheSoftTube,
    ),
    {
      title: 'Froth height in the first box',
      target: tagged('console'),
      body:
        `In centimetres, to the nearest **${LEAST_COUNT} cm**. Within a millimetre of the truth scores full marks and ` +
        'within two millimetres scores half — so read carefully, and read honestly.',
    },
    {
      title: 'The second box is scum, or none',
      target: tagged('console'),
      body:
        'Say what **that tube** showed, not what the book says it should. A tube that surprised you is still what ' +
        'you saw, and the marking compares your row against the tube and nothing else.',
    },
    does(
      {
        title: 'Then check the other tube before you submit',
        target: region(REGION.tubesAB),
        highlight: ['tube:1'],
        body:
          'Both rows are marked at the moment you hand them in, so if either tube has changed since you measured ' +
          'it, measure it again first.',
      },
      lookAtTheHardTube,
    ),
  ];

  // --- the extension --------------------------------------------------------
  const extend: readonly Step[] = [
    does(
      {
        title: 'Tube B gave almost no froth',
        target: tagged('soap-closeup'),
        body:
          'Because nearly every drop of soap was precipitated as scum before it could lather. So the extension ' +
          'simply carries on: **more soap into tube B**, until the ions run out.',
      },
      lookAtTheHardTube,
    ),
    does(
      {
        title: 'One squeeze',
        target: region(REGION.soap),
        highlight: ['tool:soap', 'tube:1'],
        body: `${DROPS} more drops into tube **${nameOf(TUBE_B)}**. Count them as you go — the counting is the answer.`,
      },
      oneMoreRoundOfSoap,
    ),
    does(
      {
        title: 'Then a cork…',
        target: region(REGION.corks),
        highlight: ['tool:cork'],
        body: 'Soap that is not mixed in cannot foam, so every squeeze wants a shake after it.',
      },
      thenACork,
    ),
    does(
      {
        title: '…and a shake',
        target: region(REGION.tubesAB),
        highlight: ['tube:1'],
        body:
          '**Squeeze, shake, look** — over and over. Once the calcium and magnesium ions have all been precipitated, ' +
          'the next soap stays in solution and the hard water lathers like the soft water did.',
      },
      andAShake,
    ),
    {
      title: 'How many drops that takes is the marked answer',
      target: tagged('console'),
      body:
        'So the bench stops here and leaves the counting to you. You may also **skip** the extension — it is worth ' +
        'saying that an honest skip costs less than a number you did not measure.',
    },
    does(
      {
        title: 'Put the cork down and carry on from where you were',
        target: tagged('soap-hands'),
        body: 'The two tubes are still there, and the table you already submitted is untouched by any of this.',
      },
      handsDown,
    ),
  ];

  // --- the conclusion -------------------------------------------------------
  const conclude: readonly Step[] = [
    {
      title: 'The conclusion has to follow from your table',
      target: tagged('console'),
      body: 'So nothing here is chosen for you.',
    },
    {
      title: 'Compare the two froth heights you wrote down',
      target: tagged('console'),
      body:
        'The taller column is the water that cleaned better **with the same soap**. Read it off your own two ' +
        'numbers, not off what you expected before you started.',
    },
    {
      title: 'Pick that water in the first row of buttons',
      target: tagged('console'),
      body: 'Which one — and it is marked against **your** table, so a surprising pair of heights is not a wrong answer.',
    },
    {
      title: 'Then the reason',
      target: tagged('console'),
      body:
        'Which is about what the **Ca²⁺ and Mg²⁺ ions** did to the soap — not about the froth, which is the ' +
        'evidence rather than the explanation.',
    },
    {
      title: 'The two halves are marked separately',
      body: 'A sound reason still scores even if your heights came out odd. Answer both on their own merits.',
    },
  ];

  // --- the viva -------------------------------------------------------------
  const viva: readonly Step[] = [
    {
      title: 'Your first answer counts',
      target: tagged('console'),
      body: 'Five questions, twenty marks, and nothing here gets tapped for you.',
    },
    {
      title: 'Every one is about what you just did',
      target: tagged('console'),
      body: 'Hardness, scum, the fair test, and why detergents behave differently.',
    },
    {
      title: 'The explanation appears once you answer',
      target: tagged('console'),
      body: 'Right or wrong, with the passage from the chapter beside it. Read it either way.',
    },
    {
      title: 'Stuck on one?',
      target: tagged('console'),
      body: 'The **Theory** tab beside the procedure list is worth a second look.',
    },
  ];

  return {
    [STEP.fill]: fill,
    [STEP.soap]: soap,
    [STEP.shake]: shake,
    [STEP.measure]: measure,
    [STEP.record]: record,
    [STEP.extend]: extend,
    [STEP.conclude]: conclude,
    [STEP.viva]: viva,
  };
}

/**
 * WHERE THE TEACH FLAG IS READ. A hook, and passed to the workspace by
 * reference so it is called as one: with the flag off there is no teaching
 * panel on the bench bar, and the step that opens it is never built.
 */
export function useSoapTrainer(ctx: SoapTrainerCtx): Readonly<Record<number, readonly Step[]>> {
  return buildSoapTrainer(ctx, useLabFeature('teach'));
}
