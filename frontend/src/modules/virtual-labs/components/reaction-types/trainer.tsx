'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { SP, VDEF, vol } from '@labs/lib/reaction-types/chemistry';
import { STEP } from '@labs/lib/reaction-types/marking';
import type { ReactionAction } from '@labs/lib/reaction-types/reducer';
import type { ReactionTypesState } from '@labs/lib/reaction-types/state';
import {
  K,
  compareAgainstTheControl,
  crystalsAreSafeToAdd,
  dropTheNailsIn,
  fillTheLastTube,
  fillTheNailTube,
  handsDown,
  lightTheBurner,
  lookAtTheControl,
  lookAtTheLastTube,
  openTheFirstReaction,
  openTheNailReaction,
  quicklimeIsSafeToAdd,
  slideTheBurnerBackOut,
  slideTheBurnerUnderTheCrystals,
  standTheThermometerIn,
  takeTheBariumChloride,
  takeTheBurner,
  takeTheCopperSulphate,
  takeTheCrystals,
  takeTheFlameAway,
  takeTheNails,
  takeTheQuicklime,
  takeTheRedLitmus,
  takeTheSodiumSulphate,
  takeTheThermometer,
  takeTheWaterBottle,
  tipTheCrystalsIn,
  tipTheQuicklimeIn,
  waftTheGasTowardsYou,
  type DemoCtx,
} from '@labs/lib/reaction-types/trainer-demos';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { useLabFeature } from '../lab-features';

import { BENCH_HEIGHT, BENCH_WIDTH, BURN_PARK } from './bench';

/**
 * THE VISUAL TRAINER: "Show me this step", on the bench as it stands.
 *
 * The tour walks two of the four reactions through on a sandbox bench. This is
 * the answer to "what do I do *here*", so it runs on the student's own vessels
 * and the workspace puts them back byte for byte when it finishes.
 *
 * WHAT IT WILL NOT DO:
 *
 * - **It never ticks an observation, never names a reaction type and never
 *   submits either table.** Those decide 70 of the 100 marks. What a vessel
 *   showed is the observation, and the observation is the practical.
 * - **It never finishes a step.** Each of the four setups turns on one last
 *   act — the water onto the quicklime, the minute of real heating, the control
 *   tube, the barium chloride — and it is left to the student on purpose, said
 *   out loud rather than quietly skipped.
 * - **It never runs the lab clock.** A lit burner and five simulated minutes
 *   crack tubes; the clock is the student's.
 *
 * TWO SAFETY LESSONS live on reaction (ii) and nowhere else in this port:
 * **never heat a closed tube**, before the flame is lit, and **waft a gas
 * towards you with your hand** rather than putting your nose over the mouth of
 * the tube. Both are steps of the `fs` script below.
 *
 * The teaching layer is this bench's "What's happening" panel, so the step that
 * opens it is dropped when the `teach` flag is off.
 */
export type ReactionTrainerCtx = BenchTourContext<ReactionTypesState, ReactionAction>;
type Step = TourStep<ReactionTrainerCtx>;

// ---------------------------------------------------------------------------
// Doing the thing
// ---------------------------------------------------------------------------

/** Runs a step's actions once, as it opens. See the prism bench's trainer. */
function Demonstrate({ run, ctx }: { run: (ctx: DemoCtx) => void; ctx: ReactionTrainerCtx }): null {
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

const vx = (k: number): number => VDEF[k]!.x;

const RG = {
  bottles: [30, 34, 540, 178] as Region,
  tools: [540, 86, 320, 176] as Region,
  clock: [846, 88, 138, 142] as Region,
  lime: [vx(K.lime) - 46, 296, 92, 300] as Region,
  fs: [vx(K.fs) - 60, 296, 120, 300] as Region,
  nails: [vx(K.nail) - 50, 296, 190, 300] as Region,
  dd: [vx(K.dd) - 56, 296, 112, 300] as Region,
  burner: [BURN_PARK - 46, 480, 92, 110] as Region,
};

/**
 * The demonstrations, keyed by procedure step.
 *
 * `teach` is a parameter rather than a hook call, so this stays a plain
 * function: the flag is read once, by the hook below, and the step that opens
 * the teaching panel is left OUT of the set rather than skipped when it runs.
 */
export function buildReactionTrainer(
  ctx: ReactionTrainerCtx,
  teach: boolean,
): Readonly<Record<number, readonly Step[]>> {
  const stage = ctx.stage;
  const find = ctx.find;

  /** A rectangle in BENCH coordinates, mapped to where it actually is on screen. */
  const region = ([x, y, w, h]: Region): TourTarget => ({
    element: stage,
    region: (box): TourRect => {
      const k = Math.min(box.width / BENCH_WIDTH, box.height / BENCH_HEIGHT);
      const originX = box.left + (box.width - BENCH_WIDTH * k) / 2;
      const originY = box.top + (box.height - BENCH_HEIGHT * k) / 2;
      return { left: originX + x * k, top: originY + y * k, width: w * k, height: h * k };
    },
  });
  const tagged = (name: string): TourTarget => ({ element: () => find(name), pad: 6 });

  const dose = (id: keyof ReactionTypesState['dose']): string =>
    `${ctx.state.dose[id]}${SP[id].g ? ' g' : ' mL'}`;

  // --- (i) water on quicklime ----------------------------------------------
  const lime: readonly Step[] = [
    does(
      {
        title: 'Quicklime first',
        target: region(RG.bottles),
        highlight: ['tool:CaO'],
        body:
          'Pick the **CaO** bottle up. Every bottle and every tool on this bench works the same way: pick it up, then ' +
          'tap the vessel you want to use it on. Tapping a vessel with empty hands only opens its close-up.',
      },
      takeTheQuicklime,
    ),
    does(
      {
        title: 'Into the tube labelled (i)',
        target: region(RG.lime),
        highlight: ['tube:0'],
        body: (c) =>
          quicklimeIsSafeToAdd(c.state)
            ? `${dose('CaO')} of the powder, into a **dry** tube. Every vessel is labelled with the reaction it is for, ` +
              'and a reagent that does not belong in one spoils it: whatever it shows afterwards is a mixture, not ' +
              'the reaction you set out to do.'
            : 'There is already something wet in that tube, so I will leave the powder alone — tipping it in now ' +
              'would set the reaction going and carry this step on while I was still talking.',
      },
      tipTheQuicklimeIn,
    ),
    does(
      {
        title: 'Then the water, and that one is yours',
        target: region(RG.bottles),
        highlight: ['tool:H2O', 'tube:0'],
        body:
          'Straight onto the quicklime. I am putting the bottle in your hand and stopping there on purpose: **the ' +
          'water is the act that finishes this step**, and it is not mine to make.\n\nWhen you tap the tube, listen ' +
          'and look at it the moment the water lands.',
      },
      takeTheWaterBottle,
    ),
    does(
      {
        title: 'The heat is the whole point of this one',
        target: region(RG.tools),
        highlight: ['tool:thermo'],
        body:
          'Take the **thermometer** and tap the tube to stand it in. It reads room temperature to start with, and it ' +
          'stays in the tube until you take it out.\n\nNever stand one in something over a flame — a lab thermometer ' +
          'reads to 110 °C and a burner takes a tube far past that.',
      },
      takeTheThermometer,
    ),
    does(
      {
        title: 'Standing in the tube',
        target: region(RG.lime),
        highlight: ['tube:0'],
        body:
          'Nothing on this bench moves until time does, so let a minute go by on the lab clock and then read the ' +
          'thermometer in the close-up. **Whatever it says is your reading**, so take it yourself — a temperature ' +
          'rise with no flame anywhere near the tube is the observation this reaction exists for.',
      },
      standTheThermometerIn,
    ),
    does(
      {
        title: 'And the litmus, once the fizzing has stopped',
        target: region(RG.tools),
        highlight: ['tool:litmusR', 'tube:0'],
        body:
          'Dip **red litmus** into the milky liquid and read the strip yourself — I will not read it for you. The ' +
          'product is slaked lime, and what a base does to red litmus is the thing being tested.',
      },
      takeTheRedLitmus,
    ),
    does(
      {
        title: 'Then put whatever you are holding down',
        target: tagged('rx-controls'),
        body: 'Press **Put down** or press Esc. What is in your hand is always named under the bench.',
      },
      handsDown,
    ),
  ];

  // --- (ii) heating the crystals -------------------------------------------
  const fs: readonly Step[] = [
    does(
      {
        title: 'Green crystals, into a dry tube',
        target: region(RG.bottles),
        body: (c) =>
          crystalsAreSafeToAdd(c.state)
            ? `**Ferrous sulphate**, ${dose('FeSO4x7')} of it. Dry, because the water of crystallisation is part of ` +
              'what comes off when it is heated — the crystals lose their own water first, and only then does the ' +
              'sulphate itself break up.'
            : 'These crystals have already had their minute over the flame, so tipping more in now would carry the ' +
              'step on. I will leave the bottle alone.',
      },
      takeTheCrystals,
    ),
    does(
      {
        title: 'Tap tube (ii)',
        target: region(RG.fs),
        highlight: ['tube:1'],
        body:
          'The crystals go in green and they will not stay that way. Watch the tube itself the whole time it is ' +
          'heated: it tells you when each change happens, and **in what order**, which is half of what the ' +
          'observation table asks for.',
      },
      tipTheCrystalsIn,
    ),
    does(
      {
        title: 'The burner is a tool like any other',
        target: region(RG.burner),
        highlight: ['tool:burner'],
        body: 'Pick it up first. Nothing is heated by pressing a button on this bench.',
      },
      takeTheBurner,
    ),
    does(
      {
        title: 'Under tube (ii), and nowhere else',
        target: region(RG.fs),
        highlight: ['tube:1'],
        body:
          'Tap the tube to slide the burner underneath it. This is the **only** vessel that is ever heated in this ' +
          'practical — a flame under any of the others boils it dry, spoils the reaction in it and is logged against ' +
          'you.',
      },
      slideTheBurnerUnderTheCrystals,
    ),
    {
      title: 'Before the flame: the stopper stays on the bench',
      target: region(RG.tools),
      highlight: ['tool:stopper'],
      body:
        '**Never heat a closed tube.** The gas has nowhere to go, the pressure builds, and the tube bursts — ' +
        'everything in it is lost and the reaction has to be set up again in a fresh one.\n\nThe stopper is there for ' +
        'holding a gas, not for heating one. I am not even picking it up.',
    },
    does(
      {
        title: 'Now light it',
        target: tagged('rx-controls'),
        body:
          'The flame does nothing on its own. **Heating is not a click**: the crystals change because the tube gets ' +
          'hotter, and that takes time on the lab clock.',
      },
      lightTheBurner,
    ),
    {
      title: 'And the minute is yours',
      target: tagged('rx-controls'),
      body:
        'Press **Wait 1 min**, then more. Half a simulated minute of real flame is what this step is waiting for, so ' +
        'it is the one act I will not make for you — and on a bench where a lit burner can crack a tube, a ' +
        'demonstration should not set the clock running and walk away.\n\nFive more minutes takes the tube far past ' +
        'red heat. Watch it, do not just wait it out.',
    },
    does(
      {
        title: 'To smell a gas, waft it towards you',
        target: tagged('rx-controls'),
        body:
          '**With your hand, from a distance — never put your nose over the mouth of the tube.** That is what the ' +
          '**Smell it** button does, and it is the only way this practical will let you do it.\n\nWhat comes off ' +
          'here is sulphur dioxide and sulphur trioxide. A lungful of either is a hospital visit.',
      },
      waftTheGasTowardsYou,
    ),
    does(
      {
        title: 'Once nothing more comes off, take the flame away',
        target: tagged('rx-controls'),
        body:
          'Glass kept red hot with nothing left to heat cracks, and a cracked tube costs five marks and the residue ' +
          'with it. When the crystals have gone brown and the gas has stopped, that reaction is finished.',
      },
      takeTheFlameAway,
    ),
    does(
      {
        title: 'Then slide the burner back out',
        target: region(RG.burner),
        highlight: ['tool:burner'],
        body: 'Pick it up, tap the same tube again, and it goes back to its parking place off the bench.',
      },
      slideTheBurnerBackOut,
    ),
  ];

  // --- (iii) nails in copper sulphate --------------------------------------
  const nails: readonly Step[] = [
    does(
      {
        title: 'Copper sulphate into two tubes',
        target: region(RG.bottles),
        body:
          'The reaction, and the **control** it is judged against. Without the control you cannot say whether the ' +
          'blue faded because of the iron or because it stood on a bench for twenty minutes.',
      },
      takeTheCopperSulphate,
    ),
    does(
      {
        title: 'This one is tube (iii)',
        target: region(RG.nails),
        highlight: ['tube:2'],
        body: (c) => `${dose('CuSO4')} of blue solution, enough to half cover a nail.`,
      },
      fillTheNailTube,
    ),
    does(
      {
        title: 'Now the iron nails',
        target: region(RG.tools),
        highlight: ['tool:nails'],
        body:
          'Two clean ones. They go into **(iii) only** — the control keeps no nail, and that is the whole of what ' +
          'makes it a control.',
      },
      takeTheNails,
    ),
    does(
      {
        title: 'Into the nail tube',
        target: region(RG.nails),
        highlight: ['tube:2'],
        body:
          'Half covered by the solution, so you can see the part that is in it and the part that is not. Fe + CuSO₄ → ' +
          'FeSO₄ + Cu: the iron goes into solution and the copper comes out onto the nail.',
      },
      dropTheNailsIn,
    ),
    does(
      {
        title: 'And the control tube is yours',
        target: region(RG.nails),
        highlight: ['tube:3'],
        body:
          'The same solution again into the tube beside it, and **no nail**. I am leaving that pour to you because it ' +
          'is the act that carries this step — and because a control somebody else set up is not a control you can ' +
          'trust.',
      },
      lookAtTheControl,
    ),
    {
      title: 'This one runs on the lab clock',
      target: region(RG.clock),
      body:
        'It is **slow**. About fifteen simulated minutes is when it is safe to call, so set the other three ' +
        'reactions up while it runs rather than sitting and watching it.\n\nThe clock is yours to press. Nothing on ' +
        'this bench moves until time does.',
    },
    {
      title: 'Then hold the two tubes against each other',
      target: region(RG.nails),
      highlight: ['tube:2', 'tube:3'],
      body:
        'The control, not your memory, is the comparison. Blue fading is easy to imagine; blue fading **beside a tube ' +
        'that has not faded** is an observation.',
    },
    does(
      {
        title: 'Hands free',
        target: tagged('rx-controls'),
        body: 'Nails down. Anything still in your hand acts on the next vessel you tap.',
      },
      handsDown,
    ),
  ];

  // --- (iv) the precipitate -------------------------------------------------
  const dd: readonly Step[] = [
    does(
      {
        title: 'Sodium sulphate into the last tube',
        target: region(RG.bottles),
        body: (c) =>
          `${dose('Na2SO4')} of it, into the tube labelled **(iv)**. This is the one reaction here that needs no ` +
          'flame and no waiting at all.',
      },
      takeTheSodiumSulphate,
    ),
    does(
      {
        title: 'Tap tube (iv)',
        target: region(RG.dd),
        highlight: ['tube:4'],
        body:
          'Clear and colourless, and it stays that way until the second solution arrives. Na₂SO₄ + BaCl₂ → BaSO₄ + ' +
          '2NaCl — two compounds trading partners, and one of the products will not stay in solution.',
      },
      fillTheLastTube,
    ),
    does(
      {
        title: 'Then barium chloride, and that pour is yours',
        target: region(RG.bottles),
        body:
          'Straight in on top of it. **Keep your eyes on the tube as you pour** — this one is over in an instant, and ' +
          'if you are looking at the bottle you will miss it.\n\nI am stopping with the bottle in your hand because ' +
          'that pour completes the reaction, and the reaction is what you are here to see.',
      },
      takeTheBariumChloride,
    ),
    does(
      {
        title: 'Then give it a moment before you decide',
        target: tagged('rx-closeup'),
        body:
          'Tap the tube for the close-up. A precipitate that has just formed hangs in the liquid and then starts to ' +
          'settle, and **how it looks** — dense, white, fine — is part of what the table asks for.',
      },
      lookAtTheLastTube,
    ),
    does(
      {
        title: 'Then put the bottle down',
        target: tagged('rx-controls'),
        body: 'Four reactions on one bench, and only one of them was in a hurry.',
      },
      handsDown,
    ),
  ];

  // --- the observation table ------------------------------------------------
  const record: readonly Step[] = [
    {
      title: 'This table is marked on honesty',
      body:
        'So I will show you the method and not tick a single box. Twenty-eight marks are in these four rows, and ' +
        'each row is marked against **its own vessel at the moment you submit** — not against the textbook, and not ' +
        'against what the vessel looked like ten minutes ago.',
    },
    does(
      {
        title: 'One vessel at a time',
        target: region(RG.lime),
        highlight: ['tube:0'],
        body:
          'Tap a reaction in the table, or its vessel on the bench — both bring the same one into the close-up, and ' +
          'the close-up is where you read it: what is in it, how the glass feels, what the litmus did.',
      },
      openTheFirstReaction,
    ),
    {
      title: 'Then answer the six questions in that row',
      target: tagged('console'),
      body:
        'About **that vessel**, and nothing else. A tick for something you did not actually see earns nothing and ' +
        'costs you a line in the log; **No change at all** is a real answer and it is marked as one.',
    },
    does(
      {
        title: 'Reaction (iii) has a control',
        target: region(RG.nails),
        highlight: ['tube:2', 'tube:3'],
        body:
          'Compare the two tubes before you tick anything on its row. If the control has faded as much as the nail ' +
          'tube, then whatever happened was not the iron.',
      },
      openTheNailReaction,
    ),
    does(
      {
        title: 'The control, side by side',
        target: region(RG.nails),
        highlight: ['tube:3'],
        body:
          'No nail, same solution, same bench, same twenty minutes. Everything the two tubes have in common cancels, ' +
          'and what is left is the reaction.',
      },
      compareAgainstTheControl,
    ),
    {
      title: 'And the clock keeps running while you write',
      target: region(RG.clock),
      body:
        'If reaction (iii) is not finished yet, it will go on changing underneath you. Finish the slow row **last**, ' +
        'and if you are not sure it is done, let the clock run a little further before you submit.',
    },
    ...(teach
      ? [
          {
            title: 'And if you want the mechanism',
            target: tagged('teach-toggle'),
            body:
              'Open **What’s happening** under the bench for what each reaction is doing underneath. It is a ' +
              'teaching aid, it is never marked, and it will not tell you what your vessels showed.',
          } satisfies Step,
        ]
      : []),
  ];

  // --- naming the four types ------------------------------------------------
  const classify: readonly Step[] = [
    {
      title: 'Naming the four types is your judgement',
      target: tagged('console'),
      body: 'Twenty-eight marks, seven a reaction, and the bench will not name one of them for you.',
    },
    {
      title: 'Read the equation, do not recall it',
      target: tagged('console'),
      body:
        'Everything you need is printed above each menu. The reaction you did is the reaction in front of you, and ' +
        'the names follow from its equation rather than from which chapter it came out of.',
    },
    {
      title: 'Count what goes in and what comes out',
      target: tagged('console'),
      body:
        'Formulas **in**, formulas **out**. Two into one is combination; one into two or more is decomposition. That ' +
        'is the first half of the rule and it settles two of the four on its own.',
    },
    {
      title: 'Then look for a free element',
      body:
        'A substance on its own, not part of a compound, on either side. One free element trading places with part ' +
        'of a compound is **displacement**; no free element anywhere and two compounds swapping partners is **double ' +
        'displacement**.',
    },
    {
      title: 'The rules are written out beside the procedure',
      target: tagged('console'),
      body:
        'In the **Theory** tab, in full. Read them again before you choose — this is the step where a reaction that ' +
        'was observed perfectly gets the wrong name.',
    },
    {
      title: 'Choose all four, then submit once',
      target: tagged('console'),
      body: 'There is no second attempt at it, so read each equation twice before you do.',
    },
  ];

  // --- the viva -------------------------------------------------------------
  const viva: readonly Step[] = [
    {
      title: 'Your first answer counts',
      target: tagged('console'),
      body:
        'Five questions, twenty marks, and nothing here gets clicked for you. What follows is how to read them.',
    },
    {
      title: 'Read all four options before you touch one',
      target: tagged('console'),
      body: 'Two of them usually differ by a single word.',
    },
    {
      title: 'Every answer is somewhere in what you just did',
      body:
        'What got hot on its own, what changed colour, what came off as a gas, what would not stay in solution. ' +
        'These are questions about your own bench, asked in the examiner’s words.',
    },
    {
      title: 'Then read the reason either way',
      target: tagged('console'),
      body:
        'It is shown whether you were right or wrong, with the passage from the chapter beside it. That is the part ' +
        'worth reading.',
    },
  ];

  return {
    [STEP.lime]: lime,
    [STEP.fs]: fs,
    [STEP.nails]: nails,
    [STEP.dd]: dd,
    [STEP.record]: record,
    [STEP.classify]: classify,
    [STEP.viva]: viva,
  };
}

/**
 * WHERE THE TEACH FLAG IS READ. A hook, and passed to the workspace by
 * reference so it is called as one: with the flag off there is no teaching
 * panel on the bench bar, and the step that opens it is never built.
 */
export function useReactionTrainer(
  ctx: ReactionTrainerCtx,
): Readonly<Record<number, readonly Step[]>> {
  return buildReactionTrainer(ctx, useLabFeature('teach'));
}
