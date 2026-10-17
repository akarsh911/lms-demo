'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import {
  BENCH_HEIGHT,
  BENCH_WIDTH,
  CONFIGS,
  P,
  PRACTICE_DIAL,
  TAP_LETTER,
  TERMINALS,
  buildNetFor,
  canonOf,
  cellsUsed,
  tapId,
  type TerminalId,
} from '@labs/lib/series-parallel/apparatus';
import { diagnose, joined, strayWires } from '@labs/lib/series-parallel/diagnose';
import type { LabMethod } from '@labs/lib/series-parallel/method';
import type { LabAction } from '@labs/lib/series-parallel/reducer';
import { solveBench } from '@labs/lib/series-parallel/solve';
import type { LabState } from '@labs/lib/series-parallel/state';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { Schematic } from './schematic';
import { PracticeDialCheck } from './tour-checks';

/**
 * The bench's two tours, written as content for the generic tour engine.
 *
 *   controls  "How to play": every control on the real bench, before anything
 *             is marked. Opens by itself on a first visit.
 *   build     "Guided build": clean the wire ends, lay the SERIES circuit wire
 *             by wire, switch it on, then change three wires to turn it into
 *             the PARALLEL circuit and watch the current jump. Same cells, same
 *             two resistors: the only thing that changed is how they are
 *             joined, and that is the whole practical in one move.
 *
 * Both run on a SANDBOX bench (the host swaps it in), so opening one mid-way
 * through the practical loses nothing and pauses the clock. The guided build
 * uses different resistors from the student's own, because it shows real values.
 *
 * EVERY STEP THAT NAMES THE CONTROL VARYING THE CURRENT HAS TWO VERSIONS. The
 * sandbox bench is built with the method the student chose, so a tour never
 * demonstrates apparatus that is not on their bench.
 */
export type LabTourCtx = BenchTourContext<LabState, LabAction>;
export type TourKind = 'controls' | 'build';

type Region = readonly [x: number, y: number, w: number, h: number];

const RG_POWER: Region = [48, 425, 474, 150];
const RG_KEY: Region = [330, 428, 184, 128];
const RG_RHEO: Region = [562, 424, 374, 172];
const RG_AM: Region = [140, 22, 220, 226];
const RG_METERS: Region = [140, 22, 640, 226];
const RG_BOARDS: Region = [466, 250, 470, 346];
const RG_RESISTORS_ONLY: Region = [466, 250, 470, 150];
const RG_SAND: Region = [48, 306, 144, 100];
const RG_BAT: Region = [46, 440, 290, 140];

function pairRegion(a: TerminalId, b: TerminalId): Region {
  const A = TERMINALS[a];
  const B = TERMINALS[b];
  return [Math.min(A.x, B.x) - 46, Math.min(A.y, B.y) - 46, Math.abs(A.x - B.x) + 92, Math.abs(A.y - B.y) + 92];
}

/**
 * Which textbook layout the stage should judge stray wires against, passed as a
 * HIGHLIGHT so it travels with the step rather than being guessed from the
 * wiring. The step that says "that wire is now wrong" is exactly the step where
 * guessing would get it backwards.
 */
const NET = { series: 'net:series', parallel: 'net:parallel' } as const;

const WIRE_WHY: Readonly<Record<LabMethod, readonly (readonly [title: string, why: string])[]>> = {
  cells: [
    ['Cell tap B to the plug key', 'Current leaves the holder at the stud you take it from. **B** puts one cell in the circuit — the smallest current. The key comes first, so one plug can switch the whole circuit on and off.'],
    ['Plug key to ammeter +', 'The ammeter has to carry the full current, so it goes **in series** — straight into the loop. Current enters at its red **+** terminal.'],
    ['Ammeter − to R₁', 'The current leaving the ammeter goes into the first resistor, R₁.'],
    ['R₁ to R₂', 'This one wire is what makes it **series**: current leaving R₁ has nowhere to go but into R₂. One path, one current.'],
    ['R₂ back to the holder at A', 'This wire closes the loop at the **−** stud **A**.'],
    ['Voltmeter + to R₁', 'Rs is the resistance of the **whole** combination, so the voltmeter spans both resistors. Its **+** goes to R₁’s end nearer the cells’ +…'],
    ['Voltmeter − to R₂', '…and its **−** to the far end of R₂. Now it reads the potential difference across R₁ and R₂ together.'],
  ],
  rheostat: [
    ['Battery + to the plug key', 'Current leaves the battery at its **+** terminal. The key comes first, so one plug can switch the whole circuit on and off.'],
    ['Plug key to ammeter +', 'The ammeter has to carry the full current, so it goes **in series** — straight into the loop. Current enters at its red **+** terminal.'],
    ['Ammeter − to R₁', 'The current leaving the ammeter goes into the first resistor, R₁.'],
    ['R₁ to R₂', 'This one wire is what makes it **series**: current leaving R₁ has nowhere to go but into R₂. One path, one current.'],
    ['R₂ to rheostat end A', 'The rheostat stays in series with the pair, so it controls the current through both.'],
    ['Rheostat slider C to battery −', 'Use the **sliding contact C**, not end B — with A and B the whole coil is always in and sliding does nothing. This wire closes the loop back at battery **−**.'],
    ['Voltmeter + to R₁', 'Rs is the resistance of the **whole** combination, so the voltmeter spans both resistors. Its **+** goes to R₁’s end nearer battery +…'],
    ['Voltmeter − to R₂', '…and its **−** to the far end of R₂. Now it reads the potential difference across R₁ and R₂ together.'],
  ],
};

/** True once the needles have settled where they are, so a number can be read off. */
function settled(state: LabState): boolean {
  if (!state.key || state.lastObs === null) return false;
  const ctl = state.method === 'cells' ? cellsUsed(state.wires, state.method) : state.s;
  return Math.abs(state.lastObs.ctl - ctl) < 1e-4;
}

/** The ammeter, right now. */
function ammeter(state: LabState): number {
  return Math.abs(solveBench(state).Iam);
}

/**
 * What the ammeter WOULD read with the same two resistors in series at this
 * same operating point. Recomputing it beats remembering it: it is the number
 * the student saw two steps ago, and it cannot go stale.
 */
function seriesAmmeterAt(state: LabState): number {
  const wires = [...canonOf(CONFIGS.series, state.method)];
  // Under the cells method the comparison is taken at whichever tap the lead is
  // on, so the two circuits really are driven by the same cells.
  if (state.method === 'cells') {
    const k = Math.max(1, cellsUsed(state.wires, state.method));
    wires[0] = [tapId(k), 'key.a'];
  }
  return Math.abs(solveBench({ ...state, wires, key: true }).Iam);
}

/**
 * Build both tours against the live page. `stage` returns the bench `<svg>`
 * (regions are drawn in its 1000-wide coordinates); `find` returns an element
 * the host has tagged with `data-tour`.
 */
export function createSeriesParallelTours(ctx: LabTourCtx): Record<TourKind, TourStep<LabTourCtx>[]> {
  // Where things are is fixed for the life of the tour; what they are DOING is
  // read from the context each step is handed, never from this one.
  const bench = ctx.stage;
  const find = ctx.find;
  // Likewise the method: a tour is built when it opens, and changing the method
  // restarts the bench, which closes it.
  const method = ctx.state.method;
  const cells = method === 'cells';
  const seriesCanon = canonOf(CONFIGS.series, method);
  const why = WIRE_WHY[method];
  const seriesNet = buildNetFor('series', method);
  const parallelNet = buildNetFor('parallel', method);
  /** The tap the textbook layout starts on, or the battery's single + terminal. */
  const source: TerminalId = cells ? tapId(1) : 'bat+';

  /**
   * A rectangle in BENCH coordinates, mapped to where it actually is on screen.
   * The drawing scales to fit its box and centres (`xMidYMid meet`), so it is
   * letterboxed whenever the box's proportions differ from the bench's.
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

  const seriesDiagram = (active: number, remove = -1) =>
    function SeriesDiagram(c: LabTourCtx): React.ReactNode {
      return <Schematic config="series" method={c.state.method} wires={c.state.wires} active={active} remove={remove} />;
    };
  const parallelDiagram = (active: number) =>
    function ParallelDiagram(c: LabTourCtx): React.ReactNode {
      return <Schematic config="parallel" method={c.state.method} wires={c.state.wires} active={active} />;
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
        ? `The **cell holder** carries ${P.cells} dry cells of 1.5 V end to end, with a brass stud between every pair. Take the circuit off at stud **B** and one cell drives it; at **C**, two; at **${TAP_LETTER[P.cells]}**, all ${P.cells}. That is how you read each arrangement at more than one current. The **plug key** is your switch. Terminal colours matter: **red is +**, **black is −**, and brass terminals have no polarity.`
        : `The **battery** (${P.cells} cells of 1.5 V) drives the current. The **plug key** is your switch. Terminal colours matter: **red is +**, **black is −**, and brass terminals have no polarity.`,
    },
    {
      title: 'The two meters',
      target: region(RG_METERS),
      body: `The **ammeter** (0–${P.amFS} A) measures current and always goes **in series** — inside the loop. The **voltmeter** (0–${P.vmFS} V) measures potential difference and always goes **across** the part you are measuring. On both, current must enter at the red + terminal.`,
    },
    {
      title: cells ? 'The two resistors' : 'Resistors and rheostat',
      target: region(RG_BOARDS),
      body:
        'Two resistors, **R₁** and **R₂**, sit on the boards — their values are unknown, and different on every bench. You will measure each on its own, then joined in series, then in parallel. ' +
        (cells
          ? 'There is no rheostat in these circuits: the current is changed by changing **how many cells** drive them, which is what the taps on the holder are for.'
          : 'The **rheostat** below them is a variable resistor: its sliding contact **C** sets how much coil the current passes through.'),
    },
    {
      title: 'Clean the wire ends',
      target: region(RG_SAND),
      body: 'Step 2 of the real procedure, and the bench holds you to it: fresh connecting wire carries an insulating enamel and old wire grows an oxide film, and either one is unaccounted resistance sitting in your circuit. It matters more here than anywhere, because you will rewire four times.',
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
      body: 'Made a wrong connection? Tap the wire itself to take it off. You will do a lot of this today — turning series into parallel is three wires. **Undo wire** and **Clear** sit under the bench as well.',
      task: 'Tap the wire you just laid.',
      done: ({ state }) => state.wires.length === 0,
    },
    {
      title: 'The plug key',
      target: region(RG_KEY),
      body: 'Plug in closes the circuit; plug out opens it. Keep it out except while you are reading the meters — current heats the coils and changes their resistance — and **always** take it out before you rewire anything.',
      task: 'Tap the key to put the plug in, then tap it again to take it out.',
      done: ({ state }, entry) => state.keyToggles - entry.state.keyToggles >= 2 && !state.key,
    },
    cells
      ? {
          title: 'Change the current',
          target: region(RG_BAT),
          highlight: [tapId(1), tapId(2)],
          body: 'There is no rheostat in these circuits. To change the current you move the single lead along the holder: from **B** to **C** puts a second cell behind the same arrangement, and each arrangement is read at one cell, then two, then three. Only ever **one** tap carries a lead — a wire from one tap to another short-circuits the cells between them.',
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
      target: tagged('console'),
      body: 'This panel always shows the step you are on and the one thing to type for it. Underneath, **Readings** holds the table for the circuit you are on, **Compare** collects all four results side by side, **Graph** plots them together and **Theory** holds the textbook. Every reading is checked against where the needle really pointed: within one least count earns full marks.',
    },
    {
      title: 'How you are marked',
      target: tagged('stats'),
      body: 'Twelve readings across four circuits, then one calculation and five questions. Every slip is logged so you can learn from it; hints and unsafe moves — a short circuit, overloading a meter — cost marks. Want to see two of the circuits built once first? Choose **Guided build**.',
    },
  ];

  const build: TourStep<LabTourCtx>[] = [
    {
      title: 'Clean the wire ends first',
      target: region(RG_SAND),
      highlight: [NET.series],
      body: 'Before a single wire goes on, the ends are rubbed bright on the sand paper. An enamel or oxide film on the copper is resistance sitting in your circuit that appears in no diagram and in no calculation — and the bench will not let you lay a wire until it is gone.',
      task: 'Tap the sand paper.',
      done: ({ state }) => state.sanded,
      doneMessage: 'Bright copper. Now the circuit.',
    },
    {
      title: 'Series first, then parallel',
      media: seriesDiagram(-1),
      highlight: [NET.series],
      body: `You will build the **series** circuit and switch it on, then turn it into a **parallel** circuit by changing just three wires — and see what happens to the current. Read the diagram like a map: from ${
        cells ? 'the cell tap' : 'battery **+**'
      }, all the way round, back to ${cells ? 'the **−** stud' : 'battery **−**'}.`,
    },
    ...seriesCanon.map(
      ([a, b], i): TourStep<LabTourCtx> => ({
        title: `Wire ${i + 1} of ${seriesCanon.length}: ${why[i]![0]}`,
        target: region(pairRegion(a, b)),
        highlight: [NET.series, a, b],
        media: seriesDiagram(i),
        body: why[i]![1],
        // The instruction changes once the wire itself is right: a stale "connect
        // these two" beside a warning leaves a student unsure which to believe.
        task: ({ state }) =>
          joined(state.wires, a, b, state.method) &&
          strayWires(state.wires, seriesNet, state.method).length > 0
            ? 'Wire laid ✓ — now remove the wire **flashing red**, which isn’t part of this layout.'
            : `Connect **${TERMINALS[a].name}** to **${TERMINALS[b].name}** — the pulsing terminals.`,
        done: ({ state }) =>
          joined(state.wires, a, b, state.method) &&
          strayWires(state.wires, seriesNet, state.method).length === 0,
      }),
    ),
    {
      title: 'The lab assistant checks it',
      media: seriesDiagram(seriesCanon.length),
      highlight: [NET.series],
      body: ({ state }) => {
        const d = diagnose(state, CONFIGS.series);
        return d.ok
          ? `Every line in the diagram has a real wire. The assistant tested it with the key in and out${
              cells ? '' : ' and the rheostat at both ends'
            }: **R₁ and R₂ in series, ammeter in the loop, voltmeter across both.**`
          : `The assistant found a problem: ${d.msg}`;
      },
    },
    ...(cells
      ? []
      : [
          {
            title: 'Set the rheostat to maximum',
            target: region(RG_RHEO),
            highlight: [NET.series],
            body: `Always start with the smallest current. In this layout current enters the coil at A and leaves at the slider, so the slider at **B** puts the whole ${P.rRh} Ω coil in the circuit.`,
            task: 'Slide the contact all the way to end **B**.',
            done: ({ state }: LabTourCtx) => state.s >= 0.97,
          } satisfies TourStep<LabTourCtx>,
        ]),
    {
      title: 'Switch on the series circuit',
      target: region(RG_KEY),
      highlight: [NET.series],
      body: cells
        ? 'Insert the key. Both needles should swing forward a little — one cell across two resistors in a row, so the current is small and safe.'
        : 'Insert the key. Both needles should swing forward a little — the whole coil is in, so the current is small and safe.',
      task: 'Insert the plug key.',
      done: ({ state }) => state.key,
      doneMessage: 'Current flows through R₁, then through R₂.',
    },
    cells
      ? {
          title: 'Note the series current',
          target: region(RG_AM),
          highlight: [NET.series],
          stay: true,
          body: 'Let the needles settle and remember what the ammeter reads. Nothing else on the bench will change from here — the same one cell, the same two resistors — so that number is the fair thing to compare against.',
          task: 'Let the needles settle with the key in.',
          done: ({ state }) => settled(state),
          doneMessage: 'Holding here.',
          after: ({ state }) => `In series the ammeter reads about **${ammeter(state).toFixed(2)} A**. Remember that number.`,
        }
      : {
          title: 'Pick a point to compare at',
          target: region(RG_RHEO),
          highlight: [NET.series],
          stay: true,
          body: `The rheostat at full is big enough to hide the difference between the two circuits. Slide it back to about **a fifth of the way from A** — a fifth of the coil, ${(P.rRh * 0.2).toFixed(1)} Ω. Leave it there for the rest of the build, so the only thing that changes is how R₁ and R₂ are joined.`,
          task: 'Slide the contact to about a fifth of the way from A, and let the needles settle.',
          done: ({ state }: LabTourCtx) => Math.abs(state.s - 0.2) <= 0.04 && settled(state),
          doneMessage: 'Holding here.',
          after: ({ state }: LabTourCtx) =>
            `In series the ammeter reads about **${ammeter(state).toFixed(2)} A**. Remember that number.`,
        },
    {
      title: 'Switch off before rewiring',
      target: region(RG_KEY),
      highlight: [NET.series],
      body: 'Never change connections with current flowing. Take the plug out first.',
      task: 'Take the plug key out.',
      done: ({ state }) => !state.key,
    },
    {
      title: 'Break the series link',
      target: region(RG_RESISTORS_ONLY),
      // The layout it is judged against is already PARALLEL, which is what puts
      // the R₁–R₂ link in the wrong: that is the point of this step.
      highlight: [NET.parallel],
      media: seriesDiagram(-1, 3),
      body: 'In parallel, R₁ and R₂ must **not** be joined end to end — that joint is what forces one current through both. The wire between them is now flashing red.',
      task: 'Tap the flashing wire between R₁ and R₂ to remove it.',
      done: ({ state }) =>
        !joined(state.wires, 'r1.b', 'r2.a', state.method) &&
        strayWires(state.wires, parallelNet, state.method).length === 0,
    },
    {
      title: 'Join the left ends',
      target: region(pairRegion('r1.a', 'r2.a')),
      highlight: [NET.parallel, 'r1.a', 'r2.a'],
      media: parallelDiagram(3),
      body: 'Parallel means both resistors connect between the **same two points**. Join R₁’s left end to R₂’s left end — the current will split here.',
      task: 'Connect **R₁ left end** to **R₂ left end**.',
      done: ({ state }) =>
        joined(state.wires, 'r1.a', 'r2.a', state.method) &&
        strayWires(state.wires, parallelNet, state.method).length === 0,
    },
    {
      title: 'Join the right ends',
      target: region(pairRegion('r1.b', 'r2.b')),
      highlight: [NET.parallel, 'r1.b', 'r2.b'],
      media: parallelDiagram(4),
      body: `Now join the two right ends — the currents meet again here. The voltmeter${
        cells ? '' : ' and rheostat'
      } wire${cells ? '' : 's'} can stay where ${cells ? 'it is' : 'they are'}: ${
        cells ? 'it already sits' : 'they already sit'
      } across the pair.`,
      task: 'Connect **R₁ right end** to **R₂ right end**.',
      done: ({ state }) =>
        joined(state.wires, 'r1.b', 'r2.b', state.method) &&
        strayWires(state.wires, parallelNet, state.method).length === 0,
    },
    {
      title: 'The lab assistant checks it again',
      media: parallelDiagram(canonOf(CONFIGS.parallel, method).length),
      highlight: [NET.parallel],
      body: ({ state }) => {
        const d = diagnose(state, CONFIGS.parallel);
        return d.ok
          ? 'Three wires changed, and now it is **R₁ and R₂ in parallel**, with the ammeter in the main line and the voltmeter across the pair.'
          : `The assistant found a problem: ${d.msg}`;
      },
    },
    {
      title: 'Switch on the parallel circuit',
      target: region(RG_KEY),
      highlight: [NET.parallel],
      stay: true,
      body: cells
        ? 'Same one cell, same two resistors — only the way they are joined has changed. Watch the ammeter.'
        : 'Same battery, same rheostat position — only the resistors are joined differently. Normally you would start again at maximum resistance; here the slider stays put so the comparison is fair.',
      task: 'Insert the plug key and watch the ammeter.',
      done: ({ state }) => settled(state) && (cells || Math.abs(state.s - 0.2) <= 0.06),
      doneMessage: 'The needle swung further than before.',
      after: ({ state }) => {
        const parallel = ammeter(state);
        const series = seriesAmmeterAt(state);
        return (
          `Series: **${series.toFixed(2)} A**. Parallel: **${parallel.toFixed(2)} A** — ${(parallel / series).toFixed(1)} times as much, ` +
          `with the same ${cells ? 'single cell' : 'battery and the same rheostat setting'}.\n` +
          'More current means **less resistance**: two side-by-side paths let charge through more easily. ' +
          'So R_p is smaller than either resistor, and R_s is larger than either.'
        );
      },
    },
    {
      title: 'Switch off',
      target: region(RG_KEY),
      highlight: [NET.parallel],
      body: 'Take the key out so the coils can cool.',
      task: 'Take the plug key out.',
      done: ({ state }) => !state.key,
    },
    {
      title: 'Two circuits, three wires apart',
      media: parallelDiagram(canonOf(CONFIGS.parallel, method).length),
      highlight: [NET.parallel],
      body:
        'Series: one path, the same current through both, and the resistances add. Parallel: two paths between the same two points, the same potential difference across both, and the total resistance drops. In the practical you measure R₁, R₂, the series pair and the parallel pair yourself, on a different bench — ' +
        (cells ? 'three readings of each, at one cell, two and three.' : 'three readings of each, at three rheostat settings.'),
    },
  ];

  return { controls, build };
}
