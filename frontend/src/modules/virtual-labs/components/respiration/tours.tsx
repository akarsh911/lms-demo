'use client';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import {
  DIP_ML,
  GRAM,
  POUR,
  SETUP_A,
  SETUP_B,
  dips,
  milkiness,
} from '@labs/lib/respiration/biology';
import { MAX } from '@labs/lib/respiration/marking';
import type { RespirationAction } from '@labs/lib/respiration/reducer';
import type { RespirationState } from '@labs/lib/respiration/state';
import type { BenchTourContext } from '@labs/types/lab-bench';

import { BENCH_HEIGHT, BENCH_WIDTH, REGION } from './bench';

/**
 * "How to play": one set-up built, sealed and left to stand, on a sandbox bench.
 *
 * The host swaps the practical out while it runs, so opening it mid-way loses
 * nothing and pauses the clock. Nothing done during the tour is marked, which
 * the first step says out loud — a student who is told that experiments more.
 */
export type RespirationTourCtx = BenchTourContext<RespirationState, RespirationAction>;

type Region = readonly [x: number, y: number, w: number, h: number];

export function createRespirationTours(ctx: RespirationTourCtx): { controls: TourStep<RespirationTourCtx>[] } {
  const bench = ctx.stage;
  const find = ctx.find;

  /**
   * A rectangle in BENCH coordinates, mapped to where it actually is on screen.
   * The drawing scales to fit and centres, so it is letterboxed whenever its
   * box has different proportions; scaling by width alone lands the spotlight
   * well away from the thing it is naming.
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

  const flaskA = (c: RespirationTourCtx) => c.state.flasks[SETUP_A];

  const controls: TourStep<RespirationTourCtx>[] = [
    {
      title: 'Your bench',
      body:
        'Two conical flasks, side by side, each closed with a cork carrying a bent delivery tube that dips into a test tube ' +
        'of lime water. **Nothing here is scripted.** The seeds respire at a real rate, the gas has to get past the cork and ' +
        'under the lime water, and the milkiness you see is the calcium carbonate that was actually precipitated. Nothing in ' +
        'this tour is marked.',
    },
    {
      title: 'The two set-ups',
      target: region(REGION.both),
      body:
        '**Set-up A** holds germinating seeds — alive and respiring. **Set-up B** holds boiled seeds — dead. Everything else ' +
        'about the two is identical. B is the **control**: if its lime water stays clear while A goes milky, the carbon ' +
        'dioxide must have come from the living seeds and not from the air in the flask.',
    },
    {
      title: 'Three jars of seed',
      target: region(REGION.jars),
      body:
        'Germinating seeds (soaked, with a white radicle showing), boiled seeds, and dry seeds. Germination switches the ' +
        'seed’s metabolism on; a dry seed is dormant and gives off almost nothing.',
    },
    {
      title: 'Lime water',
      target: region(REGION.lime),
      body:
        'Lime water is a solution of calcium hydroxide. Carbon dioxide bubbled through it throws down insoluble calcium ' +
        'carbonate — **Ca(OH)₂ + CO₂ → CaCO₃↓ + H₂O** — and that white precipitate is the milkiness.',
    },
    {
      title: 'Put seeds in flask A',
      target: region(REGION.setupA),
      highlight: ['seed:germ', 'flask:0'],
      stay: true,
      body: 'Pick something up, then tap what it acts on. That one gesture does everything at this bench.',
      task: 'Tap the **germinating** jar, then tap flask A.',
      done: (c) => Boolean(flaskA(c)?.seeds),
      doneMessage: `${GRAM} grams of germinating seed in the flask.`,
      after: () =>
        `Each tap adds ${GRAM} g. More seed means more carbon dioxide every minute — the tube would go milky sooner, but ` +
        'the answer is the same.',
    },
    {
      title: 'Fill the test tube',
      target: region(REGION.setupA),
      highlight: ['tool:lime', 'tube:0'],
      stay: true,
      body: 'Lime water goes in the **test tube**, not the flask.',
      task: `Tap the **lime water**, then tap A’s test tube twice — ${DIP_ML} mL.`,
      done: (c) => {
        const f = flaskA(c);
        return f ? dips(f) : false;
      },
      doneMessage: 'The tube holds enough.',
      after: () =>
        `That second tap matters. With only ${POUR} mL the mouth of the bent tube sits **above** the liquid, the gas ` +
        'bubbles into the empty space, and the lime water never changes.',
    },
    {
      title: 'Cork and delivery tube',
      target: region(REGION.corks),
      highlight: ['tool:cork', 'flask:0'],
      stay: true,
      body: 'The cork carries the bent glass tube that leads the gas from the flask down under the lime water.',
      task: 'Tap the **corks**, then tap flask A.',
      done: (c) => Boolean(flaskA(c)?.cork),
      doneMessage: 'The flask is closed and the tube leads to the lime water.',
    },
    {
      title: 'Make it airtight',
      target: region(REGION.vaseline),
      highlight: ['tool:vas', 'flask:0'],
      stay: true,
      body: 'A cork that only rests in the neck lets most of the gas out there instead.',
      task: 'Tap the **vaseline**, then tap flask A.',
      done: (c) => Boolean(flaskA(c)?.sealed),
      doneMessage: 'The joint is sealed.',
      after: () =>
        'The seeds go on respiring and the lime water still stays clear — which is why the seal is checked **before** the ' +
        'clock starts. **Test the seal** under the bench squeezes the flask and watches for bubbles.',
    },
    {
      title: 'Let time pass',
      target: tagged('console'),
      stay: true,
      body:
        'Respiration is slow, so the bench gives you a lab clock: let it run, fast-forward it, or jump five minutes. Every ' +
        'simulated minute passes through the apparatus, so a leak leaks for all of them.',
      task: 'Press **Set up — check the seals**, then **Start the clock**, and let five lab minutes pass.',
      done: (c, entry) => c.state.min >= entry.state.min + 5,
      doneMessage: 'Five lab minutes later…',
      after: (c) => {
        const f = flaskA(c);
        const pct = f ? (milkiness(f) * 100).toFixed(0) : '0';
        return (
          `Bubbles came up through the lime water, and ${pct}% of the calcium hydroxide has already come down as calcium ` +
          'carbonate. **Pause** the clock whenever you come back: the bench then tells you what each tube has done since ' +
          'your last look, which is the one thing a running clock hides.'
        );
      },
    },
    {
      title: 'The water bath',
      target: region(REGION.bath),
      body:
        'Warmth speeds respiration: roughly double the rate for every 10 °C. The bath warms **every** flask together, so the ' +
        'comparison between A and B is untouched — it only makes you wait less.',
    },
    {
      title: 'Method 2 — KOH',
      target: region(REGION.methodTwo),
      body:
        'The lab manual’s alternative. A small tube of **KOH** inside the flask soaks up the carbon dioxide as fast as the ' +
        'seeds make it. Oxygen is still being used, so the gas in the flask shrinks and water climbs the bent tube from the ' +
        'beaker. It measures the same respiration a different way. This set-up is optional and not marked.',
    },
    {
      title: 'Look closely',
      target: tagged('respiration-closeup'),
      highlight: ['tube:1'],
      stay: true,
      body:
        'The close-up magnifies whichever set-up you last tapped, and stands it beside three reference tubes — clear, just ' +
        'turning milky, and milky. Judging which one yours matches **is** the reading this practical is marked on.',
      task: 'Tap the **control’s** test tube to bring it into the close-up.',
      done: (c) => c.state.sel === SETUP_B,
      // Names what the control IS FOR, never what it shows. The line below
      // promises the close-up does not tell you the answer, and this used to
      // read "still clear" — handing over one of the three option words one
      // sentence before promising not to.
      doneMessage:
        'There it is — the control. Its seeds were boiled, so nothing in it can respire: whatever it does is what ' +
        '“no respiration” looks like on this bench.',
      after: () =>
        'The close-up tells you what is in the apparatus — seeds, millilitres, whether the tube dips, whether the cork is ' +
        'sealed. It does not tell you the answer.',
    },
    {
      title: 'Your observation table',
      target: tagged('console'),
      body:
        'At the Record step you describe **both** test tubes at the same moment. Each row is marked against what that lime ' +
        'water really showed — claiming milkiness a tube never produced is a mistake, and so is missing milkiness that was ' +
        'plainly there.',
    },
    {
      title: 'How you are marked',
      target: tagged('stats'),
      body:
        'Marks come from building both set-ups, **running the control**, sealing the corks, honest observations, and a ' +
        `conclusion that follows from your own table as well as being true. The control is worth **${MAX.control}** on its ` +
        'own — without it the experiment proves nothing.',
    },
  ];

  return { controls };
}
