import type { TeachSection } from '@labs/components/teach-sections';

import { DIP_ML } from './biology';

const ALWAYS: readonly TeachSection[] = [
  {
    heading: 'What is a germinating seed actually doing?',
    lead:
      'Breaking glucose down with oxygen in every living cell, and putting the energy to work building a ' +
      'seedling.',
    kind: 'why',
    equations: ['C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + energy'],
    body: [
      'Soaking and germination switch a seed’s metabolism on. In every living cell glucose is being broken down ' +
        'with oxygen, and the carbon and hydrogen in it leave as carbon dioxide and water while the energy is put ' +
        'to work building a seedling.',
      'Boiling kills the tissue and denatures the enzymes that carry respiration out, so in a dead seed this ' +
        'reaction does not run at all. A **dry** seed is a third case: it is dormant rather than dead, its enzymes ' +
        'idle for want of water, and the same reaction ticks over at a tiny fraction of the germinating rate.',
      'The water on the right of that equation is why the inside of the glass mists over — a living seed gives off ' +
        'water vapour along with the gas. Warmth speeds the whole thing up, which is why a bath warms every flask ' +
        'alike: warming one and not the other would put a second difference into an experiment that is allowed ' +
        'only one.',
    ],
  },
  {
    heading: 'Why is lime water the test for this gas?',
    lead:
      'Because the calcium carbonate it makes will not dissolve, so the apparatus asks a **yes-or-no** question a ' +
      'pair of eyes can settle.',
    kind: 'why',
    equations: ['Ca(OH)₂ + CO₂ → CaCO₃↓ + H₂O'],
    body: [
      'Lime water is a solution of **calcium hydroxide**. Carbon dioxide passed through it makes calcium ' +
        'carbonate, which will not dissolve: the solid comes out as a suspension of particles too fine to settle, ' +
        'and a suspension of a fine white solid is exactly what stops a clear liquid being clear.',
      `The mouth of the delivery tube has to be **under the surface**. Gas breaking into the empty space above ` +
        `the liquid meets nothing at all; gas bubbling up through the liquid has to meet the calcium hydroxide on ` +
        `the way. ${DIP_ML} mL is the least that dips the tube under.`,
      'So the apparatus is a test with a yes-or-no answer. It does not measure how much gas there was. It asks ' +
        'whether a solid came out of a solution, which is a question a pair of eyes can settle.',
    ],
  },
  {
    heading: 'Why does the cork have to be greased?',
    lead:
      'Gas takes the easiest way out, and a loose joint is a far easier road than a long narrow delivery tube.',
    kind: 'how',
    body: [
      'Gas takes the easiest way out. An open flask loses all of it to the room. A cork merely **resting** in the ' +
        'neck loses most of it there, because a loose joint is a far easier road than a long narrow tube. Greased ' +
        'with vaseline the joint is airtight, and the only route left is down the delivery tube.',
      'That is why the seals carry marks of their own. A leaking flask is not a flask that gives a smaller ' +
        'reading — it is a flask whose reading means nothing, because what the seeds made never arrived at the ' +
        'test.',
    ],
  },
  {
    heading: 'Why does this take so long to show anything?',
    lead:
      'Enough carbon dioxide has to bubble through to throw down a **visible** amount of solid, and that is a ' +
      'matter of many minutes.',
    kind: 'watch',
    body: [
      'Respiration is slow, and the test is deliberately blunt. A tube of lime water holds a great deal of ' +
        'calcium hydroxide, and enough carbon dioxide has to bubble through to throw down a **visible** amount of ' +
        'solid before anything can be said about it. That is a matter of many minutes.',
      'Which makes reading the tubes early a real risk, because _no change yet_ and _no change ever_ look exactly ' +
        'the same in a glass tube. The lab clock is there so the wait can be done properly rather than guessed at.',
    ],
  },
  {
    heading: 'What is the flask of boiled seeds for?',
    lead:
      'It shares **every** accidental cause with the test flask and differs in exactly one thing: whether the ' +
      'seeds in it are alive.',
    kind: 'why',
    body: [
      'The second flask of boiled seeds is not a spare. It is the only thing that makes the first one mean ' +
        'anything.',
      'Air already contains a little carbon dioxide; glassware is never perfectly clean; lime water left standing ' +
        'will cloud on its own given long enough. Any of those could change a tube, and not one of them has ' +
        'anything to do with respiration. The control shares **every** one of them with the test flask and differs ' +
        'in exactly one thing: whether the seeds in it are alive.',
      'So whatever the two flasks have in common cannot be evidence, and whatever separates them must be. That is ' +
        'the whole logic of the experiment — and it is why the conclusion asked for is about **the pair**, never ' +
        'about one tube on its own.',
    ],
  },
  {
    heading: 'What is the third flask, with the KOH, doing?',
    lead:
      'Asking the same question from the **oxygen** side: the KOH soaks up the carbon dioxide, the gas inside ' +
      'shrinks, and water is pushed up the tube.',
    kind: 'why',
    body: [
      'The third set-up on the bench is unmarked and is here because it answers the same question from the other ' +
        'side. A small tube of **potassium hydroxide** inside the flask soaks up carbon dioxide as fast as the ' +
        'seeds can make it.',
      'Oxygen is still being taken up, though, so the gas inside the sealed flask shrinks by exactly the volume of ' +
        'oxygen used, and atmospheric pressure pushes water up the tube to fill the gap. The rise measures ' +
        'respiration by the **oxygen** side of the equation instead of the carbon dioxide side.',
      'It also shows why the KOH tube must never go into flask A or B: it would absorb the very gas those flasks ' +
        'exist to deliver, and defeat the lime water test entirely.',
    ],
  },
  {
    heading: 'What will this panel not tell you?',
    lead:
      'What your lime water has done in either flask — that, and the conclusion the pair lets you draw, are the ' +
      'marked answers.',
    kind: 'how',
    body: [
      'It will not say what your lime water has done, in either flask. What each tube shows, whether carbon ' +
        'dioxide was detected in it, and the conclusion the pair lets you draw are the marked answers.',
      'The bench shows all of it to you plainly. Go and look at the glass.',
    ],
  },
];

/** The books, opened once the practical is over and nothing is left to mark. */
const TRUTH: TeachSection = {
  heading: 'Your table is in — what does the pair show?',
  lead:
    '**Carbon dioxide is given out during respiration** — living seeds gave it off and an identical flask of ' +
    'boiled ones did not.',
  kind: 'after',
  body: [
    'Your marks are recorded, so the conclusion can be written out. A flask of living, germinating seeds gives ' +
      'out carbon dioxide; an identical flask of boiled seeds does not; therefore the gas came from something ' +
      'the living seeds were doing, and not from the air in the apparatus, the glass or the lime water itself. ' +
      '**Carbon dioxide is given out during respiration.**',
    'It is worth being exact about what the pair does _not_ license. It does not show that oxygen was used up — ' +
      'nothing in these two flasks measures oxygen at all — and it does not show that the gas came specifically ' +
      'from glucose. Those are further experiments, and the KOH set-up beside them is the first of them.',
    'The strength of the argument is entirely in the sameness of the two flasks. Every difference you allowed ' +
      'between them — a leaking cork, a different mass of seeds, one warmer than the other — is a difference the ' +
      'conclusion has to be defended against, which is why the set-up and the seals carry marks of their own ' +
      'rather than being counted as preparation.',
  ],
};

/**
 * The panel's contents.
 *
 * @param revealed true once the practical is finished and the marks are settled.
 */
export function respirationTeach(revealed: boolean): readonly TeachSection[] {
  return revealed ? [...ALWAYS.slice(0, -1), TRUTH] : ALWAYS;
}

export type { TeachSection };
