'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import {
  BENCH_HEIGHT,
  BENCH_WIDTH,
  P,
  TAP_LETTER,
  TERMINALS,
  cellsUsed,
  type TerminalId,
} from '@labs/lib/ohms-law/apparatus';
import { CIRCUIT, READINGS_REQUIRED, STEP } from '@labs/lib/ohms-law/marking';
import type { LabAction } from '@labs/lib/ohms-law/reducer';
import type { LabState } from '@labs/lib/ohms-law/state';
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
  textbookWires,
  type DemoCtx,
  type Hand,
} from '@labs/lib/ohms-law/trainer-demos';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { useLabFeature } from '../lab-features';

/**
 * THE VISUAL TRAINER: "Show me this step", for the step the student is actually
 * standing on.
 *
 * It is not the tour. The tours are one walk through the bench on a SANDBOX
 * bench with a different resistor; this runs on the STUDENT'S OWN bench,
 * because the question it answers is "what do I do *here*". The workspace takes
 * a snapshot before it starts and puts it back byte for byte afterwards — our
 * state is immutable, so holding the reference IS the copy.
 *
 * This file is the words. The hands are in
 * `@labs/lib/ohms-law/trainer-demos.ts`, which is pure and says what every
 * demonstration is allowed to touch — and which can therefore be driven from
 * plain Node to prove that none of this moves a mark.
 *
 * WHAT IT WILL NOT DO. It never presses **Check least counts**, **Check my
 * circuit**, **Record** or **Submit result**: those four presses are where all
 * but the procedure marks are decided, and each of them is the whole of the
 * step it belongs to. It lays the circuit and it works the plug key, because a
 * demonstration of wiring that laid no wire would be a diagram, not a
 * demonstration — and because the workspace freezes the script when a
 * demonstration starts, closing the key is free to carry the "close the circuit
 * safely" step through to its end.
 *
 * BOTH METHODS. The bench bar switches the apparatus between the manual's own
 * cells and the rheostat it offers as an alternative, and under the cells there
 * is no rheostat on the bench at all. Every card that names the control varying
 * the current therefore has two versions, and the wiring cards are built from
 * `canonFor(method)`, so a demonstration never points at apparatus that is not
 * there.
 *
 * The card that points at the **What's happening** switch is dropped when the
 * `teach` flag is off: the switch is not rendered, and a demonstration of a
 * control an administrator has taken away would be a demonstration of nothing.
 */
export type OhmsLawTrainerCtx = BenchTourContext<LabState, LabAction>;
type Step = TourStep<OhmsLawTrainerCtx>;

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
function Demonstrate({ run, ctx }: { run: Hand; ctx: OhmsLawTrainerCtx }): null {
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
 * its way through six more it had not laid.
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
const RG_RESISTOR: Region = [466, 294, 470, 302];

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
 * The demonstrations, keyed by procedure step.
 *
 * `teach` and `hints` are parameters rather than hook calls so this stays a
 * plain function: the flags are read once, by the hook below, and a card that
 * depends on a layer an administrator has switched off is left OUT of the set
 * rather than skipped when it runs.
 */
export function buildOhmsLawTrainer(
  ctx: OhmsLawTrainerCtx,
  teach: boolean,
  hints: boolean,
): Readonly<Record<number, readonly Step[]>> {
  const bench = ctx.stage;
  const find = ctx.find;
  // The apparatus is fixed for the life of a demonstration: changing the method
  // restarts the bench, which is not something that can happen mid-run.
  const method = ctx.state.method;
  const cells = method === 'cells';
  const canon = textbookWires(ctx.state);

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
  const leastCounts: readonly Step[] = [
    {
      title: 'Both numbers are marked, so this is method only',
      target: tagged('console'),
      body:
        'Every reading you take today is only as good as these two numbers, and they are worth **5 marks each** — ' +
        'so I will show you where to look and leave the counting to you. A wrong try costs 2 of the 5 for that ' +
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
          'Each meter has its own range **and** its own division count, so work each one out on its own. Nothing ' +
          'carries over from the other, and nothing carries over from another bench.',
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
  const sand: readonly Step[] = [
    {
      title: 'Nothing here is marked on its own',
      body:
        'But a bad joint quietly spoils every reading that follows, which is why the manual makes this **step 2** ' +
        'and why the bench will not let you lay a wire until it is done.',
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
      target: region(RG_RESISTOR),
      body:
        'That film lies between the copper and the terminal screw — in **series with your whole circuit**, and ' +
        'appearing in no diagram and in no calculation you will do today. It is resistance you never account for, ' +
        'added to the resistance you came to measure.',
    },
    {
      title: 'Rub them bright, and tighten every screw as you go',
      target: region(RG_SAND),
      body:
        '**Tap the sand paper** to do it — that press is yours, and it is the whole of this step. Bright copper, ' +
        'and a joint that stays metal to metal.',
    },
  ];

  // --- 3. the circuit -------------------------------------------------------
  const wiring: readonly Step[] = keep([
    does(
      {
        title: 'Watch the order, then lay them yourself',
        target: region(RG_BENCH),
        body:
          'I am taking the plug out and clearing the bench so you can see the order plainly. **Every wire I lay is ' +
          'wiped off again at the end** and none of it costs a mark — the circuit is still yours to build.\n\nTap ' +
          'one terminal, then another, and a wire drops between them; on a computer you can drag from one to the ' +
          'other instead.',
      },
      clearTheBench,
    ),
    ...canon.map(([a, b], i) =>
      does(
        {
          title: `Wire ${i + 1} of ${canon.length}: ${TERMINALS[a].name} to ${TERMINALS[b].name}`,
          target: region(pairRegion(a, b)),
          highlight: [a, b],
          body: wireWhy(method)[i] ?? '',
        },
        layWire(a, b),
      ),
    ),
    {
      title: 'That is the whole layout',
      target: region(RG_BENCH),
      body: cells
        ? 'One series loop — **one cell, key, ammeter, resistor, back to the holder at A** — with the voltmeter ' +
          '**across** the resistor on its own two wires. Moving that first lead along the taps is what will give ' +
          'you your four readings.'
        : 'One series loop — **battery, key, ammeter, resistor, rheostat** — with the voltmeter **across** the ' +
          'resistor on its own two wires. Sliding the contact is what will give you your four readings.',
    },
    teach
      ? {
          title: 'And if you want the reason rather than the order',
          target: tagged('teach-toggle'),
          body:
            'The switch on the bench bar opens **What’s happening**: why an ammeter of about ' +
            `${P.rAm} Ω has to go in the line and a voltmeter of about ${(P.rVm / 1000).toFixed(0)} kΩ has to go ` +
            'across, and what happens to the circuit if you exchange them. It is not marked and it never says ' +
            'anything about **your** wiring — press it whenever you like, including now.',
        }
      : null,
    {
      title: 'Then press Check my circuit',
      target: tagged('console'),
      body:
        `The assistant tests your layout by experiment, not by comparing it with mine, so any wiring that ` +
        `behaves correctly passes. It is worth **${CIRCUIT.max} marks**, less ${CIRCUIT.perFail} for every failed ` +
        (hints
          ? `check and ${CIRCUIT.perHint} for every **Show next wire**. Watching this costs nothing at all.`
          : 'check. Watching this costs nothing at all.'),
    },
  ]);

  // --- 4. closing the circuit safely ---------------------------------------
  const closeSafely: readonly Step[] = [
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
            'circuit, and the smallest current this loop can be given.',
      },
      startAtTheSmallestCurrent,
    ),
    {
      title: 'The bench bar says what you have set',
      target: tagged('bench-readout'),
      body: cells
        ? `It reads the **wiring**, not a meter, so it says the same thing with the plug in and with it out: how ` +
          `many of the ${P.cells} cells are in the circuit, which tap that is, and what they add up to. Inserting ` +
          'the key with more than one cell already in costs **4 procedure marks**.'
        : 'It reads the slider, not a meter, so it says the same thing with the plug in and with it out. Inserting ' +
          'the key below maximum resistance costs **4 procedure marks**.',
    },
    does(
      {
        title: 'Now insert the plug key',
        target: region(RG_KEY),
        body:
          'The circuit is connected and checked, so it is safe to switch on. One plug switches the whole loop, ' +
          'which is exactly why the key went in first when you wired it.',
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
          'Whenever you are not actually reading the meters. A wire carrying current **heats up**, and a hot wire ' +
          'is a different resistance from the one you set out to measure — which is the one condition Ohm’s law ' +
          'asks you to hold still.',
      },
      takeTheKeyOut,
    ),
  ];

  // --- 5. the four readings -------------------------------------------------
  const readings: readonly Step[] = [
    {
      title: 'Readings are marked, so nothing here gets written down',
      body:
        `This is the **method** for one of your ${READINGS_REQUIRED} readings. I will work the key and open the ` +
        'close-ups; the two numbers stay yours.',
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
              `One cell, then two, then three, then ${P.cells} — and the only thing that moves on the whole bench ` +
              `is that single lead on the holder. You are on tap **${TAP_LETTER[k]}**; the next reading goes on ` +
              `tap **${TAP_LETTER[next]}**.\n\nI am leaving it where it is: which tap you are on is the first ` +
              'column of your table, and that is yours to fill.'
            );
          },
        }
      : does(
          {
            title: 'Each reading needs a different current',
            target: region(RG_RHEO),
            body:
              'So move the slider to a fresh position first, and **spread them out** — four points huddled together ' +
              'make a slope you cannot draw. A bigger deflection is also an easier one to read.',
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
          'Looking at a needle from the side reads it a division out — **parallax**, and it is worth marks on every ' +
          'row of your table. Square on, every time.',
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
          `Its own range and its own least count, **${P.lcV} V**. Read it to one division and no finer — never to ` +
          'a value you think it ought to be, and never to the value that would make V/I come out round.',
      },
      openTheVoltmeter,
    ),
    {
      title: 'Type both, then press Record',
      target: tagged('console'),
      body:
        'Within **one least count** of where the needle really pointed scores in full; within two scores half. ' +
        'Those boxes stay empty now — filling them in is your mark, not mine.',
    },
    does(
      {
        title: 'And take the key out between readings',
        target: region(RG_KEY),
        body:
          'Every time. Leaving it in warms the wire, bends your V–I line away from a straight one, and costs **3 ' +
          'procedure marks** on its own — with another **4** if you never took it out between readings at all.',
      },
      takeTheKeyOut,
    ),
  ];

  // --- 6. the graph ---------------------------------------------------------
  const result: readonly Step[] = [
    {
      title: 'The resistance is marked against YOUR points',
      target: tagged('console'),
      body:
        'So the bench will not read the graph for you. Here is how to read it — the arithmetic and the number stay ' +
        'yours, and they are worth **10 marks**.',
    },
    {
      title: 'One straight line through the origin',
      target: tagged('console'),
      body:
        'Your readings are plotted **V against I**. They should lie close to a single straight line that passes ' +
        'through **(0, 0)** — that is what V ∝ I looks like, and the origin belongs on it because no current means ' +
        'no potential difference.',
    },
    {
      title: 'Lay a ruler, do not join dot to dot',
      target: tagged('console'),
      body:
        'The line goes through the origin with your points spread **evenly either side** of it. Joining them in ' +
        'turn gives you a zigzag that measures your reading errors rather than the wire.',
    },
    {
      title: 'Then take two points FAR apart on that line',
      target: tagged('console'),
      body:
        'Read the rise **ΔV** and the run **ΔI** between them. A big triangle divides both errors by a bigger ' +
        'number, so it gives a better slope — the same reason two sighting pins go far apart rather than close ' +
        'together.',
    },
    {
      title: 'Slope = ΔV ÷ ΔI, and that slope IS the resistance',
      target: tagged('console'),
      body:
        'In ohm, because a volt divided by an ampere is an ohm. Work it out and type it in: **your** number, off ' +
        '**your** line, through **your** points. Within 5% of the best fit through them scores in full.',
    },
  ];

  return {
    [STEP.leastCounts]: numbered(leastCounts),
    [STEP.sand]: numbered(sand),
    [STEP.circuit]: numbered(wiring),
    [STEP.closeSafely]: numbered(closeSafely),
    [STEP.readings]: numbered(readings),
    [STEP.result]: numbered(result),
  };
}

/**
 * One line per wire of the textbook layout, in the order the current flows.
 *
 * They are indexed against `canonFor(method)` and there is one per entry, so a
 * wire added to either layout shows up here as a blank rather than as the wrong
 * sentence beside the right wire.
 */
function wireWhy(method: LabState['method']): readonly string[] {
  return method === 'cells'
    ? [
        'Start where the current starts: the cell holder. Take it off at tap **B** — the first stud past the **−** ' +
          'end — so exactly **one cell** drives the circuit to begin with. The plug key comes first, so one plug ' +
          'switches the whole circuit on and off.',
        'Key to the ammeter’s red **+**. The ammeter carries the whole current, so it goes **in series** — in the ' +
          'loop, never across something.',
        'Ammeter **−** into the resistor. Same loop, so the ammeter reads exactly the current in the wire you are ' +
          'testing.',
        'Resistor back to the holder’s **−** stud at **A**. That closes the loop: out of the cells at B, round ' +
          'through everything, back in at A.',
        'The loop is closed. Now the voltmeter, on its **own two wires**, goes **across** the resistor — its red ' +
          '**+** to the end nearer the cells’ +.',
        'And its **−** to the other end of the same resistor. Across, never in the loop: a voltmeter compares two ' +
          'points.',
      ]
    : [
        'Start where the current starts: battery **+**. The plug key comes first, so one plug switches the whole ' +
          'circuit on and off.',
        'Key to the ammeter’s red **+**. The ammeter carries the whole current, so it goes **in series** — in the ' +
          'loop, never across something.',
        'Ammeter **−** into the resistor. Same loop, so the ammeter reads exactly the current in the wire you are ' +
          'testing.',
        'Resistor on to rheostat end **A**. The rheostat is in series too, so it controls the current everywhere ' +
          'in the loop.',
        'Slider terminal **C** back to battery **−** — that closes the loop. Use C, not end B: with A and B the ' +
          'whole coil is always in and sliding does nothing.',
        'The loop is closed. Now the voltmeter, on its **own two wires**, goes **across** the resistor — its red ' +
          '**+** to the end nearer battery +.',
        'And its **−** to the other end of the same resistor. Across, never in the loop: a voltmeter compares two ' +
          'points.',
      ];
}

/**
 * WHERE THE FLAGS ARE READ. A hook, and handed to the workspace by reference so
 * it is called as one: with `teach` off the card that points at the **What's
 * happening** switch is never built, so a student cannot tell the layer exists,
 * and with `hints` off nothing here mentions a control they are not offered.
 */
export function useOhmsLawTrainer(
  ctx: OhmsLawTrainerCtx,
): Readonly<Record<number, readonly Step[]>> {
  return buildOhmsLawTrainer(ctx, useLabFeature('teach'), useLabFeature('hints'));
}
