'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import {
  BENCH_HEIGHT,
  BENCH_WIDTH,
  CONFIGS,
  P,
  TAP_LETTER,
  TERMINALS,
  canonOf,
  cellsUsed,
  type ConfigId,
  type ConfigSpec,
  type TerminalId,
} from '@labs/lib/series-parallel/apparatus';
import { CIRCUIT, stepOfStage } from '@labs/lib/series-parallel/marking';
import type { LabMethod } from '@labs/lib/series-parallel/method';
import { stageOf, type LabAction } from '@labs/lib/series-parallel/reducer';
import type { LabState } from '@labs/lib/series-parallel/state';
import {
  clearTheBench,
  closeTheCloseUp,
  layWire,
  moveTheSliderOn,
  nextTap,
  openTheAmmeter,
  openTheVoltmeter,
  putTheKeyIn,
  startAtTheSmallestCurrent,
  takeTheKeyOut,
  type DemoCtx,
  type Hand,
} from '@labs/lib/series-parallel/trainer-demos';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { useLabFeature } from '../lab-features';

/**
 * THE VISUAL TRAINER: "Show me this step", for the step the student is actually
 * standing on.
 *
 * It is not the tour. The tours are one walk through the bench on a SANDBOX
 * bench with a different pair of resistors; this runs on the STUDENT'S OWN
 * bench, because the question it answers is "what do I do *here*". The
 * workspace takes a snapshot before it starts and puts it back byte for byte
 * afterwards — our state is immutable, so holding the reference IS the copy.
 *
 * This file is the words. The hands are in
 * `@labs/lib/series-parallel/trainer-demos.ts`, which is pure and says what
 * every demonstration is allowed to touch — and which can therefore be driven
 * from plain Node to prove that none of this moves a mark.
 *
 * SIXTEEN STAGES, EIGHT RAIL STEPS, and the trainer is keyed by the RAIL step
 * because that is what `engine.step` reports. Four of those steps — the four
 * circuits — cover three stages each (wire it, switch it on, read it), and a
 * student pressing "Show me this step" on any of them means the stage they are
 * standing on. So the script is chosen by STAGE and filed under the rail step
 * it belongs to; the workspace freezes it the moment it starts, which is what
 * lets a demonstration carry its own stage through to the end.
 *
 * WHAT IT WILL NOT DO. It never presses **Check least counts**, **Check my
 * circuit**, **Record** or **Submit**: those are where the least-count marks,
 * all twenty-four circuit marks, all twelve readings and the calculation are
 * decided, and each of them is the whole of the stage it belongs to.
 *
 * BOTH METHODS. The bench bar switches the apparatus between the manual's own
 * cells and the rheostat it offers as an alternative, and under the cells there
 * is no rheostat on the bench at all. Every card that names the control varying
 * the current therefore has two versions, and the wiring cards are built from
 * `canonOf(config, method)`, so a demonstration never points at apparatus that
 * is not there.
 *
 * The card that points at the **What's happening** switch is dropped when the
 * `teach` flag is off: the switch is not rendered, and a demonstration of a
 * control an administrator has taken away would be a demonstration of nothing.
 */
export type SeriesParallelTrainerCtx = BenchTourContext<LabState, LabAction>;
type Step = TourStep<SeriesParallelTrainerCtx>;

// ---------------------------------------------------------------------------
// Doing the thing
// ---------------------------------------------------------------------------

/**
 * Runs a card's actions once, as it opens.
 *
 * An effect event, not a dependency list: the runner hands `content` a fresh
 * closure on every render, and a demonstration must happen once per card, not
 * once per paint. React's development double-invoke is the same instance, so
 * the latch holds there too.
 */
function Demonstrate({ run, ctx }: { run: Hand; ctx: SeriesParallelTrainerCtx }): null {
  const fire = React.useEffectEvent(() => run(ctx));
  const done = React.useRef(false);
  React.useEffect(() => {
    if (done.current) return;
    done.current = true;
    fire();
  }, []);
  return null;
}

/**
 * A card that DOES something on arrival, rather than only pointing at it.
 *
 * `gated: false` because this is a demonstration: it plays itself, and nothing
 * here is waiting for the student to do it.
 */
function does(step: Step, run: (ctx: DemoCtx) => void): Step {
  return {
    ...step,
    gated: false,
    content: ({ ctx }) => <Demonstrate run={run} ctx={ctx} />,
  };
}

/**
 * NUMBER THE CARDS, and the reason is worth stating because it is invisible
 * until it bites.
 *
 * The runner renders the ACTIVE card's `content` in one fixed position of its
 * own tree. Two acting cards in a row are therefore the same element position
 * and the same component type, so React UPDATES that `Demonstrate` instance
 * instead of remounting it — its mount effect does not run a second time, and
 * the second demonstration silently never happens. On these two benches that is
 * every card but the first: a wiring script that laid one wire and then talked
 * its way through seven more it had not laid.
 *
 * A key per card makes each one its own element, so every card mounts, fires
 * once, and unmounts. It is keyed by POSITION rather than by title, because a
 * title is only unique by luck and a repeated one would fail the same way,
 * silently.
 */
function numbered(cards: readonly Step[]): readonly Step[] {
  return cards.map((card, i) => {
    const { content } = card;
    if (!content) return card;
    return { ...card, content: (api) => <React.Fragment key={`card-${i}`}>{content(api)}</React.Fragment> };
  });
}

// ---------------------------------------------------------------------------
// Where things are
// ---------------------------------------------------------------------------

type Region = readonly [x: number, y: number, w: number, h: number];

const RG_BENCH: Region = [24, 10, 952, 580];
const RG_BAT: Region = [46, 440, 290, 140];
const RG_KEY: Region = [330, 428, 184, 128];
const RG_RHEO: Region = [562, 424, 374, 172];
const RG_AM: Region = [140, 22, 220, 226];
const RG_VM: Region = [560, 22, 220, 226];
const RG_METERS: Region = [140, 22, 640, 226];
const RG_SAND: Region = [48, 306, 144, 100];
const RG_BOARDS: Region = [466, 250, 470, 150];

/** A box round one terminal, for a card that is about that screw alone. */
function termRegion(id: TerminalId): Region {
  const t = TERMINALS[id];
  return [t.x - 54, t.y - 54, 108, 108];
}

/** A box round the two ends of one wire. */
function pairRegion(a: TerminalId, b: TerminalId): Region {
  const A = TERMINALS[a];
  const B = TERMINALS[b];
  return [
    Math.min(A.x, B.x) - 46,
    Math.min(A.y, B.y) - 46,
    Math.abs(A.x - B.x) + 92,
    Math.abs(A.y - B.y) + 92,
  ];
}

// ---------------------------------------------------------------------------
// The demonstrations
// ---------------------------------------------------------------------------

/**
 * The demonstration for the stage the student is standing on, filed under the
 * rail step that stage belongs to.
 *
 * `teach` and `hints` are parameters rather than hook calls so this stays a
 * plain function: the flags are read once, by the hook below, and a card that
 * depends on a layer an administrator has switched off is left OUT of the set
 * rather than skipped when it runs.
 */
export function buildSeriesParallelTrainer(
  ctx: SeriesParallelTrainerCtx,
  teach: boolean,
  hints: boolean,
): Readonly<Record<number, readonly Step[]>> {
  const bench = ctx.stage;
  const find = ctx.find;
  // The apparatus is fixed for the life of a demonstration: changing the method
  // restarts the bench, which is not something that can happen mid-run.
  const method = ctx.state.method;
  const cells = method === 'cells';

  /**
   * A rectangle in BENCH coordinates, mapped to where it actually is on screen.
   *
   * The drawing scales to fit its box and centres (`xMidYMid meet`), so it is
   * letterboxed whenever the box's proportions differ from the bench's. Scaling
   * by width alone ignores that and the spotlight lands well away from the
   * terminal it is naming.
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
  const keep = (steps: readonly (Step | null)[]): readonly Step[] =>
    steps.filter((s): s is Step => s !== null);

  // --- 1. the least counts --------------------------------------------------
  const leastCounts = (): readonly Step[] => [
    {
      title: 'Both numbers are marked, so this is method only',
      target: tagged('console'),
      body:
        'Twelve readings across four circuits all depend on these two numbers, and they are worth **5 marks each** ' +
        '— so I will show you where to look and leave the counting to you. A wrong try costs 2 of the 5 for that ' +
        'meter, so count twice.',
    },
    does(
      {
        title: 'Tap the ammeter’s dial',
        target: region(RG_AM),
        body:
          'A needle on the bench is drawn a few pixels wide. Tapping a dial docks a **magnified copy** of it beside ' +
          'the box its reading is typed into, and it moves with the real needle.',
      },
      openTheAmmeter,
    ),
    {
      title: 'Count the SMALL divisions, not the big ones',
      target: tagged('meter-closeup'),
      body:
        `Count every small line between **0** and the last labelled number — all ${P.amDivs} of them on this dial, ` +
        'not the handful of numbered ones. Then least count = **range ÷ that count**, and the range is printed on ' +
        'the dial itself.',
    },
    does(
      {
        title: 'Then do exactly the same on the voltmeter',
        target: region(RG_VM),
        body:
          'This bench’s two meters happen to carry the same number of divisions, and that is a coincidence of this ' +
          'experiment, not a rule — each has its own range and its own division count, so work each one out on its ' +
          'own.',
      },
      openTheVoltmeter,
    ),
    does(
      {
        title: 'Type each answer into its own box',
        target: tagged('console'),
        body:
          'Then press **Check**. The boxes stay empty until you fill them: this is the one step of the practical ' +
          'where the answer is printed on the apparatus in front of you, and reading it off is the whole skill.',
      },
      closeTheCloseUp,
    ),
  ];

  // --- 2. the sand paper ----------------------------------------------------
  const sand = (): readonly Step[] => [
    {
      title: 'Nothing here is marked on its own',
      body:
        'But a bad joint quietly spoils every reading that follows, which is why the manual makes this **step 2** ' +
        'and why the bench will not let you lay a wire until it is done. Once, now — the four circuits that follow ' +
        'are all wired with the same bright ends.',
    },
    {
      title: 'Dull grey means a film on the copper',
      target: region(RG_SAND),
      body:
        'These are the ends of your connecting wires, lying on a piece of sand paper. Fresh wire carries a thin ' +
        'insulating **enamel**; wire that has lain in a drawer grows an **oxide** layer of its own. Either one is ' +
        'dull, and either one is an insulator.',
    },
    {
      title: 'And it sits exactly where the current has to cross',
      target: region(RG_BOARDS),
      body:
        'That film lies between the copper and the terminal screw — in **series with your whole circuit**, and ' +
        'appearing in no diagram and in no calculation you will do today. On this bench it matters twice over: ' +
        'your two resistors are only about 2 Ω each, so a poor joint is a real fraction of what you are measuring.',
    },
    {
      title: 'Rub them bright, and tighten every screw as you go',
      target: region(RG_SAND),
      body:
        '**Tap the sand paper** to do it — that press is yours, and it is the whole of this step. Bright copper, ' +
        'and a joint that stays metal to metal.',
    },
  ];

  // --- 3. wiring one of the four circuits ----------------------------------
  const wiring = (config: ConfigSpec): readonly Step[] => {
    const canon = canonOf(config, method);
    const why = wireWhy(method, config.id);
    return keep([
      does(
        {
          title: 'Watch the order, then lay them yourself',
          target: region(RG_BENCH),
          body:
            'I am taking the plug out and clearing the bench so you can see this circuit laid from nothing. ' +
            '**Every wire I lay is wiped off again at the end** and none of it costs a mark — the circuit is still ' +
            'yours to build, and on your own bench you will not need to start from an empty board.\n\nTap one ' +
            'terminal, then another, and a wire drops between them.',
        },
        clearTheBench,
      ),
      ...canon.map(([a, b], i) =>
        does(
          {
            title: `Wire ${i + 1} of ${canon.length}: ${TERMINALS[a].name} to ${TERMINALS[b].name}`,
            target: region(pairRegion(a, b)),
            highlight: [a, b],
            body: why[i] ?? '',
          },
          layWire(a, b),
        ),
      ),
      {
        title: 'That is the whole layout',
        target: region(RG_BENCH),
        body: wireEnd(config.id),
      },
      teach
        ? {
            title: 'And if you want the reason rather than the order',
            target: tagged('teach-toggle'),
            body:
              'The switch on the bench bar opens **What’s happening**: why the current is the same in both ' +
              'resistors when there is one road and divides between them when there are two, and where **R₁ + R₂** ' +
              'and **R₁R₂/(R₁ + R₂)** come from. It is not marked and it never says anything about **your** wiring ' +
              'or **your** resistors — press it whenever you like, including now.',
          }
        : null,
      {
        title: 'Then press Check my circuit',
        target: tagged('console'),
        body:
          'The assistant tests your layout by experiment rather than by comparing it with mine — series is told ' +
          'from parallel by the **physics**, equal currents against equal potential differences — so any wiring ' +
          `that behaves correctly passes. This one circuit is worth **${CIRCUIT.max} marks**, less ` +
          `${CIRCUIT.perFail} for every failed check` +
          (hints
            ? ` and ${CIRCUIT.perHint} for every **Show next wire**. Watching this costs nothing at all.`
            : '. Watching this costs nothing at all.'),
      },
    ]);
  };

  // --- 4. closing that circuit safely --------------------------------------
  const closeSafely = (config: ConfigSpec): readonly Step[] => [
    does(
      {
        title: cells ? 'One cell first — and only one' : 'Maximum resistance first',
        target: cells ? region(RG_BAT) : region(RG_RHEO),
        highlight: cells ? ['bat+1'] : [],
        body: cells
          ? 'Before any current flows, the circuit must be driven by as little as it can be. The lead off the ' +
            'holder belongs on tap **B**, the first stud past the **−** end at A, so exactly **one cell** is in ' +
            'the loop.\n\nAnd only ever one stud carries a lead: a wire from one tap to another lies straight ' +
            'across the cells between them and shorts them.'
          : `Before any current flows, the rheostat goes to **maximum resistance**. Current enters the coil at ` +
            `**A** and leaves at the slider, so the slider belongs at end **B** — the whole ${P.rRh} Ω winding in ` +
            'circuit, and the smallest current this arrangement can be given.',
      },
      startAtTheSmallestCurrent,
    ),
    {
      title: 'The bench bar says what you have set',
      target: tagged('bench-readout'),
      body: cells
        ? `It reads the **wiring**, not a meter, so it says the same thing with the plug in and with it out: how ` +
          `many of the ${P.cells} cells are in the circuit, which tap that is, and what they add up to. Inserting ` +
          'the key with more than one cell already in costs **2 procedure marks**, and it can be earned once per ' +
          'circuit — four times over.'
        : 'It reads the slider, not a meter, so it says the same thing with the plug in and with it out. Inserting ' +
          'the key below maximum resistance costs **2 procedure marks**, and it can be earned once per circuit — ' +
          'four times over.',
    },
    does(
      {
        title: `Now insert the plug key — ${config.name} is connected and checked`,
        target: region(RG_KEY),
        body:
          'So it is safe to switch on. One plug switches the whole loop, which is exactly why the key went in ' +
          'first when you wired it.' +
          (config.mode === 'parallel'
            ? '\n\nWatch the ammeter especially on **this** circuit: two resistors side by side are the smallest ' +
              'resistance of the four, so it draws the **largest** current of the whole practical.'
            : ''),
      },
      putTheKeyIn,
    ),
    {
      title: 'Both needles should swing FORWARD',
      target: region(RG_METERS),
      body:
        'Forward and settle: that means every **+** and **−** is the right way round. A needle kicking **backwards** ' +
        'against its stop means that meter’s two leads are swapped — current has to enter at the red **+**.',
    },
    does(
      {
        title: 'And take the plug straight back out',
        target: region(RG_KEY),
        body:
          'Whenever you are not actually reading the meters. A coil carrying current **heats up**, and a hot coil ' +
          'is a different resistance — which would shift every V/I you take after it, in every circuit that ' +
          'follows.',
      },
      takeTheKeyOut,
    ),
  ];

  // --- 5. the three readings of that circuit -------------------------------
  const readings = (config: ConfigSpec): readonly Step[] => [
    {
      title: 'Readings are marked, so nothing here gets written down',
      body:
        `This is the **method** for one of your ${config.readings} readings on **${config.label}**. I will work ` +
        'the key and open the close-ups; the two numbers stay yours.',
    },
    does(
      {
        title: 'Key out before you change anything',
        target: region(RG_KEY),
        body: cells
          ? 'Nothing on this bench is ever rewired live. Out it comes first, every time.'
          : 'Nothing on this bench is ever adjusted live. Out it comes first, every time.',
      },
      takeTheKeyOut,
    ),
    cells
      ? {
          title: 'Each reading is one more cell',
          target: region(termRegion(nextTap(ctx.state))),
          highlight: [nextTap(ctx.state)],
          body: ({ state }) => {
            const k = Math.max(1, cellsUsed(state.wires, state.method));
            const next = Math.min(k + 1, P.cells);
            return (
              `One cell, then two, then ${P.cells} — and the only thing that moves on the whole bench is that ` +
              `single lead on the holder. You are on tap **${TAP_LETTER[k]}**; the next reading goes on tap ` +
              `**${TAP_LETTER[next]}**.\n\nI am leaving it where it is: which tap you are on is the first column ` +
              'of your table, and that is yours to fill.'
            );
          },
        }
      : does(
          {
            title: 'Each reading needs a different current',
            target: region(RG_RHEO),
            body:
              'So move the slider to a fresh position first, and **spread them out** — three points at nearly the ' +
              'same current tell you nothing about the ratio, and the bench will say so.',
          },
          moveTheSliderOn,
        ),
    does(
      {
        title: 'Insert the key and let the needles SETTLE',
        target: region(RG_KEY),
        body:
          'A needle that is still swinging is not a reading. Give it a moment at its new position before you look ' +
          'at it — the bench will not accept a number you took at an operating point you never watched.',
      },
      putTheKeyIn,
    ),
    does(
      {
        title: 'Open the close-up and put your eye straight above',
        target: region(RG_AM),
        body:
          'Looking at a needle from the side reads it a division out — **parallax**, and with twelve rows to fill ' +
          'it is worth a great many marks. Square on, every time.',
      },
      openTheAmmeter,
    ),
    {
      title: 'Labelled number first, then count on',
      target: tagged('meter-closeup'),
      body:
        `Find the labelled number just **below** the needle, then count the small divisions on from it — each one ` +
        `worth the least count you found in step 1, **${P.lcA} A** here.\n\nI am not telling you where the needle ` +
        'is pointing. That is the marked part, and it is the part you came to practise.',
    },
    does(
      {
        title: 'Then exactly the same on the voltmeter',
        target: region(RG_VM),
        body:
          `Its own scale, and on this bench its least count is **${P.lcV} V**. Read it to one division and no ` +
          'finer — never to a value you think it ought to be, and never to the one that would make this ' +
          'arrangement come out at the number you are expecting.',
      },
      openTheVoltmeter,
    ),
    {
      title: 'Type both, then press Record',
      target: tagged('console'),
      body:
        `Within **one least count** of where the needle really pointed scores in full; within two scores half. ` +
        `The ${config.readings} rows of **${config.label}** are averaged into one **${config.short}**, and that ` +
        'mean is what your calculation at the end is judged against — so an honest row is worth more to you than ' +
        'a tidy one.',
    },
    does(
      {
        title: 'And take the key out between readings',
        target: region(RG_KEY),
        body:
          'Every time. Leaving it in warms the coils and costs **3 procedure marks**; never taking it out between ' +
          'the readings of a circuit costs **1 more**, and that one can be earned in each of the four.',
      },
      takeTheKeyOut,
    ),
  ];

  // --- 6. the calculation ---------------------------------------------------
  const calc = (): readonly Step[] => [
    {
      title: 'The calculation is marked, so the arithmetic stays yours',
      target: tagged('console'),
      body:
        'Here is where the numbers come from. Both halves are graded against **your own means**, not against this ' +
        'bench’s true resistors — so an honest experiment with real error still earns full marks for getting the ' +
        'arithmetic right.',
    },
    {
      title: 'Everything you need is in the Compare tab',
      target: tagged('console'),
      body:
        'The mean **V/I** of your own readings for each of the four circuits: **R₁**, **R₂**, **Rs** and **Rp**. ' +
        'Take your measured R₁ and your measured R₂ — not the series row, not the parallel row, and not a textbook ' +
        'value.',
    },
    {
      title: 'Series in theory: simply add them',
      target: tagged('console'),
      body:
        '**Rs = R₁ + R₂.** One road through both, so the charge has to get through each in turn — which is why it ' +
        'always comes out **larger than either resistor**. If your answer is not, you have added something wrong.',
    },
    {
      title: 'Parallel in theory: product over sum',
      target: tagged('console'),
      body:
        '**Rp = R₁R₂ ÷ (R₁ + R₂).** Work out the product and the sum separately, then divide. Two roads take more ' +
        'traffic than one, so it always comes out **smaller than either resistor** — a good check on your ' +
        'arithmetic before you type it.',
    },
    {
      title: 'Then type both in and compare',
      target: tagged('console'),
      body:
        'Within **2%** of what your own means give scores in full, within **5%** scores half. And then read the ' +
        'last line: your **measured** Rs beside your **calculated** Rs, and the same for Rp. That comparison is ' +
        'the whole point of the experiment — the two formulae are what you came here to test.',
    },
  ];

  const stage = stageOf(ctx.state);
  if (!stage) return {};
  const key = stepOfStage(ctx.state.stage);

  switch (stage.type) {
    case 'lc':
      return { [key]: numbered(leastCounts()) };
    case 'sand':
      return { [key]: numbered(sand()) };
    case 'wire':
      return { [key]: numbered(wiring(CONFIGS[stage.cfg])) };
    case 'start':
      return { [key]: numbered(closeSafely(CONFIGS[stage.cfg])) };
    case 'read':
      return { [key]: numbered(readings(CONFIGS[stage.cfg])) };
    case 'calc':
      return { [key]: numbered(calc()) };
    default:
      // The viva. The console replaces the task with the paper there and draws
      // no "Show me this step" button, so a script for it could never be shown.
      return {};
  }
}

/**
 * One line per wire of a circuit's textbook layout, in the order the current
 * flows.
 *
 * Indexed against `canonOf(config, method)`, with one entry per wire, so a wire
 * added to a layout shows up here as a blank rather than as the wrong sentence
 * beside the right wire.
 */
function wireWhy(method: LabMethod, config: ConfigId): readonly string[] {
  const head =
    method === 'cells'
      ? [
          'Start at the cell holder, tap **B** — **one cell** to begin with — and the plug key first, so one plug ' +
            'switches everything on and off.',
          'Key to the ammeter’s red **+**. The ammeter is **in series**, carrying the whole current.',
        ]
      : [
          'Start where the current starts: battery **+**, and the plug key first so one plug switches everything ' +
            'on and off.',
          'Key to the ammeter’s red **+**. The ammeter is **in series**, carrying the whole current.',
        ];
  // How the loop is closed: straight back to the holder under the cells method,
  // and through the rheostat — which is one wire MORE — under the other.
  const closeOn =
    method === 'cells'
      ? 'back to the holder’s **−** stud at **A**, closing the loop.'
      : 'on to rheostat end **A**, so the rheostat can vary the current.';
  const slider: readonly string[] =
    method === 'cells'
      ? []
      : [
          'Slider terminal **C** back to battery **−** to close the loop — **C**, not end B: with A and B the ' +
            'whole coil is always in and sliding does nothing.',
        ];

  switch (config) {
    case 'r1':
      return [
        ...head,
        'Ammeter **−** into **R₁**. This circuit measures R₁ on its own, so **R₂ stays completely unconnected** — ' +
          'the assistant checks for that.',
        `R₁ ${closeOn}`,
        ...slider,
        'Voltmeter **+** across R₁, on the end nearer the source.',
        'Voltmeter **−** on R₁’s other end. It measures the p.d. across **R₁ and nothing else**.',
      ];
    case 'r2':
      return [
        ...head,
        'Ammeter **−** into **R₂** this time. R₁ is left out of the circuit altogether. On your own bench you only ' +
          'need to move the four wires at R₁’s ends across to R₂ — the voltmeter leads included.',
        `R₂ ${closeOn}`,
        ...slider,
        'Voltmeter **+** across R₂ now, not R₁ — the voltmeter leads move with everything else.',
        'Voltmeter **−** on R₂’s far end. It reads the p.d. across R₂ alone.',
      ];
    case 'series':
      return [
        ...head,
        'Ammeter **−** into R₁, the first of the two.',
        'Here is the whole idea of **series**: one wire from the end of R₁ to the start of R₂, and **nothing else ' +
          'at that joint**. Current leaving R₁ has nowhere to go but into R₂ — one path, one current.',
        `Out of R₂ ${closeOn}`,
        ...slider,
        'Rs is the resistance of the **whole combination**, so the voltmeter spans both: **+** on the free end of ' +
          'R₁…',
        '…and **−** on the free end of R₂. Across one resistor only would give you R₁, not Rs.',
      ];
    default:
      return [
        ...head,
        'Ammeter **−** into R₁’s left end. The ammeter stays in the **main line**, before the current splits — in ' +
          'a branch it would read only one resistor.',
        'Now **parallel**: join the two **left** ends together. This is the point where the current divides in two.',
        'And join the two **right** ends together, where the two currents meet again. Both resistors now sit ' +
          'between the same two points.',
        `From that right-hand joint ${closeOn}`,
        ...slider,
        'The voltmeter goes across the **pair** — and because both ends are joined, across one of them is across ' +
          'both. **+** on the left joint…',
        '…and **−** on the right joint. The same p.d. across R₁ and R₂: that is what parallel means.',
      ];
  }
}

/** What the finished circuit is, read as a whole. */
function wireEnd(config: ConfigId): string {
  switch (config) {
    case 'r1':
      return 'One series loop with **only R₁** in it, and the voltmeter across R₁. R₂ is sitting on its board ' +
        'untouched, which is exactly right: this circuit is about one resistor.';
    case 'r2':
      return 'The same loop with **only R₂** in it. Nothing else about the circuit changed — same cells, same ' +
        'meters, same key — which is what makes the two measurements comparable.';
    case 'series':
      return 'R₁ and R₂ **one after the other**, so the same current passes through both, and the voltmeter ' +
        'across the two of them together. That is what Rs means: the resistance of the pair.';
    default:
      return 'R₁ and R₂ **side by side** between the same two points, so the same p.d. sits across both — with ' +
        'the ammeter still in the **main line**, reading the total current that arrives before it splits.';
  }
}

/**
 * WHERE THE FLAGS ARE READ. A hook, and handed to the workspace by reference so
 * it is called as one: with `teach` off the card that points at the **What's
 * happening** switch is never built, so a student cannot tell the layer exists,
 * and with `hints` off nothing here mentions a control they are not offered.
 */
export function useSeriesParallelTrainer(
  ctx: SeriesParallelTrainerCtx,
): Readonly<Record<number, readonly Step[]>> {
  return buildSeriesParallelTrainer(ctx, useLabFeature('teach'), useLabFeature('hints'));
}
