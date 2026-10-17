export interface Segment {
  focus: string;
  hook: string;
  idea: string;
  example: string;
  task: string;
  questions: readonly string[];
  homework: string;
}

export interface ChapterGuide {
  objectives: readonly string[];
  segments: readonly Segment[];
}

const QUADRATICS: ChapterGuide = {
  objectives: [
    'Recognise a quadratic equation and write it in the standard form ax² + bx + c = 0.',
    'Solve a quadratic equation by splitting the middle term.',
    'Derive and apply the quadratic formula.',
    'Decide the nature of the roots from the discriminant without solving.',
    'Model a word problem as a quadratic equation and interpret both roots.',
  ],
  segments: [
    {
      focus: 'What makes an equation quadratic',
      hook: 'A rectangular garden is 3 m longer than it is wide and covers 40 m². How wide is it? Let pupils guess and check before any algebra.',
      idea: 'A quadratic equation has degree two: ax² + bx + c = 0 with a ≠ 0. Rewrite each situation in standard form before trying to solve it.',
      example: 'The garden gives x(x + 3) = 40, so x² + 3x − 40 = 0.',
      task: 'In pairs, sort eight equations into quadratic and not quadratic, rewriting each quadratic one in standard form.',
      questions: ['Is (x − 2)² = x² + 4 a quadratic equation?', 'Write x(2x + 1) = 6 in standard form.', 'Why must a be non-zero?'],
      homework: 'Exercise 4.1, questions 1 and 2: decide which are quadratic and frame the word problems.',
    },
    {
      focus: 'Solving by splitting the middle term',
      hook: 'Find two numbers whose product is −40 and whose sum is 3. Race the board.',
      idea: 'Split bx into two terms whose coefficients multiply to ac, factorise by grouping, then set each factor to zero.',
      example: 'x² + 3x − 40 = (x + 8)(x − 5) = 0, so x = 5 m for the garden; −8 is rejected as a width.',
      task: 'Factor relay: each row of pupils passes one step of a factorisation forward; the last pupil checks the roots by substitution.',
      questions: ['Factorise 2x² − 7x + 3.', 'Solve 6x² − x − 2 = 0.', 'Why is one root of the garden problem rejected?'],
      homework: 'Exercise 4.2, questions 1 (iii) to (vi) and 4.',
    },
    {
      focus: 'Completing the square and the quadratic formula',
      hook: 'Show x² + 6x as an L-shaped tile arrangement. What single tile completes the square?',
      idea: 'Completing the square turns any quadratic into (x + p)² = q, which leads to x = (−b ± √(b² − 4ac)) / 2a.',
      example: '2x² − 7x + 3 = 0 gives x = (7 ± √25) / 4, so x = 3 or x = ½.',
      task: 'Groups derive the formula on a strip of chart paper, one line per member, then use it on an equation that does not factorise.',
      questions: ['Solve x² − 4x − 1 = 0 by the formula.', 'Which step of completing the square needs a ≠ 0?', 'Check one root by substitution.'],
      homework: 'Exercise 4.3, questions 1 and 2; one equation by both methods.',
    },
    {
      focus: 'Nature of roots and the discriminant',
      hook: 'Three parabolas on the board: one crosses the axis twice, one touches it, one misses it. What is different about their equations?',
      idea: 'The discriminant D = b² − 4ac decides the roots: D > 0 two distinct real roots, D = 0 two equal roots, D < 0 no real roots.',
      example: 'For 2x² − 4x + 3 = 0, D = 16 − 24 = −8, so there are no real roots.',
      task: 'Card match: pupils pair each equation with its graph and its discriminant, then explain one match aloud.',
      questions: ['Find k if kx² + 6x + 1 = 0 has equal roots.', 'How many real roots has 3x² − 2x + ⅓ = 0?', 'Can a pond be 20 m by 40 m with a perimeter of 80 m? Use D.'],
      homework: 'Exercise 4.4, questions 1 to 4.',
    },
  ],
};

const LINEAR_PAIRS: ChapterGuide = {
  objectives: [
    'Represent a situation with a pair of linear equations in two variables.',
    'Solve a pair graphically and read consistency from the graph.',
    'Solve a pair by substitution and by elimination.',
  ],
  segments: [
    {
      focus: 'Pairs of equations and their graphs',
      hook: 'Two auto fares, two different meters: when do they cost the same? Plot both on the board.',
      idea: 'Each linear equation is a line; the pair has a unique solution, no solution or infinitely many depending on whether the lines cross, run parallel or coincide.',
      example: 'x + 2y = 3 and 2x + 4y = 6 coincide, so every point on the line is a solution.',
      task: 'Pairs draw two lines on graph paper from a fare card and mark the meeting point.',
      questions: ['When are a pair of lines inconsistent?', 'Compare a₁/a₂ and b₁/b₂ for parallel lines.'],
      homework: 'Exercise 3.1, questions 2 and 3.',
    },
    {
      focus: 'Substitution and elimination',
      hook: 'A pen and a notebook cost ₹55; two pens and a notebook cost ₹70. Solve it mentally.',
      idea: 'Substitution expresses one variable through the other; elimination scales and adds the equations so one variable cancels.',
      example: 'p + n = 55 and 2p + n = 70 give p = 15 and n = 40 by subtracting.',
      task: 'Method duel: half the class solves by substitution, half by elimination, and both halves compare working.',
      questions: ['Solve 3x + 4y = 10 and 2x − 2y = 2.', 'When is elimination quicker than substitution?'],
      homework: 'Exercise 3.3, questions 1 and 2.',
    },
  ],
};

const POLYNOMIALS: ChapterGuide = {
  objectives: [
    'Read the number of zeroes of a polynomial from its graph.',
    'Relate the zeroes of a quadratic polynomial to its coefficients.',
  ],
  segments: [
    {
      focus: 'Zeroes of a polynomial and their graphs',
      hook: 'Where does the curve y = x² − 3x − 4 meet the x-axis? Read it off the projected graph.',
      idea: 'A zero of p(x) is an x where p(x) = 0, which is where the graph meets the x-axis; a quadratic has at most two.',
      example: 'x² − 3x − 4 = (x − 4)(x + 1), so its zeroes are 4 and −1.',
      task: 'Graph gallery: groups count zeroes on six printed graphs and justify each count.',
      questions: ['How many zeroes can a cubic have?', 'Find the zeroes of x² − 2x − 8.'],
      homework: 'Exercise 2.1, question 1.',
    },
    {
      focus: 'Zeroes and coefficients',
      hook: 'The zeroes are 2 and 3. Can you write the polynomial?',
      idea: 'For ax² + bx + c the zeroes satisfy α + β = −b/a and αβ = c/a.',
      example: 'Zeroes 2 and 3 give x² − 5x + 6.',
      task: 'Reverse puzzles: pupils swap a pair of zeroes and rebuild each other’s polynomials.',
      questions: ['Find a quadratic whose zeroes sum to −3 and multiply to 2.', 'Verify the relation for 6x² − 3 − 7x.'],
      homework: 'Exercise 2.2, questions 1 and 2.',
    },
  ],
};

const LIFE_PROCESSES: ChapterGuide = {
  objectives: [
    'Explain why living things need life processes to maintain themselves.',
    'Describe autotrophic nutrition and the raw materials and products of photosynthesis.',
    'Compare aerobic and anaerobic respiration, including where each happens.',
    'Trace the path of blood through the double circulation of the human heart.',
    'Describe how the nephron filters blood and why dialysis is needed when it fails.',
  ],
  segments: [
    {
      focus: 'Nutrition and photosynthesis',
      hook: 'A potted plant kept in a dark cupboard for three days: what happens to its leaves, and why?',
      idea: 'Autotrophs make food from carbon dioxide and water using light absorbed by chlorophyll; stomata let gases in and out.',
      example: 'The starch test on a variegated leaf shows starch only where the leaf was green.',
      task: 'Groups label a leaf cross-section and trace one carbon atom from the air into a starch grain.',
      questions: ['What are the raw materials of photosynthesis?', 'Why do desert plants open their stomata at night?', 'What is the role of chlorophyll?'],
      homework: 'Textbook questions on nutrition, and one labelled diagram of the stomata.',
    },
    {
      focus: 'Respiration, with and without oxygen',
      hook: 'Why does dough rise, and why do your legs ache after a sprint?',
      idea: 'Glucose is broken down to pyruvate in the cytoplasm; with oxygen the mitochondria release much more energy as ATP, without it yeast makes ethanol and muscle makes lactic acid.',
      example: 'Yeast respiring without oxygen produces ethanol and carbon dioxide, which is why dough rises.',
      task: 'Pairs build a three-column flow chart of the three pathways of glucose breakdown.',
      questions: ['Where in the cell is pyruvate broken down using oxygen?', 'Why do muscles cramp after hard exercise?', 'In what form is the energy stored?'],
      homework: 'Write a 100-word comparison of aerobic and anaerobic respiration.',
    },
    {
      focus: 'Transport and double circulation',
      hook: 'Put a hand on your chest and count beats for fifteen seconds. Where is all that blood going?',
      idea: 'The four-chambered heart keeps oxygenated and deoxygenated blood apart, so blood passes through the heart twice in one circuit.',
      example: 'Blood from the lungs enters the left atrium and leaves the left ventricle for the body.',
      task: 'Human circulation walk: pupils hold chamber cards and walk the path of one red blood cell.',
      questions: ['Why is double circulation efficient for mammals?', 'Which chamber has the thickest wall, and why?', 'What do valves prevent?'],
      homework: 'Draw and label the human heart with the direction of blood flow.',
    },
    {
      focus: 'Excretion and the nephron',
      hook: 'A kidney filters about 180 litres a day but you pass under two. Where does the rest go?',
      idea: 'Each nephron filters blood in the glomerulus inside Bowman’s capsule and reabsorbs useful substances along the tubule.',
      example: 'When the kidneys fail, dialysis filters nitrogenous waste out of the blood with an artificial kidney.',
      task: 'Groups model a nephron with a sieve and a tube and explain what passes at each stage.',
      questions: ['What is the basic filtering unit of the kidney?', 'Name two substances reabsorbed in the tubule.', 'How does dialysis differ from a working kidney?'],
      homework: 'Textbook questions on excretion; a flow chart from renal artery to urinary bladder.',
    },
  ],
};

const CONTROL: ChapterGuide = {
  objectives: [
    'Describe the path of a reflex arc from receptor to effector.',
    'Explain how a signal crosses a synapse.',
    'Explain tropic movements in plants through auxin.',
  ],
  segments: [
    {
      focus: 'Reflexes and the nervous system',
      hook: 'Drop a ruler between a partner’s fingers and measure how far it falls before they catch it.',
      idea: 'A reflex arc runs from receptor to sensory neuron to the spinal cord to motor neuron to effector, without waiting for the brain.',
      example: 'Touching a hot pan triggers withdrawal before the pain is felt.',
      task: 'Pairs sequence reflex-arc cards and time three more reaction tests.',
      questions: ['What is a reflex action?', 'Why is the spinal cord, not the brain, in charge of reflexes?'],
      homework: 'Draw and label a reflex arc.',
    },
    {
      focus: 'Synapses and plant hormones',
      hook: 'A seedling on the windowsill bends towards the light. Does a plant have nerves?',
      idea: 'Neurons pass signals chemically across a synapse; plants coordinate with hormones such as auxin, which lengthens cells on the shaded side.',
      example: 'Auxin made at the shoot tip diffuses to the shaded side, so the shoot bends towards light.',
      task: 'Groups predict and sketch the growth of seedlings in four boxes lit from different sides.',
      questions: ['What is a synapse?', 'Why does a shoot bend towards light?'],
      homework: 'Textbook questions on coordination in plants.',
    },
  ],
};

const LIGHT: ChapterGuide = {
  objectives: [
    'State the laws of reflection and apply them to plane and spherical mirrors.',
    'Use the mirror formula and the sign convention to locate images.',
    'Explain refraction and calculate a refractive index.',
  ],
  segments: [
    {
      focus: 'Reflection and spherical mirrors',
      hook: 'Look into both sides of a steel spoon. Why is one image upside down?',
      idea: 'Concave mirrors converge light and can form real, inverted images; convex mirrors always form virtual, erect, diminished images.',
      example: 'A vehicle’s rear-view mirror is convex because it shows a wider field of view.',
      task: 'Groups trace three standard rays for an object at four positions in front of a concave mirror.',
      questions: ['State the two laws of reflection.', 'Why are convex mirrors used as rear-view mirrors?'],
      homework: 'Ray diagrams for a concave mirror, object beyond C and between F and P.',
    },
    {
      focus: 'Refraction and refractive index',
      hook: 'A pencil in a glass of water looks broken. Where is it really?',
      idea: 'Light changes speed and bends at a boundary; the refractive index n = c / v compares the speed of light in vacuum and in the medium.',
      example: 'Light entering glass slows down and bends towards the normal.',
      task: 'Pin-and-slab activity: pupils trace a ray through a glass slab and measure the lateral shift.',
      questions: ['Define refractive index.', 'Why does a ray bend towards the normal entering glass?'],
      homework: 'Textbook questions on refraction through a glass slab.',
    },
  ],
};

export const CHAPTER_GUIDES: Readonly<Record<string, ChapterGuide>> = {
  'Quadratic Equations': QUADRATICS,
  'Pair of Linear Equations in Two Variables': LINEAR_PAIRS,
  Polynomials: POLYNOMIALS,
  'Life Processes': LIFE_PROCESSES,
  'Control and Coordination': CONTROL,
  'Light: Reflection and Refraction': LIGHT,
};

export const PLAYGROUND_THREADS: Readonly<Record<string, readonly string[]>> = {
  'Real Numbers': ['factors'],
  Polynomials: ['polynomials'],
  'Pair of Linear Equations in Two Variables': ['algebra'],
  'Quadratic Equations': ['algebra'],
  'Arithmetic Progressions': ['patterns'],
  Triangles: ['triangles'],
  'Coordinate Geometry': ['coordinates'],
  'Introduction to Trigonometry': ['trig'],
  'Some Applications of Trigonometry': ['trig'],
  Circles: ['circles'],
  'Areas Related to Circles': ['circles'],
  'Surface Areas and Volumes': ['solids'],
  Statistics: ['data'],
  Probability: ['chance'],
  'Chemical Reactions and Equations': ['change'],
  'Acids, Bases and Salts': ['acids'],
  'Metals and Non-metals': ['reactions'],
  'Carbon and its Compounds': ['carbon'],
  'Life Processes': ['leaf', 'heart'],
  'Control and Coordination': ['body'],
  'How do Organisms Reproduce?': ['reproduction'],
  Heredity: ['genes'],
  'Light: Reflection and Refraction': ['light'],
  'The Human Eye and the Colourful World': ['light'],
  Electricity: ['circuits'],
  'Magnetic Effects of Electric Current': ['magnetism'],
  'Our Environment': ['webs'],
};

export const FLASHCARD_CHAPTERS: Readonly<Record<string, string>> = {
  'Chemical Reactions and Equations': 'sec_dev_chemical_reactions',
  'Life Processes': 'sec_dev_life_processes',
  'Control and Coordination': 'sec_dev_control',
  'Light: Reflection and Refraction': 'sec_dev_light',
};

export const DEBATE_MOTIONS: Readonly<Record<string, string>> = {
  'Life Processes': 'ethics-4',
  Heredity: 'science-3',
  'Our Environment': 'environment-1',
};

export const TOOLS_BY_SUBJECT: Readonly<Record<string, string>> = {
  MATH: 'graph',
  CHE: 'molecules',
  PHY: 'grapher',
  SST: 'timeline',
};

export const TOOLS_BY_CHAPTER: Readonly<Record<string, string>> = {
  'Chemical Reactions and Equations': 'molecules',
  'Acids, Bases and Salts': 'molecules',
  'Metals and Non-metals': 'molecules',
  'Carbon and its Compounds': 'molecules',
};
