import type { Paper } from '@/types/papersetter';

import { DEMO_PAPERS, DEMO_SCHEMES } from './answer-checker-demo';
import { ENGLISH_ANNUAL_SCHEME } from './english-annual-2026';
import { SCIENCE_TERM_SCHEME } from './science-term-10a';

export interface SchemePoint {
  text: string;
  marks: number;
  aliases?: string[];
}

export interface SchemeReference {
  section_path: string;
  page: number;
  text: string;
}

export interface SchemeQuestion {
  n: number;
  points: SchemePoint[];
  model_answer: string;
  options?: string[];
  answer?: number;
  reference?: SchemeReference;
}

export interface MarkingScheme {
  paper_id: string;
  book: string;
  questions: SchemeQuestion[];
  generated?: boolean;
}

const MATHS_BOOK = 'Mathematics — Class 10 (NCERT)';
const SCIENCE_BOOK = 'Science — Class 10 (NCERT)';

const point = (text: string, marks = 1, aliases?: string[]): SchemePoint => ({ text, marks, aliases });

type ObjectiveRow = readonly [string, readonly [string, string, string, string], number, string, number];

const ELECTRICITY: readonly ObjectiveRow[] = [
  ['The SI unit of electric current is', ['volt', 'ampere', 'ohm', 'watt'], 1, 'Electric Current and Circuit', 172],
  ['The SI unit of potential difference is', ['ampere', 'coulomb', 'volt', 'joule'], 2, 'Electric Potential and Potential Difference', 174],
  ['One coulomb is the charge carried by about', ['6 × 10^18 electrons', '6 × 10^23 electrons', '1.6 × 10^19 electrons', '9 × 10^9 electrons'], 0, 'Electric Current and Circuit', 172],
  ['The current in a circuit is measured with', ['a voltmeter', 'an ammeter', 'an ohmmeter', 'a potentiometer'], 1, 'Electric Current and Circuit', 173],
  ['A voltmeter is connected to the points it measures', ['in series', 'in parallel', 'either way', 'through a fuse'], 1, 'Electric Potential and Potential Difference', 175],
  ["Ohm's law states that", ['V = IR', 'V = I/R', 'V = R/I', 'I = VR'], 0, "Ohm's Law", 177],
  ['The resistance of a conductor is directly proportional to', ['its area of cross-section', 'its length', 'the current through it', 'the voltage across it'], 1, 'Factors on which the Resistance of a Conductor Depends', 179],
  ['The SI unit of resistivity is', ['ohm', 'ohm per metre', 'ohm metre', 'ohm per square metre'], 2, 'Factors on which the Resistance of a Conductor Depends', 180],
  ['Resistors of 4 Ω and 6 Ω in series have a total resistance of', ['2.4 Ω', '10 Ω', '24 Ω', '1.5 Ω'], 1, 'Resistors in Series', 182],
  ['The same two resistors in parallel have a total resistance of', ['10 Ω', '2.4 Ω', '24 Ω', '5 Ω'], 1, 'Resistors in Parallel', 184],
  ['For resistors connected in parallel, what is the same across each one?', ['current', 'potential difference', 'resistance', 'power'], 1, 'Resistors in Parallel', 184],
  ["Joule's law of heating gives the heat produced as", ['IRt', 'I²Rt', 'IR²t', 'VI/t'], 1, 'Heating Effect of Electric Current', 187],
  ['The commercial unit of electrical energy is the', ['joule', 'watt', 'kilowatt hour', 'kilowatt'], 2, 'Electric Power', 189],
  ['One kilowatt hour is equal to', ['3.6 × 10^6 J', '3.6 × 10^3 J', '1000 J', '360 J'], 0, 'Electric Power', 189],
  ['Electric power is given by', ['VI', 'V/I', 'I/V', 'V²I'], 0, 'Electric Power', 189],
  ['The element of an electric heater is usually made of', ['copper', 'nichrome', 'aluminium', 'silver'], 1, 'Practical Applications of Heating Effect', 188],
  ['A fuse wire is chosen because it has a', ['high melting point', 'low melting point', 'high conductivity', 'zero resistance'], 1, 'Practical Applications of Heating Effect', 188],
  ['The filament of an electric bulb is made of', ['copper', 'tungsten', 'nichrome', 'iron'], 1, 'Practical Applications of Heating Effect', 188],
  ['A wire has resistance R. A wire of the same material and thickness and twice the length has resistance', ['R/2', 'R', '2R', '4R'], 2, 'Factors on which the Resistance of a Conductor Depends', 179],
  ['A wire has resistance R. Doubling its area of cross-section makes it', ['2R', 'R/2', '4R', 'R/4'], 1, 'Factors on which the Resistance of a Conductor Depends', 179],
  ['A current of 0.5 A flows for 10 minutes. The charge that flows is', ['5 C', '50 C', '300 C', '3000 C'], 2, 'Electric Current and Circuit', 173],
  ['The work done in moving 2 C of charge across 6 V is', ['3 J', '12 J', '8 J', '4 J'], 1, 'Electric Potential and Potential Difference', 174],
  ['A bulb rated 220 V and 100 W has a resistance of', ['484 Ω', '2.2 Ω', '22 Ω', '4.84 Ω'], 0, 'Electric Power', 190],
  ['Which of these is a good conductor of electricity?', ['glass', 'rubber', 'silver', 'wood'], 2, 'Factors on which the Resistance of a Conductor Depends', 180],
  ['A plug key drawn with its plug in place means the circuit is', ['open', 'closed', 'short-circuited', 'earthed'], 1, 'Circuit Diagram', 176],
];

const printedOptions = (options: readonly string[]): string =>
  options.map((option, index) => `(${String.fromCharCode(97 + index)}) ${option}`).join('  ');

export const CHECKER_PAPERS: Paper[] = [
  {
    paper_id: 'mock-paper-1',
    title: 'Unit test: Life processes',
    class_id: '10',
    section_id: '10A',
    subject: 'Science',
    kind: 'unit_test',
    marks: 25,
    minutes: 60,
    created_at: '2026-10-01T08:15:00Z',
    status: 'ready',
    sections: [
      {
        title: 'Section A — Objective and very short answer',
        questions: [
          { n: 1, text: `Which part of a leaf cell is the site of photosynthesis? ${printedOptions(['mitochondrion', 'chloroplast', 'nucleus', 'ribosome'])}`, marks: 1, type: 'mcq' },
          { n: 2, text: `The enzyme in saliva that breaks down starch is ${printedOptions(['pepsin', 'trypsin', 'salivary amylase', 'lipase'])}`, marks: 1, type: 'mcq' },
          { n: 3, text: 'Name the blood vessel that carries oxygenated blood from the lungs to the heart.', marks: 1, type: 'very_short' },
        ],
      },
      {
        title: 'Section B — Short answer',
        questions: [
          { n: 4, text: 'State two differences between arteries and veins.', marks: 2, type: 'short' },
          { n: 5, text: 'Why do aquatic organisms breathe much faster than terrestrial organisms?', marks: 2, type: 'short' },
          { n: 6, text: 'Describe the role of the villi in the small intestine.', marks: 3, type: 'short' },
          { n: 7, text: 'What is the function of a nephron? Name the part of it where filtration takes place.', marks: 3, type: 'short' },
          { n: 8, text: 'How do plants get rid of excess water? Name the process.', marks: 2, type: 'short' },
        ],
      },
      {
        title: 'Section C — Long answer',
        questions: [
          { n: 9, text: 'Explain the process of photosynthesis, and write its balanced chemical equation.', marks: 5, type: 'long' },
          { n: 10, text: 'Describe double circulation in human beings. Why is it necessary?', marks: 5, type: 'long' },
        ],
      },
    ],
  },
  {
    paper_id: 'paper-omr-1',
    title: 'Objective test: Electricity',
    class_id: '10',
    section_id: '10A',
    subject: 'Science',
    kind: 'unit_test',
    marks: 25,
    minutes: 40,
    created_at: '2026-09-30T06:45:00Z',
    status: 'ready',
    sections: [
      {
        title: 'Choose the correct option and fill its bubble',
        questions: ELECTRICITY.map(([stem, options], index) => ({
          n: index + 1,
          text: `${stem} ${printedOptions(options)}`,
          marks: 1,
          type: 'mcq',
        })),
      },
    ],
  },
];

export const MARKING_SCHEMES: MarkingScheme[] = [
  {
    paper_id: 'paper-1',
    book: MATHS_BOOK,
    questions: [
      {
        n: 1,
        points: [
          point('every composite number can be written as a product of primes', 0.5),
          point('the factorisation is unique apart from the order of the factors', 0.5),
        ],
        model_answer: 'Every composite number can be expressed as a product of primes, and this factorisation is unique apart from the order in which the primes occur.',
        reference: { section_path: 'Real Numbers > The Fundamental Theorem of Arithmetic', page: 2, text: 'Every composite number can be expressed (factorised) as a product of primes, and this factorisation is unique, apart from the order in which the prime factors occur.' },
      },
      {
        n: 2,
        points: [point('96 = 2^5 × 3', 0.5), point('404 = 2^2 × 101', 0.5), point('HCF = 2^2 = 4', 1)],
        model_answer: '96 = 2^5 × 3 and 404 = 2^2 × 101, so the HCF is 2^2 = 4.',
        reference: { section_path: 'Real Numbers > The Fundamental Theorem of Arithmetic', page: 4, text: 'HCF is the product of the smallest power of each prime factor common to the numbers; LCM is the product of the greatest power of each prime factor involved.' },
      },
      {
        n: 3,
        points: [
          point('a number ending in zero is divisible by both 2 and 5'),
          point('6^n = 2^n × 3^n has no prime factor 5, so it cannot end in zero'),
        ],
        model_answer: 'To end in 0 a number must be divisible by 5. The only primes in 6^n = 2^n × 3^n are 2 and 3, so by uniqueness of factorisation 6^n never ends in 0.',
        reference: { section_path: 'Real Numbers > The Fundamental Theorem of Arithmetic', page: 3, text: 'If a number were to end with the digit zero it would be divisible by 5, so its prime factorisation would contain the prime 5. Uniqueness of the factorisation rules out any other primes appearing.' },
      },
      {
        n: 4,
        points: [
          point('assume √5 = a/b with a and b coprime'),
          point('5 divides a², so 5 divides a'),
          point('then 5 divides b too, contradicting coprimality'),
          point('if 3 + 2√5 were rational then √5 = (r − 3)/2 would be rational'),
          point('contradiction, so 3 + 2√5 is irrational'),
        ],
        model_answer: 'Suppose √5 = a/b in lowest terms. Then 5b² = a², so 5 | a; write a = 5c, then b² = 5c², so 5 | b, a contradiction. If 3 + 2√5 = r were rational, √5 = (r − 3)/2 would be rational, which it is not.',
        reference: { section_path: 'Real Numbers > Revisiting Irrational Numbers', page: 6, text: 'Let p be a prime number. If p divides a², then p divides a, where a is a positive integer. The proof that √2 is irrational proceeds by contradiction from this result.' },
      },
      {
        n: 5,
        points: [
          point('divides through by 2: x² − (7/2)x + 3/2 = 0'),
          point('adds (7/4)² to both sides'),
          point('(x − 7/4)² = 25/16'),
          point('x − 7/4 = ±5/4'),
          point('x = 3 or x = 1/2'),
        ],
        model_answer: 'x² − (7/2)x = −3/2; (x − 7/4)² = 49/16 − 24/16 = 25/16; x − 7/4 = ±5/4; x = 3 or 1/2.',
        reference: { section_path: 'Quadratic Equations > Solution of a Quadratic Equation', page: 76, text: 'Completing the square turns ax² + bx + c = 0 into (x + b/2a)² = (b² − 4ac)/4a², from which both roots follow by taking square roots.' },
      },
    ],
  },
  {
    paper_id: 'mock-paper-1',
    book: SCIENCE_BOOK,
    questions: [
      { n: 1, points: [point('(b) chloroplast')], options: ['mitochondrion', 'chloroplast', 'nucleus', 'ribosome'], answer: 1, model_answer: '(b) chloroplast', reference: { section_path: 'Life Processes > Autotrophic Nutrition', page: 81, text: 'Chloroplasts contain chlorophyll, the green pigment that absorbs light energy for photosynthesis.' } },
      { n: 2, points: [point('(c) salivary amylase')], options: ['pepsin', 'trypsin', 'salivary amylase', 'lipase'], answer: 2, model_answer: '(c) salivary amylase', reference: { section_path: 'Life Processes > Nutrition in Human Beings', page: 86, text: 'Saliva contains an enzyme called salivary amylase that breaks down starch into simple sugar.' } },
      { n: 3, points: [point('pulmonary vein', 1, ['pulmonary veins'])], model_answer: 'The pulmonary vein.', reference: { section_path: 'Life Processes > Transportation > Our Pump — the Heart', page: 92, text: 'Oxygen-rich blood from the lungs comes to the thin-walled upper chamber of the heart on the left, the left atrium.' } },
      { n: 4, points: [point('arteries carry blood away from the heart; veins carry it to the heart'), point('arteries have thick elastic walls; veins have thin walls with valves')], model_answer: 'Arteries carry blood away from the heart and have thick, elastic walls; veins bring blood back to the heart, have thin walls and valves.', reference: { section_path: 'Life Processes > Transportation > The Tubes — Blood Vessels', page: 94, text: 'Arteries carry blood away from the heart and have thick, elastic walls because the blood emerges under high pressure. Veins collect blood and bring it back; they have valves that ensure the blood flows only in one direction.' } },
      { n: 5, points: [point('water holds far less dissolved oxygen than air'), point('so they must breathe faster to take in enough oxygen')], model_answer: 'The amount of oxygen dissolved in water is fairly low compared to air, so aquatic animals breathe much faster to get enough of it.', reference: { section_path: 'Life Processes > Respiration', page: 89, text: 'Since the amount of dissolved oxygen is fairly low compared to the amount of oxygen in the air, the rate of breathing in aquatic organisms is much faster than that seen in terrestrial organisms.' } },
      { n: 6, points: [point('villi increase the surface area for absorption'), point('they are richly supplied with blood vessels'), point('digested food is absorbed into the blood through them')], model_answer: 'Villi are finger-like projections that increase the absorbing surface; they are rich in blood vessels that take the absorbed food to every cell.', reference: { section_path: 'Life Processes > Nutrition in Human Beings', page: 87, text: 'The inner lining of the small intestine has numerous finger-like projections called villi which increase the surface area for absorption. The villi are richly supplied with blood vessels.' } },
      { n: 7, points: [point('the nephron is the basic filtering unit of the kidney'), point('it removes nitrogenous waste such as urea from the blood'), point("filtration happens in the glomerulus inside Bowman's capsule")], model_answer: "Nephrons are the filtration units of the kidney; they filter urea and other waste from the blood. Filtration happens in the glomerulus, in Bowman's capsule.", reference: { section_path: 'Life Processes > Excretion', page: 97, text: "Each kidney has large numbers of filtration units called nephrons. In each nephron the cluster of capillaries, the glomerulus, sits in a cup-shaped end called Bowman's capsule that collects the filtrate." } },
      { n: 8, points: [point('excess water is lost as water vapour through the stomata'), point('the process is transpiration')], model_answer: 'By transpiration: excess water evaporates from the leaves through the stomata.', reference: { section_path: 'Life Processes > Transportation in Plants', page: 96, text: 'The loss of water in the form of vapour from the aerial parts of the plant is known as transpiration.' } },
      { n: 9, points: [point('chlorophyll absorbs light energy'), point('light energy becomes chemical energy and water is split'), point('carbon dioxide is reduced to carbohydrates'), point('6CO2 + 12H2O → C6H12O6 + 6O2 + 6H2O'), point('stomata allow the exchange of gases')], model_answer: 'Chlorophyll absorbs light; light energy is converted to chemical energy and water is split into hydrogen and oxygen; carbon dioxide is reduced to carbohydrate. 6CO2 + 12H2O → C6H12O6 + 6O2 + 6H2O. Gases are exchanged through the stomata.', reference: { section_path: 'Life Processes > Autotrophic Nutrition', page: 81, text: 'The following events occur during this process: absorption of light energy by chlorophyll; conversion of light energy to chemical energy and splitting of water molecules into hydrogen and oxygen; reduction of carbon dioxide to carbohydrates.' } },
      { n: 10, points: [point('blood passes through the heart twice in each cycle'), point('the right side sends deoxygenated blood to the lungs'), point('the left side pumps oxygenated blood to the body'), point('oxygenated and deoxygenated blood do not mix'), point('this gives the efficient oxygen supply warm-blooded animals need')], model_answer: 'Blood goes through the heart twice per cycle: the right side sends deoxygenated blood to the lungs and the left pumps oxygenated blood to the body, so the two never mix and oxygen supply is efficient enough to keep body temperature constant.', reference: { section_path: 'Life Processes > Transportation > Our Pump — the Heart', page: 93, text: 'The separation of the right side and the left side of the heart keeps oxygenated and deoxygenated blood from mixing. Such separation allows a highly efficient supply of oxygen to the body, useful in animals that have high energy needs.' } },
    ],
  },
  {
    paper_id: 'paper-omr-1',
    book: SCIENCE_BOOK,
    questions: ELECTRICITY.map(([stem, options, answer, topic, page], index) => {
      const correct = options[answer] ?? '';
      return {
        n: index + 1,
        points: [point(`(${String.fromCharCode(97 + answer)}) ${correct}`)],
        options: [...options],
        answer,
        model_answer: `(${String.fromCharCode(97 + answer)}) ${correct}`,
        reference: { section_path: `Electricity > ${topic}`, page, text: `${stem} ${correct}.` },
      };
    }),
  },
];

CHECKER_PAPERS.push(...DEMO_PAPERS);
MARKING_SCHEMES.push(...DEMO_SCHEMES);
MARKING_SCHEMES.push(ENGLISH_ANNUAL_SCHEME, SCIENCE_TERM_SCHEME);
