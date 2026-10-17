'use client';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import type { GlassSlabAction } from '@labs/lib/glass-slab/reducer';
import { currentTrial, traceOfCurrent, type GlassSlabState } from '@labs/lib/glass-slab/state';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { SHEET_HEIGHT, SHEET_WIDTH } from './bench';

/**
 * "How to play": one whole trace, from the slab going down to the first angle
 * read, on a sandbox sheet.
 *
 * The host swaps the practical out while it runs, so opening it mid-way loses
 * nothing and pauses the clock. Nothing done during the tour is marked, which
 * the first step says out loud — a student who is told that experiments more.
 */
export type GlassSlabTourCtx = BenchTourContext<GlassSlabState, GlassSlabAction>;

type Region = readonly [x: number, y: number, w: number, h: number];

/**
 * Regions of the sheet, in bench coordinates. Generous around the slab: its
 * thickness comes from the bench seed, so a rectangle drawn to the millimetre
 * would miss on a 3 cm slab and overshoot on a 5 cm one.
 */
const REGION = {
  whole: [24, 56, 952, 524],
  trayAll: [40, 0, 700, 48],
  traySlab: [50, 0, 120, 48],
  slab: [320, 226, 320, 174],
  above: [320, 66, 320, 190],
  below: [36, 374, 928, 196],
} as const satisfies Record<string, Region>;

export function createGlassSlabTours(ctx: GlassSlabTourCtx): { controls: TourStep<GlassSlabTourCtx>[] } {
  const sheet = ctx.stage;
  const find = ctx.find;

  /**
   * A rectangle in SHEET coordinates, mapped to where it actually is on screen.
   * The drawing scales to fit and centres, so it is letterboxed whenever its
   * box has different proportions; scaling by width alone lands the spotlight
   * well away from the thing it is naming.
   */
  const region = ([x, y, w, h]: Region): TourTarget => ({
    element: sheet,
    region: (box): TourRect => {
      const k = Math.min(box.width / SHEET_WIDTH, box.height / SHEET_HEIGHT);
      const originX = box.left + (box.width - SHEET_WIDTH * k) / 2;
      const originY = box.top + (box.height - SHEET_HEIGHT * k) / 2;
      return { left: originX + x * k, top: originY + y * k, width: w * k, height: h * k };
    },
  });
  const tagged = (name: string): TourTarget => ({ element: () => find(name), pad: 6 });

  const trial = (c: GlassSlabTourCtx) => currentTrial(c.state);

  const controls: TourStep<GlassSlabTourCtx>[] = [
    {
      title: 'Your drawing board',
      target: region(REGION.whole),
      body:
        'A sheet of paper pinned to a board, a rectangular **glass slab**, a box of **pins**, a **pencil**, a ' +
        '**protractor** and a **ruler**. Every ray you will see is worked out from Snell’s law at the two faces — ' +
        'nothing here is a picture. **Nothing in the tour is marked.**',
    },
    {
      title: 'Put the slab down',
      target: region(REGION.traySlab),
      highlight: ['tool:slab'],
      body: 'Tap a tool in the tray to pick it up. Whatever is in your hand is what the next press on the paper does.',
      task: 'Tap the **glass slab**, then press on the paper.',
      done: ({ state }) => state.slabOn,
      doneMessage: 'The slab is on the sheet.',
    },
    {
      title: 'Trace round it',
      target: region(REGION.slab),
      highlight: ['tool:pencil'],
      body: 'The outline is the whole point of the tracing: once the slab is lifted off, it is the only record of where the two faces were.',
      task: 'Take the **pencil** and press on the slab.',
      done: ({ state }) => state.outline,
      doneMessage: 'Outline ABCD.',
    },
    {
      title: 'Mark O and the normal',
      target: region(REGION.slab),
      highlight: ['tool:pencil'],
      body:
        'The dashed line **NN′** is the normal — perpendicular to the face. Every angle in this experiment is ' +
        'measured from it, never from the surface.',
      task: 'With the **pencil**, press on the **upper face** of the slab.',
      done: ({ state }) => state.origin,
      doneMessage: 'O marked, normal drawn.',
    },
    {
      title: 'Draw the incident ray',
      target: region(REGION.above),
      highlight: ['tool:protractor', 'protractor'],
      body:
        'Pick up the **protractor** and press on **O** to lay its centre there. Then turn its sight line: the ' +
        'arrow keys move it a degree at a time, or drag it across the scale. The normal is the 90° mark, so for ' +
        '30° of incidence you want **120°**.',
      task: 'Draw the incident ray at 30°.',
      done: (c) => trial(c).drawn !== null,
      doneMessage: 'The ray is drawn.',
    },
    {
      title: 'Two pins on the ray',
      target: region(REGION.above),
      highlight: ['tool:pin', 'paper'],
      body:
        'Two pins fix the direction the light comes in along. Keep them a good distance apart — two pins close ' +
        'together fix a line very badly, and the marking says so.',
      task: 'Stick **P₁** and **P₂** on the drawn line.',
      done: (c) => trial(c).pins.length >= 2,
      doneMessage: 'Both incident pins are in.',
    },
    {
      title: 'Look through the glass',
      target: tagged('gs-sighting'),
      body:
        'Now go round to the far side and look through the slab. You see P₁ and P₂ **shifted sideways**, because ' +
        'the light from them has been refracted twice. This view shows how far your next pin is from the line they ' +
        'appear along — at 1 mm = 9 px, because a millimetre on the sheet is too small to judge.',
    },
    {
      title: 'Two pins in line',
      target: region(REGION.below),
      highlight: ['tool:pin', 'paper'],
      stay: true,
      body:
        'Drag the crosshair until it says **in line**, then let go to stick the pin in. Do the same for the fourth, ' +
        'further away. If you put them anywhere else your trace will simply be wrong — nothing corrects it for you.',
      task: 'Stick **P₃** and **P₄** in line with the images.',
      done: (c) => trial(c).pins.length >= 4,
      doneMessage: 'Four pins in a line.',
    },
    {
      title: 'Join the points',
      target: tagged('console'),
      body:
        'The slab comes off and the pencil does the rest: P₁P₂ produced meets AB at **O**, P₃P₄ produced back ' +
        'meets DC at **O′**, and joining O to O′ is the ray inside the glass — the one piece of the path nobody ' +
        'can see.',
      task: 'Press **Lift the slab off and join the points**.',
      done: (c) => trial(c).joined,
      doneMessage: 'There is your trace.',
      after: (c) => {
        const ang = traceOfCurrent(c.state).ang;
        if (!ang) return 'The dotted line is the incident ray produced — the emergent ray runs parallel to it.';
        return (
          `The ray bends **towards** the normal going in (i ${ang.i.toFixed(0)}° → r ${ang.r.toFixed(0)}°) and ` +
          `**away** from it coming out (e ${ang.e.toFixed(0)}°). The dotted line is the incident ray produced — ` +
          'the emergent ray runs parallel to it, shifted sideways.'
        );
      },
    },
    {
      title: 'See the light path',
      target: tagged('teach-toggle'),
      body:
        'On a real sheet the ray inside the glass is invisible — clear glass leaves no track, which is the whole ' +
        'reason for the four pins. The switch under the bench draws it anyway: the beam running in, the piece ' +
        'inside the glass, and the beam running out, in the order the light travels them. It is a **teaching aid ' +
        'and it is not marked** — your angles still come off your own trace.',
      task: 'Press **The light path**.',
      done: ({ state }) => state.reveal,
      doneMessage: 'There is the beam.',
      after: () =>
        'Watch where it bends: **towards** the normal going in, **away** from it coming out, and out parallel to ' +
        'the way it came in. Press it again whenever you want the sheet back the way a real one looks.',
    },
    {
      title: 'Measure with the protractor',
      target: tagged('gs-protractor'),
      highlight: ['tool:protractor', 'protractor'],
      body:
        'Lay the protractor’s centre on **O** and read where the ray crosses the scale. At the size the sheet is ' +
        'drawn one degree is under a pixel, so the scale is magnified here: the **red line is the ray**, the blue ' +
        'one is your sight line, and the angle from the normal is **90° minus the reading**. It reads to 1°, so a ' +
        'reading within 2° of your own trace counts as right.',
      task: 'Measure **∠i**.',
      done: (c) => trial(c).meas.i !== null,
      doneMessage: 'First angle recorded.',
    },
    {
      title: 'Your observation table',
      target: tagged('console'),
      body:
        'Under the task sit your **Observations**, the **Ray diagram** and the **Theory** — the right one opens ' +
        'itself as you go. Three rows, one per angle of incidence, with sin i / sin r worked out for each. The ' +
        'whole practical is in the last columns: the index should come out near 1.5, and ∠e should come back ' +
        'equal to ∠i.',
    },
    {
      title: 'How you are marked',
      target: tagged('stats'),
      body:
        'Marks come from the setup, from four pins that really are in line, from reading the protractor against ' +
        '**your own trace**, from the refractive index your trace gives, and from the interpretation and viva. ' +
        'Every slip is logged with the reason, so you can see where a mark went.',
    },
  ];

  return { controls };
}
