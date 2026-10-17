'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { STEP } from '@labs/lib/glass-slab/marking';
import type { GlassSlabAction } from '@labs/lib/glass-slab/reducer';
import { currentTrial, type GlassSlabState } from '@labs/lib/glass-slab/state';
import {
  aimOffTheLine,
  chooseTheFirstAngle,
  compareTheTraces,
  drawTheIncidentRay,
  hideTheLightPath,
  layTheProtractorOnO,
  offerThePointOfIncidence,
  putTheSlabDown,
  showTheLightPath,
  showTheLightPathHere,
  sightTheFourthPinAgain,
  stickTheFourthPinBadly,
  stickTheIncidentPins,
  stickTheThirdPinInLine,
  traceTheOutline,
  trainerPlan,
  type DemoCtx,
} from '@labs/lib/glass-slab/trainer-demos';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { useLabFeature } from '../lab-features';

import { SHEET_HEIGHT, SHEET_WIDTH } from './bench';

/**
 * THE VISUAL TRAINER: "Show me this step", for the step the student is actually
 * standing on.
 *
 * It is not the tour. The tour is one walk through the whole bench on a sandbox
 * sheet; this runs on the STUDENT'S OWN sheet, because the question it answers
 * is "what do I do *here*". The workspace takes a snapshot before it starts and
 * puts it back byte for byte afterwards — our state is immutable, so holding
 * the reference IS the copy.
 *
 * This file is the words. The hands are in
 * `@labs/lib/glass-slab/trainer-demos.ts`, which is pure and says what every
 * demonstration is allowed to touch — and which can therefore be driven from
 * plain Node to prove that none of this moves a mark.
 *
 * A step that shows the LIGHT PATH is dropped when the `teach` flag is off:
 * there is no teaching layer to show, and a demonstration that pressed a switch
 * an administrator has taken away would be a demonstration of nothing.
 */
export type GlassSlabTrainerCtx = BenchTourContext<GlassSlabState, GlassSlabAction>;
type Step = TourStep<GlassSlabTrainerCtx>;

// ---------------------------------------------------------------------------
// Doing the thing
// ---------------------------------------------------------------------------

/**
 * Runs a step's actions once, as it opens.
 *
 * An effect event, not a dependency list: the tour hands `content` a fresh
 * closure on every render, and a demonstration must happen once per step, not
 * once per paint. React's development double-invoke is the same instance, so
 * the latch holds there too.
 */
function Demonstrate({ run, ctx }: { run: (ctx: DemoCtx) => void; ctx: GlassSlabTrainerCtx }): null {
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
 * A step that DOES something on arrival, rather than only pointing at it.
 *
 * `gated: false` because this is a demonstration: the student watches and
 * presses Next. Nothing here is waiting for them to do it.
 */
function does(step: Step, run: (ctx: DemoCtx) => void): Step {
  return {
    ...step,
    gated: false,
    content: ({ ctx }) => <Demonstrate run={run} ctx={ctx} />,
  };
}

/** One decimal, as the commentary quotes an angle. */
const deg = (v: number | undefined): string => (v === undefined ? '—' : `${v.toFixed(1)}°`);

// ---------------------------------------------------------------------------
// The demonstrations
// ---------------------------------------------------------------------------

type Region = readonly [x: number, y: number, w: number, h: number];

const REGION = {
  traySlab: [50, 0, 120, 48],
  slab: [320, 226, 320, 174],
  above: [320, 66, 320, 190],
  below: [36, 374, 928, 196],
  whole: [24, 56, 952, 524],
} as const satisfies Record<string, Region>;

/**
 * The demonstrations, keyed by procedure step.
 *
 * `teach` is a parameter rather than a hook call so this stays a plain
 * function: the flag is read once, by the hook below, and every step that
 * depends on the teaching layer is left OUT of the set rather than skipped when
 * it runs.
 */
export function buildGlassSlabTrainer(
  ctx: GlassSlabTrainerCtx,
  teach: boolean,
): Readonly<Record<number, readonly Step[]>> {
  const sheet = ctx.stage;
  const find = ctx.find;

  /**
   * A rectangle in SHEET coordinates, mapped to where it is on screen. The
   * drawing is letterboxed inside its box whenever the proportions differ, so
   * scaling by width alone lands the spotlight well away from its subject.
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
  const keep = (steps: readonly (Step | null)[]): readonly Step[] =>
    steps.filter((s): s is Step => s !== null);

  // --- fixing the paper and the slab ---------------------------------------
  const setup: readonly Step[] = keep([
    {
      title: 'Three acts, in this order',
      target: region(REGION.whole),
      body:
        'Slab down, **outline traced**, then O and the normal marked. The order is the whole of this step: once a ' +
        'pin has nudged the glass, an outline drawn late records a position the light never passed through, and the ' +
        'bench takes **4 marks** off for it.\n\nWatch — nothing I do is marked, and your sheet comes back exactly ' +
        'as you left it.',
    },
    does(
      {
        title: 'The slab goes down first',
        target: region(REGION.traySlab),
        highlight: ['tool:slab'],
        body:
          'Tap a tool in the tray to pick it up: whatever is in your hand is what the next press on the paper does. ' +
          'The slab is set down **square** on the sheet, well inside it — a slab lying skew turns every angle you ' +
          'read afterwards.',
      },
      putTheSlabDown,
    ),
    does(
      {
        title: 'Trace right round it',
        target: region(REGION.slab),
        highlight: ['tool:pencil'],
        body:
          'Now the pencil, right round all four faces — **ABCD**. Once the slab is lifted off to join the points, ' +
          'that outline is the only record of where the two faces were, and every angle you measure is measured ' +
          'from it.',
      },
      traceTheOutline,
    ),
    does(
      {
        title: 'And the last press is yours',
        target: region(REGION.slab),
        highlight: ['tool:pencil'],
        body:
          'The crosshair is on the **upper face AB**, which is where the point of incidence **O** goes; pressing ' +
          'there marks it and draws the **normal NN′** through it, perpendicular to the face. Every angle in this ' +
          'experiment is measured from that dashed line, never from the surface of the glass.\n\nI am leaving that ' +
          'press to you: it finishes the set-up, and the set-up is marked.',
      },
      offerThePointOfIncidence,
    ),
    teach
      ? does(
          {
            title: 'What you are about to spend an hour finding',
            target: tagged('teach-toggle'),
            body:
              'Once, before you start: the switch under the bench draws the path the light really takes. The beam ' +
              'in, the piece **inside the glass**, the beam out — and a **ray box** you can drag round to any angle ' +
              'you like, with ∠i, ∠r, ∠e and the sideways shift printed beside it.\n\nIt is worked out from Snell’s ' +
              'law at both faces, it is **not marked**, and it is **not your trace**: it is a ray of your own, which ' +
              'is exactly why its numbers can be shown to you.',
          },
          showTheLightPath(40),
        )
      : null,
    teach
      ? does(
          {
            title: 'And off again',
            target: tagged('teach-toggle'),
            body:
              '**A real sheet shows you none of that.** Clear glass leaves no track, so there is nothing on the ' +
              'paper but a pencil outline — and four pins are how you find a ray you cannot see. That is the whole ' +
              'reason this method exists.',
          },
          hideTheLightPath,
        )
      : null,
  ]);

  // --- one trace ------------------------------------------------------------
  const trace: readonly Step[] = keep([
    {
      title: 'The order for this trace',
      target: tagged('console'),
      body: ({ state }) => {
        const tr = currentTrial(state);
        return tr.joined
          ? `Your **${tr.target}°** trace is joined up, so what is left is the three angles — and those come off ` +
              '**your own** drawing with the protractor. I will show you where each one is measured from, and read ' +
              'none of them: those numbers are exactly what is marked.'
          : `**${tr.target}°** this time. Protractor on O and the ray **drawn** first, then two pins on it, then ` +
              'round to the far side to sight two more through the glass — and only then does the slab come off. ' +
              'Watch: I stop before the joining, because that is where your pin marks are decided.';
      },
    },
    does(
      {
        title: 'The protractor comes before the pins',
        target: region(REGION.slab),
        highlight: ['tool:protractor', 'protractor'],
        body: ({ state }) =>
          currentTrial(state).joined
            ? 'The protractor’s centre goes on **O**, straight edge along the face AB. The normal is the **90° ' +
              'mark**, so an angle from the normal is **90 minus the scale reading** — that is the one piece of ' +
              'arithmetic this whole practical turns on.'
            : 'Centre on **O**, straight edge along the face AB. The ray is **drawn** before any pin goes in, not ' +
              'fitted to the pins afterwards — the pins mark a direction you have already chosen.',
      },
      layTheProtractorOnO,
    ),
    does(
      {
        title: 'Turn the sight line to the angle you want',
        target: tagged('gs-protractor'),
        highlight: ['protractor'],
        body: ({ state }) => {
          const tr = currentTrial(state);
          return (
            `The normal is the **90°** mark, so **${tr.target}°** of incidence is the **${90 + tr.target}°** mark — ` +
            `or ${90 - tr.target}° for a ray coming from the other side. The magnified scale beside the task moves ` +
            'a degree at a time under the arrow keys, and the line is ruled from O through that mark.' +
            (tr.drawn === null
              ? '\n\nI am pressing **Draw the ray**: ruling it is not marked, and everything after it is.'
              : '\n\nYours is already drawn, so nothing here changes.')
          );
        },
      },
      drawTheIncidentRay,
    ),
    does(
      {
        title: 'Two pins fix that direction',
        target: region(REGION.above),
        highlight: ['tool:pin', 'paper'],
        body: ({ state }) =>
          currentTrial(state).pins.length >= 2
            ? 'Your **P₁** and **P₂** are already on the drawn line. Keep a pair like that well apart: the angular ' +
              'error of a line through two points is roughly the error in either one divided by the gap between ' +
              'them, so doubling the gap halves the error in every angle you go on to read.'
            : '**P₁** anywhere on the drawn line, **P₂** a good way further along it. Two pins close together fix a ' +
              'direction very badly — the marking halves the pair for it, and your own angles suffer first.',
      },
      stickTheIncidentPins,
    ),
    does(
      {
        title: 'Now walk round to the far side',
        target: tagged('gs-sighting'),
        body:
          'Through the glass you see P₁ and P₂ **shifted sideways**, because their light has been refracted twice — ' +
          'and that shifted line IS the emergent ray. The **sighting view** beside the task is that view, magnified ' +
          'at 1 mm = 9 px, because a millimetre on the sheet is far too small to judge by eye.\n\nThis crosshair is ' +
          'deliberately **4 mm** off the line the images lie along. The badge says so, and the ghost head sits off ' +
          'the dotted line.',
      },
      aimOffTheLine,
    ),
    does(
      {
        title: 'Move it until it reads “in line”',
        target: region(REGION.below),
        highlight: ['tool:pin', 'paper'],
        body:
          'Only then does the pin go in. That is the whole of the pin method: **P₃** on the line of both images, ' +
          'then **P₄** further out, a good distance beyond it.',
      },
      stickTheThirdPinInLine,
    ),
    does(
      {
        title: 'And here is what two millimetres cost',
        target: region(REGION.below),
        highlight: ['paper'],
        body: ({ state }) => {
          const plan = trainerPlan(state);
          if (!plan?.good || !plan.bad) {
            return (
              'This one is going in about **2 mm** off the line — roughly the width of a pin head. Nothing on a ' +
              'real bench tells you it is off; you check it yourself against both images.'
            );
          }
          return (
            'This one is going in about **2 mm** off the line, roughly the width of a pin head. Nothing on a real ' +
            'bench will tell you: you check it yourself against both images.\n\nP₃P₄ then leaves at **∠e = ' +
            `${deg(plan.bad.e)}** against ∠i ${deg(plan.good.i)}. Those two should be equal — the faces are ` +
            'parallel — so a row where they are not is a row where the sighting was out. Sighted properly it comes ' +
            `back to **${deg(plan.good.e)}**.`
          );
        },
      },
      stickTheFourthPinBadly,
    ),
    does(
      {
        title: 'Pull it and sight again',
        target: region(REGION.below),
        highlight: ['tool:pin', 'paper'],
        body:
          'Out it comes, and back in **square on the line of both images**. A pin is cheap to pull; a trace measured ' +
          'off a crooked line is not — it is wrong all the way to your refractive index.',
      },
      sightTheFourthPinAgain,
    ),
    {
      title: 'The joining is yours',
      target: tagged('console'),
      body:
        'Four pins in one line, and the next press is **Lift the slab off and join the points** — P₁P₂ produced ' +
        'meets AB at O, P₃P₄ produced back meets DC at O′, and O to O′ is the piece of the path nobody can see.\n\n' +
        'I stop here on purpose. **That press is where your pin marks are awarded**, and it is yours to make.',
    },
    teach
      ? does(
          {
            title: 'What the four pins were standing in for',
            target: tagged('teach-toggle'),
            body: ({ state }) =>
              `The ray box is aimed at **${currentTrial(state).target}°**, the same angle as this trace. Watch where ` +
              'it bends: **towards** the normal going in at O, **away** from it coming out at O′, and out ' +
              '**parallel** to the way it came in, shifted sideways by **d**.\n\nSwing the box and the readout ' +
              'follows — but notice what it is: a ray of **your own**, not the one you pinned. Your ∠i, ∠r and ∠e ' +
              'still have to come off your own trace with the protractor.',
          },
          showTheLightPathHere,
        )
      : null,
    teach
      ? does(
          {
            title: 'And off again',
            target: tagged('teach-toggle'),
            body:
              'Back to the sheet as a real one looks: an outline, some pins and a pencil line. Press the switch ' +
              'yourself whenever you want the beam back — it costs nothing and it is marked nowhere.',
          },
          hideTheLightPath,
        )
      : null,
    does(
      {
        title: 'Then three angles, off your own drawing',
        target: tagged('console'),
        highlight: ['tool:protractor'],
        body:
          'Say which angle you are measuring first, so the bench knows whether you are working at **O** or at ' +
          '**O′**. **∠i** and **∠r** are both at O — the protractor is turned **over** for ∠r, so its scale lies ' +
          'on the glass side, where the refracted ray runs. **∠e** is at O′ on the lower face.\n\nRead where **your ' +
          'own** ray crosses the scale and take it from 90. Within 2° of what your trace really makes scores in ' +
          'full, and a protractor reads to 1° — so read it square on, and do not round towards the number you were ' +
          'hoping for. The reading itself is yours.',
      },
      chooseTheFirstAngle,
    ),
  ]);

  // --- the interpretation ---------------------------------------------------
  const interpret: readonly Step[] = [
    {
      title: 'This one comes out of your own table',
      target: tagged('console'),
      body:
        'Four statements, and the first is marked against **your three rows**, not against the textbook. Read ∠i ' +
        'beside ∠e in every row: if your own ∠e came back equal to ∠i, that is what you answer — and if it did not, ' +
        'the honest reading of your own table is still the answer that earns the marks. Nothing here gets tapped ' +
        'for you.',
    },
    does(
      {
        title: 'Put the three traces side by side',
        target: region(REGION.whole),
        body:
          'One colour each, all on the same sheet. Look along them: every emergent ray runs **parallel** to its own ' +
          'incident ray — a slab displaces light, it does not deviate it — and the sideways shift **d** grows as ∠i ' +
          'grows. That is two of the four statements, visible in one picture.',
      },
      compareTheTraces,
    ),
    {
      title: 'And the last column is the point of the whole thing',
      target: tagged('console'),
      body:
        'sin i / sin r, worked out for each of your rows and averaged. Three quite different angles of incidence, ' +
        'and one number near **1.50** — that constancy is the evidence that the ratio belongs to the **glass** and ' +
        'not to the angle you happened to choose. Which is what makes it the refractive index.',
    },
  ];

  return {
    [STEP.setup]: setup,
    [STEP.firstTrial]: trace,
    [STEP.firstTrial + 1]: trace,
    [STEP.firstTrial + 2]: trace,
    [STEP.conclusions]: interpret,
  };
}

/**
 * WHERE THE TEACH FLAG IS READ. A hook, and passed to the workspace by
 * reference so it is called as one: with the flag off, the steps that use the
 * light path are never built, so a student cannot tell the layer exists.
 */
export function useGlassSlabTrainer(
  ctx: GlassSlabTrainerCtx,
): Readonly<Record<number, readonly Step[]>> {
  return buildGlassSlabTrainer(ctx, useLabFeature('teach'));
}
