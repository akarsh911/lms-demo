import type { TeachSection } from '@labs/components/teach-sections';

import { RX, classify, typeLabel } from './chemistry';

const ALWAYS: readonly TeachSection[] = [
  {
    heading: 'How do you tell the four patterns apart?',
    lead:
      'Balance the equation, count what goes in against what comes out, then look for an **element** standing ' +
      'free on either side.',
    kind: 'how',
    equations: [
      'A + B → AB',
      'AB → A + B',
      'A + BC → AC + B',
      'AB + CD → AD + CB',
    ],
    body: [
      'Those are the four shapes a Class 10 reaction is sorted into, and they are written in letters on purpose: ' +
        'the sorting is done on the **shape of the equation**, not on what the chemicals happen to be.',
      '**Count what goes in, then count what comes out.** Two or more substances in and a single one out can only ' +
        'be the first pattern. One substance in and two or more out can only be the second. That one count settles ' +
        'half the question before any chemistry is needed at all.',
      'The other two both have two in and two out, and what separates them is whether an **element** is standing ' +
        'free. A free element going in and a _different_ free element coming out means one of them has taken the ' +
        'other’s place. No free element on either side means two compounds have simply exchanged partners.',
      'So the method is: balance the equation, count both sides, and look for a bare element. Nothing about the ' +
        'colour, the heat or the smell enters into it — those tell you _that_ a reaction happened, not which kind.',
    ],
  },
  {
    heading: 'Is the heat from the reaction or the flame?',
    lead:
      'A thermometer only answers that in a vessel with **no flame under it** — every degree in a tube over a ' +
      'burner is the burner’s.',
    kind: 'watch',
    body: [
      'Breaking bonds costs energy and making them gives energy back. When the making gives back more than the ' +
        'breaking cost, the difference has nowhere to go except into the vessel and whatever is in it, and the ' +
        'tube warms **by itself**.',
      'That is why a thermometer is only worth anything in a vessel with **no flame under it**. Every degree in a ' +
        'tube standing over a burner is the flame’s, and says nothing whatever about the reaction. A rise in a ' +
        'tube nobody is heating has only one place it can have come from.',
      'The other half of the same idea: a change that happens only while the burner is under it, and stops when ' +
        'the burner is taken away, is being **paid for** by the flame rather than by the reaction.',
    ],
  },
  {
    heading: 'How long should the burner stay under the tube?',
    lead:
      'Long enough for the **temperature** to build, because that is what changes a solid — a flame waved at a ' +
      'tube changes nothing.',
    kind: 'how',
    body: [
      'Nothing changes the instant a flame arrives. What changes a solid is its **temperature**, and temperature ' +
        'takes time to build — which is why a burner has to stand under a tube rather than be waved at it.',
      'A solid can also pass through more than one change on the way up. Water built into a crystal lattice is ' +
        'driven off at one temperature; the salt itself may not come apart until hundreds of degrees later. Those ' +
        'are two different events, and only the second is the substance itself breaking down.',
      'Nothing in an open tube can hold a gas. If a gas is among the products it simply leaves, so what stays ' +
        'behind weighs less than what was put in — and a smell at the mouth of the tube is a product that has ' +
        'left the tube, not one you have lost.',
    ],
  },
  {
    heading: 'Why does a colour drift rather than switch?',
    lead:
      'A solution’s colour belongs to its **ions**, so while one salt turns into another you are looking at the ' +
      'two blended in whatever proportion is left.',
    kind: 'why',
    body: [
      'A dissolved salt is barely the salt any more: it is its ions, drifting about independently, and the colour ' +
        'of a solution belongs to those ions rather than to the water.',
      'So if one salt is turning into another the colour cannot jump. What you are looking at is the two salts ' +
        'blended in whatever proportion is actually left in the vessel at that moment, which is why the change ' +
        '**drifts** — and why it can only go as fast as the reaction itself.',
      'A change that arrives all at once is a different kind of event. A substance that will not dissolve has no ' +
        'way to stay in the liquid, so it appears immediately, everywhere the two solutions met, as a suspension ' +
        'of particles too fine to settle.',
    ],
  },
  {
    heading: 'What is the second vessel beside it for?',
    lead:
      'It is a **control** — a ruler rather than an experiment, so that whatever the first tube does cannot be ' +
      'blamed on time, light or glass.',
    kind: 'why',
    body: [
      'One of the set-ups on this bench carries a second vessel beside it holding everything except the one thing ' +
        'being tested. That is a **control**, and it is a ruler rather than an experiment.',
      'It is the vessel you hold the other one up against, so that whatever the first does cannot be blamed on ' +
        'time simply passing, on the light in the room, or on the glass. A change in both means the cause is ' +
        'something they share; a change in one alone means the cause is the thing they do not.',
    ],
  },
  {
    heading: 'What will this panel not tell you?',
    lead:
      'It names no vessel and classifies nothing — what each reaction showed and which of the four kinds it was ' +
      'are the two things you are marked on.',
    kind: 'how',
    body: [
      'It names no vessel, and it classifies nothing. What each of the four reactions showed, and which of the ' +
        'four kinds each one was, are precisely the two things you are marked on. Read the equations above, count ' +
        'for yourself, and use the thermometer and the litmus paper that are on the bench.',
    ],
  },
];

/** The books, opened once the practical is over and nothing is left to mark. */
const TRUTH: TeachSection = {
  heading: 'Your answers are in — which kind was which?',
  lead:
    'The table below classifies all four, and every entry in its last column is the counting rule from the top of ' +
    'this panel applied to the equation beside it.',
  kind: 'after',
  body: [
    'Your marks are recorded, so the four can be named. Nothing in the last column below was typed out: each one ' +
      'is the counting rule from the top of this panel, applied to the equation beside it — the same function the ' +
      'bench marked you with.',
    'Four reactions and four different kinds is not an accident. It is why these four are the ones the syllabus ' +
      'asks for: between them they use every pattern once, so a student who can sort these can sort any of them.',
  ],
  table: {
    caption: 'The four, classified by counting',
    columns: ['Reaction', 'Equation', 'In → out', 'Type'],
    rows: RX.map((rx) => [
      `${rx.roman} ${rx.title}`,
      rx.eq,
      `${rx.reactants.length} → ${rx.products.length}`,
      typeLabel(classify(rx)),
    ]),
  },
};

/**
 * The panel's contents.
 *
 * @param revealed true once the practical is finished and the marks are settled.
 */
export function reactionTypesTeach(revealed: boolean): readonly TeachSection[] {
  return revealed ? [...ALWAYS.slice(0, -1), TRUTH] : ALWAYS;
}

export type { TeachSection };
