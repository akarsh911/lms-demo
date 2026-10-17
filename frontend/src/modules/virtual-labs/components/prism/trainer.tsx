'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { RAYS, STEP } from '@labs/lib/prism/marking';
import {
  APEX,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  criticalAngle,
  minimumDeviation,
  smallestUsefulIncidence,
} from '@labs/lib/prism/optics';
import type { PrismAction } from '@labs/lib/prism/reducer';
import { currentTrial, type PrismState } from '@labs/lib/prism/state';
import {
  fixTheIncidentRay,
  fixTheThirdPinBadly,
  layTheProtractorDown,
  liftTheProtractor,
  lightTheRayBox,
  lightTheRayBoxHere,
  nextUnreadAngle,
  putTheRayBoxAway,
  showWhiteLight,
  sightTheEmergentRayProperly,
  sweepTheRayBox,
  takeAPin,
  trainerPlan,
  type DemoCtx,
} from '@labs/lib/prism/trainer-demos';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { useLabFeature } from '../lab-features';

/**
 * THE VISUAL TRAINER: "Show me this step", on the paper as it stands.
 *
 * The tour is one ray from end to end on a sandbox bench. This is the answer to
 * "what do I do *here*", so it runs on the student's own sheet and the
 * workspace puts that sheet back byte for byte when it finishes.
 *
 * WHAT IT WILL NOT DO:
 *
 * - **It never joins the pins and never records a reading.** Those two presses
 *   are where the sighting marks and the nine protractor marks are decided.
 *   Every demonstration here stops one press short of them, on purpose — the
 *   snapshot would undo it, but undoing it is not the point: the practical is
 *   the student's to do.
 * - **It never traces the outline and never moves the procedure on.** A step
 *   that completed itself would change the script out from under the
 *   demonstration keyed to it.
 *
 * The RAY BOX is this bench's teaching layer, so every step that uses it is
 * dropped when the `teach` flag is off — there is no lamp to put on the paper
 * and no switch to press.
 */
export type PrismTrainerCtx = BenchTourContext<PrismState, PrismAction>;
type Step = TourStep<PrismTrainerCtx>;

// ---------------------------------------------------------------------------
// Doing the thing
// ---------------------------------------------------------------------------

/** Runs a step's actions once, as it opens. See the glass slab's trainer. */
function Demonstrate({
  run,
  ctx,
}: {
  run: (ctx: DemoCtx) => void;
  ctx: PrismTrainerCtx;
}): null {
  // `useEffectEvent` so the effect can stay a genuine once-per-step effect: it
  // always sees the latest closure without listing one as a dependency.
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

/** Whether the machine has been told not to animate. Read at the moment of use. */
const stillness = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const one = (v: number): string => v.toFixed(1);

// ---------------------------------------------------------------------------
// The demonstrations
// ---------------------------------------------------------------------------

type Region = readonly [x: number, y: number, w: number, h: number];

const RG_BOARD: Region = [40, 26, 920, 476];
const RG_PRISM: Region = [364, 126, 272, 242];
const RG_LEFT: Region = [60, 250, 380, 240];
const RG_RIGHT: Region = [604, 190, 336, 300];

/**
 * The demonstrations, keyed by procedure step.
 *
 * `teach` is a parameter rather than a hook call, so this stays a plain
 * function: the flag is read once, by the hook below, and every step that uses
 * the ray box is left OUT of the set rather than skipped when it runs.
 */
export function buildPrismTrainer(
  ctx: PrismTrainerCtx,
  teach: boolean,
): Readonly<Record<number, readonly Step[]>> {
  const sheet = ctx.stage;
  const find = ctx.find;

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

  // --- fixing the paper and the prism --------------------------------------
  const fix: readonly Step[] = keep([
    {
      title: 'The outline goes down before anything else',
      target: region(RG_PRISM),
      highlight: ['prism'],
      body:
        'One tap on the glass pins it down and pencils round it — outline on the paper, corners lettered **A**, ' +
        '**B** and **C**, refracting angle **A = 60°** written in.\n\nThat press is yours, because it is the step. ' +
        'Every angle you measure afterwards is measured off that pencil outline, for the plain reason that the ' +
        'glass itself gets lifted out of the way before you join anything up.',
    },
    {
      title: 'Why a prism and not a slab',
      target: region(RG_PRISM),
      body:
        'A glass slab has **parallel** faces, so the second refraction undoes the first and the ray leaves ' +
        '_displaced_ but parallel to the way it came in. A prism’s two faces are inclined at **60°**, so the two ' +
        'bendings **add** — and the ray leaves turned firmly towards the **base**. That turn is the angle of ' +
        'deviation D, and it is what this whole practical is about.',
    },
    teach
      ? does(
          {
            title: 'Once, before you start: the light itself',
            target: tagged('teach-toggle'),
            highlight: ['raybox'],
            body: ({ state }) =>
              'A lamp goes down on the paper: the beam in, the path **inside the glass**, the beam out, and the ' +
              'orange arc where the incident ray _produced_ crosses the emergent ray — that arc is **D**. All of it ' +
              'is drawn by the same tracer your own trace will be marked against.\n\n**A real bench shows you none ' +
              `of it.** That is the whole reason for the four pins. It is a teaching aid, it is **not marked**, and ` +
              `on this bench’s glass (n = ${state.n}) it will bottom out at about **${one(
                minimumDeviation(state.n).D,
              )}°**.`,
          },
          lightTheRayBox(48),
        )
      : null,
    teach
      ? does(
          {
            title: 'Swing it, and watch D do something worth seeing',
            target: tagged('prism-raybox-controls'),
            highlight: ['raybox'],
            body: ({ state }) => {
              const m = minimumDeviation(state.n);
              return (
                'The deviation **falls, bottoms out, and rises again** — and the curve plots itself as the box ' +
                `turns. One minimum, and only one: at it **i = e = ${one(m.i)}°**, the ray inside runs parallel to ` +
                'the base, and that **Dₘ** is what gives you the refractive index, ' +
                'n = sin((A + Dₘ)/2) ÷ sin(A/2).\n\nCome in too **squarely** instead — less than about ' +
                `**${one(smallestUsefulIncidence(state.n))}°** to the normal — and nothing comes out of face AC at ` +
                `all: inside the glass the ray meets it past the **critical angle (${one(
                  criticalAngle(state.n),
                )}°)** and is turned back. That is not a special case in the code; it is a refraction equation with ` +
                'no solution.'
              );
            },
          },
          (c) => sweepTheRayBox(stillness())(c),
        )
      : null,
    teach
      ? does(
          {
            title: 'And off it goes again',
            target: tagged('teach-toggle'),
            body:
              'Because that is your real bench: clear glass, no visible ray, and nothing on the paper but a pencil ' +
              'outline. Everything you have to find here is found with **four pins** — which is exactly what the ' +
              'next step is.',
          },
          putTheRayBoxAway,
        )
      : null,
  ]);

  // --- the pin method -------------------------------------------------------
  const trace: readonly Step[] = keep([
    {
      title: 'Four pins, and the first two choose your angle',
      target: region(RG_BOARD),
      body: ({ state }) => {
        const t = currentTrial(state);
        if (t.traced) {
          return (
            `Ray ${t.k + 1} is joined up already, so nothing I do can touch it. Here is the method again over the ` +
            'top of it — and **Next ray** is the press that starts a fresh one, when you want it.'
          );
        }
        return (
          'The line through **P1** and **P2** _is_ your incident ray: you choose the angle by where you put them, ' +
          'not from a menu. Watch — and your own pins come straight back when I finish, exactly where they were.'
        );
      },
    },
    does(
      {
        title: 'A pin out of the tray',
        target: tagged('prism-controls'),
        highlight: ['pins'],
        body: ({ state }) =>
          currentTrial(state).pins.length
            ? 'I am lifting the pins that are in, so the line can be laid down from nothing. They come back the ' +
              'moment this finishes — this is a demonstration, and it is holding your paper, not marking it.'
            : 'Tapping the box picks one up; tapping the paper puts it in. The crosshair moves with the arrow keys ' +
              'too, and Enter presses the pin home.',
      },
      takeAPin,
    ),
    does(
      {
        title: 'P1 and P2, in front of face AB',
        target: region(RG_LEFT),
        highlight: ['pins'],
        body: ({ state }) => {
          const plan = trainerPlan(state);
          return (
            'Both on the paper to the **left** of the prism, and at least **3 cm** apart: the angular error of a ' +
            'line through two points is roughly the error in either one divided by the gap between them, so a ' +
            'short base is a bad line and the marking says so.' +
            (plan
              ? `\n\nThis pair makes an angle of incidence of about **${one(plan.i)}°** — the bench works out where ` +
                'their line strikes the glass, marks **P** there and dashes in the **normal** in blue.'
              : '')
          );
        },
      },
      fixTheIncidentRay,
    ),
    {
      title: 'Now move your eye round to face AC',
      target: region(RG_RIGHT),
      body:
        'Two dashed circles have appeared beyond the second face. They are the **images of P1 and P2** seen through ' +
        'the glass, and they lie along the real emergent ray — which is the only reason this method works at all. ' +
        'Put your eye down low and line the next pin up with **both** of them.',
    },
    does(
      {
        title: 'Eye a little off, pin a little off',
        target: region(RG_RIGHT),
        highlight: ['pins'],
        body: ({ state }) => {
          const plan = trainerPlan(state);
          return (
            'Like this one: about **4 mm** wide of the line the two images lie along. Hold it against them and you ' +
            'can see it — the pin is not on their line.' +
            (plan
              ? `\n\nFour millimetres there swings the emergent line by about **${one(plan.err)}°**, and the ` +
                'sighting marks are 6 within 1° and 3 within 2°. Nothing on a real bench tells you: you check it ' +
                'yourself, against both images.'
              : '')
          );
        },
      },
      fixTheThirdPinBadly,
    ),
    does(
      {
        title: 'So you pull it out and sight again',
        target: region(RG_RIGHT),
        highlight: ['pins'],
        body:
          'Back in, square on the line of both images — **P3** — and then **P4** further out again, another 3 cm or ' +
          'more. A long base gives a truer line, and two emergent pins close together is where most of the error in ' +
          'this experiment comes from.',
      },
      sightTheEmergentRayProperly,
    ),
    teach
      ? does(
          {
            title: 'What the four pins were standing in for',
            target: tagged('prism-raybox'),
            highlight: ['raybox'],
            body: ({ state }) => {
              const plan = trainerPlan(state);
              return (
                'The lamp, at the same angle as the pins you have just watched go in. The ray bends **towards** the ' +
                'normal at P going in, **away** from it at M coming out, and both turns go the same way — towards ' +
                'the thick end of the wedge, which is the base.' +
                (plan ? ` At this angle it is deviated by about **${one(plan.D)}°**.` : '') +
                '\n\nThe lamp is a teaching aid. It is not your trace, nothing about it is marked, and your own ' +
                'emergent ray still has to be found by sighting.'
              );
            },
          },
          lightTheRayBoxHere,
        )
      : null,
    teach
      ? does(
          {
            title: 'White light, while the lamp is on',
            target: tagged('prism-controls'),
            body:
              'Each colour has its own refractive index — about **1.513 for red, 1.532 for violet** — so each is ' +
              'deviated by its own amount and the single ray opens into a **spectrum**. That splitting is ' +
              '**dispersion**; the turning of any one colour is **deviation**. A demonstration only, and no part of ' +
              'the marked practical.',
          },
          showWhiteLight,
        )
      : null,
    teach
      ? does(
          {
            title: 'Lamp off',
            target: tagged('teach-toggle'),
            body: 'And the paper is a real one again: an outline, four pins, and a pencil.',
            highlight: ['pins'],
          },
          putTheRayBoxAway,
        )
      : null,
    {
      title: 'The joining is yours',
      target: tagged('prism-task'),
      body:
        'With the prism lifted, the line through P1 P2, the line through P3 P4 produced back to **M**, and the join ' +
        'from P to M are the whole trace.\n\nI stop here. **Lift the prism and join the pins** is where the sighting ' +
        `marks are awarded, and this practical wants **${RAYS} rays at clearly different angles** — try something ` +
        'near 35°, 50° and 65°, or the deviation curve will have no dip in it to read.',
    },
  ]);

  // --- the protractor -------------------------------------------------------
  const measure: readonly Step[] = [
    {
      title: 'Nine readings, and the first of each counts',
      target: tagged('console'),
      body:
        'On each of your three rays: **i** between the incident ray and the normal at P, **e** between the ' +
        'emergent ray and the normal at M, and **D** between the incident ray _produced_ and the emergent ray. All ' +
        'nine are marked against **your own trace**, and more than 2° out earns nothing — so I will lay the ' +
        'protractor down and then stop.',
    },
    does(
      {
        title: 'Tapping “measure” lays it on the paper',
        target: tagged('prism-protractor'),
        highlight: ['protractor'],
        body: ({ state }) => {
          const next = nextUnreadAngle(state);
          if (!next) return 'Every angle on this sheet has been read already, so there is nothing to lay it on.';
          const what = next.which === 'D' ? 'D' : `∠${next.which}`;
          return (
            `It goes down in the right place, centred on the right point, with its baseline on the right line — for ` +
            `**${what}** on ray ${next.k + 1}. Reading it is still yours.\n\nCentre on the **point**: for i that is ` +
            '**P**, where your incident ray meets AB. The little hole in the middle of the protractor sits exactly ' +
            'on it, not near it.'
          );
        },
      },
      layTheProtractorDown,
    ),
    {
      title: 'Baseline along the normal — never along the glass',
      target: tagged('prism-reader'),
      body:
        'Zero on the scale is the **normal**, the blue dashed line at right angles to the face. That is the mistake ' +
        'this experiment collects: read from the **surface** instead and you get 90° minus the angle you wanted, ' +
        'and every reading taken that way fails the check **D = i + e − A**.',
    },
    {
      title: 'D is measured somewhere else again',
      target: region(RG_BOARD),
      body:
        'Not at a face at all: the protractor goes down where the **incident ray produced** crosses the emergent ' +
        'ray, with its baseline along that produced ray. It is the angle between where the light was going and ' +
        'where it ended up going — which is what “deviation” means.',
    },
    does(
      {
        title: 'And I lift it without reading anything',
        target: tagged('console'),
        body: ({ state }) =>
          'Drag the magnified pointer onto the ray, or arrow-key it round, or type the number — but it has to be ' +
          `your number. Fill all nine in and the last column checks each ray for you: your D against your ` +
          `i + e − ${APEX}°. A row that disagrees by more than 2° means one of those three was taken off the wrong ` +
          `baseline.` +
          (state.arm ? '' : '\n\n(The protractor was not down, so there was nothing to lift.)'),
      },
      liftTheProtractor,
    ),
  ];

  // --- reading the curve ----------------------------------------------------
  const conclusion: readonly Step[] = [
    {
      title: 'Out of your own table, and nowhere else',
      target: tagged('console'),
      body:
        'Which of **your** three rays came out with the least deviation? Read down your own **D** column and take ' +
        'the smallest number you actually wrote — not the one the theory would have liked. Nothing here gets ' +
        'tapped for you: six marks hang on that pick and they are yours to earn.',
    },
    {
      title: 'The graph carries your three points',
      target: tagged('console'),
      body:
        'Where they are well spread, a parabola is fitted through them and its lowest point marked: that is **your** ' +
        'Dₘ, from your own readings. Three angles bunched together give no dip at all — and saying honestly ' +
        'that you saw no clear trend is worth more than claiming one you did not measure.',
    },
    {
      title: 'Then three short questions',
      target: tagged('console'),
      body:
        'The first is general physics: which way the emergent ray is bent, towards the apex or towards the base. ' +
        'The other two are about **your** numbers — what your D did as i increased, and how your i and e compared ' +
        'on the ray that deviated least. Answer what your table actually shows.',
    },
  ];

  return {
    [STEP.fix]: fix,
    [STEP.trace]: trace,
    [STEP.measure]: measure,
    [STEP.concl]: conclusion,
  };
}

/**
 * WHERE THE TEACH FLAG IS READ. A hook, and passed to the workspace by
 * reference so it is called as one: with the flag off the ray box does not
 * exist, and the steps that light it are never built.
 */
export function usePrismTrainer(ctx: PrismTrainerCtx): Readonly<Record<number, readonly Step[]>> {
  return buildPrismTrainer(ctx, useLabFeature('teach'));
}
