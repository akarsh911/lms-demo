'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import {
  DIP_ML,
  GRAM,
  POUR,
  SETUP_A,
  SETUP_B,
} from '@labs/lib/respiration/biology';
import { APP_OPTS, EARLY_MIN, MAX, STEP } from '@labs/lib/respiration/marking';
import type { RespirationAction } from '@labs/lib/respiration/reducer';
import { nameOf, type RespirationState } from '@labs/lib/respiration/state';
import {
  DEMO_GRAMS,
  fitTheCork,
  lookAt,
  pourOnePartOfLimeWater,
  pourUntilItDips,
  putEverythingDown,
  sealTheJoint,
  squeezeAndWatch,
  tipSeedInto,
  waitFor,
  type DemoCtx,
} from '@labs/lib/respiration/trainer-demos';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { useLabFeature } from '../lab-features';

import { BENCH_HEIGHT, BENCH_WIDTH, REGION } from './bench';

/**
 * THE VISUAL TRAINER: "Show me this step", for the step the student is standing
 * on right now.
 *
 * It is not the tour. The tour is one walk through the whole bench on a SANDBOX
 * set of flasks; this runs on the student's OWN apparatus, because the question
 * it answers is "what do I do *here*". The workspace snapshots the practical
 * before it starts and puts it back byte for byte afterwards — the state is
 * immutable, so holding the reference IS the copy, and the lab clock is given
 * back the time the demonstration borrowed.
 *
 * This file is the words. The hands are in
 * `@labs/lib/respiration/trainer-demos.ts`, which is pure and says exactly what
 * each demonstration may touch — and which can therefore be driven from plain
 * Node to prove that none of it moves a mark.
 *
 * THE NO-LEAK RULE. Every step of this practical ends on a press the student has
 * to make — **Set up**, **Start the clock**, **Submit observations**, **Submit
 * conclusion** — and the trainer stops short of all four. It also never says
 * what a tube shows: how milky the lime water has gone is the 8-mark
 * observation, and the "was carbon dioxide given out?" row follows out of it.
 * The tube is drawn on the bench and magnified in the close-up beside a strip of
 * reference tubes. Reading it is the practical.
 */
export type RespirationTrainerCtx = BenchTourContext<RespirationState, RespirationAction>;
type Step = TourStep<RespirationTrainerCtx>;

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
  ctx: RespirationTrainerCtx;
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

export function buildRespirationTrainer(
  ctx: RespirationTrainerCtx,
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

  // --- 1. building the two set-ups ------------------------------------------
  const build: readonly Step[] = keep([
    does(
      {
        title: 'Set-up A takes the living seeds',
        target: region(REGION.jars),
        highlight: ['seed:germ'],
        body:
          'Watch — nothing I do is marked, and your bench comes back exactly as you left it, clock included.\n\n' +
          `**Germinating** seeds: soaked, with a white radicle showing. Each tap of the jar tips in ${GRAM} g, and ` +
          `${DEMO_GRAMS} g is a sensible charge. More seed means more carbon dioxide a minute, and a flask that is ` +
          'nearly full of seed leaves no air to collect it in.',
      },
      tipSeedInto(SETUP_A),
    ),
    does(
      {
        title: 'Now watch what one pour of lime water does NOT do',
        target: region(REGION.lime),
        highlight: ['tool:lime'],
        body: `Calcium hydroxide solution, ${POUR} mL a tap. Look at the close-up beside this card as it goes in.`,
      },
      pourOnePartOfLimeWater(SETUP_A),
    ),
    does(
      {
        title: 'The tube has to be UNDER the surface',
        target: tagged('respiration-closeup'),
        // Said in the form that is true AFTER the pour: bodies re-render every
        // frame and the demonstration fires right after the first paint, so a
        // line about what is about to change would only ever be read too late.
        body:
          `With only ${POUR} mL in it the mouth of the bent delivery tube stands **above** the liquid, so the gas ` +
          'would bubble into empty space and never meet the lime water at all — and no amount of waiting fixes ' +
          `that. **${DIP_ML} mL** puts the tube under the surface, which is what every bubble then has to pass ` +
          'through.',
      },
      pourUntilItDips(SETUP_A),
    ),
    does(
      {
        title: 'Then the cork, and the seeds go in first',
        target: region(REGION.corks),
        highlight: ['tool:cork'],
        body:
          'A cork carrying a bent glass delivery tube, with its far end in the test tube. Once it is in, the flask is ' +
          'closed — so everything that is going inside has to be inside already.',
      },
      fitTheCork(SETUP_A),
    ),
    does(
      {
        title: 'And now the half that is worth marks on its own',
        target: region(REGION.jars),
        highlight: ['seed:boiled'],
        body:
          `**Boiled** seeds — dead, so they cannot respire — in an otherwise identical flask. That is the **control**, ` +
          `and it carries **${MAX.control} marks** of its own.\n\nWhy bother? Because a milky tube on A alone proves ` +
          'nothing: the gas could have come from the air that was already in the flask when you corked it. B is what ' +
          'rules that out.',
      },
      tipSeedInto(SETUP_B),
    ),
    does(
      {
        title: 'Everything but the seeds has to match',
        target: region(REGION.setupB),
        highlight: ['tube:1'],
        body:
          `The same ${DEMO_GRAMS} g, the same ${DIP_ML} mL so its own delivery tube dips, the same cork. A "control" ` +
          'that differs in two things at once controls nothing — if it stays clear you would not know whether that was ' +
          'because the seeds were dead or because its tube never reached the liquid.',
      },
      (c) => {
        pourUntilItDips(SETUP_B)(c);
        fitTheCork(SETUP_B)(c);
      },
    ),
    does(
      {
        title: 'And the press that ends this step is yours',
        target: tagged('console'),
        body:
          `**Set up — check the seals** is what closes the build, and the build is worth **${MAX.setup} marks** with ` +
          `another **${MAX.control}** for the control. Look over both flasks first: the chips beside the button say ` +
          'what each one still needs.',
      },
      putEverythingDown,
    ),
  ]);

  // --- 2. the seals ---------------------------------------------------------
  const seal: readonly Step[] = keep([
    does(
      {
        title: 'A cork only RESTS in the neck',
        target: region(REGION.setupA),
        highlight: ['flask:0'],
        body:
          'That is the state a flask is in the moment you fit one. Ground glass on glass is not airtight, and gas takes ' +
          'the easiest way out.\n\nNothing I do here is marked.',
      },
      lookAt(SETUP_A),
    ),
    does(
      {
        title: 'Squeeze it gently and watch the lime water',
        target: tagged('console'),
        body:
          'That is the whole of the test: if the joint is airtight the air inside has nowhere to go but down the ' +
          'delivery tube, and you get a string of bubbles. If it is not, the air hisses out past the cork instead and ' +
          'almost nothing comes through — and the seeds’ carbon dioxide would go the same way for the next twenty ' +
          'minutes.',
      },
      squeezeAndWatch(SETUP_A),
    ),
    does(
      {
        title: 'So the joint gets vaseline',
        target: region(REGION.vaseline),
        highlight: ['tool:vas'],
        body:
          'Smeared round the cork, it fills the microscopic gaps between two surfaces that were never going to match. ' +
          'It is the cheapest thing on the bench and it decides whether the experiment works at all.',
      },
      sealTheJoint(SETUP_A),
    ),
    does(
      {
        title: 'And test it again',
        target: tagged('console'),
        body: 'A steady string of bubbles. The only way out is now the delivery tube, and the delivery tube ends under the lime water.',
      },
      squeezeAndWatch(SETUP_A),
    ),
    {
      title: 'Both flasks, separately',
      target: region(REGION.setupB),
      highlight: ['flask:1'],
      body:
        `They are marked separately — **${MAX.airtight / 2} marks each** — and a leak once the clock is running costs ` +
        'that flask its marks and its evidence. Set-up B leaking is worse than A leaking: a control that lost its gas ' +
        'stays clear for the wrong reason, and you cannot tell which reason it was.',
    },
    {
      title: 'Then start the clock yourself',
      target: tagged('console'),
      body:
        'That press ends this step, so it is yours. Seal what you want sealed first: once the clock is running, the ' +
        'minutes that have already passed cannot be taken back.',
    },
  ]);

  // --- 3. waiting -----------------------------------------------------------
  const watch: readonly Step[] = keep([
    does(
      {
        title: 'Five lab minutes at a time',
        target: tagged('console'),
        body:
          'Respiration is slow. This is why the practical is set up at the start of a period and read at the end of ' +
          'it — and why the bench gives you a clock rather than pretending otherwise.\n\nThe minutes I am about to ' +
          'spend are given straight back: your own clock resumes exactly where it is now.',
      },
      waitFor(5),
    ),
    does(
      {
        title: 'And five more',
        target: region(REGION.setupA),
        highlight: ['tube:0'],
        body:
          'Every simulated minute passes through the apparatus — the seeds respire, the gas has to get past the cork ' +
          'and down the tube, and what reaches the lime water reacts with it. A leak leaks for all of them.',
      },
      waitFor(5),
    ),
    does(
      {
        title: 'Ten more, and then look at BOTH tubes',
        target: region(REGION.both),
        highlight: ['tube:0', 'tube:1'],
        body:
          `**${EARLY_MIN} minutes** is about the least that is worth reading. Look at the pair side by side and at the ` +
          'same moment: the comparison is the experiment, and a tube judged on its own tells you nothing.\n\nI am not ' +
          'going to tell you what they show. That is the reading, and it is what the marks are for.',
      },
      waitFor(10),
    ),
    {
      title: 'The close-up is apparatus, not an answer',
      target: tagged('respiration-closeup'),
      body:
        'It gives you the grams, the millilitres, whether the tube dips, whether the cork is sealed and how long the ' +
        'flask has stood — and beside the magnified tube, three **reference tubes** at known milkiness. Hold yours ' +
        'against them the way you would against a printed colour card. It will tell you when something has changed ' +
        'since you last looked; it will not tell you what it changed to.',
    },
    {
      title: 'Short of time?',
      target: region(REGION.bath),
      highlight: ['tool:bath'],
      body:
        'The water bath warms **every** flask together, so A and B stay comparable — warmer seeds respire faster, and ' +
        'so would warmer dead ones if they could. Warming only one would be a second difference between the flasks, ' +
        'and then the control would control nothing.',
    },
    teach
      ? {
          title: 'And the chemistry is under the bench',
          target: tagged('teach-toggle'),
          body:
            '**What’s happening** has the biology in the flask and the chemistry in the tube — why lime water responds ' +
            'to carbon dioxide at all, and what the white precipitate is. It leaves out the one number that would ' +
            'give the reading away, which is the rate: rate times minutes **is** the observation.',
        }
      : null,
  ]);

  // --- 4. recording ---------------------------------------------------------
  const record: readonly Step[] = [
    {
      title: 'Both rows are marked on what your tubes really show',
      target: tagged('console'),
      body: 'So I will not fill in a single cell. What I can show you is how to make the reading.',
    },
    does(
      {
        title: 'Take set-up A first',
        target: region(REGION.setupA),
        highlight: ['tube:0'],
        body:
          'Tapping a tube on the bench brings it into the close-up beside this card, magnified — on the bench it is 38 ' +
          'units wide inside a drawing that scales to fit, which is far too small to judge by.',
      },
      lookAt(SETUP_A),
    ),
    {
      title: 'Hold it against the three references',
      target: tagged('respiration-closeup'),
      body:
        `Three choices: **${APP_OPTS.map((o) => o.label).join('**, **')}**. They are drawn by the same code from the ` +
        'same ramp as your tube, so the comparison is a fair one. Judging milkiness is never exact, and the marking ' +
        'agrees: **one shade out still earns half** the appearance marks.',
    },
    does(
      {
        title: 'Then the control, at the SAME moment',
        target: region(REGION.setupB),
        highlight: ['tube:1'],
        body:
          `The pair is what the marks are for — ${MAX.observe / 2} for each row. Reading A at twenty minutes and B at ` +
          'thirty-five compares two different experiments.',
      },
      lookAt(SETUP_B),
    ),
    {
      title: 'And the clock is still yours',
      target: tagged('console'),
      body:
        'If you get here and think it is too early to say, **Wait 5 min** is on this step too. Nothing is frozen until ' +
        'you submit, and both rows are then marked against the tubes **as you submit them** — so write what is true at ' +
        'that moment, including the unflattering answers. Claiming milkiness a tube never produced earns nothing, and ' +
        'so does missing milkiness that was plainly there.',
    },
  ];

  // --- 5. the conclusion ----------------------------------------------------
  const concl: readonly Step[] = [
    {
      title: `${MAX.conclude} marks, and the choice is yours`,
      target: tagged('console'),
      body:
        'I will not press one of these for you. It is marked **twice**: once for following from your own table, once ' +
        'for being the true conclusion — so a wrong table cannot buy a right conclusion, and a right conclusion that ' +
        'your own rows do not support does not score in full either.',
    },
    {
      title: 'So read your two rows again',
      target: tagged('console'),
      body:
        `Open **Observations**. Row ${nameOf(SETUP_A)}: was carbon dioxide detected there? Row ${nameOf(SETUP_B)}: was ` +
        'it detected in the **dead** seeds? Not what the experiment is supposed to show — what yours did.',
    },
    {
      title: 'Then ask what each pair of answers rules out',
      target: tagged('console'),
      body:
        'If the control had gone milky too, what else could the gas have come from? If neither tube changed, what does ' +
        'that say about the seals? Each of the five sentences offered is the conclusion of a different pair of rows.',
    },
  ];

  // --- 6. the viva ----------------------------------------------------------
  const viva: readonly Step[] = [
    {
      title: 'Five questions, and your first answer counts',
      target: tagged('console'),
      body:
        'So nothing here gets pressed for you. Read all four options before you touch one — two of them usually differ ' +
        'by a single word.',
    },
    {
      title: 'Every answer is in what you just did',
      target: tagged('console'),
      body:
        'What the lime water reacted with, what the boiled seeds were for, what a leaking cork costs you, and why the ' +
        'delivery tube has to dip. **Theory** in the notebook has the equations if you want to check one first.',
    },
    {
      title: 'The reason is the part worth reading',
      target: tagged('stats'),
      body: 'It appears under each question the moment you answer, right or wrong, with the passage it comes from.',
    },
  ];

  return {
    [STEP.build]: build,
    [STEP.seal]: seal,
    [STEP.watch]: watch,
    [STEP.record]: record,
    [STEP.concl]: concl,
    [STEP.viva]: viva,
  };
}

/**
 * WHERE THE TEACH FLAG IS READ. A hook, and passed to the workspace by
 * reference so it is called as one: with the flag off, the step that points at
 * the teaching layer is never built, so a student cannot tell it exists.
 */
export function useRespirationTrainer(
  ctx: RespirationTrainerCtx,
): Readonly<Record<number, readonly Step[]>> {
  return buildRespirationTrainer(ctx, useLabFeature('teach'));
}
