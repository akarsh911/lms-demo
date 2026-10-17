import type { TeachSection } from '@labs/components/teach-sections';

/**
 * The four reactions of this practical.
 *
 * `gas` is the hole. Before the table is marked it is a question mark in every
 * equation; afterwards it is the formula. Writing it once means the two states
 * cannot drift apart into two different sets of equations.
 */
function equations(gas: (formula: string) => string): Readonly<Record<'znAcid' | 'znBase' | 'carbAcid', string>> {
  return {
    znAcid: `Zn + 2HCl → ZnCl₂ + ${gas('H₂')}↑`,
    znBase: `Zn + 2NaOH → Na₂ZnO₂ + ${gas('H₂')}↑`,
    carbAcid: `Na₂CO₃ + 2HCl → 2NaCl + H₂O + ${gas('CO₂')}↑`,
  };
}

const HIDDEN = equations(() => '?');
const NAMED = equations((formula) => formula);

const LITMUS: TeachSection = {
  heading: 'What is the litmus actually reporting?',
  lead:
    'How much H⁺ is loose in the solution around it, and nothing else about the liquid whatever.',
  kind: 'why',
  body: [
    'Litmus is a dye from lichen whose molecule takes one shape while it is holding an H⁺ and a different shape ' +
      'once it has let go. The two shapes absorb light differently, so the colour is a direct report of **how much ' +
      'H⁺ is loose in the solution around it** — nothing else about the liquid matters to it.',
    'The changeover happens between about pH 6 and pH 8, which is why one strip can be used on both sides of the ' +
      'question. A litmus colour is therefore not a verdict the bench has issued. It is the dye reporting the ' +
      'number in the tube, and reading it off is the observation.',
  ],
};

const ZINC = (eq: Readonly<Record<'znAcid' | 'znBase', string>>): TeachSection => ({
  heading: 'Why does zinc bubble in both tubes?',
  lead:
    'Zinc is **amphoteric** — an alkali pulls it into solution just as an acid does, and the same gas is pushed ' +
    'out either way.',
  kind: 'why',
  equations: [eq.znAcid, eq.znBase],
  body: [
    'A metal standing in an acid **displaces** it. The zinc goes into solution as its salt, taking the chloride ' +
      'with it, and what the acid was holding is pushed out of the liquid as a gas. The bubbles are that gas ' +
      'leaving.',
    'Zinc is also **amphoteric** — an alkali attacks it just as an acid does. There the alkali pulls the zinc into ' +
      'solution as a _zincate_, and a gas is pushed out again. It is the **same gas** both times, and the alkali is ' +
      'the slower of the two, so the two zinc tubes are worth watching side by side rather than one after the other.',
    'Which is exactly why effervescence with zinc can never tell an acid from a base: **both tubes do it.**',
  ],
});

const CARBONATE = (eq: Readonly<Record<'carbAcid', string>>): TeachSection => ({
  heading: 'What does an acid do to a carbonate?',
  lead:
    'Its H⁺ pulls the carbonate ion to pieces, leaving a salt and water — and a gas that will not stay dissolved.',
  kind: 'why',
  equations: [eq.carbAcid],
  body: [
    'An acid takes a carbonate apart. The H⁺ the acid has let go of pulls the carbonate ion to pieces, leaving a ' +
      'salt and water — and a gas that will not stay dissolved, so it forces its way out through the liquid.',
    'No metal is involved this time. There is therefore no reason whatever to assume it is the same gas as the ' +
      'zinc tubes gave, and the syllabus asks you not to assume but to test.',
  ],
});

const NO_REACTION: TeachSection = {
  heading: 'Why does a carbonate ignore an alkali?',
  lead:
    'Sodium carbonate is itself a base, so there is no H⁺ anywhere in that tube for it to take and nothing to react.',
  kind: 'why',
  equations: ['Na₂CO₃ + NaOH → no reaction'],
  body: [
    '**Nothing, and that is the point.** Sodium carbonate is itself a base, and so is sodium hydroxide. There is ' +
      'no H⁺ anywhere in that tube for the carbonate to take, so there is nothing to react: no bubbles, and ' +
      'nothing to collect or test.',
    'One reagent, two solutions, and only one of them does anything at all. That is a test that **separates** ' +
      'them — which is more than effervescence with zinc manages, since zinc obliges both.',
  ],
};

const BUBBLES: TeachSection = {
  heading: 'Does fizzing stopping mean the solid has gone?',
  lead:
    'No — a spatula of solid is more than 5 mL of a 0.1 M solution can get through, so it is the **solution** ' +
    'that runs out first.',
  kind: 'watch',
  body: [
    'A bubble is not decoration. Each one starts on the **surface of the solid**, because that is where the ' +
      'reaction is actually happening; the gas has nowhere to go until enough of it has gathered in one place to ' +
      'break away, and then it floats free, wobbles up through the liquid and bursts into the head of foam.',
    'The tube is open at the top, so gas is escaping from its mouth the whole time it is being made. A gas test ' +
      'is worth running while the reaction is still working, not a quarter of an hour later.',
    'The two reagents do not run out together, either. A spatula of solid is far more than 5 mL of a 0.1 M ' +
      'solution can ever get through, so it is the **solution** that is exhausted first: the bubbles stop while ' +
      'the solid is still sitting on the bottom, pitted where it was attacked. That is worth knowing before you ' +
      'fill in the table — **the fizzing stopping does not mean the solid has gone.**',
  ],
};

const NAMING_METHOD: TeachSection = {
  heading: 'How do you put a name to a gas?',
  lead:
    'Two tests, asking two different questions: a **burning splinter** asks what the gas does to a flame, and ' +
    '**lime water** responds to one gas only.',
  kind: 'how',
  body: [
    'Two tests, asking two different questions. A **burning splinter** held at the mouth asks what the gas does ' +
      'to a flame — does it burn, or does it put the flame out? **Lime water** responds to one gas and one gas ' +
      'only, and the card on the bench says which result means what.',
    'Run the test yourself and read it yourself. **Effervescence names no gas**, and neither does this panel.',
  ],
};

const HELD_BACK: TeachSection = {
  heading: 'What will this panel not tell you?',
  lead:
    'Which gas came off which tube — the equations above carry a **?** where each gas goes, and they will keep it.',
  kind: 'how',
  body: [
    'The equations above carry a **?** where each gas goes, and they will carry it however long you look at ' +
      'them. What each tube showed, and which gas came off it, are the marked answers on this bench. Go and look ' +
      'at the tube; go and run the test.',
  ],
};

const NAMED_GASES: TeachSection = {
  heading: 'Your table is in — which gases were they?',
  lead:
    '**Hydrogen** off the zinc, which pops at a burning splinter, and **carbon dioxide** off the carbonate, ' +
    'which smothers the flame and turns lime water milky.',
  kind: 'after',
  equations: ['2H₂ + O₂ → 2H₂O', 'Ca(OH)₂ + CO₂ → CaCO₃↓ + H₂O'],
  body: [
    'Your observations are marked, so the question marks can come out — they are filled in above.',
    'A **burning splinter** at the mouth: hydrogen burns explosively in air, and that small explosion is the ' +
      '**pop**. Carbon dioxide neither burns nor supports burning, so it puts the flame out instead. One gas ' +
      'answers the flame by feeding it and the other by smothering it, which is what makes the test worth doing.',
    '**Lime water** is a solution of calcium hydroxide. Carbon dioxide turns it milky because the calcium ' +
      'carbonate that forms will not dissolve, and a suspension of a fine white solid is what stops a clear ' +
      'liquid being clear. Hydrogen does nothing to lime water at all — which is why a lime water tube that ' +
      'stayed clear is a **real result**, and not a failed one.',
  ],
};

/**
 * The panel's contents.
 *
 * @param revealed true once the practical is finished and the marks are settled.
 */
export function acidBaseTeach(revealed: boolean): readonly TeachSection[] {
  const eq = revealed ? NAMED : HIDDEN;
  return [
    LITMUS,
    ZINC(eq),
    CARBONATE(eq),
    NO_REACTION,
    BUBBLES,
    revealed ? NAMED_GASES : NAMING_METHOD,
    ...(revealed ? [] : [HELD_BACK]),
  ];
}

export type { TeachSection };
