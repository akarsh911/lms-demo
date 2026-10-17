import type { TeachSection } from '@labs/components/teach-sections';

import { SAMPLES, natureOf, truePhOf } from './chemistry';

/** Why each sample sits where it does — printed only once the marks are in. */
const STRENGTH: Readonly<Record<string, string>> = {
  HCl: 'strong acid — ionises completely, so essentially every molecule hands its H⁺ to the water',
  CH3COOH: 'weak acid — an equilibrium, and only a small fraction of the molecules let go of their H⁺',
  Lemon: 'weak acid, but concentrated — citric acid is weak, yet lemon juice carries a great deal of it',
  Water: 'neither — only water’s own splitting, and the two halves are exactly equal',
  NaHCO3: 'weak base — the salt of a strong base and a weak acid, so its ion takes H⁺ back off the water',
  NaOH: 'strong base — dissolves completely into Na⁺ and OH⁻, so every formula unit supplies an OH⁻',
};

const ALWAYS: readonly TeachSection[] = [
  {
    heading: 'What is the indicator actually responding to?',
    lead:
      'Only **how many H⁺ are loose in the solution around it** — which is exactly what pH measures, and never a ' +
      'count of acid molecules.',
    kind: 'why',
    equations: ['H₂O ⇌ H⁺ + OH⁻', 'pH = −log₁₀[H⁺]'],
    body: [
      'Water is never only H₂O. A tiny share of it is always split apart into **H⁺** and **OH⁻**, and in pure ' +
        'water the two are made in exactly equal numbers. That balance point sits in the middle of the scale.',
      'An **acid** dissolves and hands extra H⁺ to the water, so the H⁺ population climbs. A **base** supplies ' +
        'OH⁻, and OH⁻ takes H⁺ out of circulation, so the H⁺ population falls. The two are tied together — push ' +
        'one up and the other must come down.',
      'An indicator never counts acid molecules. It only ever responds to **how many H⁺ are loose in the ' +
        'solution around it**, and that is exactly what pH measures: pH = −log₁₀[H⁺].',
      'Pour two different samples into one tube and every H⁺ one of them supplied cancels an OH⁻ from the ' +
        'other, one for one. What survives belongs to neither sample — which is why the bench asks you to empty ' +
        'and rinse rather than top a tube up.',
    ],
  },
  {
    heading: 'Why red one way and blue the other?',
    lead:
      'Universal indicator is a blend of dyes, each one a weak acid that is one colour while it holds its H⁺ and ' +
      'another once it has let go.',
    kind: 'why',
    body: [
      'Universal indicator is not one dye but a blend of several, and each of them is itself a weak acid. Every ' +
        'one exists in two forms — one still holding its H⁺, one that has let it go — and the two forms are ' +
        'different colours.',
      'Crowd the solution with H⁺ and the dyes are pushed back onto the form that keeps its H⁺: that form looks ' +
        '**red, then orange, then yellow**. Take the H⁺ away with OH⁻ and the dyes give theirs up too, and the ' +
        'form left behind looks **blue, then indigo, then violet**.',
      'Because the members of the blend flip over at different points, the mixture slides through a different ' +
        'colour at every step of the scale. That is the only reason the chart on the bench can be read at all.',
    ],
  },
  {
    heading: 'Does it matter whether I use paper or drops?',
    lead:
      'Not to the answer: a strip carries the same dyes fixed into its fibres, and either way **the colour is the ' +
      'measurement**.',
    kind: 'how',
    body: [
      'A strip of pH paper is those same dyes fixed into its fibres. Dip it and the solution is drawn up into ' +
        'the paper, where the dyes meet it and settle on a colour; lift the strip out and that colour stays put.',
      'Drops of universal indicator do it the other way round. They diffuse through the whole tube until every ' +
        'dye molecule sits in the same solution, so the entire column reports one thing.',
      'Either way **the colour is the measurement**. Holding it against the chart is the reading, and the ' +
        'reading is yours to take.',
    ],
  },
  {
    heading: 'Is strong the same as concentrated?',
    lead:
      'No — _strong_ is what fraction of the molecules ionise, _concentrated_ is how many molecules there are to ' +
      'begin with.',
    kind: 'why',
    body: [
      'Two acids at the same concentration need not give the same H⁺ population. A **strong** acid ionises ' +
        'completely: essentially every molecule gives up its H⁺ the moment it dissolves. A **weak** acid is an ' +
        'equilibrium — most of its molecules keep hold of their H⁺ and only a small fraction let go, so the same ' +
        'amount of it leaves far fewer H⁺ loose.',
      'The same split runs on the other side: a strong base releases all of its OH⁻, a weak one only a little. ' +
        '_Strong_ and _concentrated_ are therefore different words. One is about what fraction of the molecules ' +
        'ionise, the other about how many molecules there are.',
      'Each step along the scale is a **tenfold** change in H⁺, so "far fewer" becomes whole steps of difference ' +
        'very quickly.',
    ],
  },
  {
    heading: 'What will this panel not tell you?',
    lead:
      'Which sample reads what, and whether it is acidic, neutral or basic — nothing above names a sample or a ' +
      'number.',
    kind: 'how',
    body: [
      'Which sample reads what, and whether it is acidic, neutral or basic, is exactly what you are being ' +
        'marked on — so nothing above names a sample or a number. It is a teaching aid, not an answer key. ' +
        'Submit your readings and the books open.',
    ],
  },
];

/** The books, opened once the practical is over and nothing is left to mark. */
const TRUTH: TeachSection = {
  heading: 'Your readings are in — what did each read?',
  lead:
    'The table below sets every sample beside its pH, and the spread from strong acid to strong base is the point ' +
    'of the whole experiment.',
  kind: 'after',
  body: [
    'Your marks are recorded, so the books can be opened. Every number below came from the same calculation ' +
      'that coloured the liquid on the bench: the H⁺ and OH⁻ each sample supplies, netted off against each ' +
      'other, then **pH = −log₁₀[H⁺]**.',
    'Read down the pH column and the spread is the point of the whole experiment. A strong acid and a strong ' +
      'base sit at the two ends; the weak ones sit well inside them even though they are acids and bases just ' +
      'the same; and water sits in the middle because its H⁺ and OH⁻ are equal.',
  ],
  table: {
    caption: 'A clean 5 mL of each sample, on its own',
    columns: ['Sample', 'pH', 'Nature', 'Why it sits there'],
    rows: SAMPLES.map((s) => {
      const ph = truePhOf(s.id);
      return [s.name, ph.toFixed(1), natureOf(ph), STRENGTH[s.id] ?? ''];
    }),
  },
};

/**
 * 10 to a power, written the way a textbook writes it. One helper so the
 * exponents in the ladder cannot drift from each other or from the prose.
 */
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

function molar(exponent: number): string {
  if (exponent === 0) return '1';
  const digits = [...String(Math.abs(exponent))].map((d) => SUPERSCRIPT[Number(d)] ?? d).join('');
  return `10${exponent < 0 ? '⁻' : ''}${digits}`;
}

/** The rungs printed in the ladder: every second decade, plus the neutral one. */
const DECADES: readonly number[] = [0, 2, 4, 6, 7, 8, 10, 12, 14];

/**
 * THE ARITHMETIC, and why none of it is worked on a bottle from this bench.
 *
 * A student is marked here on the pH of each of the six samples, on calling each
 * one acidic / neutral / basic, and on the order those readings put them in
 * (`marking.ts`: the `ph`, `nature` and `order` parts). Those six pH values are
 * therefore the answer key, and they are round numbers — the bench's samples are
 * carried as effective concentrations of 10⁻¹, 10⁻², 10⁻³ and 10⁻⁷ mol/L of H⁺
 * and 10⁻¹, 10⁻⁵ mol/L of OH⁻, so they land on whole decades. A worked example
 * on a decade is therefore one step away from being a worked example on a
 * sample, and the step is only that nobody has said the name out loud.
 *
 * So the line held here is: **no sample is named anywhere in these three
 * sections, and the two worked examples are put on decades no bottle on this
 * bench occupies** — pH 4 forwards and pH 5 backwards. They are as round as any
 * other decade and cost the teaching nothing, and they mean that even if these
 * sections were ever moved out from behind `revealed` by a later edit, the
 * arithmetic would still give nothing away. The ladder table is the one place
 * the marked decades appear, and it has to: a table of powers of ten with rungs
 * missing would be a worse reference than no table, and it is a page out of a
 * textbook rather than a statement about anything in the rack. The `TRUTH`
 * section above is the only place a name and a number are set side by side, and
 * it has earned that by the marks already being in.
 *
 * Three headings rather than one because there are three separate claims — how
 * the logarithm is worked, why 7 is the neutral point, and what a colour match
 * can honestly resolve to — and one heading over ten paragraphs reads as a wall.
 */
const ARITHMETIC: readonly TeachSection[] = [
  {
    heading: 'Where does the number on the chart come from?',
    lead:
      'Write the H⁺ concentration as a power of ten and pH is that **exponent** with its sign flipped — which is ' +
      'the whole of what the logarithm is doing.',
    kind: 'after',
    equations: [
      'pH = −log₁₀[H⁺]',
      'forwards:  [H⁺] = 10⁻⁴ mol/L  →  pH = −log₁₀(10⁻⁴) = −(−4) = 4',
      'backwards:  pH = 5  →  [H⁺] = antilog(−5) = 10⁻⁵ mol/L = 0.00001 mol/L',
    ],
    body: [
      'The H⁺ concentration of an ordinary solution is an awkward number to carry about: a thousandth of a mole ' +
        'per litre, a hundred-thousandth, a ten-millionth. Writing them as powers of ten tidies them up, and once ' +
        'they are powers of ten the only part that changes from one to the next is the **exponent**. The pH scale ' +
        'is that exponent and nothing more — read off, and its sign flipped so the number comes out positive.',
      'That is all a logarithm is doing here. log₁₀ of a power of ten _is_ the power: log₁₀(10⁻⁴) is simply −4. ' +
        'Put the minus sign of the definition in front of it and **pH = 4**. Forwards, from a concentration to a ' +
        'pH, the work is to write the concentration as a power of ten and then change the sign of the exponent.',
      'Backwards it is the same move in reverse. Given **pH = 5**, the exponent must have been −5, so [H⁺] = ' +
        '10⁻⁵ mol/L — a hundred-thousandth of a mole in every litre. Every reading you matched off the chart ' +
        'stands for a concentration in exactly this way, and this is the calculation that turns one into the other.',
      'The flipped sign is also why the scale runs the way it does. A _bigger_ H⁺ concentration is a _less_ ' +
        'negative exponent, so it gives a _smaller_ pH. The most acidic solution on any bench is the one with the ' +
        'lowest number against it, which feels backwards until you have seen where the number came from.',
      'And because each step is a whole power of ten, **one pH unit is a tenfold change in H⁺ and two units a ' +
        'hundredfold**. This is the single thing most often got wrong. pH 4 and pH 6 are not "both a bit acidic, ' +
        'one slightly more" — the first has a hundred times the H⁺ of the second. It is also why diluting an acid ' +
        'tenfold moves its pH by exactly one, and why halving it moves it by only about 0.3: the scale counts ' +
        'multiplications, not additions.',
    ],
  },
  {
    heading: 'Why is 7 neutral, and not just the middle?',
    lead:
      'Because [H⁺] × [OH⁻] is fixed at 10⁻¹⁴, so two equal concentrations must each be 10⁻⁷ — and −log₁₀(10⁻⁷) ' +
      'is 7.',
    kind: 'after',
    equations: [
      'Kw = [H⁺][OH⁻] = 10⁻¹⁴ mol²/L²  (at 25 °C)',
      'neutral means [H⁺] = [OH⁻],  so each is 10⁻⁷ mol/L  →  pH = 7',
      'pH + pOH = 14',
    ],
    body: [
      'Water splitting into H⁺ and OH⁻ is an equilibrium, and like every equilibrium it settles somewhere ' +
        'definite. What is fixed is not either concentration on its own but their **product**: multiply the H⁺ ' +
        'concentration by the OH⁻ concentration, in any aqueous solution whatever, and at 25 °C you get 10⁻¹⁴. ' +
        'That product has a name, **Kw**, the ionic product of water.',
      'A fixed product is what ties the two together. Add acid and the H⁺ concentration rises, so the OH⁻ ' +
        'concentration must fall by the same factor to keep the product where it was; add a base and it happens ' +
        'the other way round. Neither ion is ever entirely absent — there is OH⁻ in the strongest acid you will ' +
        'ever pour, just vanishingly little of it.',
      '**Neutral** means the two are present in equal numbers. Two equal numbers whose product is 10⁻¹⁴ must ' +
        'each be 10⁻⁷, and −log₁₀(10⁻⁷) is 7. So pH 7 is the neutral point _because that is where H⁺ and OH⁻ are ' +
        'equal_, and it lands in the middle of the printed scale as a consequence of that, not as a reason for ' +
        'it. A scale drawn from 0 to 20 would still have its neutral point at 7.',
      'Two things follow that are worth knowing. The ends of the scale are not fences: 0 and 14 are where the ' +
        'concentrations we normally meet run out, and a solution can sit outside them. And because Kw depends on ' +
        'temperature — warm the water and a little more of it splits — the neutral point moves too. Hot water is ' +
        'still neutral, with H⁺ and OH⁻ still equal, at a pH a little below 7. That is why **25 °C** is written ' +
        'beside the number rather than left to be assumed.',
      'Read across any row of the ladder below and the two concentrations multiply to 10⁻¹⁴. Read down it and ' +
        'every step of two in pH is a hundredfold change in both columns at once.',
    ],
    table: {
      caption: 'The ladder of round values, at 25 °C',
      columns: ['pH', '[H⁺] (mol/L)', '[OH⁻] (mol/L)'],
      rows: DECADES.map((ph) => [String(ph), molar(-ph), molar(-(14 - ph))]),
    },
  },
  {
    heading: 'Why a whole number and not three decimals?',
    lead:
      'The chart is the instrument, so its printed squares are the resolution of the reading — a unit, or a half ' +
      'where the colour plainly sits between two.',
    kind: 'after',
    body: [
      'A chart has one printed square per unit of pH, and reading it is an eye judgement about which square a wet ' +
        'strip most nearly matches. When the colour clearly sits between two squares you may honestly say so and ' +
        'record a half — and that is the end of what the method can resolve. The resolution of the reading is the ' +
        'resolution of the **chart**, because the chart is the instrument.',
      'So a pH written to two decimal places off a strip of paper is **false precision**: digits claimed by the ' +
        'person rather than delivered by the measurement. It is not that the solution has no further decimals — ' +
        'it has a perfectly definite H⁺ concentration — it is that a colour match cannot reach them. The ' +
        'instrument that can is a **pH meter**, whose glass electrode develops a small voltage that varies with ' +
        'H⁺ and which is calibrated against standard buffer solutions first; that reads to about 0.01, and it is ' +
        'the only reason two-decimal pH values exist in a book at all.',
      'Put the half unit through the arithmetic above and you can see what it is worth. Half a pH unit is a ' +
        'factor of 10 to the power of a half in concentration, which is about **three**. So "pH 5, give or take a ' +
        'half" already means "somewhere between roughly a third as much H⁺ and three times as much" — a wide ' +
        'window by the standards of most measurements, and a reminder that on a logarithmic scale a small-looking ' +
        'uncertainty is never small.',
      'None of which makes the reading worthless. To the nearest unit or half unit is exactly what this practical ' +
        'asks of you, it is enough to tell acidic from neutral from basic with room to spare, and it is enough to ' +
        'put six samples in order. Quote it to the precision you actually have, and no further.',
    ],
  },
];

/**
 * The panel's contents.
 *
 * @param revealed true once the practical is finished and the marks are settled.
 */
export function phTeach(revealed: boolean): readonly TeachSection[] {
  return revealed ? [...ALWAYS.slice(0, -1), TRUTH, ...ARITHMETIC] : ALWAYS;
}

export type { TeachSection };
