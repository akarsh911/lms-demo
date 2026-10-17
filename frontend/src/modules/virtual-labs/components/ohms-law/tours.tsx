'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import {
  BENCH_HEIGHT,
  BENCH_WIDTH,
  P,
  PRACTICE_DIAL,
  TAP_LETTER,
  TERMINALS,
  canonFor,
  cellsUsed,
  tapId,
  type TerminalId,
} from '@labs/lib/ohms-law/apparatus';
import { diagnose, joined, strayWiresFor } from '@labs/lib/ohms-law/diagnose';
import type { LabMethod } from '@labs/lib/ohms-law/method';
import type { LabAction } from '@labs/lib/ohms-law/reducer';
import { solveBench, type BenchReading } from '@labs/lib/ohms-law/solve';
import type { LabState } from '@labs/lib/ohms-law/state';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { Schematic } from './schematic';
import { MeterReadingCheck, PracticeDialCheck } from './tour-checks';

/**
 * The bench's two tours, written as content for the generic tour engine.
 *
 *   controls  "How to play": every control on the real bench, before anything
 *             is marked. Opens by itself on a first visit.
 *   build     "Guided build": clean the wire ends, lay the textbook circuit
 *             wire by wire, switch on, read the meters, change the current and
 *             see V/I stay constant.
 *
 * Both run on a SANDBOX bench (the host swaps it in), so opening one mid-way
 * through the practical loses nothing and pauses the clock. The guided build
 * uses a different wire from the student's own, because it shows real values.
 *
 * EVERY STEP THAT NAMES THE CONTROL VARYING THE CURRENT HAS TWO VERSIONS. The
 * sandbox bench is built with the method the student chose, so a tour never
 * demonstrates apparatus that is not on their bench.
 */
/** What a step of this bench's tours can read: the workspace's standard context. */
export type LabTourCtx = BenchTourContext<LabState, LabAction>;

/** The meters as they stand right now, for a step that compares readings. */
const now = (ctx: LabTourCtx): BenchReading => solveBench(ctx.state);

export type TourKind = 'controls' | 'build';

type Region = readonly [x: number, y: number, w: number, h: number];

const RG_POWER: Region = [48, 425, 474, 150];
const RG_KEY: Region = [330, 428, 184, 128];
const RG_RHEO: Region = [562, 424, 374, 172];
const RG_AM: Region = [140, 22, 220, 226];
const RG_METERS: Region = [140, 22, 640, 226];
const RG_SAND: Region = [48, 306, 144, 100];
const RG_BAT: Region = [46, 440, 290, 140];
const RG_RESISTOR: Region = [466, 294, 470, 302];

function pairRegion(a: TerminalId, b: TerminalId): Region {
  const A = TERMINALS[a];
  const B = TERMINALS[b];
  return [Math.min(A.x, B.x) - 46, Math.min(A.y, B.y) - 46, Math.abs(A.x - B.x) + 92, Math.abs(A.y - B.y) + 92];
}

const WIRE_WHY: Readonly<Record<LabMethod, readonly (readonly [title: string, why: string])[]>> = {
  cells: [
    ['Cell tap B to the plug key', 'Current leaves the holder at whichever stud you take it from. **B** is the first one past the − end at A, so exactly **one cell** is driving the circuit — the smallest current, which is where every electrical practical starts. The key comes first, so one plug can switch the whole circuit on and off.'],
    ['Plug key to ammeter +', 'The ammeter has to carry the full current, so it goes **in series** — straight into the loop. Current enters at its red **+** terminal.'],
    ['Ammeter − to the resistor', 'The current leaving the ammeter flows straight into the nichrome wire, so both carry exactly the same current.'],
    ['Resistor back to the holder at A', 'This wire closes the loop: out of the cells at **B**, through the key, the ammeter and the resistor, and back in at the **−** stud **A**.'],
    ['Voltmeter + to the resistor', 'The series loop is closed. The voltmeter sits **across** the resistor on its own two wires. Its **+** goes to the resistor end nearer the cells’ + — the end joined to the ammeter.'],
    ['Voltmeter − to the other end', 'Now the voltmeter compares the two ends of the wire. That difference is the potential difference V across it.'],
  ],
  rheostat: [
    ['Battery + to the plug key', 'Current leaves the battery at its **+** terminal. The key comes first, so one plug can switch the whole circuit on and off.'],
    ['Plug key to ammeter +', 'The ammeter has to carry the full current, so it goes **in series** — straight into the loop. Current enters at its red **+** terminal.'],
    ['Ammeter − to the resistor', 'The current leaving the ammeter flows straight into the nichrome wire, so both carry exactly the same current.'],
    ['Resistor to rheostat end A', 'The rheostat goes in series too, so it can control the current in the whole loop.'],
    ['Rheostat slider C to battery −', 'Use the **sliding contact C**, not end B — with A and B the whole coil is always in and sliding does nothing. This wire closes the loop back at battery **−**.'],
    ['Voltmeter + to the resistor', 'The series loop is closed. The voltmeter sits **across** the resistor on its own two wires. Its **+** goes to the resistor end nearer battery + — the end joined to the ammeter.'],
    ['Voltmeter − to the other end', 'Now the voltmeter compares the two ends of the wire. That difference is the potential difference V across it.'],
  ],
};

export const STRAY_NOTICE = 'A wire that isn’t part of this layout is **flashing red**. Tap it to remove it.';

/**
 * The marker a guided-build step carries to say "judge the wiring against the
 * TEXTBOOK layout here". It travels in `highlight`, alongside the terminals to
 * pulse, so the stage knows without guessing — and outside the build nothing is
 * flashed red, because the practical accepts any topology that behaves.
 */
export const TEXTBOOK_NET_MARK = 'net:textbook';

/**
 * Build both tours against the live page. `bench` returns the bench `<svg>`
 * (regions are drawn in its 1000-wide coordinates); `find` returns an element
 * the host has tagged with `data-tour`.
 */
export function createOhmsLawTours(ctx: LabTourCtx): Record<TourKind, TourStep<LabTourCtx>[]> {
  // Where things are is fixed for the life of the tour; what they are DOING is
  // read from the context each step is handed, never from this one.
  const bench = ctx.stage;
  const find = ctx.find;
  // Likewise the method: a tour is built when it opens, and changing the method
  // restarts the bench, which closes it.
  const method = ctx.state.method;
  const cells = method === 'cells';
  const canon = canonFor(method);
  const why = WIRE_WHY[method];
  /** The tap the textbook layout starts on, or the battery's single + terminal. */
  const source: TerminalId = cells ? tapId(1) : 'bat+';

  /**
   * A rectangle in BENCH coordinates, mapped to where it actually is on screen.
   *
   * The drawing scales to fit its box and centres (`xMidYMid meet`), so it is
   * letterboxed whenever the box's proportions differ from the bench's. Scaling
   * by width alone ignores that, and the spotlight lands up to ~60px away from
   * the terminal it is naming.
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
  const schematic = (active: number) =>
    function SchematicMedia(c: LabTourCtx): React.ReactNode {
      return <Schematic method={c.state.method} wires={c.state.wires} active={active} />;
    };

  const controls: TourStep<LabTourCtx>[] = [
    {
      title: 'How the bench works',
      body: 'Everything here is simulated from real physics — wire it wrong and it **behaves** wrong, just like the school lab, except nothing burns. This short tour shows you every control. **Nothing you do in the tour is marked.**',
    },
    {
      title: 'Power and control',
      target: region(RG_POWER),
      body: cells
        ? `The **cell holder** carries ${P.cells} dry cells of 1.5 V end to end, with a brass stud between every pair. Take the circuit off at stud **B** and one cell drives it; at **C**, two; and so on to **${TAP_LETTER[P.cells]}**. That is how you change the current in this experiment. The **plug key** is your switch. Terminal colours matter: **red is +**, **black is −**, and brass terminals have no polarity.`
        : `The **battery** (${P.cells} cells of 1.5 V) drives the current. The **plug key** is your switch. Terminal colours matter: **red is +**, **black is −**, and brass terminals have no polarity.`,
    },
    {
      title: 'The two meters',
      target: region(RG_METERS),
      body: `The **ammeter** (0–${P.amFS} A) measures current and always goes **in series** — inside the loop. The **voltmeter** (0–${P.vmFS} V) measures potential difference and always goes **across** the part you are measuring. On both, current must enter at the red + terminal.`,
    },
    {
      title: cells ? 'The resistor' : 'Resistor and rheostat',
      target: region(RG_RESISTOR),
      body:
        'The **nichrome wire** is what you are investigating — its resistance is unknown, and different on every bench. ' +
        (cells
          ? 'There is no rheostat in this circuit: the current is changed by changing **how many cells** drive it, which is what the taps on the holder are for.'
          : 'The **rheostat** is a variable resistor: its sliding contact **C** sets how much coil the current passes through.'),
    },
    {
      title: 'Clean the wire ends',
      target: region(RG_SAND),
      body: 'Step 2 of the real procedure, and the bench holds you to it: fresh connecting wire carries an insulating enamel and old wire grows an oxide film, and either one is unaccounted resistance sitting in your circuit. Rub the ends bright on the sand paper before you join anything.',
      task: 'Tap the sand paper to clean the ends of the connecting wires.',
      done: ({ state }) => state.sanded,
    },
    {
      title: 'Lay a wire',
      target: region(RG_POWER),
      highlight: [source, 'key.a', 'key.b'],
      body: 'Tap one terminal, then another, and a wire drops between them. On a computer you can also drag from one to the other.',
      task: cells
        ? 'Tap the red **cell tap B** terminal, then either **plug key** terminal.'
        : 'Tap the red **Battery +** terminal, then either **plug key** terminal.',
      done: ({ state }) =>
        state.wires.some((w) => w.includes(source) && (w.includes('key.a') || w.includes('key.b'))),
    },
    {
      title: 'Remove a wire',
      target: region(RG_POWER),
      body: 'Made a wrong connection? Tap the wire itself to take it off. **Undo wire** and **Remove all wires** sit under the bench as well.',
      task: 'Tap the wire you just laid.',
      done: ({ state }) => state.wires.length === 0,
    },
    {
      title: 'The plug key',
      target: region(RG_KEY),
      body: 'Plug in closes the circuit; plug out opens it. In the practical, keep it out except while you are reading the meters — current heats the wire and changes its resistance.',
      task: 'Tap the key to put the plug in, then tap it again to take it out.',
      done: ({ state }, entry) => state.keyToggles - entry.state.keyToggles >= 2 && !state.key,
    },
    cells
      ? {
          title: 'Change the current',
          target: region(RG_BAT),
          highlight: [tapId(1), tapId(2)],
          body: `There is no rheostat in this circuit. To change the current you move the single lead along the holder: from **B** to **C** puts a second cell behind the same resistance, and every reading of this practical is one more cell. Only ever **one** tap carries a lead — a wire from one tap to another short-circuits the cells between them.`,
        }
      : {
          title: 'The rheostat slider',
          target: region(RG_RHEO),
          body: 'Moving the sliding contact changes how much coil is in the circuit — that is how you change the current between readings. Keyboard: focus the slider and use ← →.',
          task: 'Drag the grey slider along the top rod.',
          done: ({ state }, entry) => Math.abs(state.s - entry.state.s) > 0.25,
        },
    {
      title: 'Look closely',
      target: region(RG_AM),
      body: 'Needles are thin and divisions are small. Tap either meter’s dial and a **magnified copy** appears in the panel on the right, beside the box you type its reading into — it stays there while you work, and it moves with the real needle.',
      task: 'Tap the ammeter’s dial.',
      done: ({ state }, entry) => state.lensOpens > entry.state.lensOpens,
      doneMessage: 'That meter is now magnified beside your readings.',
    },
    {
      title: 'Practice: read a meter',
      body: `Every analog reading works the same way: find what **one small division** is worth (range ÷ number of divisions), then count on from the nearest labelled number. This practice voltmeter goes from 0 to ${PRACTICE_DIAL.fs} V, and it is not either of the meters on your bench — work it out, do not remember it.`,
      content: ({ completed, complete }) => <PracticeDialCheck completed={completed} complete={complete} />,
    },
    {
      title: 'Your lab notebook',
      target: tagged('observations'),
      body: 'This panel always shows the step you are on and what to type for it. Underneath, **Readings**, **Graph** and **Theory** hold your table, your V–I plot and the textbook — the right one opens itself as you go. Every reading is checked against where the needle really pointed: within one least count earns full marks.',
    },
    {
      title: 'How you are marked',
      target: tagged('stats'),
      body: 'Your score builds as you finish each step of the procedure, in the same order as the board practical. Every slip is logged so you can learn from it; hints and unsafe moves — a short circuit, overloading a meter — cost marks. Want to see the whole circuit built once first? Choose **Guided build**.',
    },
  ];

  const build: TourStep<LabTourCtx>[] = [
    {
      title: 'Clean the wire ends first',
      target: region(RG_SAND),
      highlight: [TEXTBOOK_NET_MARK],
      body: 'Before a single wire goes on, the ends are rubbed bright on the sand paper. An enamel or oxide film on the copper is resistance sitting in your circuit that appears in no diagram and in no calculation — and the bench will not let you lay a wire until it is gone.',
      task: 'Tap the sand paper.',
      done: ({ state }) => state.sanded,
      doneMessage: 'Bright copper. Now the circuit.',
    },
    {
      title: 'Read the circuit diagram first',
      media: schematic(-1),
      highlight: [TEXTBOOK_NET_MARK],
      body: `This is the circuit diagram for this experiment. Read it like a map: start at ${
        cells ? 'the cell tap' : 'battery **+**'
      }, follow the current all the way round, and arrive back at ${
        cells ? 'the **−** stud' : 'battery **−**'
      }. You will lay one real wire for each line, in that order — watch the diagram fill in as you go.`,
    },
    ...canon.map(
      ([a, b], i): TourStep<LabTourCtx> => ({
        title: `Wire ${i + 1} of ${canon.length}: ${why[i]![0]}`,
        target: region(pairRegion(a, b)),
        highlight: [TEXTBOOK_NET_MARK, a, b],
        media: schematic(i),
        body: why[i]![1],
        // The instruction changes once the wire itself is right: a stale "connect
        // these two" beside a warning leaves a student unsure which to believe.
        task: ({ state }) =>
          joined(state.wires, a, b, state.method) && strayWiresFor(state.wires, state.method).length > 0
            ? 'Wire laid ✓ — now remove the wire **flashing red**, which isn’t part of this layout.'
            : `Connect **${TERMINALS[a].name}** to **${TERMINALS[b].name}** — the pulsing terminals.`,
        done: ({ state }) =>
          joined(state.wires, a, b, state.method) && strayWiresFor(state.wires, state.method).length === 0,
      }),
    ),
    {
      title: 'The lab assistant checks it',
      media: schematic(canon.length),
      highlight: [TEXTBOOK_NET_MARK],
      body: ({ state }) => {
        const d = diagnose(state);
        if (!d.ok) return `The assistant found a problem: ${d.msg}`;
        return cells
          ? 'Every line in the diagram now has a real wire. The assistant tested your layout with the key in and out: **ammeter in series, voltmeter across the resistor, key in the loop and one cell driving it.** It will work.'
          : 'Every line in the diagram now has a real wire. The assistant tested your layout with the key in and out and the rheostat at both ends: **ammeter in series, voltmeter across the resistor, rheostat and key in the loop.** It will work.';
      },
    },
    ...(cells
      ? []
      : [
          {
            title: 'Set the rheostat to maximum',
            target: region(RG_RHEO),
            highlight: [TEXTBOOK_NET_MARK],
            body: `Before any current flows, make the resistance as large as possible so the current starts small and nothing is overloaded. In this layout current enters the coil at A and leaves at the slider, so the slider at **B** puts the whole ${P.rRh} Ω coil in the circuit.`,
            task: 'Slide the contact all the way to end **B**.',
            done: ({ state }: LabTourCtx) => state.s >= 0.97,
          } satisfies TourStep<LabTourCtx>,
        ]),
    {
      title: 'Switch on',
      target: region(RG_KEY),
      highlight: [TEXTBOOK_NET_MARK],
      body: 'Now close the circuit and watch both needles. They should swing **forward** and settle — forward means every + and − is the right way round.',
      task: 'Insert the plug key.',
      done: ({ state }) => state.key,
      doneMessage: 'Current is flowing and both needles moved forward.',
    },
    {
      title: 'Read both meters',
      target: region(RG_METERS),
      highlight: [TEXTBOOK_NET_MARK],
      stay: true,
      body: 'Tap a dial for the close-up. Work out what one small division is worth, count on from the nearest labelled number, and type what each needle shows.',
      content: ({ ctx: c, completed, complete }) => (
        <MeterReadingCheck
          keyIn={c.state.key}
          reading={now(c)}
          completed={completed}
          complete={complete}
          // Remembered in the bench's own state, so the next step's completion
          // test stays a pure function of it.
          onRead={(r) => c.dispatch({ type: 'noteTourReading', I: r.I, V: r.V })}
        />
      ),
    },
    cells
      ? {
          title: 'Change the current',
          target: region([46, 424, 480, 166]),
          highlight: [TEXTBOOK_NET_MARK, tapId(2)],
          stay: true,
          body: 'One reading proves nothing. Take the key out (let the wire rest), then move the lead from tap **B** to tap **C** so that **two cells** drive the same resistor, and switch on again.',
          task: 'Take the plug out, move the lead from **B** to **C**, then put the plug back in.',
          done: (c, entry) =>
            c.state.tourReading !== null &&
            cellsUsed(c.state.wires, c.state.method) === 2 &&
            c.state.keyToggles - entry.state.keyToggles >= 2 &&
            c.state.key &&
            Math.abs(now(c).Iam) > c.state.tourReading.I + 0.08,
          doneMessage: 'Two cells, and more current flows.',
          after: (c) => comparison(c, 'Twice the push gave about twice the current, but their ratio did not move.'),
        }
      : {
          title: 'Change the current',
          target: region([330, 424, 606, 172]),
          highlight: [TEXTBOOK_NET_MARK],
          stay: true,
          body: 'One reading proves nothing. Take the key out (let the wire rest), make the resistance smaller, and switch on again.',
          task: 'Take the plug out, slide the contact towards **A**, then put the plug back in.',
          done: (c, entry) =>
            c.state.tourReading !== null &&
            c.state.keyToggles - entry.state.keyToggles >= 2 &&
            c.state.key &&
            Math.abs(now(c).Iam) > c.state.tourReading.I + 0.08,
          doneMessage: 'More current flows now.',
          after: (c) => comparison(c, 'Current and voltage both changed, but their ratio did not.'),
        },
    {
      title: 'Switch off',
      target: region(RG_KEY),
      highlight: [TEXTBOOK_NET_MARK],
      body: 'Readings done — take the key out so the wire can cool. Make it a habit: in the practical, leaving the key in costs marks.',
      task: 'Take the plug key out.',
      done: ({ state }) => !state.key,
    },
    {
      title: 'You built it and made it work',
      media: schematic(canon.length),
      highlight: [TEXTBOOK_NET_MARK],
      body: cells
        ? 'That is the whole layout: one series loop — cells, key, ammeter, resistor — with the voltmeter across the resistor. In the practical you build it again on your own bench (a different wire) and take **four** readings, one at each tap: one cell, two, three and four. Then you plot the graph.'
        : 'That is the whole layout: one series loop — battery, key, ammeter, resistor, rheostat — with the voltmeter across the resistor. In the practical you build it again on your own bench (a different wire), take four readings and plot the graph.',
    },
  ];

  return { controls, build };
}

/** Before and after, and the ratio that did not move. */
function comparison(c: LabTourCtx, moral: string): string {
  const a = c.state.tourReading;
  if (!a) return '';
  const reading = now(c);
  const b = { I: Math.abs(reading.Iam), V: Math.abs(reading.Vvm) };
  return (
    `Before: ${a.I.toFixed(2)} A and ${a.V.toFixed(2)} V, so V/I = **${(a.V / a.I).toFixed(1)} Ω**.\n` +
    `Now: ${b.I.toFixed(2)} A and ${b.V.toFixed(2)} V, so V/I = **${(b.V / b.I).toFixed(1)} Ω**.\n` +
    `${moral} That constant is the wire’s resistance, and V ∝ I is **Ohm’s law**.`
  );
}
