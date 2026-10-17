'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { DROPS, POUR } from '@labs/lib/acid-base/chemistry';
import { STEP } from '@labs/lib/acid-base/marking';
import type { AcidBaseAction } from '@labs/lib/acid-base/reducer';
import type { AcidBaseState } from '@labs/lib/acid-base/state';
import {
  carbAcid,
  carbAlkali,
  dipTheLitmusItsLabelCallsFor,
  fillItsOwnTube,
  handsDown,
  idOf,
  litmusDemoTube,
  openTheAlkaliOfThePair,
  openTheFirstTube,
  passTheGasTooSoon,
  pourDemoTube,
  pourWouldFinish,
  runTheCarbonatePairFromClean,
  runTheZincPairFromClean,
  takeTheAcidBottle,
  takeTheAlkaliBottle,
  takeTheCarbonateJar,
  takeTheLimeWater,
  takeTheSplinter,
  takeTheZincJar,
  testTheGasTooSoon,
  tipASpatulaIntoTheAcidTube,
  tipCarbonateIntoTheAcidTube,
  zincAcid,
  zincAlkali,
  type DemoCtx,
} from '@labs/lib/acid-base/trainer-demos';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { useLabFeature } from '../lab-features';

import { BENCH_HEIGHT, BENCH_WIDTH, SHELF_X } from './bench';
import { tubeToken } from './tours';

/**
 * THE VISUAL TRAINER: "Show me this step", on the rack as it stands.
 *
 * The tour is one litmus test and one gas test on a sandbox bench. This is the
 * answer to "what do I do *here*", so it runs on the student's own rack and the
 * workspace puts that rack back byte for byte when it finishes.
 *
 * WHAT IT WILL NOT DO:
 *
 * - **It never writes a row, never submits the table, and never answers a
 *   conclusion or a viva question.** Those decide 64 of the 100 marks. What a
 *   tube does is the observation, and the observation is the practical.
 * - **It never finishes a step.** The eighth pour, the fourth litmus test and
 *   the gas test that completes a pair all carry the procedure forward, so the
 *   demonstration either leaves that one act to the student or runs its pair
 *   from clean so that it cannot be the act that ends the stage.
 *
 * THE TIMING LESSON lives on the zinc stage and again, in its own words, on the
 * carbonate stage: a gas test made the instant the solid lands finds nothing.
 * It is taught by doing it wrong on purpose. See `testTheGasTooSoon`.
 *
 * The teaching layer is this bench's "What's happening" panel, so the step that
 * opens it is dropped when the `teach` flag is off.
 */
export type AcidBaseTrainerCtx = BenchTourContext<AcidBaseState, AcidBaseAction>;
type Step = TourStep<AcidBaseTrainerCtx>;

// ---------------------------------------------------------------------------
// Doing the thing
// ---------------------------------------------------------------------------

/** Runs a step's actions once, as it opens. See the prism bench's trainer. */
function Demonstrate({ run, ctx }: { run: (ctx: DemoCtx) => void; ctx: AcidBaseTrainerCtx }): null {
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

const RG_REAGENTS: Region = [103, 28, 174, 178];
const RG_LITMUS: Region = [291, 28, 174, 178];
const RG_SOLIDS: Region = [479, 40, 424, 166];
const RG_LIME: Region = [SHELF_X.lime - 48, 44, 96, 162];
const RG_RACK: Region = [50, 200, 900, 340];

/**
 * The demonstrations, keyed by procedure step.
 *
 * `teach` is a parameter rather than a hook call, so this stays a plain
 * function: the flag is read once, by the hook below, and the step that opens
 * the teaching panel is left OUT of the set rather than skipped when it runs.
 */
export function buildAcidBaseTrainer(
  ctx: AcidBaseTrainerCtx,
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

  // --- filling the tubes ----------------------------------------------------
  const pour: readonly Step[] = [
    does(
      {
        title: 'Pick a bottle up',
        target: region(RG_REAGENTS),
        highlight: ['reagent:HCl'],
        body:
          'This one is the **dil. HCl**. Everything on this bench works the same way — pick a thing up, then tap the ' +
          'tube you want to use it on. Tapping a tube with empty hands only looks at it.',
      },
      takeTheAcidBottle,
    ),
    does(
      {
        title: 'Read the label, then tap the tube',
        target: region(RG_RACK),
        highlight: [tubeToken('HCl', 'blue')],
        body: (c) =>
          pourWouldFinish(c.state, pourDemoTube(c.state))
            ? `Tube **${idOf(c.state, pourDemoTube(c.state))}** is the last one still empty, so I will leave it to you — ` +
              'filling it would carry the procedure on to the litmus tests while I was still talking.'
            : `Tube **${idOf(c.state, pourDemoTube(c.state))}** is labelled **dil. HCl**, blue litmus, so ${POUR} mL goes in ` +
              'there.\n\nWhich tube holds the acid is decided by the bench seed, so the letters are different on every ' +
              'bench and a neighbour’s answers will not fit yours. **Read the label under the tube.**',
      },
      fillItsOwnTube,
    ),
    {
      title: 'The bottle stays in your hand',
      target: region(RG_RACK),
      body: (c) => {
        const same = c.state.layout
          .map((spec, i) => (spec.reagent === 'HCl' ? idOf(c.state, i) : ''))
          .filter(Boolean);
        return (
          `So carry straight on to every other tube labelled the same way — on this bench that is **${same.join(', ')}**. ` +
          'Four tubes of acid and four of alkali, and the pairing is what the whole practical rests on.'
        );
      },
    },
    does(
      {
        title: 'Then change bottles',
        target: region(RG_REAGENTS),
        highlight: ['reagent:NaOH'],
        body:
          'Tap the **dil. NaOH** bottle and the acid goes back on the shelf. Pour a solution into a tube labelled for ' +
          'the other one and they cancel: the tube ends up neither acid nor alkali, it costs two marks, and it is ' +
          'logged. **Empty and rinse** gives you the tube back, but not the mark.',
      },
      takeTheAlkaliBottle,
    ),
    does(
      {
        title: 'Put it down when the rack is full',
        target: tagged('held'),
        body:
          'Press **Put down**, press Esc, or tap an empty part of the bench. What is in your hand is always named ' +
          'under the rack, so you never have to guess what the next tap will do.',
      },
      handsDown,
    ),
  ];

  // --- the litmus tests -----------------------------------------------------
  const litmus: readonly Step[] = [
    {
      title: 'Four tubes, four separate tests',
      target: region(RG_LITMUS),
      body:
        'Two dropper bottles of the same dye at different starting colours. **Blue litmus** turns red below about ' +
        'pH 6; **red litmus** turns blue above about pH 8. In between it sits purple, which is an observation of its ' +
        'own and not a failure.',
    },
    does(
      {
        title: 'Each tube calls for one of them',
        target: region(RG_RACK),
        highlight: [`litmus:blue`, tubeToken('HCl', 'blue')],
        body: (c) => {
          const k = litmusDemoTube(c.state);
          return (
            `The label under the tube says which. Tube **${idOf(c.state, k)}** calls for **${c.state.layout[k]!.what}**, so ` +
            `that bottle comes off the shelf and ${DROPS} drops go in.\n\nDropping the other colour in is not a ` +
            'disaster, but it is noted: a tube is set up for one test, and the pair it belongs to is what makes it ' +
            'mean anything.'
          );
        },
      },
      dipTheLitmusItsLabelCallsFor,
    ),
    {
      title: 'What it does next is your observation',
      target: region(RG_RACK),
      stay: true,
      body:
        'Look at the solution, not at me. The colour is worked out from the tube’s real pH and nothing else, so what ' +
        'you see is what happened.\n\nThe rule you are reading it against is printed on the card beside the tube: ' +
        'blue turns red for an acid, red turns blue for an alkali.',
    },
    {
      title: 'Then the partner tube',
      target: region(RG_RACK),
      highlight: [tubeToken('NaOH', 'blue')],
      body: (c) =>
        `Blue litmus goes into **${idOf(c.state, 0)}** and **${idOf(c.state, 2)}**; red litmus into ` +
        `**${idOf(c.state, 1)}** and **${idOf(c.state, 3)}**. One of each pair holds the acid and the other the alkali, ` +
        'and it is the **difference between them** that tells the two solutions apart — a single tube on its own ' +
        'tells you nothing.',
    },
    ...(teach
      ? [
          {
            title: 'And if you want the mechanism',
            target: tagged('teach-toggle'),
            body:
              'Open **What’s happening** under the bench for what the dye is actually responding to, and what the ' +
              'numbers underneath the colour are. It is a teaching aid, it is never marked, and it will not read a ' +
              'tube for you.',
          } satisfies Step,
        ]
      : []),
    does(
      {
        title: 'Then put the dropper down',
        target: tagged('held'),
        body: 'Hands free before the solids come out — a dropper in your hand will not tip a spatula of anything.',
      },
      handsDown,
    ),
  ];

  // --- zinc, and the timing lesson -----------------------------------------
  const zinc: readonly Step[] = [
    does(
      {
        title: 'I will run this pair from clean',
        target: region(RG_RACK),
        highlight: [tubeToken('HCl', 'Zn'), tubeToken('NaOH', 'Zn')],
        body: (c) =>
          `Tubes **${idOf(c.state, zincAcid(c.state))}** and **${idOf(c.state, zincAlkali(c.state))}** — the zinc pair — ` +
          'emptied, rinsed and filled again with what their labels call for, so the demonstration is the same every ' +
          'time and nothing I do here can end the step under you.',
      },
      runTheZincPairFromClean,
    ),
    does(
      {
        title: 'Pick up the jar of zinc granules',
        target: region(RG_SOLIDS),
        highlight: ['jar:Zn'],
        body:
          'A jar behaves like a bottle: pick it up, then tap a tube and one spatula goes in. A solid tipped into an ' +
          'empty tube does nothing at all, which is why the solutions go in first.',
      },
      takeTheZincJar,
    ),
    does(
      {
        title: 'The tube starts to work at once',
        target: region(RG_RACK),
        highlight: [tubeToken('HCl', 'Zn')],
        stay: true,
        body: (c) =>
          `Zn + 2HCl → ZnCl₂ + H₂, and it begins the moment the granules land in tube ` +
          `**${idOf(c.state, zincAcid(c.state))}**.\n\nBut bubbles alone do not name a gas. Zinc does this with ` +
          '**NaOH too** — it is amphoteric — so you cannot even use the fizzing to tell the two solutions apart.',
      },
      tipASpatulaIntoTheAcidTube,
    ),
    {
      title: 'The alkali one is yours',
      target: region(RG_RACK),
      highlight: [tubeToken('NaOH', 'Zn')],
      body: (c) =>
        `The same spatula goes into tube **${idOf(c.state, zincAlkali(c.state))}** — set both up before you judge ` +
        'either, because the pair is the comparison.\n\nI leave that one to you deliberately: tipping it in and then ' +
        'testing the gas is what carries this step, and I am not going to finish your step for you.',
    },
    does(
      {
        title: 'Now the gas',
        target: region(RG_SOLIDS),
        highlight: ['splinter'],
        body:
          'Put the jar down and pick up the **burning splinter**. Tap a tube and it is brought to the mouth — that is ' +
          'the whole movement, and it reads the gas that is really standing there.',
      },
      takeTheSplinter,
    ),
    does(
      {
        title: 'And nothing happens',
        target: region(RG_RACK),
        highlight: [tubeToken('HCl', 'Zn')],
        stay: true,
        body:
          'Because I started the tube over and tested it the instant the zinc went in. There was no gas at the mouth ' +
          'yet, so the splinter just went on burning.\n\n**Let the tube fizz for a few seconds first, then test it** ' +
          '— and what the flame does is yours to read, not mine to tell you.',
      },
      testTheGasTooSoon,
    ),
    {
      title: 'The tube leaks, so do not leave it either',
      target: region(RG_RACK),
      body:
        'It is open at the top and loses about two per cent of what it holds every second, so a tube tested long ' +
        'after it stopped fizzing has nothing left in it. Test it **while it is still working**, and if the splinter ' +
        'tells you nothing, wait a moment and try again.',
    },
    does(
      {
        title: 'Then put the splinter down',
        target: tagged('held'),
        body:
          'A gas named by the wrong test is not named at all: lime water does not respond to hydrogen, and a ' +
          'splinter does not identify carbon dioxide. Ten marks turn on using the right one.',
      },
      handsDown,
    ),
  ];

  // --- the carbonate pair ---------------------------------------------------
  const carbonate: readonly Step[] = [
    does(
      {
        title: 'Again from clean',
        target: region(RG_RACK),
        highlight: [tubeToken('HCl', 'Na2CO3'), tubeToken('NaOH', 'Na2CO3')],
        body: (c) =>
          `This time the carbonate pair, tubes **${idOf(c.state, carbAcid(c.state))}** and ` +
          `**${idOf(c.state, carbAlkali(c.state))}**. Same idea: emptied, rinsed and refilled, so what you are about ` +
          'to watch is the reaction and not whatever was left in the glass.',
      },
      runTheCarbonatePairFromClean,
    ),
    does(
      {
        title: 'Pick up the solid sodium carbonate',
        target: region(RG_SOLIDS),
        highlight: ['jar:Na2CO3'],
        body:
          'Na₂CO₃ + 2HCl → 2NaCl + H₂O + CO₂. With the alkali there is no reaction at all — a carbonate and a base ' +
          'have nothing to give each other — and **that** difference is one you can use.',
      },
      takeTheCarbonateJar,
    ),
    does(
      {
        title: 'A spatula into the acid one',
        target: region(RG_RACK),
        highlight: [tubeToken('HCl', 'Na2CO3')],
        stay: true,
        body: (c) =>
          `Tube **${idOf(c.state, carbAcid(c.state))}**. This one fizzes harder than the zinc did — carbon dioxide ` +
          'comes off about twice as fast — and it runs out sooner, because there is only a spatula of carbonate to ' +
          'spend.',
      },
      tipCarbonateIntoTheAcidTube,
    ),
    {
      title: 'And the same into the alkali one',
      target: region(RG_RACK),
      highlight: [tubeToken('NaOH', 'Na2CO3')],
      body: (c) =>
        `Tube **${idOf(c.state, carbAlkali(c.state))}** takes it too, and you should expect **nothing** — which is a ` +
        'result, not a failed test. You always set the pair up.\n\nThat one is yours, for the same reason as before: ' +
        'it is the act that carries the step.',
    },
    does(
      {
        title: 'Pick up the lime water',
        target: region(RG_LIME),
        highlight: ['lime'],
        body:
          'Tap a fizzing tube while you are holding it and its gas is passed through the lime water tube standing on ' +
          'the bench. That tube, not the one in your hand, is what you watch.',
      },
      takeTheLimeWater,
    ),
    does(
      {
        title: 'Too soon again',
        target: region(RG_LIME),
        stay: true,
        body:
          'Barely any gas had collected, so the lime water could not show anything — and that is a lesson in timing, ' +
          'not a result. Let the tube fizz for a few seconds, pass the gas again, and **read the lime water ' +
          'yourself**.\n\nIt goes milky only if the gas really is carbon dioxide. Try it on the hydrogen tube and it ' +
          'stays clear, which is itself worth knowing.',
      },
      passTheGasTooSoon,
    ),
    {
      title: 'Naming the gas is your job',
      target: region(RG_LIME),
      body:
        'Two gases, two tests, and each one only answers for its own: the **splinter pops** for hydrogen, the **lime ' +
        'water goes milky** for carbon dioxide. Writing down a gas you did not establish with the right test earns ' +
        'nothing, even when the textbook agrees with you.',
    },
    does(
      {
        title: 'Then put the bottle down',
        target: tagged('held'),
        body: 'Hands free, and the rack is set up. Everything after this is reading and writing.',
      },
      handsDown,
    ),
  ];

  // --- the observation table ------------------------------------------------
  const record: readonly Step[] = [
    {
      title: 'Nothing gets written in for you',
      body:
        'Thirty-two marks are in this table and every one of them is marked against the tube it describes, at the ' +
        'moment you submit. So this is the method, not the answers.',
    },
    does(
      {
        title: 'One tube at a time',
        target: region(RG_RACK),
        body:
          'Tap it on the rack, or tap its row in the table — both open the same tube. The close-up beside the table ' +
          'shows that one tube magnified, and the one thing there is to decide about it.',
      },
      openTheFirstTube,
    ),
    {
      title: 'Find the matching row',
      target: tagged('console'),
      body:
        'Eight rows, one per test, in the order the rack is laid out. Write down what **you** saw in that tube — not ' +
        'what the pair was supposed to show, and not what the tube beside it did.',
    },
    does(
      {
        title: 'A pair is read as a pair',
        target: region(RG_RACK),
        highlight: [tubeToken('NaOH', 'Zn')],
        body:
          'Here is the alkali tube of the zinc pair. Zinc fizzes in both, so this row and its partner say the same ' +
          'thing and neither tells the solutions apart. That is a real finding, and the conclusions ask about it.',
      },
      openTheAlkaliOfThePair,
    ),
    {
      title: 'A gas row wants two things',
      target: tagged('console'),
      body:
        'How hard it fizzed, and **the gas your own test named**. If you never tested it, “I did not test the gas” is ' +
        'the correct entry and it is marked as such. Guessing “carbon dioxide” because it seems likely costs the ' +
        'mark and puts a line in the log.',
    },
    {
      title: 'Then submit once',
      target: tagged('console'),
      body:
        'Eight rows, then **Submit the table**. After that the tubes are frozen exactly as they were marked, so ' +
        'anything you want to test again, test now.',
    },
  ];

  // --- the three conclusions ------------------------------------------------
  const conclusions: readonly Step[] = [
    {
      title: 'Three conclusions, and none of them chosen for you',
      target: tagged('console'),
      body:
        'Twelve marks, four each, and your first tap on a question is the one that counts. So decide before you tap.',
    },
    {
      title: 'Read the question, then read your own table',
      target: tagged('console'),
      body:
        'Your eight rows are still there beside it. Every one of these questions is answered by something in them — ' +
        'and by nothing else. The textbook is not being examined here; your rack is.',
    },
    {
      title: 'Ask it of every option in turn',
      target: tagged('console'),
      body: 'Did **my** tubes actually show that? Not "is that true in general" — did I see it, in this rack, today?',
    },
    {
      title: 'Rule out anything both solutions did',
      body:
        'Whatever the acid and the alkali share cannot tell them apart. Zinc fizzed in both, so effervescence with ' +
        'zinc is not a test for an acid. That single idea answers more of these than any other.',
    },
    {
      title: 'And the one that only one of them did',
      target: tagged('console'),
      body:
        'Is the test. Look for the row where the pair disagreed — where one tube did something and its partner sat ' +
        'there — and read what the difference was.',
    },
  ];

  // --- the viva -------------------------------------------------------------
  const viva: readonly Step[] = [
    {
      title: 'Nothing here can be demonstrated',
      target: tagged('console'),
      body:
        'Five questions, twenty marks, and your first answer counts — so nothing gets tapped for you. What follows ' +
        'is how to read them.',
    },
    {
      title: 'Take the whole stem first',
      target: tagged('console'),
      body: 'Most of these turn on a single word: **which** gas, **which** tube, blue litmus or red.',
    },
    {
      title: 'Answer from what your own tubes did',
      target: tagged('console'),
      body:
        'Your table is still there to check, and so is the rack. A question about what zinc does in alkali has an ' +
        'answer sitting in one of your rows.',
    },
    {
      title: 'Then read the reason either way',
      target: tagged('console'),
      body:
        'The explanation appears once you have answered, whether you were right or wrong, with the passage from the ' +
        'chapter beside it. That is the part worth reading.',
    },
  ];

  return {
    [STEP.pour]: pour,
    [STEP.litmus]: litmus,
    [STEP.zinc]: zinc,
    [STEP.carbonate]: carbonate,
    [STEP.record]: record,
    [STEP.conclusions]: conclusions,
    [STEP.viva]: viva,
  };
}

/**
 * WHERE THE TEACH FLAG IS READ. A hook, and passed to the workspace by
 * reference so it is called as one: with the flag off there is no teaching
 * panel on the bench bar, and the step that opens it is never built.
 */
export function useAcidBaseTrainer(
  ctx: AcidBaseTrainerCtx,
): Readonly<Record<number, readonly Step[]>> {
  return buildAcidBaseTrainer(ctx, useLabFeature('teach'));
}
