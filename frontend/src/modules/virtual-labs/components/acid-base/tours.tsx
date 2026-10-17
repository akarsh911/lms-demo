'use client';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import {
  pHof,
  solutionVol,
  tubeWith,
  type ReagentId,
  type TestId,
  type TubeSpec,
} from '@labs/lib/acid-base/chemistry';
import type { AcidBaseAction } from '@labs/lib/acid-base/reducer';
import type { AcidBaseState } from '@labs/lib/acid-base/state';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { BENCH_HEIGHT, BENCH_WIDTH, SHELF_X } from './bench';

/**
 * "How to play": one litmus test and one gas test, start to finish, on a
 * sandbox bench. Nothing in the tour is marked and the practical waits.
 *
 * A step never names a tube by letter in its own text: which tube holds the
 * acid is decided by the bench seed, so every instruction reads the letter out
 * of the live state it is handed.
 */
export type AcidBaseTourCtx = BenchTourContext<AcidBaseState, AcidBaseAction>;

type Region = readonly [x: number, y: number, w: number, h: number];

const RG_REAGENTS: Region = [103, 28, 174, 178];
const RG_LITMUS: Region = [291, 28, 174, 178];
const RG_SOLIDS: Region = [479, 40, 424, 166];
const RG_LIME: Region = [SHELF_X.lime - 48, 44, 96, 162];
const RG_RACK: Region = [50, 200, 900, 340];

/**
 * A tube named by what it HOLDS rather than by its position, resolved against
 * the live bench. `highlightsFor` in the definition translates the same token.
 */
export const tubeToken = (reagent: ReagentId, test: TestId): string => `tube@${reagent}:${test}`;

export function resolveTubeToken(token: string, layout: readonly TubeSpec[]): string {
  if (!token.startsWith('tube@')) return token;
  const [reagent, test] = token.slice(5).split(':') as [ReagentId, TestId];
  const i = tubeWith(layout, reagent, test);
  return i >= 0 ? `tube:${i}` : token;
}

const at = (s: AcidBaseState, reagent: ReagentId, test: TestId): number => tubeWith(s.layout, reagent, test);
const idOf = (s: AcidBaseState, i: number): string => s.layout[i]?.id ?? '?';

export function createAcidBaseTours(ctx: AcidBaseTourCtx): { controls: TourStep<AcidBaseTourCtx>[] } {
  const bench = ctx.stage;
  const find = ctx.find;

  /**
   * A rectangle in BENCH coordinates, mapped to where it actually is on screen.
   * The drawing is letterboxed inside its box (`xMidYMid meet`), so scaling by
   * width alone would land the spotlight well away from what it names.
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

  const controls: TourStep<AcidBaseTourCtx>[] = [
    {
      title: 'Your bench',
      body:
        'Two colourless solutions, four ways to tell them apart, and eight labelled tubes. Everything you will see is worked out from what is really in each tube — the litmus colour from its pH, the bubbles from the reaction that is running. ' +
        'This tour does one litmus test and one gas test. **Nothing in the tour is marked.**',
    },
    {
      title: 'The two solutions',
      target: region(RG_REAGENTS),
      body: 'Dilute **hydrochloric acid** and dilute **sodium hydroxide**. They look exactly the same, they are both clear, and neither smells of anything at this dilution. The whole practical exists because you cannot tell them apart by looking.',
    },
    {
      title: 'Litmus solution',
      target: region(RG_LITMUS),
      body: 'Two dropper bottles of the same dye at different starting colours. **Blue litmus** turns red below about pH 6; **red litmus** turns blue above about pH 8. In between it sits purple.',
    },
    {
      title: 'The solids and the gas tests',
      target: region(RG_SOLIDS),
      body: '**Zinc granules**, **solid sodium carbonate**, a **burning splinter** and a tube of **lime water**. The jars go into a tube; the splinter and the lime water read the gas that comes off it.',
    },
    {
      title: 'Read the rack',
      target: region(RG_RACK),
      body:
        'Eight tubes, each labelled underneath with the solution that belongs in it and the test it is for. **Read the label** — which tube holds the acid is different on every bench, so a neighbour’s answers will not fit yours.',
    },
    {
      title: 'Pick up the acid',
      target: region(RG_REAGENTS),
      highlight: ['reagent:HCl'],
      body: 'Everything here works the same way: pick a thing up, then tap the tube you want to use it on. Tapping a tube with empty hands only looks at it, so nothing goes in by accident.',
      task: 'Tap the **dil. HCl** bottle.',
      done: ({ state }) => state.held?.kind === 'reagent' && state.held.id === 'HCl',
    },
    {
      title: 'Fill a tube',
      target: region(RG_RACK),
      highlight: [tubeToken('HCl', 'blue')],
      body: 'The bottle stays in your hand until you put it down, so you can fill several tubes in a row.',
      task: ({ state }) => `Tap the pulsing tube — **${idOf(state, at(state, 'HCl', 'blue'))}**, the one labelled dil. HCl with blue litmus.`,
      done: ({ state }) => solutionVol(state.tubes[at(state, 'HCl', 'blue')]!) > 0,
    },
    {
      title: 'And the zinc tube',
      target: region(RG_RACK),
      highlight: [tubeToken('HCl', 'Zn')],
      body: 'Still holding the bottle. The tube that takes dil. HCl with zinc needs the same 5 mL.',
      task: ({ state }) => `Tap tube **${idOf(state, at(state, 'HCl', 'Zn'))}**.`,
      done: ({ state }) => solutionVol(state.tubes[at(state, 'HCl', 'Zn')]!) > 0,
      doneMessage: 'Two tubes of acid.',
    },
    {
      title: 'Put it down',
      target: tagged('held'),
      body: 'What is in your hand is always named under the bench.',
      task: 'Press **Put down**, press Esc, or tap an empty part of the bench.',
      done: ({ state }) => state.held === null,
    },
    {
      title: 'The litmus test',
      target: region(RG_RACK),
      highlight: ['litmus:blue', tubeToken('HCl', 'blue')],
      stay: true,
      body: 'Three drops is plenty. Watch what the colour does.',
      task: ({ state }) => `Tap the **blue litmus** bottle, then tap tube **${idOf(state, at(state, 'HCl', 'blue'))}**.`,
      done: ({ state }) => state.tubes[at(state, 'HCl', 'blue')]!.drops.blue > 0,
      doneMessage: 'Three drops in.',
      after: ({ state }) => {
        const i = at(state, 'HCl', 'blue');
        const ph = pHof(state.tubes[i]!) ?? 7;
        return (
          `Tube ${idOf(state, i)} is at **pH ${ph.toFixed(1)}**, and the colour follows from that number alone: below pH 6 the litmus is red. ` +
          '**Blue litmus turned red** — that is the test for an acid. Drop the same litmus into NaOH later and nothing will happen.'
        );
      },
    },
    {
      title: 'Zinc into the acid',
      target: region(RG_RACK),
      highlight: ['jar:Zn', tubeToken('HCl', 'Zn')],
      stay: true,
      body: 'A spatula of granules goes in, and the reaction starts the moment it lands.',
      task: ({ state }) => `Tap the **zinc** jar, then tap tube **${idOf(state, at(state, 'HCl', 'Zn'))}**.`,
      done: ({ state }) => state.tubes[at(state, 'HCl', 'Zn')]!.put.Zn > 0,
      doneMessage: 'The tube is fizzing.',
      after: () =>
        'Zn + 2HCl → ZnCl₂ + H₂. Brisk effervescence — but bubbles alone do not name a gas. Zinc does this with **NaOH too**, so you cannot even use the fizzing to tell acid from alkali.',
    },
    {
      title: 'Test the gas',
      target: region(RG_RACK),
      highlight: ['splinter', tubeToken('HCl', 'Zn')],
      stay: true,
      body: 'Gas has to collect before there is anything at the mouth to test. The tube is open at the top and it leaks, so test while it is still fizzing.',
      task: ({ state }) =>
        `Tap the **burning splinter**, then tap tube **${idOf(state, at(state, 'HCl', 'Zn'))}** to hold it at the mouth.`,
      done: ({ state }) => state.tubes[at(state, 'HCl', 'Zn')]!.tests.splinter === 'pop',
      doneMessage: 'Pop.',
      after: ({ state }) => {
        const t = state.tubes[at(state, 'HCl', 'Zn')]!;
        return (
          `About ${t.gas.H2.toFixed(1)} mL of gas had collected, and it burned with a sharp pop: **hydrogen**. ` +
          'Try it the instant the solid goes in and nothing happens — there is not enough gas there yet.'
        );
      },
    },
    {
      title: 'Lime water is for CO₂',
      target: region(RG_LIME),
      body: 'The other gas test. Hold the **lime water** tube and tap a fizzing tube to pass its gas through it. It goes **milky** only if the gas really is carbon dioxide — try it on a hydrogen tube and it stays clear, which is itself worth knowing.',
    },
    {
      title: 'Your observation table',
      target: tagged('console'),
      body:
        'This panel always shows the tube you are on, magnified, and the one thing to decide about it. Eight rows, one per test, and each is marked against the **real** state of that tube. ' +
        'Writing “carbon dioxide” for a gas you never tested costs the mark, even when the textbook agrees with you.',
    },
    {
      title: 'How you are marked',
      target: tagged('stats'),
      body:
        'Marks come from filling the tubes correctly, setting up all eight tests, identifying both gases with the right test, an honest observation table, three conclusions and the viva. ' +
        'Mistakes are logged with the time, so you can see where each one came from.',
    },
  ];

  return { controls };
}
