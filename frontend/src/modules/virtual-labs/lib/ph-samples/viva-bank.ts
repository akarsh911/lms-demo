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
    q: 'pH is a measure of…',
    a: 0,
    o: [
      'how many H⁺ ions are loose in the solution',
      'how much acid was poured out of the bottle',
      'how quickly the solution attacks a metal',
      'how deeply coloured the solution is',
    ],
    why: 'pH is defined from the H⁺ concentration alone: pH = −log₁₀[H⁺]. A large volume of a very dilute acid still has a high pH.',
  },
  {
    cat: 'principle',
    q: 'Which of these samples has the lowest pH?',
    a: 2,
    o: [
      'Lemon juice',
      'Dilute ethanoic acid',
      'Dilute hydrochloric acid',
      'Dilute sodium hydrogen carbonate',
    ],
    why: 'HCl is a strong acid — it ionises completely, so it gives the highest H⁺ concentration and the lowest pH, about 1. Ethanoic acid is weak and only partly ionises.',
  },
  {
    cat: 'principle',
    q: 'A solution of pH 5 holds how many times the H⁺ of a solution of pH 7?',
    a: 1,
    o: [
      'twice as much',
      'a hundred times as much',
      'ten times as much',
      'five times as much',
    ],
    why: 'Each step down the scale is a tenfold rise in H⁺, so two steps is ten × ten. That is why the scale is written as a logarithm at all.',
  },
  {
    cat: 'apparatus',
    q: 'Why is distilled water used for this test rather than tap water?',
    a: 3,
    o: [
      'Distilled water is cheaper',
      'Tap water damages pH paper',
      'Tap water is always acidic',
      'Tap water has dissolved salts and gases that shift its pH away from 7',
    ],
    why: 'Distilled water is close to neutral, so it gives the pH 7 reference. Tap water carries dissolved carbon dioxide and salts.',
  },
  {
    cat: 'apparatus',
    q: 'Universal indicator is used here in place of litmus because…',
    a: 0,
    o: [
      'it is a blend of dyes that changes colour right along the scale, so a value can be read and not just a verdict',
      'it is the only indicator that works on dilute solutions',
      'litmus cannot be used on bases',
      'it reacts with the sample and neutralises it',
    ],
    why: 'Litmus answers only “acid or base”. The members of the universal blend flip over at different pH values, so the mixture takes a different colour at every step of the chart.',
  },
  {
    cat: 'apparatus',
    q: 'The used strip is laid on a white tile rather than on the bench top because…',
    a: 1,
    o: [
      'the tile is unattackable by acid',
      'a white background is the only fair one to match a colour against',
      'the tile keeps the strip damp',
      'the strip would otherwise be too hot to handle',
    ],
    why: 'A coloured or dark surface shows through the wet paper and shifts the colour you judge. The chart is printed on white, so the strip has to be read on white.',
  },
  {
    cat: 'procedure',
    q: 'Why must a fresh strip of pH paper be used for each sample?',
    a: 0,
    o: [
      'A used strip still carries the previous solution and would give a false reading',
      'Strips lose colour after a minute',
      'One strip cannot absorb twice',
      'It makes no difference',
    ],
    why: 'Carrying acid across into a basic sample (or the reverse) changes what you are testing. Same reason the dropper is rinsed between samples.',
  },
  {
    cat: 'procedure',
    q: 'Only two or three drops of universal indicator are added to a tube, never a dropperful, because…',
    a: 2,
    o: [
      'the bottle would soon be emptied',
      'a few drops react faster than many',
      'the indicator is itself a mixture of weak acids, and a large amount of it would shift the very pH being measured',
      'more than three drops would turn any sample green',
    ],
    why: 'The dye is an acid too. A trace of it reports the solution; a flood of it starts to become the solution.',
  },
  {
    cat: 'procedure',
    q: 'When should the colour on a strip of pH paper be matched against the chart?',
    a: 1,
    o: [
      'the instant it touches the liquid, before any dye can move',
      'as soon as the colour has developed, and before the strip dries out',
      'only once the strip is completely dry',
      'a day later, when the dye has set',
    ],
    why: 'The dyes need a moment in the wet paper to settle on a colour, but a drying strip pales and its colour drifts. Read it while it is still damp.',
  },
  {
    cat: 'errors',
    q: 'A student dips one strip in the acid tube and then the same strip in the alkali tube. The second reading is…',
    a: 3,
    o: [
      'correct, because the paper reads whatever it touched last',
      'always too high',
      'unaffected — the strip is only paper',
      'untrustworthy: acid carried across on the strip has partly neutralised the alkali it is meant to be testing',
    ],
    why: 'Carry-over does not merely add a little colour; it changes the chemistry in the fibres where the dyes sit.',
  },
  {
    cat: 'errors',
    q: 'A tube still holds a little rinsing water when the sample is poured in. The reading will be…',
    a: 0,
    o: [
      'pulled towards 7, because the sample has been diluted',
      'unchanged, since water has no pH of its own',
      'too low for every sample',
      'impossible to take at all',
    ],
    why: 'Diluting an acid lowers its H⁺ and diluting an alkali lowers its OH⁻, so both drift towards the neutral middle. Tubes are drained after rinsing for exactly this reason.',
  },
  {
    cat: 'errors',
    q: 'Matching a colour by eye is good to about half a unit of pH. The honest way to report a reading is therefore to…',
    a: 2,
    o: [
      'quote it to two decimal places from the nearest swatch',
      'go on testing until one swatch matches exactly',
      'give the nearest value on the chart and accept that half a unit is the limit of the method',
      'write down the value the textbook gives for that sample',
    ],
    why: 'A result should never be quoted finer than the method can resolve, and it is never mended by copying the expected answer.',
  },
  {
    cat: 'interpretation',
    q: 'Universal indicator turns green in a solution. Its pH is about…',
    a: 1,
    o: [
      '1',
      '7',
      '11',
      '14',
    ],
    why: 'Green is the middle of the chart: pH 7, neutral. Reds and oranges are acidic, blues and violets are basic.',
  },
  {
    cat: 'interpretation',
    q: 'Dilute sodium hydrogen carbonate solution is…',
    a: 2,
    o: [
      'strongly acidic',
      'weakly acidic',
      'weakly basic, around pH 9',
      'strongly basic, around pH 13',
    ],
    why: 'NaHCO₃ is the salt of a strong base and a weak acid, so its solution is weakly basic — around pH 9, which reads blue on the chart.',
  },
  {
    cat: 'interpretation',
    q: 'A sample turns the paper orange. Which statement about it is safe to make?',
    a: 0,
    o: [
      'it is acidic, so its pH is below 7',
      'it is a strong acid',
      'it contains hydrochloric acid',
      'it will turn red litmus blue',
    ],
    why: 'The colour reports the H⁺ population and nothing else. It cannot say which acid is present, nor whether that acid is strong or weak — only where the solution sits on the scale.',
  },
];
