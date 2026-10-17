'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { BASIS, MAX, STEP } from '@labs/lib/stomata/marking';
import { OBJ } from '@labs/lib/stomata/peel';
import type { StomataAction } from '@labs/lib/stomata/reducer';
import type { StomataState } from '@labs/lib/stomata/state';
import {
  addOneDropOfSafranin,
  centreTheField,
  layTheDropOfWater,
  layThePeelInTheDrop,
  layTheLeafLowerSideUp,
  pickTheSlideUp,
  putEverythingDown,
  rackTowardsFocus,
  swingIn,
  takeUpTheForceps,
  takeUpTheNeedle,
  FOUND,
  SHARP,
  type DemoCtx,
} from '@labs/lib/stomata/trainer-demos';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { useLabFeature } from '../lab-features';

import { BENCH_HEIGHT, BENCH_WIDTH, REGIONS } from './bench';

/**
 * THE VISUAL TRAINER: "Show me this step", for the step the student is standing
 * on right now.
 *
 * It is not the tour. The tour is one walk through a whole practical on a
 * SANDBOX leaf; this runs on the student's OWN bench, because the question it
 * answers is "what do I do *here*, with this slide". The workspace snapshots the
 * practical before it starts and puts it back byte for byte afterwards — the
 * state is immutable, so holding the reference IS the copy.
 *
 * This file is the words. The hands are in
 * `@labs/lib/stomata/trainer-demos.ts`, which is pure and says exactly what each
 * demonstration is allowed to touch — and which can therefore be driven from
 * plain Node to prove that none of it moves a mark.
 *
 * WHERE EVERY SCRIPT STOPS. The peel is pulled by the student, the coverslip is
 * lowered by the student, the slide goes on the stage by the student, and the
 * field is brought to sharp focus by the student. Those four acts are what the
 * peel, mount, focus and observation marks are awarded for, and the snapshot
 * going back afterwards is not a reason to do them: a demonstration that did the
 * practical would not be teaching it.
 */
export type StomataTrainerCtx = BenchTourContext<StomataState, StomataAction>;
type Step = TourStep<StomataTrainerCtx>;

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
function Demonstrate({ run, ctx }: { run: (ctx: DemoCtx) => void; ctx: StomataTrainerCtx }): null {
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

// ---------------------------------------------------------------------------
// The demonstrations
// ---------------------------------------------------------------------------

type Region = readonly [x: number, y: number, w: number, h: number];

export function buildStomataTrainer(
  ctx: StomataTrainerCtx,
  teach: boolean,
): Readonly<Record<number, readonly Step[]>> {
  const bench = ctx.stage;
  const find = ctx.find;

  /**
   * A rectangle in BENCH coordinates, mapped to where it actually is on screen.
   * The drawing scales to fit and centres, so it is letterboxed whenever its box
   * has different proportions; scaling by width alone puts the spotlight well
   * away from its subject.
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

  // --- 1. the peel ----------------------------------------------------------
  const peel: readonly Step[] = keep([
    does(
      {
        title: 'Which face is up',
        target: region(REGIONS.leaf),
        highlight: ['obj:flip'],
        body:
          'Watch — nothing I do is marked, and your bench comes back exactly as you left it.\n\nThe first decision is ' +
          'made before anything is touched: **which surface**. On a dorsiventral dicot leaf almost every stoma sits on ' +
          'the shaded **lower** epidermis, so that is the face to peel. The label under the leaf says which way it is ' +
          'lying, and **Turn the leaf over** changes it.',
      },
      layTheLeafLowerSideUp,
    ),
    {
      title: 'Not the green part',
      target: region(REGIONS.leaf),
      highlight: ['obj:leafBody'],
      body:
        'That is the **whole leaf** — epidermis, mesophyll, veins, the other epidermis — many cells thick. A microscope ' +
        'is in focus at one plane at a time, so every setting shows a different layer of it and none of them shows the ' +
        'lot. A thick piece is not a focusing problem; it is a ruined slide.',
    },
    does(
      {
        title: 'The forceps go in your hand first',
        target: region(REGIONS.tools),
        highlight: ['tool:forceps'],
        body:
          'Nothing on this bench happens by itself: you pick a tool up, then tap what to use it on. Tapping the same ' +
          'tool again puts it down, and so does **Put down** under the bench.\n\nForceps, not the mounted needle — the ' +
          'needle tears at the leaf and brings away a shredded scrap.',
      },
      takeUpTheForceps,
    ),
    {
      title: 'And the pull is yours',
      target: region(REGIONS.leaf),
      highlight: ['obj:leafFlap'],
      body:
        'The leaf has already been folded and snapped, and a **thin transparent flap** is hanging off the torn edge. ' +
        'That flap is the epidermis: one cell thick, and you can see straight through it. Grip it there and pull.\n\n' +
        `I stop here on purpose. **${MAX.peel} marks** hang on this one gesture — ${BASIS.peel} — so it is yours to make.`,
    },
    {
      title: 'Then straight into the water',
      target: region(REGIONS.dish),
      highlight: ['obj:dish'],
      body:
        'A peel taken dry to the slide curls towards the side it was attached to, and a fold is two cell layers where ' +
        'there should be one — further apart than the depth of focus, so no setting shows both. Floating lets surface ' +
        'tension pull it open again.',
    },
  ]);

  // --- 2. the mount ---------------------------------------------------------
  const mount: readonly Step[] = keep([
    does(
      {
        title: 'The water goes down first',
        target: region(REGIONS.slide),
        highlight: ['tool:water', 'obj:slide'],
        // Bodies are re-evaluated every render, and the demonstration fires
        // straight after the first paint — so a line conditional on what the
        // demonstration is about to do would only ever be read in its "already
        // done" form. These say what is true either way.
        body:
          'One drop, in the middle of the slide, **before** the specimen. The drop **is** the mount: it fills the ' +
          'space between slide and coverslip so the light passes glass, water, glass with almost no change of ' +
          'refractive index. A peel laid on dry glass has an air gap under every part of it, and air scatters the ' +
          'light into glare — and it starts drying out while you are still working.',
      },
      layTheDropOfWater,
    ),
    does(
      {
        title: 'The brush lifts it, never the forceps',
        target: region(REGIONS.tools),
        highlight: ['tool:brush', 'obj:dish', 'obj:slide'],
        body:
          'The **fine brush**, slid under the floating peel and laid out flat in the drop. A wet peel folds and tears ' +
          'on metal points, and a torn peel has very little left in it to look at: that is the whole reason for a ' +
          'brush on this bench.',
      },
      layThePeelInTheDrop,
    ),
    does(
      {
        title: 'One drop of safranin, or two',
        target: region(REGIONS.slide),
        highlight: ['tool:safranin', 'obj:slide'],
        body:
          'An epidermal peel is almost colourless on its own. Safranin is a **basic** dye — its coloured part carries a ' +
          'positive charge — so it is held wherever it meets a negative one: the lignin and pectin of the cell walls, ' +
          'and the phosphate backbone of the DNA in the nucleus. Walls and nuclei come up red while the watery ' +
          'cytoplasm stays almost clear.\n\nStop at one or two. Once every binding site is taken the dye simply sits ' +
          'about in the cell and the whole peel goes dark together — and contrast is a **difference**.',
      },
      addOneDropOfSafranin,
    ),
    does(
      {
        title: 'The coverslip comes down on the needle',
        target: region(REGIONS.cover),
        highlight: ['tool:needle', 'tool:cover'],
        body:
          'Hold it on the point of the needle and let **one edge** touch the liquid first. Capillary action draws the ' +
          'liquid along under the falling glass, and the advancing front sweeps the air out ahead of it. Drop it flat ' +
          'and the whole face lands at once: the air in the middle has nowhere to go and is sealed in as bubbles.\n\n' +
          'The needle is in my hand; the coverslip is not. **That press is worth 4 marks and it ends this step**, so ' +
          'it is yours.',
      },
      takeUpTheNeedle,
    ),
    {
      title: 'And the blotting paper last of all',
      target: region(REGIONS.tools),
      highlight: ['tool:blot', 'obj:slide'],
      body:
        'Touched to the **edge** of the coverslip, after it is down, it draws off the surplus by capillarity and lets ' +
        'the glass settle. Too much liquid and the coverslip floats instead of resting, so the mount drifts about ' +
        'while you are trying to focus on it. Blot **before** the coverslip and all you have done is dry the specimen ' +
        'out.',
    },
    teach
      ? {
          title: 'What the switch under the bench holds',
          target: tagged('teach-toggle'),
          body:
            '**What’s happening** is the whole of the reasoning behind those four moves — why the drop goes first, ' +
            'what the safranin is binding to, why a trapped bubble ruins the patch it sits on, and what the blotting ' +
            'is for. It never says a word about **your** slide, so there is nothing in it to give anything away. Open ' +
            'it whenever you like; it costs nothing and it is marked nowhere.',
        }
      : null,
    does(
      {
        title: 'Hands free',
        target: region(REGIONS.tools),
        body: 'Yours is next. Water, peel, stain, coverslip on the needle, blot — in that order.',
      },
      putEverythingDown,
    ),
  ]);

  // --- 3. checking the mount ------------------------------------------------
  const check: readonly Step[] = keep([
    {
      title: 'Look at the slide before the microscope does',
      target: tagged('st-closeup'),
      body:
        'The close-up beside the task is the slide from **above**, at the size it really is, with the field of view ' +
        'the objective will see drawn on it as a dashed circle — and under it a strip showing the mount in section. ' +
        'Everything that is wrong with a mount is easier to see here than down an eyepiece.',
    },
    {
      title: 'Count the bubbles now, not later',
      target: region(REGIONS.slide),
      highlight: ['obj:slide'],
      body: ({ state }) =>
        (state.slide.bubbles.length
          ? `There are **${state.slide.bubbles.length}** under your coverslip. `
          : 'There are none under yours. ') +
        'A bubble is air with water curved round it, which makes it a strong little lens: it throws the light out of ' +
        'the eyepiece’s path and comes up as a bright disc in a thick black ring. Nothing under it can be seen — and ' +
        'what cannot be seen cannot be counted. **Discard the mount** under the bench and make another one; it costs ' +
        '2 marks, and a field full of black rings costs more.',
    },
    does(
      {
        title: 'Then it goes to the microscope',
        target: region(REGIONS.slide),
        highlight: ['obj:slide', 'obj:stage'],
        body:
          'Tap the slide with empty hands and it comes up into them — that much I can do. The tap on the **stage** is ' +
          'yours, and it ends this step.\n\nNever put an uncovered wet mount there: the objective would go straight ' +
          'into the liquid.',
      },
      pickTheSlideUp,
    ),
  ]);

  // --- 4. low power ---------------------------------------------------------
  const low: readonly Step[] = keep([
    does(
      {
        title: 'Always the 10× first',
        target: region(REGIONS.objectives),
        highlight: ['mic:obj10'],
        body:
          `Its field is **${(OBJ[10].fieldR * 2).toFixed(2)} mm** across against the 40×’s ` +
          `**${(OBJ[40].fieldR * 2).toFixed(2)} mm** — four times the width, sixteen times the area — and its depth of ` +
          'focus is about five times deeper. That is what makes it possible to find anything at all. A specimen is ' +
          'almost never mounted in the middle of a slide.',
      },
      swingIn(10),
    ),
    does(
      {
        title: 'Rack up, watching the gap from the side',
        target: region(REGIONS.knobs),
        highlight: ['mic:coarseUp'],
        body:
          'The **coarse** knob, one direction at a time. Watch the side view beside the eyepiece while you do it: it ' +
          'shows the front lens, the slide, and the gap closing between them, with the red band marking where the ' +
          'lens is **into** the coverslip.\n\nA blur that is getting darker and more definite is a blur you are moving ' +
          'towards.',
      },
      rackTowardsFocus('coarse', FOUND),
    ),
    {
      title: 'The last half-turn is yours',
      target: region(REGIONS.eye),
      body: ({ state }) =>
        `The field is close now — sharpness is what the **focus** marks are read from, and finding it on low power ` +
        `first is 4 of the ${MAX.focus}. Keep turning the same way, a little at a time, until the pale jigsaw of ` +
        'epidermal cells comes up with darker pores scattered through it.' +
        (state.slide.peel?.thick
          ? '\n\nThough not on this peel. It is several cells thick, and no knob fixes that — only a thinner peel.'
          : ''),
    },
    does(
      {
        title: 'Then centre it, before touching the objectives',
        target: region(REGIONS.stagepad),
        highlight: ['mic:panU', 'mic:panD', 'mic:panL', 'mic:panR'],
        body:
          'The stage controls walk the slide about under the lens. At 40× you will see about a **sixteenth of the ' +
          'area** you have now, and the two objectives agree only about the centre of the field — so whatever is off ' +
          'to one side here will simply not be in the high-power field at all.\n\nThis is the move students skip, and ' +
          'it is the one that makes 40× look empty.',
      },
      centreTheField,
    ),
  ]);

  // --- 5. high power --------------------------------------------------------
  const high: readonly Step[] = keep([
    does(
      {
        title: 'Now the 40× swings round',
        target: region(REGIONS.objectives),
        highlight: ['mic:obj40'],
        body:
          'The two objectives are nearly parfocal, so the image stays roughly where it was — just much bigger, much ' +
          'dimmer, and much softer. Nothing has gone wrong: the depth of focus has collapsed to about a fifth of what ' +
          'it was, so the plane you were focused on is no longer the only one that looked sharp.',
      },
      swingIn(40),
    ),
    does(
      {
        title: 'Fine adjustment, a little at a time',
        target: region(REGIONS.knobs),
        highlight: ['mic:fineUp'],
        body:
          'Depth of focus falls roughly as the square of the aperture, and the 40× gathers a far wider cone of light ' +
          'than the 10×. The same turn of the knob that barely softens a low-power image throws the high-power one ' +
          'away completely — which is the entire reason a microscope has a second, slower knob.\n\nThe magnified ' +
          'eyepiece beside your count has its own **Fine ▲ ▼**, so you can focus with your eyes on the thing you are ' +
          'focusing.',
      },
      rackTowardsFocus('fine', SHARP),
    ),
    {
      title: 'And the last of it is yours',
      target: tagged('st-eyepiece'),
      body:
        'Sharp is when the two bean-shaped **guard cells** come apart from the slit between them and the grains inside ' +
        'them resolve. **6 of the focus marks** are for a sharp high-power field, 4 for a usable one, 2 for a poor ' +
        'one — and the observation table is marked against the field you actually had, so it is worth the extra ' +
        'quarter-turn.',
    },
    {
      title: 'Never the coarse knob at this magnification',
      target: region(REGIONS.gauge),
      highlight: ['mic:coarseUp'],
      body:
        'The 40× barrel is the longer one and works a fraction of a millimetre from the coverslip. The stage is driven ' +
        'by a rack and pinion that has no idea what is above it, so a coarse turn that was harmless at 10× drives the ' +
        'lens straight through the glass. **6 marks off, every time**, and the mount is gone with it.\n\nThat is what ' +
        'the gap gauge is for. Look at it, not at the knob.',
    },
  ]);

  // --- 6. recording ---------------------------------------------------------
  const record: readonly Step[] = keep([
    {
      title: 'This step is marked on what YOU see',
      target: tagged('st-eyepiece'),
      body:
        'So I will fill in nothing at all — only show you where to look. The magnified eyepiece beside the count is ' +
        'the same field as the one on the microscope, drawn from the same peel; it is bigger because a stoma at 40× is ' +
        'a few pixels on the bench and nobody can honestly count what they cannot resolve.',
    },
    {
      title: 'Count in rows, and only what you can see',
      target: tagged('st-eyepiece'),
      body:
        'Work across one row of the field and then the next, so nothing is counted twice or missed. A stoma under a ' +
        'bubble is **not visible**, so it is not counted — and the marking agrees with you about that: it counts the ' +
        `same field you are looking at. ${BASIS.count}.`,
    },
    {
      title: 'Then the six lines, including the unflattering ones',
      target: tagged('console'),
      body:
        'Every line is marked against **this** field at the moment you submit, not against the textbook. "Bubbles ' +
        'present" and "the image was blurred" are worth exactly as much as the flattering answers, and writing ' +
        '"chloroplasts present" on a field too soft to resolve them is marked wrong even though the biology is right.',
    },
    {
      title: 'And four names on the magnified view',
      target: tagged('console'),
      body:
        'Open **Drawing**. Four pins, five names — one of the five is not pinned at all. The bean-shaped pair, the ' +
        'slit between them, the jigsaw cells around them, and the green grains that only the guard cells carry: the ' +
        'ordinary epidermis is transparent on purpose, so that light reaches the mesophyll underneath, and transparent ' +
        'means no chloroplasts.',
    },
    teach
      ? {
          title: 'The panel will not do it for you',
          target: tagged('teach-toggle'),
          body:
            '**What’s happening** explains the stoma, the guard cells and the wet mount, and it is blind to your ' +
            'slide — it cannot see the peel, the stain, the bubbles, the objective or the field, so it cannot name, ' +
            'count or judge any of them. Read it for the biology. The counting stays yours.',
        }
      : null,
  ]);

  // --- 7. the conclusion ----------------------------------------------------
  const concl: readonly Step[] = [
    {
      title: 'Two blanks, and the first is about your own slide',
      target: tagged('console'),
      body: ({ state }) =>
        'It asks which surface **you** peeled, and it is marked against the peel actually on your slide' +
        (state.slide.peel ? '' : ' — and there is none on it at the moment') +
        '. A conclusion that contradicts your own work loses the mark even when it sounds like the right answer. If ' +
        'you peeled the upper face and saw almost nothing, **say so**: that observation earns marks, and stomata you ' +
        'did not see do not.',
    },
    {
      title: 'The second is the general fact',
      target: tagged('console'),
      body:
        'A stoma has to be open for the leaf to feed, and every moment it is open the leaf is losing water. The lower ' +
        'surface is shaded and cooler and the damp air against it is not stirred away as fast, so a pore there loses ' +
        'less water for the same exchange of gas; the upper surface gets a thicker waxy cuticle instead.\n\nIt is not ' +
        'a rule about up and down — a floating lily leaf reverses it entirely — it is about where water is cheap.',
    },
    {
      title: 'Both are marked, so I press neither',
      target: tagged('stats'),
      body: `${BASIS.concl}. Choose one for each blank and submit.`,
    },
  ];

  // --- 8. the viva ----------------------------------------------------------
  const viva: readonly Step[] = [
    {
      title: 'Five questions, and the first answer counts',
      target: tagged('console'),
      body:
        'So there is nothing to gain from a quick guess, and nothing here gets pressed for you. Read all four options ' +
        'before you touch one — two of them usually differ by a single word.',
    },
    {
      title: 'Every one of them comes off this bench',
      target: tagged('console'),
      body:
        'Why the lower epidermis, why the peel is floated, what the safranin binds to, why the coverslip goes down on ' +
        'a needle, and what the guard cells do with the chloroplasts that no other epidermal cell has. You have just ' +
        'done all five.',
    },
    {
      title: 'The explanation is the part worth reading',
      target: tagged('console'),
      body:
        'It appears the moment you answer, right or wrong, with the passage from the chapter beside it. **Theory** in ' +
        'the notebook has the same chapter open if you want to read it first.',
    },
  ];

  return {
    [STEP.peel]: peel,
    [STEP.mount]: mount,
    [STEP.check]: check,
    [STEP.low]: low,
    [STEP.high]: high,
    [STEP.record]: record,
    [STEP.concl]: concl,
    [STEP.viva]: viva,
  };
}

/**
 * WHERE THE TEACH FLAG IS READ. A hook, and passed to the workspace by
 * reference so it is called as one: with the flag off, the steps that point at
 * the teaching layer are never built, so a student cannot tell it exists.
 */
export function useStomataTrainer(
  ctx: StomataTrainerCtx,
): Readonly<Record<number, readonly Step[]>> {
  return buildStomataTrainer(ctx, useLabFeature('teach'));
}
