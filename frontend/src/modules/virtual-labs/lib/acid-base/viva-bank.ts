import type { BenchVivaQuestion } from '@labs/types/lab-bench';

/**
 * THE VIVA BANK for this practical — 15 questions across 5 categories.
 *
 * Five are drawn per attempt, one from each category where the bank allows,
 * with the options shuffled and the correct answer carried by identity. See
 * `@labs/lib/viva.ts`; never read this list to mark an answer.
 *
 * The questions and their explanations are the reference bench's own words,
 * carried over verbatim.
 */
export const VIVA_BANK: readonly BenchVivaQuestion[] = [
  {
    cat: 'principle',
    q: 'Zinc gives hydrogen with dilute HCl and also with dilute NaOH. Why does that matter in this experiment?',
    a: 2,
    o: [
      'It shows zinc is a very reactive metal',
      'It proves NaOH is really an acid',
      'Effervescence with zinc alone cannot tell you whether the solution is an acid or a base',
      'It means the zinc was impure',
    ],
    why: 'Zinc is amphoteric — it reacts with acids and with alkalis, giving hydrogen both times. Only the litmus test separates the two solutions.',
  },
  {
    cat: 'principle',
    q: 'When hydrochloric acid dissolves in water it is behaving as…',
    a: 1,
    o: [
      'a substance that takes OH⁻ out of the water',
      'a substance that hands H⁺ to the water',
      'a salt that simply dissolves without changing anything',
      'an oxidising agent',
    ],
    why: 'An acid in water is an H⁺ donor; an alkali supplies OH⁻. Every test in this practical is ultimately a test for one or other of those two populations.',
  },
  {
    cat: 'principle',
    q: 'Sodium carbonate is the salt of a strong base and a weak acid. Its solution is therefore…',
    a: 0,
    o: [
      'itself basic, which is why it has nothing to react with in the sodium hydroxide tube',
      'strongly acidic',
      'exactly neutral, like distilled water',
      'able to turn blue litmus red',
    ],
    why: 'The carbonate ion takes H⁺ off water, leaving the solution basic. Put a base into a base and there is no H⁺ for it to take — so nothing happens at all.',
  },
  {
    cat: 'apparatus',
    q: 'Both a blue and a red litmus solution are kept on the bench because…',
    a: 3,
    o: [
      'blue litmus is for solutions and red for solids',
      'one is a spare in case the other runs out',
      'the two are used on alternate tubes to save reagent',
      'one of them reports acids and the other reports bases, so a single colour could only ever answer half the question',
    ],
    why: 'Blue litmus turning red identifies an acid; red litmus turning blue identifies a base. Using one alone leaves the other half of the conclusion unsupported.',
  },
  {
    cat: 'apparatus',
    q: 'The delivery tube leads into lime water rather than into plain water because…',
    a: 1,
    o: [
      'lime water dissolves hydrogen and water does not',
      'calcium hydroxide gives an insoluble white carbonate with CO₂, and that milkiness is the visible result',
      'water would boil when the gas passed through it',
      'lime water conducts the gas better',
    ],
    why: 'Ca(OH)₂ + CO₂ → CaCO₃ + H₂O. The white insoluble carbonate is what you see. Plain water would show you nothing at all.',
  },
  {
    cat: 'apparatus',
    q: 'A burning splinter is brought to the mouth of the zinc tube, not a glowing one, because…',
    a: 2,
    o: [
      'a glowing splinter is put out by every gas',
      'a burning splinter is the safer of the two',
      'the gas expected here burns, and a flame is needed to set it alight — a glowing splinter is the test for oxygen',
      'a glowing splinter responds only to carbon dioxide',
    ],
    why: 'A glowing splinter bursting into flame identifies oxygen. Hydrogen has to be lit, and its little explosion is the pop.',
  },
  {
    cat: 'procedure',
    q: 'You add a solid to dilute HCl and see brisk effervescence. Before you write “carbon dioxide” in your table you must…',
    a: 0,
    o: [
      'test the gas — pass it through lime water or hold a burning splinter at the mouth',
      'weigh the solid',
      'wait for the fizzing to stop',
      'nothing: fizzing with an acid always means carbon dioxide',
    ],
    why: 'Zinc, magnesium and iron all fizz with dilute acid and give hydrogen, not carbon dioxide. Effervescence says a gas is coming off; only a test says which gas.',
  },
  {
    cat: 'procedure',
    q: 'The splinter is held at the mouth of the tube and never pushed down inside it because…',
    a: 3,
    o: [
      'the flame would be put out by the damp glass',
      'the gas lies at the bottom of the tube',
      'the splinter would be wetted by the solution',
      'the gas burns where it meets the air at the mouth, and taking a flame into a tube full of it risks the lot going up at once',
    ],
    why: 'Hydrogen burns only where it can reach oxygen. The mouth is where the two meet, and it is also where a small flame stays a small flame.',
  },
  {
    cat: 'procedure',
    q: 'Both tubes of a pair are given the same volume of solution and the same spatula of solid. Why?',
    a: 1,
    o: [
      'to use the reagents up at the same rate',
      'so that any difference between them can only be down to the solution itself',
      'because the tubes would not otherwise fit the rack',
      'because the reaction will not start unless the amounts match',
    ],
    why: 'The pair is a comparison. If two things differ, only one of them may be allowed to vary, and here that one is the solution under test.',
  },
  {
    cat: 'errors',
    q: 'A splinter is held at the mouth of the zinc tube a second after the zinc goes in, and nothing happens. The sound conclusion is…',
    a: 2,
    o: [
      'that tube gives no gas',
      'the gas must be carbon dioxide',
      'too little gas has collected yet, so the test has said nothing and must be repeated while the tube is fizzing',
      'the zinc was not reacting',
    ],
    why: 'A test at the mouth needs gas at the mouth. A negative result from a tube that has not yet filled is not a result — it is a test done too early.',
  },
  {
    cat: 'errors',
    q: 'The lime water has stood in an unstoppered bottle for weeks and is faintly cloudy before anything is passed through it. Using it would…',
    a: 0,
    o: [
      'give a false positive, since the milkiness it is judged by is already there',
      'make no difference, as the cloudiness settles out',
      'stop the gas dissolving in it altogether',
      'turn any gas passed through it into carbon dioxide',
    ],
    why: 'Lime water left open takes carbon dioxide from the air and goes milky on its own. A test is only trustworthy when the blank starts clear.',
  },
  {
    cat: 'errors',
    q: 'Far too much litmus solution is squeezed into a tube. The trouble with that is…',
    a: 1,
    o: [
      'the litmus turns the opposite colour when it is concentrated',
      'the colour is too deep to judge, and the dye itself is now a part of what is in the tube',
      'the solution in the tube becomes a base',
      'the tube warms up and the colour cannot settle',
    ],
    why: 'Litmus is an indicator, not a reagent: a few drops report the solution, while a flood of it dilutes the solution and swamps the colour being read.',
  },
  {
    cat: 'interpretation',
    q: 'A gas burns with a sharp pop when a burning splinter is held at the mouth of the tube. The gas is…',
    a: 1,
    o: [
      'carbon dioxide',
      'hydrogen',
      'oxygen',
      'nitrogen',
    ],
    why: 'Hydrogen burns explosively in air: 2H₂ + O₂ → 2H₂O. That small explosion is the pop. Oxygen would make the splinter burn more brightly instead.',
  },
  {
    cat: 'interpretation',
    q: 'Carbon dioxide turns lime water milky because…',
    a: 3,
    o: [
      'it bleaches the lime water',
      'it dissolves the calcium hydroxide',
      'it makes the lime water boil',
      'insoluble calcium carbonate is formed: Ca(OH)₂ + CO₂ → CaCO₃ + H₂O',
    ],
    why: 'The milkiness is a white precipitate of calcium carbonate. Passing excess CO₂ through it dissolves the precipitate again as calcium hydrogen carbonate.',
  },
  {
    cat: 'interpretation',
    q: 'Red litmus solution is added to a solution and stays red. What can you conclude?',
    a: 1,
    o: [
      'The solution is definitely an acid',
      'The solution is not basic — it could be acidic or neutral',
      'The solution is definitely neutral',
      'Nothing at all can be concluded',
    ],
    why: 'Red litmus only reports bases. To show the solution is an acid you need blue litmus to turn red as well.',
  },
];
