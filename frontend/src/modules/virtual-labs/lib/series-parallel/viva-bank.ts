import type { BenchVivaQuestion } from '@labs/types/lab-bench';

import type { LabMethod } from './method';

/**
 * THE VIVA BANK for this practical — 16 questions across 5 categories.
 *
 * Five are drawn per attempt, one from each category where the bank allows,
 * with the options shuffled and the correct answer carried by identity. See
 * `@labs/lib/viva.ts`; never read this list to mark an answer.
 *
 * The questions and their explanations are the reference bench's own words,
 * carried over verbatim.
 *
 * THREE OF THEM ARE ABOUT THE CONTROL THAT VARIES THE CURRENT, and that control
 * is different under the two methods. Each carries a `cells` variant, and the
 * bank is resolved for the method in use before a paper is drawn, so no student
 * is ever asked about a rheostat that was never on their bench.
 */
interface MethodVariant {
  q?: string;
  a?: number;
  o?: readonly string[];
  why?: string;
}

interface BankQuestion extends BenchVivaQuestion {
  /** What this question becomes under the cells method. */
  cells?: MethodVariant;
}

const BANK: readonly BankQuestion[] = [
  {
    cat: 'principle',
    q: 'Two resistors are joined in series. Their equivalent resistance is…',
    a: 1,
    o: [
      'smaller than either resistor',
      'larger than the larger resistor',
      'equal to the smaller resistor',
      'the average of the two',
    ],
    why: 'In series the current has to pass through both, one after the other, so the resistances add: Rs = R₁ + R₂.',
  },
  {
    cat: 'principle',
    q: 'Two resistors are joined in parallel. Their equivalent resistance is…',
    a: 0,
    o: [
      'smaller than the smaller resistor',
      'larger than the larger resistor',
      'equal to R₁ + R₂',
      'always exactly half of R₁',
    ],
    why: 'Parallel gives the current two paths, so it flows more easily: 1/Rp = 1/R₁ + 1/R₂, which is always less than the smaller one.',
  },
  {
    cat: 'principle',
    q: 'In the parallel combination, which quantity is the same for R₁ and R₂?',
    a: 1,
    o: [
      'The current through each',
      'The potential difference across each',
      'The power in each',
      'Nothing is the same',
    ],
    why: 'Both resistors connect between the same two points, so they have the same potential difference across them. The current divides between them.',
  },
  {
    cat: 'apparatus',
    q: 'To find Rs, where does the voltmeter go in the series circuit?',
    a: 2,
    o: [
      'Across R₁ only',
      'In series with the resistors',
      'Across R₁ and R₂ together',
      'Across the battery',
    ],
    why: 'Rs is the resistance of the whole combination, so you need the potential difference across the whole combination.',
  },
  {
    cat: 'apparatus',
    q: 'Why must the ammeter be in the main line, not in one branch, for the parallel combination?',
    a: 3,
    o: [
      'A branch would short-circuit the battery',
      'Ammeters only work in the main line',
      'To reduce the current',
      'To measure the total current drawn by both resistors',
    ],
    why: 'Rp = V / I needs the total current. An ammeter in one branch reads only the current through that one resistor.',
  },
  {
    cat: 'apparatus',
    q: 'The same rheostat is kept in all four circuits of this experiment mainly so that…',
    a: 0,
    o: [
      'each arrangement can be read at more than one current, and the mean of the ratios taken',
      'the two resistors are forced to carry equal currents',
      'the combination under test is made larger',
      'the voltmeter is protected from too large a potential difference',
    ],
    why: 'One pair of readings could be a fluke. Sliding the contact gives a fresh current for each arrangement, and averaging V/I over them smooths out the reading errors.',
    cells: {
      q: 'Each of the four arrangements is read at one cell, then two, then three, mainly so that…',
      a: 0,
      o: [
        'each arrangement can be read at more than one current, and the mean of the ratios taken',
        'the two resistors are forced to carry equal currents',
        'the combination under test is made larger',
        'the voltmeter is protected from too large a potential difference',
      ],
      why: 'One pair of readings could be a fluke. Each extra cell gives a fresh current for the same arrangement, and averaging V/I over the three smooths out the reading errors.',
    },
  },
  {
    cat: 'procedure',
    q: 'While R₁ is being measured on its own, R₂ should be…',
    a: 1,
    o: [
      'joined to R₁ at one end, so it is ready for the next part',
      'left entirely out of the circuit, carrying no current',
      'connected across the battery terminals',
      'connected in series with the voltmeter',
    ],
    why: 'Anything carrying current alongside R₁ is measured together with it. For that part of the experiment R₁ must be the only resistance under test.',
  },
  {
    cat: 'procedure',
    q: 'What must be done first when the wiring is changed from one arrangement to the next?',
    a: 2,
    o: [
      'Slide the rheostat to its smallest resistance',
      'Reverse the leads of the voltmeter',
      'Take the plug out of the key, so no current is flowing while the joints are altered',
      'Record the last reading again for comparison',
    ],
    why: 'Breaking a live circuit sparks at the joint, pits the contacts and swings the needles violently. The key comes out before anything is unscrewed.',
    cells: {
      o: [
        'Move the lead to the tap that gives the largest current',
        'Reverse the leads of the voltmeter',
        'Take the plug out of the key, so no current is flowing while the joints are altered',
        'Record the last reading again for comparison',
      ],
    },
  },
  {
    cat: 'procedure',
    q: 'The parallel arrangement draws the largest current of the four from the same battery. The sensible precaution is to…',
    a: 3,
    o: [
      'read the ammeter from a distance',
      'take only one reading of that arrangement',
      'disconnect the voltmeter while the key is in',
      'have the whole rheostat coil in the circuit before the key goes in, and watch the ammeter as you slide',
    ],
    why: 'Least resistance means most current, so the parallel circuit is the one that can drive the needle past full scale. Starting with the coil fully in keeps the first current small.',
    cells: {
      o: [
        'read the ammeter from a distance',
        'take only one reading of that arrangement',
        'disconnect the voltmeter while the key is in',
        'start it on **one cell** before the key goes in, and watch the ammeter as you add the next',
      ],
      why: 'Least resistance means most current, so the parallel circuit is the one that comes nearest full scale. Starting on a single cell keeps the first current small, and you see the needle climb before you commit to another cell.',
    },
  },
  {
    cat: 'errors',
    q: 'The three values of V/I for one arrangement come out slightly different from one another. You should…',
    a: 0,
    o: [
      'take their mean, and treat the spread as a measure of the uncertainty',
      'keep only the largest of the three',
      'keep only the value taken at the smallest current',
      'start the whole experiment again with new resistors',
    ],
    why: 'Each reading carries a least-count uncertainty, so small scatter is expected. Averaging reduces it; discarding awkward values does not.',
  },
  {
    cat: 'errors',
    q: 'A joint at one end of R₂ is not tightened properly. The measured value of the series combination will come out…',
    a: 2,
    o: [
      'smaller, because some current leaks past the joint',
      'unchanged, since the joint is not part of either resistor',
      'larger, because the resistance of the poor contact is measured along with the resistors',
      'larger, but only if the key is left in for a long time',
    ],
    why: 'A loose contact is extra resistance sitting in the same loop, and the voltmeter cannot tell it apart from the resistors. Series measurements are the ones it spoils most, because it lies inside the part being measured.',
  },
  {
    cat: 'errors',
    q: 'Each of the four arrangements is left switched on for a long time before its readings are taken. The values obtained tend to be…',
    a: 1,
    o: [
      'too small, because the cells run down and the current falls',
      'too large, because both resistors settle at a temperature above the room and resistance rises with temperature',
      'unaffected, because both resistors warm equally',
      'too small, because the meters warm up as well',
    ],
    why: 'Resistance wire is not indifferent to its own temperature. The remedy is the same in every part of the experiment: insert the key, read, and take it out again.',
  },
  {
    cat: 'interpretation',
    q: 'Physically, why does joining two resistors side by side give less resistance than either of them alone?',
    a: 3,
    o: [
      'The two resistances partly cancel each other',
      'The potential difference across the pair is shared between them',
      'The battery is made to deliver a larger emf',
      'The charge is offered a second path, so for the same potential difference more current flows altogether',
    ],
    why: 'Resistance measures how hard it is to drive charge through. Add a second road between the same two points and more traffic gets through for the same push — so the pair is easier to drive than either road alone.',
  },
  {
    cat: 'interpretation',
    q: 'Your four sets of readings are drawn on one set of V–I axes. The least steep of the four lines belongs to…',
    a: 2,
    o: [
      'R₁ on its own',
      'R₂ on its own',
      'the parallel arrangement',
      'the series arrangement',
    ],
    why: 'The steepness of a V–I line is the resistance itself. Parallel gives the smallest of the four resistances, so its line climbs most gently; the series line is the steepest.',
  },
  {
    cat: 'errors',
    q: 'A student reads both meters from a little to one side of the pointer and writes every value down to three decimal places. Which two faults is that?',
    a: 0,
    o: [
      'A parallax error, and a figure quoted finer than the scale can justify',
      'A zero error, and a rounding error',
      'A heating error, and a parallax error',
      'Neither is a fault, so long as both meters are treated the same way',
    ],
    why: 'The pointer stands above the scale, so from one side it lines up with the wrong division; and no meter can be read more finely than one of its smallest divisions, whatever a calculator prints afterwards.',
  },
];

function resolve(method: LabMethod): readonly BenchVivaQuestion[] {
  return Object.freeze(
    BANK.map(({ cells, ...q }) => (method === 'cells' && cells ? { ...q, ...cells } : q)),
  );
}

/**
 * The bank AS THIS BENCH ASKS IT. One frozen array per method, computed once:
 * the draw is cached against the bank's identity (see `@labs/lib/viva.ts`), so
 * handing back a fresh array each call would redraw the paper on every render.
 */
const RESOLVED: Readonly<Record<LabMethod, readonly BenchVivaQuestion[]>> = {
  cells: resolve('cells'),
  rheostat: resolve('rheostat'),
};

export function vivaBankFor(method: LabMethod): readonly BenchVivaQuestion[] {
  return RESOLVED[method];
}

/** The rheostat wording, for anything that only wants to count the bank. */
export const VIVA_BANK = RESOLVED.rheostat;
