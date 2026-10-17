'use client';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { VDEF, pHof, tempOf } from '@labs/lib/reaction-types/chemistry';
import type { ReactionAction } from '@labs/lib/reaction-types/reducer';
import type { ReactionTypesState } from '@labs/lib/reaction-types/state';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { BENCH_HEIGHT, BENCH_WIDTH, BURN_PARK } from './bench';

/**
 * "How to play": every control on the bench, run over two of the four
 * reactions, before anything is marked.
 *
 * It runs on a SANDBOX bench the workspace swaps in, so opening it mid-practical
 * loses nothing and pauses the clock. There is no second "guided build" tour:
 * this practical is four short procedures rather than one long assembly, and
 * walking two of them through to a real observation is the lesson.
 */
export type ReactionTourCtx = BenchTourContext<ReactionTypesState, ReactionAction>;

type Region = readonly [x: number, y: number, w: number, h: number];

const vx = (k: number): number => VDEF[k]!.x;

const RG = {
  bottles: [30, 34, 540, 178] as Region,
  tools: [540, 86, 320, 176] as Region,
  clock: [846, 88, 138, 142] as Region,
  lime: [vx(0) - 46, 296, 92, 300] as Region,
  fs: [vx(1) - 60, 296, 120, 300] as Region,
  nails: [vx(2) - 50, 296, 190, 300] as Region,
  burner: [BURN_PARK - 46, 480, 92, 110] as Region,
};

const lime = (s: ReactionTypesState) => s.vessels[0]!;

export function createReactionTours(ctx: ReactionTourCtx): { controls: TourStep<ReactionTourCtx>[] } {
  const stage = ctx.stage;
  const find = ctx.find;

  /**
   * A rectangle in BENCH coordinates, mapped to where it actually is on screen.
   * The drawing scales to fit and centres, so it is letterboxed whenever its box
   * has different proportions; scaling by width alone lands the spotlight beside
   * the thing it is naming.
   */
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

  const controls: TourStep<ReactionTourCtx>[] = [
    {
      title: 'Your bench',
      body:
        'Four reactions, five vessels and a burner. Everything you will see — the temperature, the colours, the smell, ' +
        'the precipitate — is worked out from what is actually in each vessel. This tour runs two of the four. ' +
        '**Nothing in the tour is marked.**',
    },
    {
      title: 'The reagents',
      target: region(RG.bottles),
      body:
        'Quicklime and water for (i); green ferrous sulphate crystals for (ii); copper sulphate for (iii); sodium ' +
        'sulphate and barium chloride for (iv). Pick a bottle up, then tap a vessel to pour.',
    },
    {
      title: 'The tools',
      target: region(RG.tools),
      body:
        'Iron nails, **red and blue litmus**, a **thermometer** reading to 110 °C, and a rubber **stopper**. The ' +
        'stopper is there so you can find out for yourself why a closed tube must never be heated.',
    },
    {
      title: 'The lab clock',
      target: region(RG.clock),
      body:
        'Reactions take time. **Wait 1 min** and **Wait 5 min** move the clock on, and everything on the bench moves ' +
        'with it — the slaked lime cools, the crystals decompose, the copper plates onto the nails.',
    },
    {
      title: 'Pick up the quicklime',
      target: region(RG.bottles),
      highlight: ['tool:CaO'],
      body: 'A bottle is picked up first and poured second, exactly as it is on a real bench.',
      task: 'Tap the **CaO** bottle.',
      done: ({ state }) => state.held?.kind === 'bottle' && state.held.k === 'CaO',
    },
    {
      title: 'Put it in the first tube',
      target: region(RG.lime),
      highlight: ['tube:0'],
      body: 'Whatever is in your hand goes into whichever vessel you tap next.',
      task: 'Tap the first vessel, labelled **(i) CaO + H₂O**.',
      done: ({ state }) => (lime(state).c.CaO ?? 0) > 0,
    },
    {
      title: 'Now the water',
      target: region(RG.lime),
      highlight: ['tool:H2O', 'tube:0'],
      stay: true,
      body: 'Two substances are about to become one. Watch what the tube does the instant they meet.',
      task: 'Tap the **H₂O** bottle, then tap that tube again.',
      done: ({ state }) => (lime(state).c.H2O ?? 0) > 0,
      doneMessage: 'It hisses at once.',
      after: ({ state }) =>
        'Steam is coming off it. But nothing on this bench moves without **time passing** — the reaction is only just ' +
        `beginning, and the thermometer still reads ${tempOf(lime(state)).toFixed(0)} °C. Give it a minute.`,
    },
    {
      title: 'Let a minute pass',
      target: tagged('rx-controls'),
      body: 'The lab clock is the only thing that makes a reaction proceed. One press moves every vessel on together.',
      task: 'Press **Wait 1 min**.',
      done: ({ state }) => state.min >= 1,
      doneMessage: 'One minute gone.',
      after: ({ state }) =>
        `The tube is at **${tempOf(lime(state)).toFixed(0)} °C** — hot enough to be uncomfortable to hold, and there ` +
        'is no flame anywhere near it. That heat came out of the reaction itself: CaO + H₂O → Ca(OH)₂ is ' +
        '**exothermic**, and two substances becoming one is a **combination**.',
    },
    {
      title: 'Test it with litmus',
      target: region(RG.tools),
      highlight: ['tool:litmusR', 'tube:0'],
      stay: true,
      body: 'The milky liquid is lime water. A strip of litmus says what kind of solution it is.',
      task: 'Tap the **red litmus**, then tap the quicklime tube.',
      done: ({ state }) => lime(state).litmus.litmusR !== undefined,
      doneMessage: 'The strip is out and dry.',
      after: ({ state }) =>
        'Red litmus turning blue means the milky liquid is **basic**: slaked lime dissolving gives lime water, about ' +
        `pH ${(pHof(lime(state)) ?? 7).toFixed(1)}.`,
    },
    {
      title: 'The burner',
      target: region(RG.burner),
      highlight: ['tool:burner'],
      body:
        'Reaction (ii) is the only one that gets heated. The burner is a tool like any other: pick it up, and tap the ' +
        'vessel you want it under.',
      task: 'Tap the **burner**.',
      done: ({ state }) => state.held?.kind === 'burner',
    },
    {
      title: 'Slide it under tube (ii)',
      target: region(RG.fs),
      highlight: ['tube:1'],
      body: 'The burner stays where you leave it until you move it again.',
      task: 'Tap the **(ii) FeSO₄ crystals** tube.',
      done: ({ state }) => state.burnerAt === 1,
    },
    {
      title: 'Heating is not a click',
      target: tagged('rx-controls'),
      body:
        'Lighting the burner does nothing by itself — the crystals change because the **tube gets hotter**. Above ' +
        'about 100 °C they lose their water of crystallisation and go white; only past about 480 °C do they break up ' +
        'into brown ferric oxide and choking sulphur gases. You will need crystals in the tube and the clock running ' +
        'to see it.',
    },
    {
      title: 'Reaction (iii) is the slow one',
      target: region(RG.nails),
      body:
        'Iron nails in copper sulphate take minutes, not seconds — so start it early and work on the others while it ' +
        'runs. The **second tube, with no nail**, is the control: it is how you show the change came from the iron and ' +
        'not from standing about.',
    },
    {
      title: 'Your observation table',
      target: tagged('console'),
      body:
        'One row per reaction, six things you might have seen, and the vessel you are judging magnified right beside ' +
        'them. Tick **only** what that vessel actually showed you. Ticking something the book predicts but the vessel ' +
        'never did costs marks — that is the whole point of writing a practical record.',
    },
    {
      title: 'How you are marked',
      target: tagged('stats'),
      body:
        'Setting the four reactions up, heating (ii) safely, using the thermometer and the litmus, an honest ' +
        'observation table, and naming the four types of reaction. Every mistake is logged with the time it happened.',
    },
  ];

  return { controls };
}
