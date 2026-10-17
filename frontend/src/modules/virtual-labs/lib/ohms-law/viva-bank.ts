import type { BenchVivaQuestion } from '@labs/types/lab-bench';

import type { LabMethod } from './method';

/**
 * THE VIVA BANK for this practical — 15 questions across 5 categories.
 *
 * Five are drawn per attempt, one from each category where the bank allows,
 * with the options shuffled and the correct answer carried by identity. See
 * `@labs/lib/viva.ts`; never read this list to mark an answer.
 *
 * The questions and their explanations are the reference bench's own words,
 * carried over verbatim.
 *
 * TWO OF THEM ARE ABOUT THE CONTROL THAT VARIES THE CURRENT, and that control
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
    q: 'Ohm’s law holds for a metallic conductor only if…',
    a: 3,
    o: [
      'the current is large',
      'the voltmeter is ideal',
      'the wire is made of copper',
      'its temperature and other physical conditions stay the same',
    ],
    why: 'V ∝ I only while temperature, length, area and material stay the same.',
  },
  {
    cat: 'principle',
    q: 'A component is described as non-ohmic when…',
    a: 1,
    o: [
      'it has a very large resistance',
      'the ratio V/I changes as the current through it changes',
      'it can only carry current one way round',
      'no current passes through it at all',
    ],
    why: 'Ohmic means V/I is the same at every current. A filament lamp or a diode fails that test, so its V–I graph is not a straight line through the origin.',
  },
  {
    cat: 'apparatus',
    q: 'Why is the voltmeter connected in parallel with the resistor?',
    a: 0,
    o: [
      'It measures the potential difference between two points, so it must touch both ends',
      'Parallel connection increases the current through the resistor',
      'It protects the ammeter from damage',
      'Its resistance is very low',
    ],
    why: 'A voltmeter compares the potential at two points. Its very high resistance means it draws almost no current, so it barely disturbs the circuit.',
  },
  {
    cat: 'apparatus',
    q: 'What is the rheostat for in this experiment?',
    a: 1,
    o: [
      'To measure the resistance of the wire',
      'To vary the current in the circuit',
      'To keep the current constant',
      'To protect the voltmeter',
    ],
    why: 'Changing the length of coil in the circuit changes the total resistance, which lets you take readings at several different currents.',
    cells: {
      q: 'What are the studs between the cells in the holder for?',
      a: 1,
      o: [
        'To measure the resistance of the wire',
        'To let you choose how many cells drive the circuit, and so vary the current',
        'To keep the current constant',
        'To protect the voltmeter',
      ],
      why: 'Each cell adds 1.5 V to the push. Taking the circuit off at B, C, D or E puts one, two, three or four cells behind the same resistor — four different currents, which is what a V–I graph needs. Only one stud may carry a lead: a wire from one stud to another short-circuits the cells between them.',
    },
  },
  {
    cat: 'apparatus',
    q: 'An ammeter is built with a very small resistance of its own so that…',
    a: 2,
    o: [
      'its needle can deflect over the whole scale',
      'it can safely be joined across a resistor as well',
      'putting it into the line hardly alters the very current it is there to measure',
      'it does not get warm while current passes',
    ],
    why: 'Anything placed in the line becomes part of the circuit. Only a resistance far smaller than the rest leaves the current essentially as it was — which is also why an ammeter must never be put across a component.',
  },
  {
    cat: 'apparatus',
    q: 'What does the plug key contribute to this circuit?',
    a: 1,
    o: [
      'It holds the current down to a value the meters can survive',
      'It is the one switch every bit of the current passes through, so a single plug makes and breaks the whole circuit',
      'It keeps the potential difference across the resistor steady',
      'It guards the meters against a battery joined the wrong way round',
    ],
    why: 'Because it sits in the main loop, taking the plug out stops everything — which is what lets the circuit be closed only for the moment a reading is taken. A key in a side branch would switch off that branch alone.',
  },
  {
    cat: 'procedure',
    q: 'Why should the plug key be removed when you are not taking readings?',
    a: 0,
    o: [
      'So the wire does not heat up and change its resistance',
      'Only to save the battery',
      'The voltmeter stops working if it stays in',
      'To bring the needles back to zero for the next reading',
    ],
    why: 'Current heats the wire (Joule heating). Resistance rises with temperature, and Ohm’s law assumes the temperature stays constant.',
  },
  {
    cat: 'procedure',
    q: 'Where should the rheostat contact be set just before the key is inserted?',
    a: 3,
    o: [
      'At the middle of the coil, so the needles sit mid-scale',
      'At the end that puts the least coil in the circuit, for a bold deflection',
      'It makes no difference, provided the key is put in quickly',
      'At the end that puts the most coil in the circuit, so the current starts at its smallest',
    ],
    why: 'Switching on at maximum resistance means nothing is ever overloaded at the first instant. You can always slide towards a larger current once you can see what the meters are doing.',
    cells: {
      q: 'How many cells should be in the circuit when the key is first inserted?',
      a: 3,
      o: [
        'Two, so the needles sit mid-scale',
        'All four, for a bold deflection',
        'It makes no difference, provided the key is put in quickly',
        'One — the lead on tap B — so the current starts at its smallest',
      ],
      why: 'Switching on with the smallest push means nothing is ever overloaded at the first instant. You can always move the lead along to a larger current once you can see what the meters are doing.',
    },
  },
  {
    cat: 'procedure',
    q: 'Current should be led into the ammeter at…',
    a: 2,
    o: [
      'whichever terminal is nearer the resistor',
      'either terminal — a d.c. ammeter has no polarity',
      'the red + terminal, the one wired towards the + of the battery',
      'the black − terminal, so the needle rises from zero',
    ],
    why: 'A moving-coil meter deflects one way only. Entering at the − terminal drives the needle back against its stop, which reads nothing and can bend the pointer.',
  },
  {
    cat: 'errors',
    q: 'Parallax error creeps into a meter reading when…',
    a: 1,
    o: [
      'the needle has not yet stopped swinging',
      'the eye is to one side, so the needle appears against the wrong division',
      'the least count has been worked out wrongly',
      'the two meters are read one after the other rather than together',
    ],
    why: 'The needle stands a little above the scale. Seen from the side it lines up with a division it is not actually over — so read with the eye vertically above the pointer.',
  },
  {
    cat: 'errors',
    q: 'The least count of an analog meter tells you…',
    a: 0,
    o: [
      'the smallest change in the quantity that its scale can show',
      'the largest reading the meter will survive',
      'how much its needle lags behind the current',
      'the error the maker guarantees in every reading',
    ],
    why: 'It is the range divided by the number of smallest divisions. No reading from that meter can be trusted to anything finer, so quoting extra decimal places is false precision.',
  },
  {
    cat: 'errors',
    q: 'A terminal screw is left loose. What does it add to the circuit?',
    a: 3,
    o: [
      'An extra potential difference opposing the battery',
      'Nothing at all, as long as the wire still touches',
      'A larger least count on both meters',
      'An unwanted contact resistance of its own, in series with everything else',
    ],
    why: 'A poor joint is simply more resistance in the loop. It lowers the current and, being in series with the part you are measuring, it can be counted as part of it — so every screw is tightened before the key goes in.',
  },
  {
    cat: 'errors',
    q: 'Readings taken over several minutes with the key left in are likely to drift because…',
    a: 2,
    o: [
      'the ammeter needle slowly loses its zero',
      'the voltmeter begins to draw a larger current',
      'the resistance wire warms up, and warm wire has a higher resistance',
      'the connecting leads become better conductors as they carry current',
    ],
    why: 'The wire dissipates I²R as heat and its resistance climbs with temperature. The later points then sit off the straight line drawn through the early ones.',
  },
  {
    cat: 'interpretation',
    q: 'The slope of your V–I graph (V on the y-axis) gives the…',
    a: 2,
    o: [
      'current',
      'power dissipated',
      'resistance',
      'conductance',
    ],
    why: 'Slope = ΔV / ΔI = R. With I on the y-axis instead, the slope would be 1/R, the conductance.',
  },
  {
    cat: 'interpretation',
    q: 'Why is the best-fit line drawn so that it passes through the origin?',
    a: 1,
    o: [
      'Because the graph paper is ruled from zero',
      'Because with no current there is no potential difference across the resistor, so (0, 0) is itself a reading',
      'Because the first reading is always the most accurate one',
      'Because the least count is zero there',
    ],
    why: 'Zero current and zero potential difference go together for a conductor obeying Ohm’s law, so the origin is a genuine point of the graph. A line that misses it is a sign of a zero error or a poor set of readings.',
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
