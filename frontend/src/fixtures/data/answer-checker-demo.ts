import type { Paper } from '@/types/papersetter';

import type { MarkingScheme, SchemeQuestion } from './answer-checker';

const SCIENCE_BOOK = 'Science — Class 10 (NCERT)';

interface Written {
  text: string;
  type: string;
  points: readonly string[];
  model: string;
  path: string;
  page: number;
  passage: string;
}

type ObjectiveRow = readonly [string, readonly [string, string, string, string], number, string, number];

export const DEMO_PAPER_IDS = {
  midway: 'demo-control',
  review: 'demo-heredity',
  recorded: 'demo-light',
  omrScored: 'demo-acids',
  online: 'demo-online',
} as const;

export const LIVE_DEMO_PAPER_IDS = {
  scan: 'mock-paper-1',
  omr: 'paper-omr-1',
} as const;

export const DEMO_STRENGTHS: readonly { paperId: string; pupil: string; questions: readonly string[] }[] = [
  { paperId: LIVE_DEMO_PAPER_IDS.scan, pupil: 'Navya Varma', questions: ['5'] },
];

const CONTROL: readonly Written[] = [
  { text: 'What is a reflex action? Give one example.', type: 'short', points: ['a quick automatic response to a stimulus', 'example such as pulling the hand back from a hot object'], model: 'A sudden, automatic response to a stimulus, such as withdrawing the hand from a flame.', path: 'Control and Coordination > Reflex Actions', page: 102, passage: 'Reflex action is a sudden response to something in the environment, made without thinking about it.' },
  { text: 'Name the hormone that regulates blood sugar and the gland that secretes it.', type: 'short', points: ['insulin', 'secreted by the pancreas'], model: 'Insulin, secreted by the pancreas.', path: 'Control and Coordination > Hormones in Animals', page: 111, passage: 'Insulin is a hormone produced by the pancreas that helps in regulating blood sugar levels.' },
  { text: 'Draw the path of a reflex arc and name its parts.', type: 'short', points: ['receptor detects the stimulus', 'sensory neuron carries it to the spinal cord', 'motor neuron carries the signal to the effector muscle'], model: 'Receptor → sensory neuron → relay in the spinal cord → motor neuron → effector.', path: 'Control and Coordination > Reflex Actions', page: 103, passage: 'Nerves from all over the body meet in a bundle in the spinal cord on their way to the brain. Reflex arcs are formed in this spinal cord itself.' },
  { text: 'How do plants respond to light? Name the movement and the hormone involved.', type: 'short', points: ['shoots bend towards light', 'the movement is phototropism', 'auxin moves to the shaded side and makes it grow faster'], model: 'Shoots grow towards light (phototropism) because auxin collects on the shaded side and makes those cells grow longer.', path: 'Control and Coordination > Coordination in Plants', page: 108, passage: 'When growing plants detect light, a hormone called auxin, synthesised at the shoot tip, helps the cells to grow longer.' },
  { text: 'Explain how the brain is protected, and name the three main parts of the brain.', type: 'long', points: ['the skull (cranium) protects the brain', 'fluid-filled balloon absorbs shocks', 'forebrain', 'midbrain', 'hindbrain'], model: 'The brain sits in a bony box, the cranium, inside a fluid-filled balloon that absorbs shocks. Its parts are the forebrain, midbrain and hindbrain.', path: 'Control and Coordination > Human Brain', page: 105, passage: 'The brain sits inside a bony box. Inside the box, the brain is contained in a fluid-filled balloon which provides further shock absorption.' },
];

const HEREDITY: readonly Written[] = [
  { text: 'What is a gene?', type: 'very_short', points: ['a section of DNA that carries the information for a trait'], model: 'A section of DNA that provides information for one protein, and so for one trait.', path: 'Heredity > Inheritance', page: 133, passage: 'A section of DNA that provides information for one protein is called the gene for that protein.' },
  { text: 'State two differences between acquired and inherited traits.', type: 'short', points: ['inherited traits are passed on through genes', 'acquired traits develop during a lifetime and are not passed on'], model: 'Inherited traits pass through genes to offspring; acquired traits are developed in a lifetime and are not inherited.', path: 'Heredity > Accumulation of Variation', page: 129, passage: 'Changes in non-reproductive tissues cannot be passed on to the DNA of the germ cells, so experiences during the lifetime of an individual cannot be passed on.' },
  { text: 'How is the sex of a child determined in human beings?', type: 'short', points: ['mother always gives an X chromosome', 'father gives either X or Y', 'XY gives a boy and XX gives a girl'], model: 'The mother gives an X; a father passing X gives a girl (XX) and passing Y gives a boy (XY).', path: 'Heredity > Sex Determination', page: 135, passage: 'All children will inherit an X chromosome from their mother. The sex of the children will be determined by what they inherit from their father.' },
  { text: "Explain Mendel's experiment with tall and dwarf pea plants.", type: 'long', points: ['crossed pure tall with pure dwarf plants', 'all F1 plants were tall', 'F1 self-pollinated gave tall and dwarf in F2', 'ratio of 3 tall to 1 dwarf', 'tallness is the dominant trait'], model: 'Pure tall × pure dwarf gave all-tall F1. Selfing F1 gave F2 tall and dwarf in a 3:1 ratio, so tallness is dominant.', path: 'Heredity > Rules for the Inheritance of Traits', page: 131, passage: 'Mendel crossed pea plants with contrasting characteristics. The first generation were all tall; the second generation had tall and short plants in a ratio of three to one.' },
  { text: 'Why are variations important for a species?', type: 'very_short', points: ['variations help a species survive in a changing environment'], model: 'They improve the chance that some individuals survive when the environment changes.', path: 'Heredity > Accumulation of Variation', page: 128, passage: 'Depending on the nature of variations, different individuals would have different kinds of advantages.' },
];

const LIGHT: readonly Written[] = [
  { text: 'State the laws of reflection of light.', type: 'long', points: ['the angle of incidence equals the angle of reflection', 'the incident ray, reflected ray and normal lie in one plane', 'the normal is drawn at the point of incidence', 'it holds for every reflecting surface', 'a labelled diagram of the rays'], model: 'The angle of incidence equals the angle of reflection, and the incident ray, normal and reflected ray all lie in the same plane.', path: 'Light — Reflection and Refraction > Reflection of Light', page: 134, passage: 'The angle of incidence is equal to the angle of reflection, and the incident ray, the normal and the reflected ray all lie in the same plane.' },
  { text: 'Describe the image formed by a plane mirror.', type: 'long', points: ['virtual and erect', 'same size as the object', 'as far behind the mirror as the object is in front', 'laterally inverted', 'cannot be caught on a screen'], model: 'Virtual, erect, the same size, as far behind the mirror as the object is in front, and laterally inverted.', path: 'Light — Reflection and Refraction > Reflection of Light', page: 135, passage: 'The image formed by a plane mirror is always virtual and erect. The size of the image is equal to that of the object.' },
  { text: 'A concave mirror has a focal length of 15 cm. Where should an object be placed to get a real image the same size?', type: 'numerical', points: ['the image is the same size when the object is at C', 'C is at twice the focal length', 'R = 2f', 'R = 2 × 15 = 30 cm', 'object at 30 cm in front of the mirror'], model: 'At the centre of curvature: 2f = 30 cm in front of the mirror.', path: 'Light — Reflection and Refraction > Image Formation by Spherical Mirrors', page: 139, passage: 'When the object is at C, the image is formed at C, real and inverted, and of the same size as the object.' },
  { text: 'State the laws of refraction of light.', type: 'long', points: ['the incident ray, refracted ray and normal lie in one plane', 'sin i / sin r is constant for a pair of media', "this constant is the refractive index", "it is called Snell's law", 'light bends towards the normal entering a denser medium'], model: "The rays and normal are in one plane, and sin i / sin r is a constant for a given pair of media (Snell's law).", path: 'Light — Reflection and Refraction > Refraction of Light', page: 148, passage: 'The ratio of sine of angle of incidence to the sine of angle of refraction is a constant, for the light of a given colour and for the given pair of media.' },
  { text: 'Define the power of a lens and give its SI unit.', type: 'long', points: ['power is the reciprocal of focal length', 'P = 1/f', 'f is measured in metres', 'the SI unit is the dioptre', 'a convex lens has positive power'], model: 'P = 1/f with f in metres; the unit is the dioptre (D). Convex lenses have positive power.', path: 'Light — Reflection and Refraction > Power of a Lens', page: 158, passage: 'The power of a lens is defined as the reciprocal of its focal length. The SI unit of power of a lens is dioptre.' },
  { text: 'Why does a pencil look bent in a glass of water?', type: 'long', points: ['light from the pencil passes from water into air', 'it bends away from the normal', 'this is refraction', 'the eye traces the rays back in straight lines', 'so the immersed part appears raised'], model: 'Light from the pencil refracts away from the normal leaving water, so the immersed part seems raised and the pencil looks bent.', path: 'Light — Reflection and Refraction > Refraction of Light', page: 146, passage: 'A pencil partly immersed in water in a glass tumbler appears to be displaced at the interface of air and water.' },
  { text: 'Give the sign convention for spherical mirrors.', type: 'long', points: ['distances are measured from the pole', 'distances in the direction of incident light are positive', 'distances against the incident light are negative', 'heights above the principal axis are positive', 'heights below the axis are negative'], model: 'From the pole; along incident light positive, against it negative; above the axis positive, below negative.', path: 'Light — Reflection and Refraction > Sign Convention for Reflection', page: 141, passage: 'All distances parallel to the principal axis are measured from the pole of the mirror.' },
  { text: 'List two uses each of concave and convex mirrors.', type: 'long', points: ['concave: torches and headlights', 'concave: shaving mirrors', 'convex: rear-view mirrors of vehicles', 'convex mirrors give a wider field of view', 'concave: solar furnaces'], model: 'Concave: headlights, shaving mirrors, solar furnaces. Convex: rear-view mirrors, for their wider view.', path: 'Light — Reflection and Refraction > Uses of Spherical Mirrors', page: 140, passage: 'Convex mirrors are commonly used as rear-view mirrors in vehicles because they give an erect image and a wider field of view.' },
];

const NUTRITION: readonly Written[] = [
  { text: 'What are the raw materials and the products of photosynthesis? Why does a plant need sunlight for it?', type: 'short', points: ['carbon dioxide and water are the raw materials', 'glucose and oxygen are the products', 'sunlight provides the energy to make food'], model: 'Carbon dioxide and water are used to make glucose, releasing oxygen; sunlight supplies the energy, absorbed by chlorophyll.', path: 'Life Processes > Autotrophic Nutrition', page: 81, passage: 'Carbon dioxide and water are converted into carbohydrates in the presence of sunlight and chlorophyll, and oxygen is released.' },
  { text: 'Distinguish between aerobic and anaerobic respiration. Give one example of each.', type: 'short', points: ['aerobic respiration uses oxygen and releases more energy', 'anaerobic respiration happens without oxygen', 'examples such as humans for aerobic and yeast for anaerobic'], model: 'Aerobic respiration uses oxygen and releases much more energy (humans); anaerobic happens without oxygen (yeast making alcohol).', path: 'Life Processes > Respiration', page: 88, passage: 'The breakdown of pyruvate using oxygen takes place in the mitochondria and releases more energy than the anaerobic process, as in yeast during fermentation.' },
  { text: 'Why are the alveoli in our lungs richly supplied with blood capillaries?', type: 'short', points: ['so gases can be exchanged between air and blood', 'oxygen diffuses into the blood and carbon dioxide out'], model: 'For the exchange of gases: oxygen diffuses from the alveoli into the blood and carbon dioxide passes out.', path: 'Life Processes > Respiration', page: 90, passage: 'The walls of the alveoli contain an extensive network of blood-vessels, where oxygen is taken up by the blood and carbon dioxide is released into the alveoli.' },
];

const ACIDS: readonly ObjectiveRow[] = [
  ['Which gas is released when an acid reacts with a metal?', ['oxygen', 'hydrogen', 'carbon dioxide', 'nitrogen'], 1, 'Reaction of Acids with Metals', 20],
  ['The pH of a neutral solution is', ['0', '7', '10', '14'], 1, 'How Strong are Acid or Base Solutions?', 27],
  ['Turmeric turns red in', ['an acid', 'a base', 'water', 'salt solution'], 1, 'Indicators', 18],
  ['The chemical name of baking soda is', ['sodium carbonate', 'sodium hydrogencarbonate', 'sodium chloride', 'calcium carbonate'], 1, 'Baking Soda', 33],
  ['Which acid is present in curd?', ['acetic acid', 'citric acid', 'lactic acid', 'oxalic acid'], 2, 'Acids in Daily Life', 26],
  ['Bleaching powder is', ['CaOCl2', 'CaCO3', 'NaHCO3', 'NaCl'], 0, 'Bleaching Powder', 32],
  ['An acid and a base react to form', ['salt and water', 'salt and hydrogen', 'water only', 'a metal oxide'], 0, 'Neutralisation', 22],
  ['Washing soda is', ['Na2CO3·10H2O', 'NaHCO3', 'CaSO4·½H2O', 'NaOH'], 0, 'Washing Soda', 34],
  ['A solution turns blue litmus red. Its pH is likely', ['above 7', 'exactly 7', 'below 7', 'exactly 14'], 2, 'How Strong are Acid or Base Solutions?', 27],
  ['Plaster of Paris is made by heating', ['limestone', 'gypsum', 'baking soda', 'salt'], 1, 'Plaster of Paris', 35],
  ['Bee sting contains', ['methanoic acid', 'citric acid', 'tartaric acid', 'oxalic acid'], 0, 'Acids in Daily Life', 29],
  ['Which is a strong acid?', ['acetic acid', 'carbonic acid', 'hydrochloric acid', 'citric acid'], 2, 'How Strong are Acid or Base Solutions?', 28],
  ['Tooth decay starts when the mouth pH falls below', ['5.5', '7', '8.5', '10'], 0, 'Importance of pH in Everyday Life', 29],
  ['Which salt is used to make chlorine and caustic soda?', ['sodium chloride', 'calcium sulphate', 'copper sulphate', 'potassium nitrate'], 0, 'Chlor-alkali Process', 31],
  ['Metal oxides are generally', ['acidic', 'basic', 'neutral', 'amphoteric only'], 1, 'Reaction of Metallic Oxides with Acids', 22],
  ['Water of crystallisation in copper sulphate crystals is', ['2 molecules', '5 molecules', '7 molecules', '10 molecules'], 1, 'Water of Crystallisation', 35],
  ['A farmer treats acidic soil with', ['quicklime', 'vinegar', 'common salt', 'sugar'], 0, 'Importance of pH in Everyday Life', 29],
  ['Universal indicator shows', ['only acid or base', 'a range of pH values', 'only neutral', 'only strong bases'], 1, 'How Strong are Acid or Base Solutions?', 27],
  ['Which antacid neutralises excess stomach acid?', ['milk of magnesia', 'lemon juice', 'vinegar', 'soda water'], 0, 'Importance of pH in Everyday Life', 29],
  ['Dilution of an acid is done by adding', ['water to acid', 'acid to water slowly', 'both at once', 'acid to ice only'], 1, 'Dilution', 25],
];

const printed = (options: readonly string[]): string => options.map((option, index) => `(${String.fromCharCode(97 + index)}) ${option}`).join('  ');

function writtenPaper(id: string, title: string, section: string, kind: string, minutes: number, rows: readonly Written[]): { paper: Paper; scheme: MarkingScheme } {
  const questions = rows.map((row, index) => ({ n: index + 1, text: row.text, marks: row.points.length, type: row.type }));
  const marks = questions.reduce((sum, question) => sum + question.marks, 0);
  const scheme: SchemeQuestion[] = rows.map((row, index) => ({
    n: index + 1,
    points: row.points.map((text) => ({ text, marks: 1 })),
    model_answer: row.model,
    reference: { section_path: row.path, page: row.page, text: row.passage },
  }));
  return {
    paper: { paper_id: id, title, class_id: '10', section_id: section, subject: 'Science', kind, marks, minutes, created_at: '2026-09-20T07:30:00Z', status: 'ready', sections: [{ title: 'Answer all questions', questions }] },
    scheme: { paper_id: id, book: SCIENCE_BOOK, questions: scheme },
  };
}

function objectivePaper(id: string, title: string, rows: readonly ObjectiveRow[]): { paper: Paper; scheme: MarkingScheme } {
  return {
    paper: {
      paper_id: id,
      title,
      class_id: '10',
      section_id: '10A',
      subject: 'Science',
      kind: 'unit_test',
      marks: rows.length,
      minutes: 30,
      created_at: '2026-09-25T06:00:00Z',
      status: 'ready',
      sections: [{ title: 'Choose the correct option and fill its bubble', questions: rows.map(([stem, options], index) => ({ n: index + 1, text: `${stem} ${printed(options)}`, marks: 1, type: 'mcq' })) }],
    },
    scheme: {
      paper_id: id,
      book: SCIENCE_BOOK,
      questions: rows.map(([stem, options, answer, topic, page], index) => {
        const keyed = `(${String.fromCharCode(97 + answer)}) ${options[answer] ?? ''}`;
        return { n: index + 1, points: [{ text: keyed, marks: 1 }], options: [...options], answer, model_answer: keyed, reference: { section_path: `Acids, Bases and Salts > ${topic}`, page, text: `${stem} ${options[answer] ?? ''}.` } };
      }),
    },
  };
}

const DEMO = [
  writtenPaper(DEMO_PAPER_IDS.midway, 'Class test: Control and coordination', '10A', 'unit_test', 40, CONTROL),
  writtenPaper(DEMO_PAPER_IDS.review, 'Class test: Heredity', '10B', 'unit_test', 40, HEREDITY),
  writtenPaper(DEMO_PAPER_IDS.recorded, 'Half-yearly examination: Science', '10A', 'term', 90, LIGHT),
  objectivePaper(DEMO_PAPER_IDS.omrScored, 'Objective test: Acids, bases and salts', ACIDS),
  writtenPaper(DEMO_PAPER_IDS.online, 'Online test: Nutrition and respiration', '10A', 'unit_test', 30, NUTRITION),
];

export const DEMO_PAPERS: Paper[] = DEMO.map((entry) => entry.paper);
export const DEMO_SCHEMES: MarkingScheme[] = DEMO.map((entry) => entry.scheme);
