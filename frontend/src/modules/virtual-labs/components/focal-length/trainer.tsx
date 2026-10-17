'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { STEP } from '@labs/lib/focal-length/marking';
import {
  OBJECTS,
  OPT,
  cm1,
  screenView,
  setupFor,
  type PartId,
} from '@labs/lib/focal-length/optics';
import type { FocalLengthAction } from '@labs/lib/focal-length/reducer';
import type { FocalLengthState } from '@labs/lib/focal-length/state';
import {
  aimAtSomethingDistant,
  creepBackToTheFocus,
  hideTheRays,
  mountTheLens,
  moveOnToTheNextTrial,
  overshootTheFocus,
  showTheRays,
  startShortOfTheFocus,
  takeHoldOfTheOptic,
  takeHoldOfTheScreen,
  type DemoCtx,
} from '@labs/lib/focal-length/trainer-demos';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { useLabFeature } from '../lab-features';

import {
  BENCH_HEIGHT,
  BENCH_WIDTH,
  RG_MIRROR_RUN,
  RG_SCREEN_RUN,
  RG_SPARE,
  RG_WINDOW,
  RG_ZOOM,
  type Region,
} from './geometry';

/**
 * THE VISUAL TRAINER: "Show me this step", on the bench as it stands.
 *
 * The tour walks the whole apparatus once, on a sandbox bench. This does the
 * one thing the current step asks for, on the student's own bench, and hands it
 * back exactly as it was — the workspace snapshots before it runs and restores
 * after, and our state is immutable, so holding the reference is the copy.
 *
 * WHAT IT WILL NOT DO, and the reason is the same both times:
 *
 * - **It never presses Record, Ready, Submit or the means.** Those are the
 *   marked acts: the judgement of "sharp enough" is 4 marks of every trial, and
 *   the two scale readings are 4 more. A demonstration that typed them would
 *   have taken the practical away even though the snapshot puts them back.
 * - **It never moves the procedure on.** The demonstrations are keyed to the
 *   step they were built for, so a step that completed itself would change the
 *   script out from under itself. Every one of them stops one press short.
 *
 * It also never chooses the Sun or the candle to show what happens: both cost
 * four set-up marks and log a mistake in the student's own log. The refusal is
 * worth knowing about, so it is described rather than performed.
 *
 * The steps that use the drawn RAYS are dropped when the `teach` flag is off —
 * with no switch on the bench bar there is nothing to demonstrate.
 */
export type FocalLengthTrainerCtx = BenchTourContext<FocalLengthState, FocalLengthAction>;
type Step = TourStep<FocalLengthTrainerCtx>;

// ---------------------------------------------------------------------------
// Doing the thing
// ---------------------------------------------------------------------------

/** Runs a step's actions once, as it opens. See the glass slab's trainer. */
function Demonstrate({
  run,
  ctx,
}: {
  run: (ctx: DemoCtx) => void;
  ctx: FocalLengthTrainerCtx;
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

// ---------------------------------------------------------------------------
// Hands on the bench: what a demonstration is allowed to touch
// ---------------------------------------------------------------------------

const word = (part: PartId): string => (part === 'mirror' ? 'mirror' : 'lens');

// ---------------------------------------------------------------------------
// The demonstrations
// ---------------------------------------------------------------------------

/**
 * The demonstrations, keyed by procedure step.
 *
 * `teach` is a parameter rather than a hook call, so this stays a plain
 * function: the flag is read once, by the hook below, and every step that
 * depends on the drawn rays is left OUT of the set rather than skipped when it
 * runs.
 */
export function buildFocalLengthTrainer(
  ctx: FocalLengthTrainerCtx,
  teach: boolean,
): Readonly<Record<number, readonly Step[]>> {
  const bench = ctx.stage;
  const find = ctx.find;

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

  /** Aiming the optic at something distant, for either half of the practical. */
  const setUpScript = (part: PartId): readonly Step[] =>
    keep([
      part === 'lens'
        ? does(
            {
              title: 'The lens goes into the stand',
              target: region(RG_SPARE),
              highlight: ['spare'],
              body:
                'The convex lens is lying at the front of the bench. It goes into the stand and the mirror comes ' +
                'out — same stand, same scale, a different optic.',
            },
            mountTheLens,
          )
        : null,
      {
        title: part === 'mirror' ? 'How the bench stands' : 'The screen changes sides',
        target: region(part === 'mirror' ? RG_MIRROR_RUN : RG_SCREEN_RUN),
        highlight: ['comp', 'scr'],
        body:
          part === 'mirror'
            ? 'The concave mirror faces the window. The screen stands **between the window and the mirror**, held ' +
              'just clear of the beam so it does not shade it — the light comes back towards where it came from.'
            : 'Light goes **through** a lens and converges behind it, so the screen now belongs on the **far side**. ' +
              'That is the one thing that changes: the method, the scale and the arithmetic are the same.',
      },
      does(
        {
          title: 'Aim it at something genuinely distant',
          target: region(RG_WINDOW),
          body: ({ state }) => {
            const chosen = state.obj[part];
            return (
              'Everything in this experiment rests on the object being far enough away. Rays from one point of a ' +
              'tree 120 m off reach a 5 cm mirror spread over about **two hundredths of a degree** — parallel, for ' +
              'this purpose — and parallel rays meet in the **focal plane**, which is what makes the distance you ' +
              'measure **f** and not something else.' +
              (chosen && OBJECTS[chosen].far
                ? `\n\nYou have already aimed at ${OBJECTS[chosen].name}, which is far enough, so I have left it.`
                : '\n\nYour own choice comes back the moment I finish — and **Ready** is yours to press, because ' +
                  'that choice is the set-up mark.')
            );
          },
        },
        aimAtSomethingDistant(part),
      ),
      {
        title: 'The Sun is not one of the choices',
        target: tagged('console'),
        body:
          '**Never** look at the Sun through a lens or a mirror, and never use it as the object here. A lens ' +
          'concentrates sunlight enough to char paper; focused on the retina it burns it permanently, and there is ' +
          'no pain to warn you. The bench refuses it outright — and it takes **4 set-up marks** off for asking, so ' +
          'I am not going to press it to show you.',
      },
      {
        title: 'Nor is the candle, for a quieter reason',
        target: tagged('console'),
        body:
          'The candle stands on the bench a few tens of centimetres away. Its rays arrive still **spreading**, so ' +
          'the sharp image forms where **1/v = 1/f − 1/u** puts it — out beyond the focus. You would measure **v**, ' +
          'not f' +
          (teach
            ? ', and the zoom panel says so outright: its label changes from FOCAL PLANE to THIS IS v, NOT f. '
            : '. ') +
          'It costs 4 marks too, so take it from the ray diagram rather than from your own set-up.',
      },
      {
        title: 'Then press Ready yourself',
        target: tagged('console'),
        body:
          'That press starts the focusing and settles the set-up marks, so it is yours. A distant tree or the water ' +
          `tank across the road — either is far enough for the ${word(part)}.`,
      },
    ]);

  /** The search for the sharp image, and the two readings that come out of it. */
  const focusScript = (part: PartId): readonly Step[] =>
    keep([
      does(
        {
          title: 'Take hold of the screen',
          target: region(RG_SCREEN_RUN),
          highlight: ['scr'],
          body:
            'Tap its stand on the bench, or the **Screen** button in the bar underneath. Whatever you tap last is ' +
            'what the arrow keys and the close-up follow — 1 mm at a time, or 1 cm with **Shift**.',
        },
        takeHoldOfTheScreen,
      ),
      does(
        {
          title: 'Start well short of it',
          target: tagged('fl-closeup'),
          highlight: ['scr'],
          body:
            'On purpose, so you can see what **off** looks like: a wide, dim patch on the card. Away from the focal ' +
            'plane every point of the object spreads into a blur circle, and the further away the screen is, the ' +
            'wider that circle gets.',
        },
        startShortOfTheFocus(part),
      ),
      teach
        ? does(
            {
              title: 'Leave the rays on while you hunt',
              target: tagged('teach-toggle'),
              body:
                'They draw the light itself — the beam arriving, the cone closing to a point and opening out again ' +
                'past it — and the cone is the whole explanation of what the card is showing. A real optical bench ' +
                'shows you **none** of it: there is nothing in the air to see, only the patch on the card. It is a ' +
                'teaching aid and it is **not marked**.',
            },
            showTheRays,
          )
        : null,
      {
        title: 'The patch is a slice of that cone',
        target: teach ? region(RG_ZOOM) : tagged('fl-closeup'),
        body:
          'Where the screen stands, it cuts the cone across; the width of the cut is the width of the patch. So the ' +
          'hunt for focus is the hunt for the **one plane** where the cut is a point — and there is only one.' +
          (teach
            ? '\n\nThe strip above the bench is that stretch magnified, with the screen sliding through it. Seven ' +
              'centimetres of bench, and a millimetre bar in the corner to read the blur against.'
            : ''),
      },
      does(
        {
          title: 'Overshoot, on purpose',
          target: tagged('fl-closeup'),
          highlight: ['scr'],
          body:
            'Past the focus the cone opens out again and the blur grows back. Going too far deliberately is how you ' +
            'find out that you have passed it: a blur that is growing tells you which way to come back.',
        },
        overshootTheFocus(part),
      ),
      does(
        {
          title: 'Now creep back a millimetre at a time',
          target: tagged('fl-closeup'),
          highlight: ['scr'],
          body:
            'Watching the blur circle close towards a point. A stand is pushed by hand, so it never lands on an ' +
            'exact millimetre — which is exactly why the position has to be **read off the scale** afterwards ' +
            'rather than remembered from the push.',
        },
        creepBackToTheFocus(part),
      ),
      teach
        ? {
            title: 'The green band is a millimetre of blur',
            target: region(RG_ZOOM),
            body:
              'Inside it the blur circle is under **1 mm** across, which is as sharp as this bench goes — and it is ' +
              'one short stretch of bench only. Watch the yellow stroke through the screen shut towards a point as ' +
              'you come into the band, and open out again if you go past it.\n\nThe panel measures. It never says ' +
              '**stop**: that call is the one being marked.',
          }
        : null,
      {
        title: 'How sharp is sharp enough',
        target: tagged('fl-closeup'),
        stay: true,
        body: ({ state }) =>
          'In the close-up the dashed circle **is** the blur circle, and at the focal plane it shuts to a dot. ' +
          `Under **${cm1(OPT.sharp * 10)} mm** across counts as sharp and takes all 4 focus marks; under ` +
          `**${cm1(OPT.okBlur * 10)} mm** takes 2; wider than that takes none.\n\nDeciding when you are there is ` +
          'yours — it is the judgement the trial is really testing, and it is why I am not pressing **Record**.' +
          (screenView(setupFor(part, state), state.pos[state.part].scr).lit
            ? ''
            : '\n\nNothing is on the card at the moment — the screen is on the wrong side of the optic.'),
      },
      does(
        {
          title: 'Then the reading, and the magnifier',
          target: tagged('fl-scale'),
          highlight: ['comp'],
          body: ({ state }) =>
            `Select the ${word(state.mounted)} and the magnifier slides under **its** stand. Each small division of ` +
            'the metre scale is one millimetre, so the **least count is 0.1 cm**: read the red index mark against ' +
            'it with your eye straight over the mark, and never write a figure finer than the least count.',
        },
        takeHoldOfTheOptic,
      ),
      does(
        {
          title: 'And the screen, the same way',
          target: tagged('fl-scale'),
          highlight: ['scr'],
          body:
            'Two positions, one scale. **f = |a − b|** — you never measure a focal length directly, you measure two ' +
            'marks and subtract.\n\nI am not going to say what either of them reads. Both are marked against where ' +
            'the stands really are, within one least count, and they are the other half of every trial.',
        },
        takeHoldOfTheScreen,
      ),
      does(
        {
          title: 'Then move it, and do it again',
          target: region(RG_MIRROR_RUN),
          highlight: ['comp'],
          body: ({ state }) =>
            `Watch what happens: the ${word(state.mounted)} shifts, and the sharp image goes with it. That is why a ` +
            `second reading of the same set-up is not a second trial — move it at least **${OPT.moveBetweenTrials} ` +
            'cm** and find the focus again, three times over.\n\n**Record** is yours to press, on your own two ' +
            'numbers.',
        },
        moveOnToTheNextTrial,
      ),
    ]);

  const meanScript: readonly Step[] = [
    {
      title: 'This one is arithmetic on your own numbers',
      target: tagged('console'),
      body:
        'So the bench will not do it for you — it will only show you where the numbers are. Your three values of f ' +
        'are in the **f column** of the table: |a − b| for each trial, worked out from the readings you typed.',
    },
    {
      title: 'Add the three and divide by three',
      target: tagged('console'),
      body:
        'Keep two decimals, the way the table keeps them: a mean is no more precise than the readings behind it. ' +
        'Then the same again for the convex lens, from its own three trials.',
    },
    {
      title: 'What is actually marked here',
      target: tagged('stats'),
      body:
        'The mean **following from your own three trials**, not landing near the true focal length — that is the ' +
        'conclusion’s business. So use your numbers even if a trial went badly: a mean that matches your table ' +
        'scores in full, and an invented one does not.',
    },
  ];

  const conclusionScript: readonly Step[] = [
    {
      title: 'It has to follow from your two means',
      target: tagged('console'),
      body:
        'They are printed at the top of this card, and they are the only two numbers the statement has to agree ' +
        'with. Look at which of them is the **smaller**, and pick the statement that says so — not the one that is ' +
        'usually true of mirrors and lenses.',
    },
    {
      title: 'What a short focal length means',
      target: tagged('console'),
      body:
        'f is the distance from the pole, or the optical centre, out to the focal plane. The **shorter** it is, the ' +
        'harder that optic has to bend parallel rays to bring them to a point — which is the whole physical content ' +
        'of the comparison you are being asked for.',
    },
    {
      title: 'Where the eight marks are',
      target: tagged('stats'),
      body:
        'Half of them are for each mean sitting within a centimetre of this bench’s real focal lengths — that is ' +
        'your measuring. The other half are for the statement being true to **your own table** — that is your ' +
        'honesty. The choice is yours to make, so nothing here gets tapped for you.',
    },
  ];

  return {
    [STEP.setupM]: setUpScript('mirror'),
    [STEP.mirror]: focusScript('mirror'),
    [STEP.setupL]: setUpScript('lens'),
    [STEP.lens]: focusScript('lens'),
    [STEP.mean]: meanScript,
    [STEP.concl]: conclusionScript,
  };
}

/**
 * WHERE THE TEACH FLAG IS READ. A hook, and passed to the workspace by
 * reference so it is called as one: with the flag off the steps that use the
 * drawn rays are never built, so a student cannot tell the layer exists.
 */
export function useFocalLengthTrainer(
  ctx: FocalLengthTrainerCtx,
): Readonly<Record<number, readonly Step[]>> {
  return buildFocalLengthTrainer(ctx, useLabFeature('teach'));
}
