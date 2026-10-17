import type { TeachSection } from '@labs/components/teach-sections';

/**
 * The carbonate reaction, with a hole where the gas goes.
 *
 * Written once so the redacted and the named form cannot drift into two
 * different equations.
 */
const carbonateEq = (gas: string): string => `CH₃COOH + NaHCO₃ → CH₃COONa + H₂O + ${gas}↑`;

const IONISE: TeachSection = {
  heading: 'Why is vinegar a weak acid?',
  lead:
    'It hands its hydrogen ion to water only reluctantly, so at any moment about one molecule in a hundred is in ' +
    'pieces and the rest are whole.',
  kind: 'why',
  // The structure behind the equation: which hydrogen leaves, why the anion
  // holds together, and which side the balance sits on. Named, not supplied —
  // this file is pure data and the bench's `Teach` wrapper hands the drawing in.
  figure: 'ionSvg',
  equations: ['CH₃COOH + H₂O ⇌ CH₃COO⁻ + H₃O⁺'],
  body: [
    'An acid works by handing a hydrogen ion over to the water around it. Ethanoic acid does that only ' +
      'reluctantly, and the reaction runs in both directions at once — **the double arrow is the whole point.** It ' +
      'settles with most of the acid still in one piece.',
    'An acid that comes apart only partly like that is called **weak**; one that comes apart completely is ' +
      '**strong**. At any moment roughly one ethanoic acid molecule in a hundred is in pieces, against every ' +
      'single molecule of a strong acid at the same concentration.',
    '_Weak_ is not _dilute_. One is about how far the molecules come apart, the other about how many of them are ' +
      'in the bottle — so two bottles of the same concentration can put very different amounts of H⁺ into a tube, ' +
      'and that is the comparison this practical is built around.',
  ],
};

const MIXING: TeachSection = {
  heading: 'Why will some liquids not mix with water?',
  lead:
    'Water only lets in something that has a lopsided or charged part of its own to offer in exchange for the ' +
    'bonds it breaks.',
  kind: 'why',
  // Hydrogen bonding drawn at the scale it happens on. The drawing keeps the
  // same promise the last paragraph makes — it shows no tube and counts no
  // layers until the table has been handed in.
  figure: 'mixSvg',
  body: [
    'A water molecule is bent and lopsided: the oxygen end carries a little negative charge and the hydrogen ends ' +
      'a little positive, so every water molecule clings to its neighbours. For something to dissolve in water it ' +
      'has to be able to join in — it needs a lopsided or charged part of its own to offer in exchange for the ' +
      'bonds it breaks.',
    'A long chain of carbon and hydrogen has nothing lopsided anywhere along it. Water has nothing to take hold ' +
      'of, so it keeps to its own company and the two liquids stay apart. Ethanoic acid is the opposite case: its ' +
      '**–COOH** end is as lopsided as water itself and hydrogen-bonds to water exactly as water does to water.',
    'Shaking forces any two liquids together as tiny droplets, and that cloudy state is a real thing — an ' +
      '**emulsion** — but it is not the answer to the question being asked. The answer is what the tube looks ' +
      'like once it has been **left to stand**.',
  ],
};

const LITMUS: TeachSection = {
  heading: 'What is the litmus paper responding to?',
  lead:
    'Only how much H⁺ is in the solution around it — nothing else about the liquid matters to the dye at all.',
  kind: 'why',
  body: [
    'Litmus is a dye whose molecule takes one shape while it is holding a hydrogen ion and another once it has ' +
      'let go, and the two shapes absorb light differently. So the colour is a direct report of **how much H⁺ is ' +
      'in the solution around the paper** — nothing else about the liquid matters to it.',
    'That is why the chart on the bench is laid out against pH and not against a list of chemicals, and it is ' +
      'why a strip is worth dipping in a weak acid and a strong one both: the dye answers the same question in ' +
      'each, and the answers need not be the same.',
  ],
};

const CARBONATE = (gas: string): TeachSection => ({
  heading: 'Why does a hydrogencarbonate fizz in acid?',
  lead:
    'The H⁺ the acid has let go of pulls the hydrogencarbonate ion apart, and one of the pieces is a gas that ' +
    'will not stay dissolved.',
  kind: 'why',
  equations: [carbonateEq(gas)],
  body: [
    'Every acid does the same thing to a carbonate or a hydrogencarbonate. The H⁺ the acid has let go of pulls ' +
      'the hydrogencarbonate ion apart; what is left behind is a salt and water, and a gas that will not stay ' +
      'dissolved, so it forces its way out through the liquid.',
    'The rate follows from how much H⁺ is loose at that instant, so the reaction starts at its fastest, slows as ' +
      'the acid is used up, and stops when either the acid or the solid runs out. The same concentration of a ' +
      '_strong_ acid would drive it much harder from the very first second — which is the weak-acid point again, ' +
      'made visible in bubbles instead of in a colour.',
  ],
});

const LIME: TeachSection = {
  heading: 'What is the lime water there for?',
  lead:
    'It turns the gas into a **yes-or-no** question: the gas goes in at one end, and either a solid comes out of ' +
    'a clear solution at the other or it does not.',
  kind: 'why',
  body: [
    'Lime water is a solution of calcium hydroxide, Ca(OH)₂ — and it is transparent, because that much calcium ' +
      'hydroxide will dissolve. A gas that behaves as an acid once it meets water reacts with the hydroxide in ' +
      'it, and the calcium salt that forms is **not** soluble.',
    'It cannot stay in solution, so it appears instead as an enormous number of particles too fine to settle, ' +
      'suspended right through the liquid. A suspension like that is exactly what stops a clear liquid being ' +
      'clear.',
    'So the delivery tube sets up a test with a **yes-or-no** answer: the gas goes in at one end, and whether a ' +
      'solid comes out of the solution at the other is the thing to watch for.',
  ],
};

const WAFTING: TeachSection = {
  heading: 'Why waft the vapour instead of sniffing it?',
  lead:
    'Wafting brings a little of a corrosive vapour across heavily diluted with air; a nose at the mouth of the ' +
    'tube gets the lot.',
  kind: 'watch',
  body: [
    'Ethanoic acid is **volatile**: it leaves the liquid easily at room temperature, which is why an open bottle ' +
      'of it can be noticed across a room. That is the only reason an odour test is possible at all — there is ' +
      'no nose in chemistry, only a vapour that has arrived.',
    'The vapour arrives whether you invite it or not. Wafting brings a little of it across, diluted with a great ' +
      'deal of air; putting your nose to the mouth of a tube brings the lot, and for a corrosive vapour that is ' +
      'how an accident happens. The technique is marked because it is the technique, not because the smell is ' +
      'different either way.',
  ],
};

const HELD_BACK: TeachSection = {
  heading: 'What will this panel not tell you?',
  lead:
    'No pH, no colour, no count of layers and no name for the gas — those are the eight rows and two conclusions ' +
    'you are marked on.',
  kind: 'how',
  body: [
    'No pH, no colour, no count of layers, and no name for the gas — the equation above keeps its **?** however ' +
      'long you look at it. Those are the eight rows and the two conclusions you are marked on.',
    'Measure the pH with the paper and read it off the chart yourself; let the shaken tubes stand and look down ' +
      'the whole length of the glass; and name the gas from your own test at the mouth of the tube.',
  ],
};

const TRUTH: TeachSection = {
  heading: 'Your table is in — what was the gas?',
  lead:
    'It is **carbon dioxide**, and the white solid it throws down in lime water is **calcium carbonate**.',
  kind: 'after',
  equations: [carbonateEq('CO₂'), 'Ca(OH)₂ + CO₂ → CaCO₃↓ + H₂O'],
  body: [
    'Your observations are marked, so the blank can be filled: it is **carbon dioxide**, and it is filled in above.',
    'The white solid the lime water throws down is **calcium carbonate**, and a suspension of it is what makes ' +
      'lime water milky. It is the same test that identifies the gas over any fizzing carbonate, which is why it ' +
      'is worth learning once and using everywhere.',
    'It is also the reaction behind baking powder: a hydrogencarbonate and a solid acid in the same tin, dry and ' +
      'inert until water brings them together, and then the same gas — this time trapped in dough instead of ' +
      'bubbled through a tube.',
  ],
};

/**
 * The panel's contents.
 *
 * @param revealed true once the practical is finished and the marks are settled.
 */
export function aceticAcidTeach(revealed: boolean): readonly TeachSection[] {
  return [
    IONISE,
    MIXING,
    LITMUS,
    CARBONATE(revealed ? 'CO₂' : '?'),
    LIME,
    WAFTING,
    revealed ? TRUTH : HELD_BACK,
  ];
}

export type { TeachSection };
