'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { PER_SLIDE_TABLE_MARKS, STEP, TRAY_SIZE } from '@labs/lib/cell-division/marking';
import { LAMPS, OBJECTIVES, totalMagnification } from '@labs/lib/cell-division/optics';
import type { CellDivisionAction } from '@labs/lib/cell-division/reducer';
import { mountedSlide, type CellDivisionState } from '@labs/lib/cell-division/state';
import {
  FIELD_MM,
  centreTheSpecimen,
  clipTheSlideOn,
  rackToFocus,
  readyTheInstrument,
  swingIn,
  turnTheLampUp,
  type DemoCtx,
} from '@labs/lib/cell-division/trainer-demos';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { useLabFeature } from '../lab-features';

import { BENCH_HEIGHT, BENCH_WIDTH, REGION } from './microscope';

/**
 * THE VISUAL TRAINER: "Show me this step", for the step the student is standing
 * on right now.
 *
 * It is not the tour. The tour is one walk through the whole bench on a SANDBOX
 * microscope; this runs on the student's OWN instrument, with their own slide on
 * the stage, because the question it answers is "what do I do *here*". The
 * workspace snapshots the practical before it starts and puts it back byte for
 * byte afterwards — the state is immutable, so holding the reference IS the copy.
 *
 * This file is the words. The hands are in
 * `@labs/lib/cell-division/trainer-demos.ts`, which is pure and says exactly what
 * each demonstration may touch — and which can therefore be driven from plain
 * Node to prove that none of it moves a mark.
 *
 * THE NO-LEAK RULE, which matters more here than on any other bench in the set.
 * What is marked is naming the organism, naming the process, naming the three
 * pointers and saying what was in the field. So the trainer drives the
 * instrument and says **nothing whatever** about what comes up in it — not even
 * "you can see it now". It demonstrates on the slide already under the
 * objective, so it cannot be read as a hint about a different one, and it stops
 * dead at the reference plate.
 */
export type CellDivisionTrainerCtx = BenchTourContext<CellDivisionState, CellDivisionAction>;
type Step = TourStep<CellDivisionTrainerCtx>;

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
function Demonstrate({
  run,
  ctx,
}: {
  run: (ctx: DemoCtx) => void;
  ctx: CellDivisionTrainerCtx;
}): null {
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

export function buildCellDivisionTrainer(
  ctx: CellDivisionTrainerCtx,
  teach: boolean,
): Readonly<Record<number, readonly Step[]>> {
  const bench = ctx.stage;
  const find = ctx.find;

  /**
   * A rectangle in BENCH coordinates, mapped to where it actually is on screen.
   * The drawing scales to fit and centres, so it is letterboxed whenever its box
   * has different proportions; scaling by width alone lands the spotlight well
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

  // --- 1. setting the instrument up -----------------------------------------
  const setup: readonly Step[] = keep([
    does(
      {
        title: 'Look at the two objectives first',
        target: region(REGION.nose),
        highlight: ['obj:40'],
        body:
          `Watch — nothing I do is marked, and your bench comes back exactly as you left it.\n\nThe **40×** barrel ` +
          `hangs ${OBJECTIVES[40].barrel} units below the nosepiece against the 10×’s ${OBJECTIVES[10].barrel}, and ` +
          `it works **${OBJECTIVES[40].wd} units from the coverslip** against ${OBJECTIVES[10].wd}. Swing it in and ` +
          'the room over the stage nearly vanishes.',
      },
      swingIn(40),
    ),
    does(
      {
        title: 'Then the light',
        target: region(REGION.lamp),
        highlight: ['lamp'],
        body:
          `The dial in the base has four positions — ${LAMPS.join(', ')}. **Medium** suits the 10×; the 40× takes in a ` +
          'much narrower cone of light and wants the brighter settings, which is why swinging it in makes the field go ' +
          'dim before it goes soft.\n\nAnd a dark field is never evidence that a slide is empty.',
      },
      turnTheLampUp,
    ),
    {
      title: 'The last press is yours',
      target: region(REGION.nose),
      highlight: ['obj:10'],
      body:
        'The **10×** has to be the objective in place **before** a slide goes under the clips — with the 40× swung in ' +
        'there is not even room to get one in, and putting one there anyway costs marks and risks the coverslip.\n\n' +
        'I am leaving that press to you: it finishes the set-up, and the set-up is marked.',
    },
  ]);

  // --- 2. one slide, from the box to a high-power view -----------------------
  const slides: readonly Step[] = keep([
    does(
      {
        title: 'Every slide starts the same way',
        target: region(REGION.lamp),
        highlight: ['lamp', 'obj:10'],
        body:
          'Lamp on, **10×** in. Checking that before each slide costs a second; discovering it afterwards costs the ' +
          'slide.\n\nNothing I do here is marked, and your bench comes back exactly as it is now.',
      },
      readyTheInstrument,
    ),
    does(
      {
        title: 'Under the clips',
        target: region(REGION.tray),
        // The body is re-evaluated every render and the demonstration fires
        // right after the first paint, so it names the slide it ENDS on rather
        // than describing a stage that is about to stop being empty.
        body: ({ state }) =>
          `Slide **${mountedSlide(state)?.n ?? '—'}** is the one I am working with — whichever was already under the ` +
          'clips, or the next one that is not finished with if the stage was empty.\n\n**What is on it is still for ' +
          'you to find out.** The number on the label says nothing about the specimen, and the box is dealt from your ' +
          'own bench number, so your neighbour’s slide 3 is not yours.',
      },
      clipTheSlideOn,
    ),
    does(
      {
        title: 'Rack down on the coarse adjustment',
        target: region(REGION.knobs),
        highlight: ['rack:coarse'],
        body:
          `A prepared slide is almost never mounted in the middle, and the six in your box are not all mounted at the ` +
          `same thickness — so each one has to be focused for itself. At 10× the field is **${FIELD_MM.low.toFixed(1)} ` +
          'mm** across, which is wide enough that something comes up.',
      },
      rackToFocus('coarse'),
    ),
    {
      title: 'And watch it from the side while it comes down',
      target: region(REGION.knobs),
      highlight: ['rack:coarse'],
      body:
        'Then, once your eye is at the eyepiece, focus **upwards** — away from the slide. Racking down blindly while ' +
        'looking down the tube is how coverslips break, and there is no spare of any slide in that box.',
    },
    does(
      {
        title: 'Walk the stage until it is in the middle',
        target: region(REGION.stage),
        highlight: ['mv:r', 'mv:d'],
        body:
          'The four arrows drive the mechanical stage a step at a time. You can also **press a point in the field** ' +
          'to bring it to the centre in one go, or drag the image itself — and the specks of dust drifting past are ' +
          'how you know the stage moved at all.',
      },
      centreTheSpecimen,
    ),
    {
      title: 'Centring at low power is the whole trick',
      target: region(REGION.eye),
      body:
        `The 40× field is **${FIELD_MM.high.toFixed(2)} mm** across against the 10×’s ${FIELD_MM.low.toFixed(1)} — ` +
        'about a quarter of the width and a sixteenth of the area. Anything left off to one side here does not become ' +
        'hard to find at high power; it is simply **not in the field at all**, and there is far too little depth of ' +
        'focus at 40× to go hunting.',
    },
    does(
      {
        title: 'Then the 40× goes in',
        target: region(REGION.nose),
        highlight: ['obj:40'],
        body: `${totalMagnification(40)}× total, with the eyepiece. The image stays roughly where it was — the two are nearly parfocal — but it goes dim and soft at once.`,
      },
      swingIn(40),
    ),
    does(
      {
        title: 'Refocus on the FINE adjustment only',
        target: region(REGION.knobs),
        highlight: ['rack:fine'],
        body:
          `The depth of field falls from ${OBJECTIVES[10].dof} units to ${OBJECTIVES[40].dof}. One click of the coarse ` +
          'knob at this magnification throws the image away completely, and two more put the objective through the ' +
          'coverslip — which is why the instrument has a second, slower knob at all.',
      },
      rackToFocus('fine'),
    ),
    {
      title: 'Lamp, low power, find, centre, high power, fine focus',
      target: region(REGION.meters),
      body:
        'That is the whole method, and it is the same for every slide in the box. The three bars under the field are ' +
        'the instrument telling you how it is set — sharpness, how much of the specimen is inside the field, and how ' +
        'well the lamp suits the objective. All three have to be up before the pointers will resolve.',
    },
    {
      title: 'And what is in the field is yours to read',
      target: tagged('cd-plate'),
      body:
        'I am not going to name it, and neither will the plate beside you — it is a reference sheet of every stage the ' +
        'six slides could show, not a key to this one. Look at the **whole** field: is one parent divided into two ' +
        'daughters of the same size with no parent left over, or is there a smaller outgrowth on a parent that is ' +
        'still there and carrying on? Some of these slides show neither.',
    },
    {
      title: 'Which is why the three pointers stay empty too',
      target: region(REGION.eye),
      body:
        'Each takes a name from a list that also holds structures that are **not** on this slide. The organism, the ' +
        'process and the three names are all marked, and the number on the label tells you nothing about any of them.',
    },
    teach
      ? {
          title: 'The panel under the bench explains the biology',
          target: tagged('teach-toggle'),
          body:
            '**What’s happening** sets out binary fission and budding in general — what each one leaves behind, and why ' +
            'that is the thing to look for. It is never handed your slide, so it reads identically whichever of the ' +
            'six is under the objective, and there is nothing in it to give this one away.',
        }
      : null,
  ]);

  // --- 3. the observation table ---------------------------------------------
  const record: readonly Step[] = [
    {
      title: 'This table is your record book',
      target: tagged('console'),
      body:
        `And I fill in none of it. ${TRAY_SIZE} rows, one per slide, in the order they came out of the box, worth ` +
        `**${PER_SLIDE_TABLE_MARKS} marks each**.`,
    },
    {
      title: 'The first two columns carry over',
      target: tagged('console'),
      body:
        'The organism and the process are the ones you named at the microscope, so those are already settled. The last ' +
        'column is a **separate judgement**: what was actually in that field, not what the chapter says should have ' +
        'been there.',
    },
    {
      title: 'Read to the end of the list',
      target: tagged('console'),
      body:
        'The descriptions offered cover all three organisms, so several of them will sound plausible for any one row. ' +
        'Two differ by a single word about what is **left behind** — which is exactly the distinction the practical is ' +
        'about.',
    },
    {
      title: 'And the microscope is still live',
      target: region(REGION.tray),
      body:
        'Unsure of a row? Put that slide back on the stage and look again before you submit. Nothing is marked until ' +
        'you press Submit, and every row is then marked against what that slide really carries.',
    },
  ];

  // --- 4. the conclusion ----------------------------------------------------
  const conclude: readonly Step[] = [
    {
      title: 'Two questions on the contrast between the two processes',
      target: tagged('console'),
      body:
        'Your first answer counts on each, so read all four options before you press one. Nothing here gets pressed ' +
        'for you.',
    },
    {
      title: 'Both of them ask what each process LEAVES BEHIND',
      target: tagged('console'),
      body:
        'Answer from the fields you examined and from the theory beside the procedure — not from a half-remembered ' +
        'diagram. **Theory** in the notebook has the chapter open.',
    },
    {
      title: 'The reasoning appears as you answer',
      target: tagged('stats'),
      body: 'Right or wrong, under each question, with the passage it comes from. That is the part worth reading.',
    },
  ];

  // --- 5. the viva ----------------------------------------------------------
  const viva: readonly Step[] = [
    {
      title: 'Five questions, first answer counts',
      target: tagged('console'),
      body:
        'So there is nothing to gain from a quick guess, and I press none of them. Two options usually differ by a ' +
        'single word.',
    },
    {
      title: 'Every one is answerable from what you just did',
      target: tagged('console'),
      body:
        'What you saw down the eyepiece and the theory beside the procedure cover all five. The explanation appears ' +
        'the moment you answer.',
    },
  ];

  return {
    [STEP.setup]: setup,
    [STEP.slides]: slides,
    [STEP.record]: record,
    [STEP.conclude]: conclude,
    [STEP.viva]: viva,
  };
}

/**
 * WHERE THE TEACH FLAG IS READ. A hook, and passed to the workspace by
 * reference so it is called as one: with the flag off, the step that points at
 * the teaching layer is never built, so a student cannot tell it exists.
 */
export function useCellDivisionTrainer(
  ctx: CellDivisionTrainerCtx,
): Readonly<Record<number, readonly Step[]>> {
  return buildCellDivisionTrainer(ctx, useLabFeature('teach'));
}
