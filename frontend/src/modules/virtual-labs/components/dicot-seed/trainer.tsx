'use client';

import * as React from 'react';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import { BASIS, LABELS, MAX, STEP, TABLE_ROWS } from '@labs/lib/dicot-seed/marking';
import type { DicotSeedAction } from '@labs/lib/dicot-seed/reducer';
import { SPECIES } from '@labs/lib/dicot-seed/seed-model';
import type { DicotSeedState } from '@labs/lib/dicot-seed/state';
import {
  OVERNIGHT,
  SHORT_SOAK,
  dropItInTheBeaker,
  openRow,
  putItDown,
  seedNow,
  showTheLens,
  soakFor,
  squeezeIt,
  takeASeed,
  takeUp,
  takeUpTheLabel,
  type DemoCtx,
} from '@labs/lib/dicot-seed/trainer-demos';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { useLabFeature } from '../lab-features';

import { BENCH_HEIGHT, BENCH_WIDTH, REGION } from './bench';

/**
 * THE VISUAL TRAINER: "Show me this step", for the step the student is standing
 * on right now.
 *
 * It is not the tour. The tour is one walk through the whole bench on a SANDBOX
 * seed; this runs on the student's OWN specimen, because the question it answers
 * is "what do I do *here*, with this seed". The workspace snapshots the
 * practical before it starts and puts it back byte for byte afterwards — the
 * state is immutable, so holding the reference IS the copy, and the bench clock
 * comes back with it.
 *
 * This file is the words. The hands are in
 * `@labs/lib/dicot-seed/trainer-demos.ts`, which is pure and says exactly what
 * each demonstration may touch — and which can therefore be driven from plain
 * Node to prove that none of it moves a mark.
 *
 * WHERE EVERY SCRIPT STOPS, and why it stops so early on this bench. The step
 * here is DERIVED from the specimen: on the tile, both marks found, coat off,
 * split cleanly. So the act that advances each step is the same act the step is
 * marked for — finding the hilum, peeling the testa, parting the halves. There
 * is nothing to demonstrate between "how it is done" and "doing it", so the
 * trainer soaks the seed, picks the right tool up, and hands it over. That is
 * not a limitation of the trainer; it is the practical.
 */
export type DicotSeedTrainerCtx = BenchTourContext<DicotSeedState, DicotSeedAction>;
type Step = TourStep<DicotSeedTrainerCtx>;

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
function Demonstrate({ run, ctx }: { run: (ctx: DemoCtx) => void; ctx: DicotSeedTrainerCtx }): null {
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

export function buildDicotSeedTrainer(
  ctx: DicotSeedTrainerCtx,
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

  // --- 1. soaking -----------------------------------------------------------
  const soak: readonly Step[] = keep([
    does(
      {
        title: 'Any of the three will do',
        target: region(REGION.dishes),
        // The body re-renders every frame and the demonstration fires right
        // after the first paint, so it names the seed it ENDS with rather than
        // the empty bench it started on.
        body: ({ state }) =>
          'Watch — nothing I do is marked, and your bench comes back exactly as you left it, clock included.\n\n' +
          `I am working with a **${SPECIES[state.specimen?.sp ?? state.dishes[0] ?? 'gram'].name}** — yours if you ` +
          'already had one, otherwise one out of a dish. Gram, pea and kidney bean have the same parts inside and ' +
          'differ only in size, so the choice changes nothing about the anatomy; the dishes are arranged from your own ' +
          'bench number, so your neighbour’s left-hand dish is not yours.',
      },
      takeASeed,
    ),
    does(
      {
        title: 'Into the beaker, and UNDER the water',
        target: region(REGION.beaker),
        highlight: ['well:beaker'],
        body:
          'Water gets into a seed through **one pore** — the micropyle, a pinprick in the coat — and nowhere else. The ' +
          'coat is waterproof everywhere else, which is the whole point of a coat. A seed left half out of the water ' +
          'is half-soaked only if the pore happens to be the half that is wet.',
      },
      dropItInTheBeaker,
    ),
    does(
      {
        title: `Two hours first, to see how little that buys`,
        target: region(REGION.clock),
        body: `The clock does the waiting. ${SHORT_SOAK} hours is about as long as a student is prepared to wait for.`,
      },
      soakFor(SHORT_SOAK),
    ),
    {
      title: 'Barely swollen, and the coat still hard',
      target: tagged('seed-lens'),
      body: ({ state }) => {
        const s = seedNow(state);
        return (
          'Watch the two pills in the panel rather than the clock: **how swollen** and **how soft the coat is**. Those ' +
          'are what the next three steps depend on, and they are what the soaking mark is read from' +
          (s ? ` — yours stands at ${s.hours.toFixed(1)} h.` : '.') +
          `\n\n${BASIS.prep}.`
        );
      },
    },
    does(
      {
        title: 'Twelve more — and that is what “overnight” means',
        target: region(REGION.clock),
        body:
          'Water enters by osmosis and the cotyledons swell as their cells take it up, so the coat is stretched from ' +
          'the inside until it gives. It flattens off after about eight hours, which is why nobody soaks for two days ' +
          '— past a day the coat splits on its own and the cotyledons waterlog, and then nothing you do with a needle ' +
          'will open the seed cleanly.',
      },
      soakFor(OVERNIGHT),
    ),
    {
      title: 'And the tile is yours',
      target: region(REGION.tile),
      body:
        'Tap the beaker to lift the seed out, then the white tile to set it down under the lamp, where it is magnified ' +
        'in the panel beside the task. That press starts the examination, so I leave it to you.',
    },
  ]);

  // --- 2. the outside of the coat -------------------------------------------
  const outside: readonly Step[] = keep([
    {
      title: 'Two marks, and both on the same edge',
      target: region(REGION.tile),
      body:
        'A dicot seed has a **flattened edge** — the straighter, slightly hollowed side — and everything worth finding ' +
        'on the coat is on it. The round back carries neither mark, so half the seed can be ruled out before you look ' +
        'at all.\n\nNothing I do here is marked, and I am not going to tap either of them.',
    },
    {
      title: 'What you are looking for',
      target: tagged('seed-lens'),
      body:
        'The **hilum** is an oval scar about the size of a grain of rice: the seed was attached to the pod there, and ' +
        'that is where it tore away. The **micropyle** is a **pinprick** a short way along the same edge from it — the ' +
        'pore the pollen tube came in by, and the pore the water went in by last night.\n\nThe magnified drawing beside ' +
        'the task is your own seed at its own size, not a textbook picture. Use it.',
    },
    {
      title: 'Tap, and the bench narrows the search',
      target: tagged('console'),
      body:
        'A tap that lands on neither is not a scolding — the assistant tells you which way to go. But **two stray taps ' +
        `are free and after that they cost 2 marks each**: ${BASIS.external}.\n\nWhich is exactly why I am not ` +
        'spending yours.',
    },
    {
      title: 'And find them NOW, while the coat is on',
      target: region(REGION.tools),
      highlight: ['tool:forceps'],
      body:
        'Both are marks **on the coat**, not parts of the embryo. Peel it and they leave with it — there is then ' +
        'nothing on the specimen to find, and the marks are gone for the rest of the practical. It is the one ordering ' +
        'mistake on this bench that cannot be undone.',
    },
    teach
      ? {
          title: 'The panel under the bench has the botany',
          target: tagged('teach-toggle'),
          body:
            '**What’s happening** explains what each part of a seed is and what becomes of it, in general — it is ' +
            'never handed your specimen, so it reads the same whichever of the three species is on your tile, and ' +
            'there is nothing in it that finds anything for you.',
        }
      : null,
  ]);

  // --- 3. the coat ----------------------------------------------------------
  const coat: readonly Step[] = keep([
    does(
      {
        title: 'One thing before anything comes off',
        target: tagged('console'),
        body:
          'Squeeze the seed between finger and thumb. A bead of water is forced back out of the **micropyle** — the ' +
          'same pore it went in by — which is the only direct evidence on this bench that the pore does what it is ' +
          'said to do.\n\nIt is not marked, and it only works while the coat is still on. Nothing I do here is marked ' +
          'either.',
      },
      squeezeIt,
    ),
    does(
      {
        title: 'The forceps — not the needle, not the blade',
        target: region(REGION.tools),
        highlight: ['tool:forceps'],
        body:
          'Forceps lift a coat. The other two open a seed, and a seed opened with its coat still on is a seed opened ' +
          'through the coat.\n\nPicking a tool up costs nothing and marks nothing; what you then tap is the whole of ' +
          `the dissection mark. ${BASIS.dissect}.`,
      },
      takeUp('forceps'),
    ),
    {
      title: 'And the tap is yours',
      target: region(REGION.tile),
      body: ({ state }) => {
        const s = seedNow(state);
        return (
          'On a properly soaked seed the softened testa comes away in one piece, leaving the two pale **cotyledons** ' +
          'still joined. On a seed soaked two hours it tears into flakes and stays put — and that is not a technique ' +
          'problem, it is a soaking problem: back in the beaker, and wait.' +
          (s ? `\n\nYours has soaked **${s.hours.toFixed(1)} h**.` : '')
        );
      },
    },
  ]);

  // --- 4. splitting ---------------------------------------------------------
  const split: readonly Step[] = keep([
    {
      title: 'The blade is on the bench, and the bench will let you use it',
      target: region(REGION.tools),
      highlight: ['tool:blade'],
      body:
        'It cuts straight **across** the cotyledons — and straight through the embryo axis with them. No plumule, no ' +
        'radicle, nothing left to label, and there is no second chance at a seed you have already halved.\n\nI am not ' +
        'going to show you that on your own specimen. It is worth knowing it is there and leaving it alone.',
    },
    does(
      {
        title: 'The needle does not cut',
        target: region(REGION.tools),
        highlight: ['tool:needle'],
        body:
          'You use it to **part** the two halves. A dicot seed already has a natural plane between its cotyledons — ' +
          'they are two separate leaves of the embryo, merely pressed together — so it opens like a book along a ' +
          'surface that is already there.\n\nAnd it will not part a seed that still has its coat on, because the coat ' +
          'is wrapped round both halves holding them together. That is why the order is coat first.',
      },
      takeUp('needle'),
    ),
    {
      title: 'So the press is yours',
      target: region(REGION.tile),
      body:
        'The **embryo axis** stays attached to one half: a pointed end and a feathery end. Which of those is which is ' +
        `marked at the very next step — **${MAX.label} marks** for the six labels — so naming them is not something ` +
        'to be shown.',
    },
  ]);

  // --- 5. labelling ---------------------------------------------------------
  const label: readonly Step[] = keep([
    {
      title: `${LABELS.length} labels, ${MAX.label} marks — the whole point of the practical`,
      target: tagged('console'),
      body:
        'I place none of them. What I can show you is how the chips work, and where a pin is allowed to score.\n\n' +
        'Nothing I do here is marked.',
    },
    does(
      {
        title: 'Two drawings, and a pin scores on only one of them',
        target: tagged('seed-lens'),
        body:
          'Your seed **as you found it**, and your seed **split open** — both at its own size, from your own specimen. ' +
          'A pin is marked against what is under it **on the drawing you dropped it on**, so a mark that only exists ' +
          'on the coat cannot score on the split view, where there is no coat.',
      },
      showTheLens('ext'),
    ),
    does(
      {
        title: 'Pick a chip up and it comes into your hand',
        target: tagged('seed-hands'),
        body:
          'The strip under the bench says which one you are carrying. Then you tap the part it names, and a pin lands ' +
          '**exactly where you tapped** — so aim at the middle of a structure, not its edge. Near enough is not ' +
          'enough, and a pin on bare tile scores nothing.',
      },
      takeUpTheLabel('testa'),
    ),
    does(
      {
        title: 'Holding the wrong one?',
        target: tagged('seed-hands'),
        body:
          'Tap the chip again, or press **Put down**. A chip you have already placed can be picked up and moved, and ' +
          '**Clear** empties all six.\n\nI am putting this one down without dropping it anywhere — nothing counts ' +
          'until you press Submit.',
      },
      putItDown,
    ),
    {
      title: 'And after you submit, every pin answers back',
      target: tagged('seed-lens'),
      body:
        'Green or red, and the red ones say what was **really** underneath them. That is where you find out what you ' +
        'actually hit, which is worth more than the mark.',
    },
  ]);

  // --- 6. the observation table ---------------------------------------------
  const table: readonly Step[] = [
    does(
      {
        title: 'This table is your record book',
        target: tagged('console'),
        body:
          `And I fill in none of it — ${TABLE_ROWS.length} parts, two columns each, and **every cell carries a mark**: ` +
          'what the part **is**, and what it **does or becomes**.',
      },
      openRow(0),
    ),
    {
      title: 'Read all the way down both lists',
      target: tagged('console'),
      body:
        'They are the same answers shuffled, so the first plausible one is rarely the right one. The two columns are ' +
        'also different questions: "the outer coat" and "protects the embryo and keeps it dry" belong to the same row ' +
        'but answer different halves of it.',
    },
    does(
      {
        title: 'Two of the rows are not on the split seed at all',
        target: tagged('seed-lens'),
        body:
          'The hilum and the micropyle went away with the coat. You answer those two from what you saw **before** you ' +
          'peeled it — which is the second reason the outside comes first.',
      },
      showTheLens('cut'),
    ),
    {
      title: 'And both drawings are still live',
      target: tagged('seed-lens'),
      body:
        'Look again before you guess a row. Submit turns on when every cell is filled, and the right answer appears ' +
        'in grey under each one you got wrong.',
    },
  ];

  // --- 7. the conclusion ----------------------------------------------------
  const concl: readonly Step[] = [
    {
      title: `Three sentences, six blanks, ${MAX.concl} marks`,
      target: tagged('console'),
      body: 'So I leave every one of them empty.',
    },
    {
      title: 'The first two come straight off your own dissection',
      target: tagged('seed-lens'),
      body:
        'Count the cotyledons on the tile — that is what "dicot" means and it is the whole reason this seed was chosen ' +
        '— and ask yourself where the food was being stored. In this seed there is no separate endosperm left; look at ' +
        'how thick those two halves are and you have your answer.',
    },
    {
      title: 'The third you can SEE rather than recall',
      target: region(REGION.germ),
      highlight: ['well:germ'],
      body:
        'Sow a spare soaked seed on the wet cotton and put the clock forward a few times. What comes out first, and ' +
        'through what?\n\nI am not going to run it for you: what emerges is one of the six blanks. And if you never ' +
        'sow one, the sentence still has to be answered — from the theory beside the procedure, and from the pore you ' +
        'found on the coat.',
    },
  ];

  // --- 8. the viva ----------------------------------------------------------
  const viva: readonly Step[] = [
    {
      title: 'Five questions, four marks each, first answer counts',
      target: tagged('console'),
      body:
        'So there is nothing to gain from a quick guess, and I press none of them. Read all four options before you ' +
        'touch one.',
    },
    {
      title: 'All five are answerable from what you just did',
      target: tagged('console'),
      body:
        'Why the seed was soaked, what the cotyledons are for, which end becomes the root, what the micropyle is, and ' +
        'why this seed is called a dicot. **Theory** in the notebook has the chapter if you want to read it first.',
    },
    {
      title: 'The reason appears as you answer',
      target: tagged('stats'),
      body: 'Right or wrong, under each question. That is the part worth reading.',
    },
  ];

  return {
    [STEP.soak]: soak,
    [STEP.outside]: outside,
    [STEP.coat]: coat,
    [STEP.split]: split,
    [STEP.label]: label,
    [STEP.table]: table,
    [STEP.concl]: concl,
    [STEP.viva]: viva,
  };
}

/**
 * WHERE THE TEACH FLAG IS READ. A hook, and passed to the workspace by
 * reference so it is called as one: with the flag off, the step that points at
 * the teaching layer is never built, so a student cannot tell it exists.
 */
export function useDicotSeedTrainer(
  ctx: DicotSeedTrainerCtx,
): Readonly<Record<number, readonly Step[]>> {
  return buildDicotSeedTrainer(ctx, useLabFeature('teach'));
}
