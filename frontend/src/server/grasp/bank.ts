import 'server-only';

import type { ClaimMaterial } from '@/lib/grasp/readback';
import type { BankSet } from '@/types/grasp';

export const BANK: readonly BankSet[] = [
  {
    id: 'sci-life',
    title: 'Life Processes: nutrition and respiration',
    subject: 'Science',
    grade: 'Class 10',
    kind: 'prose',
    questions: [
      { id: 'sci-q1', number: 1, marks: 3, text: 'What are the raw materials and the products of photosynthesis? Why does a plant need sunlight for it?' },
      { id: 'sci-q2', number: 2, marks: 3, text: 'Distinguish between aerobic and anaerobic respiration. Give one example of each.' },
      { id: 'sci-q3', number: 3, marks: 2, text: 'Why are the alveoli in our lungs richly supplied with blood capillaries?' },
    ],
  },
  {
    id: 'math-quad',
    title: 'Quadratic equations: problem set',
    subject: 'Mathematics',
    grade: 'Class 10',
    kind: 'problem-set',
    questions: [
      { id: 'math-p1', number: 1, marks: 2, text: 'Solve 2x² − 7x + 3 = 0 by factorisation.' },
      { id: 'math-p2', number: 2, marks: 2, text: 'Find the nature of the roots of 3x² + 2x + 5 = 0.' },
      { id: 'math-p3', number: 3, marks: 3, text: 'The length of a rectangle is 3 m more than its breadth and its area is 40 m². Find its dimensions.' },
      { id: 'math-p4', number: 4, marks: 3, text: 'Solve x² + 6x + 5 = 0 by completing the square.' },
    ],
  },
  {
    id: 'sst-nation',
    title: 'Nationalism in India',
    subject: 'Social Science',
    grade: 'Class 10',
    kind: 'prose',
    questions: [
      { id: 'sst-q1', number: 1, marks: 3, text: 'Why did Gandhiji call off the Non-Cooperation Movement in February 1922?' },
      { id: 'sst-q2', number: 2, marks: 2, text: "Why was the Simon Commission greeted with the slogan 'Go back Simon'?" },
      { id: 'sst-q3', number: 3, marks: 3, text: 'Why did Gandhiji choose salt as the symbol of the Civil Disobedience Movement?' },
    ],
  },
];

const claim = (
  id: string,
  questionId: string,
  topic: string,
  cues: readonly string[],
  fast: readonly [string, readonly string[]],
  slow: readonly [string, readonly string[]],
): ClaimMaterial => ({
  id,
  questionId,
  topic,
  cues,
  fast: { prompt: fast[0], options: fast[1], answer: 0 },
  slow: { prompt: slow[0], options: slow[1], answer: 0 },
});

// The first option of every pair is the right one; options are shuffled per student.
export const CLAIMS: readonly ClaimMaterial[] = [
  claim('sci-products', 'sci-q1', 'Products of photosynthesis', ['glucose', 'oxygen', 'carbohydrate', 'starch'],
    ['Your answer: what gas does the leaf give off?', ['Oxygen', 'Carbon dioxide', 'Nitrogen']],
    ['In your answer, which gas does the leaf release in photosynthesis, and which does it take in?', ['Releases oxygen, takes in carbon dioxide', 'Releases carbon dioxide, takes in oxygen', 'Releases nitrogen, takes in oxygen', 'Releases only water vapour']]),
  claim('sci-light', 'sci-q1', 'Why sunlight is needed', ['chlorophyll', 'light energy', 'sunlight', 'energy'],
    ['What did you say chlorophyll does?', ['Absorbs light energy', 'Stores glucose', 'Releases oxygen']],
    ['According to your answer, why does the plant need sunlight?', ['It gives the energy chlorophyll absorbs to make food', 'It warms the leaf so the stomata open', 'It turns starch back into glucose', 'It pulls water up from the roots']]),
  claim('sci-raw', 'sci-q1', 'Raw materials', ['carbon dioxide', 'co2', 'water', 'stomata'],
    ['Which raw materials did you name?', ['CO₂ and water', 'Oxygen and glucose', 'Starch and water']],
    ['Which raw materials did your answer say the leaf uses, and how does each get in?', ['Carbon dioxide through stomata, water through roots', 'Oxygen through stomata, water through leaves', 'Glucose through roots, CO₂ through the bark', 'Nitrogen through roots, water through stomata']]),
  claim('sci-oxygen', 'sci-q2', 'Aerobic vs anaerobic', ['oxygen', 'aerobic'],
    ['Aerobic respiration, in your answer, needs?', ['Oxygen', 'No oxygen', 'Sunlight']],
    ['How did your answer tell aerobic and anaerobic respiration apart?', ['Aerobic uses oxygen; anaerobic happens without it', 'Aerobic is in plants; anaerobic is in animals', 'Aerobic is at night; anaerobic is by day', 'Aerobic makes lactic acid; anaerobic makes water']]),
  claim('sci-anaerobic', 'sci-q2', 'Anaerobic example', ['lactic acid', 'ethanol', 'alcohol', 'yeast', 'ferment'],
    ['Your anaerobic example produced?', ['Ethanol or lactic acid', 'Glucose and oxygen', 'Only water']],
    ['Which anaerobic example did your answer give, and what does it make?', ['Yeast making ethanol and CO₂, or muscles making lactic acid', 'Leaves making glucose and oxygen', 'Lungs making oxygen and water', 'Roots making starch']]),
  claim('sci-energy', 'sci-q2', 'Energy released', ['more energy', 'less energy', 'atp', 'energy'],
    ['Which, per your answer, releases more energy?', ['Aerobic', 'Anaerobic', 'Both the same']],
    ['In your answer, how does the energy released compare between the two?', ['Aerobic releases far more energy than anaerobic', 'Anaerobic releases more because it is faster', 'Both release exactly the same', 'Neither releases energy; both store it']]),
  claim('sci-exchange', 'sci-q3', 'Gas exchange', ['exchange', 'diffus', 'gases'],
    ['What happens across the alveoli walls?', ['Exchange of gases', 'Digestion of food', 'Clotting of blood']],
    ['Why, in your answer, do the alveoli need so many capillaries?', ['So oxygen and CO₂ can pass to and from the blood quickly', 'So the lungs stay warm', 'So blood can be stored there', 'So food can be absorbed in the lungs']]),
  claim('sci-surface', 'sci-q3', 'Surface area', ['surface area', 'thin', 'large surface', 'balloon'],
    ['Alveoli give the lungs a large?', ['Surface area', 'Blood volume', 'Air pressure']],
    ['Which feature of the alveoli did your answer link to faster exchange?', ['A huge, thin surface wrapped in capillaries', 'Thick walls that hold air longer', 'Muscles that pump air in', 'Hairs that trap dust']]),

  claim('math-split', 'math-p1', 'Splitting the middle term', ['split', 'middle term', '-6x', '−6x', '(2x'],
    ['P1: how did you split −7x?', ['−6x and −x', '−5x and −2x', '−4x and −3x']],
    ['In P1, which pair did you split −7x into, and why that pair?', ['−6x and −x: they multiply to 6x² and add to −7x', '−4x and −3x: they add to −7x', '−14x and +7x: they cancel out', 'I did not split it; I used the formula']]),
  claim('math-disc', 'math-p2', 'Using the discriminant', ['discriminant', 'd =', 'b²', 'b^2', '-56', '−56', 'no real'],
    ['P2: what sign was the discriminant?', ['Negative', 'Positive', 'Zero']],
    ['In P2, what did you conclude, and from what?', ['No real roots, because b² − 4ac came out negative', 'Two equal roots, because D was zero', 'Two distinct real roots, because D was positive', 'I solved it without the discriminant']]),
  claim('math-reject', 'math-p3', 'Rejecting a root', ['reject', '-8', '−8', 'negative', 'cannot be'],
    ['P3: which root did you throw away?', ['−8', '5', '3']],
    ['Why did you discard one root in P3?', ["It was −8, and a length can't be negative", 'It was 5, because it did not fit the area', 'It was 3, the difference of the sides', 'I kept both roots']]),
  claim('math-setup', 'math-p3', 'Setting up the equation', ['x(x + 3)', 'x(x+3)', 'x + 3', 'x+3', 'breadth'],
    ['P3: what did you call x?', ['The breadth', 'The area', 'The perimeter']],
    ['How did you set up the equation in P3?', ['Breadth x, length x + 3, so x(x + 3) = 40', 'Length x, breadth 3x, so 3x² = 40', 'Perimeter: 2(x + x + 3) = 40', 'x + (x + 3) = 40']]),
  claim('math-square', 'math-p4', 'Completing the square', ['(x + 3)', '(x+3)', 'add 9', '+ 9', '+9', 'completing'],
    ['P4: what did you add to both sides?', ['9', '6', '5']],
    ['In P4, which square did you build, and what did it equal?', ['(x + 3)² = 4', '(x + 6)² = 31', '(x + 5)² = 6', '(x − 3)² = 14']]),

  claim('sst-chauri', 'sst-q1', 'Chauri Chaura', ['chauri chaura', 'violence', 'violent', 'police station'],
    ['What made Gandhiji stop the movement?', ['Violence at Chauri Chaura', 'The Jallianwala Bagh firing', 'The Simon Commission']],
    ['In your answer, what happened at Chauri Chaura, and why did it matter?', ['A protest turned violent and a police station was burnt; the movement was losing non-violence', 'Every Congress leader was arrested there', 'Protesters accepted the British terms there', 'It was where the salt law was broken']]),
  claim('sst-training', 'sst-q1', 'Readiness for satyagraha', ['training', 'trained', 'satyagrahi', 'not ready', 'prepared'],
    ['Satyagrahis, he felt, needed more?', ['Training', 'Money', 'Weapons']],
    ['What did your answer say people needed before a mass struggle?', ['Proper training, so they would stay non-violent', 'Support from foreign countries', 'A separate electorate', 'Factory jobs']]),
  claim('sst-noindian', 'sst-q2', 'No Indian member', ['no indian', 'single indian', 'all british', 'all-white', 'all white', 'british members'],
    ["What was wrong with the Commission's members?", ['No Indian member', 'Too many Indians', 'No lawyers']],
    ['Why, in your answer, was the Simon Commission rejected?', ["It had no Indian member, yet it would decide India's constitutional future", 'It wanted to ban the Congress', 'It raised the salt tax', 'Gandhiji was leading it']]),
  claim('sst-purpose', 'sst-q2', 'What the Commission was for', ['1928', 'constitutional', 'self-government', 'reform', 'functioning'],
    ['The Commission came to look into?', ['The constitution', 'The salt tax', 'Indigo farming']],
    ['What had the Simon Commission been sent to do, per your answer?', ['Review how the constitutional system worked and suggest changes', 'Collect land revenue', 'Hold the Round Table Conference', 'Train the Indian army']]),
  claim('sst-everyone', 'sst-q3', 'Salt touches everyone', ['rich and', 'poor', 'everyone', 'essential', 'all classes'],
    ['Salt mattered because it was used by?', ['Rich and poor alike', 'Only farmers', 'Only the British']],
    ['Why did salt make a good symbol, according to your answer?', ['Everyone, rich or poor, ate it, so its tax hurt all and united all', 'Only traders used it, so they would fund the movement', 'It was rare and expensive', 'The British did not use salt']]),
  claim('sst-dandi', 'sst-q3', 'The Dandi March', ['dandi', 'march', '240', 'sabarmati', 'sea water', 'seawater'],
    ['Where did the salt march end?', ['Dandi', 'Sabarmati', 'Champaran']],
    ['What did Gandhiji do at the end of the march, per your answer?', ['Made salt from sea water at Dandi, breaking the salt law', 'Signed a pact with Lord Irwin', 'Started a newspaper', 'Burnt foreign cloth in Bombay']]),
];

export const claimsFor = (setId: string | null): readonly ClaimMaterial[] => {
  const set = BANK.find((s) => s.id === setId);
  if (!set) return [];
  const ids = new Set(set.questions.map((q) => q.id));
  return CLAIMS.filter((c) => ids.has(c.questionId));
};
