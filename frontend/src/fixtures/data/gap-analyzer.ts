import type { FactAssessment } from '@/types/debate';

export const EVIDENCE_GRADE = 10;
export const EVIDENCE_SUBJECTS: readonly string[] = ['SCI', 'MATH', 'SST', 'ENG', 'HIN'];

export const DEMO_STUDENTS: readonly number[] = [1210, 1209];

export const TOPIC_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'Modes of nutrition': ['Nutrition', 'Autotrophic Nutrition', 'Nutrition in Human Beings'],
  Transportation: ['Transportation in Plants', 'Our Pump — the Heart', 'The Tubes — Blood Vessels'],
  'Current and potential difference': ['Electric Current and Circuit', 'Electric Potential and Potential Difference', 'Circuit Diagram'],
  "Ohm's law": ["Ohm's Law"],
  'Resistance and resistivity': ['Factors on which the Resistance of a Conductor Depends'],
  'Resistors in series and parallel': ['Resistors in Series', 'Resistors in Parallel'],
  'Heating effect and power': ['Heating Effect of Electric Current', 'Electric Power', 'Practical Applications of Heating Effect'],
  'Real Numbers, part 1': ['The Fundamental Theorem of Arithmetic'],
  'Real Numbers, part 2': ['Revisiting Irrational Numbers'],
  'Completing the square and the formula': ['Solution of a Quadratic Equation'],
  'Nervous system': ['Reflex Actions', 'Human Brain', 'Animals — Nervous System'],
  Hormones: ['Hormones in Animals', 'Coordination in Plants'],
  'Inherited traits': ['Inheritance', 'Rules for the Inheritance of Traits', 'Accumulation of Variation', 'Accumulation of Variation During Reproduction'],
  'Spherical mirrors': ['Reflection of Light', 'Spherical Mirrors', 'Image Formation by Spherical Mirrors', 'Sign Convention for Reflection', 'Uses of Spherical Mirrors', 'Mirror Formula and Magnification'],
  'Refraction and lenses': ['Refraction of Light', 'Refraction through a Rectangular Glass Slab', 'Refraction by Spherical Lenses', 'Lens Formula and Magnification', 'Power of a Lens'],
  'Acids, Bases and Salts, part 1': ['Indicators', 'Reaction of Acids with Metals', 'Reaction of Metallic Oxides with Acids', 'Neutralisation', 'Acids in Daily Life', 'Dilution'],
  'Acids, Bases and Salts, part 2': ['How Strong are Acid or Base Solutions?', 'Importance of pH in Everyday Life', 'Baking Soda', 'Washing Soda', 'Bleaching Powder', 'Plaster of Paris', 'Chlor-alkali Process', 'Water of Crystallisation'],
};

export const TOPIC_THREADS: Readonly<Record<string, string | null>> = {
  'Modes of nutrition': 'leaf',
  Respiration: 'heart',
  Transportation: 'heart',
  Excretion: null,
  'Nervous system': 'body',
  Hormones: 'body',
  'Resistors in series and parallel': 'circuits',
  'Completing the square and the formula': 'algebra',
  'Similarity criteria': 'triangles',
  'Basic proportionality theorem': 'triangles',
  Circles: 'circles',
  'Ozone and waste': null,
  'The French Revolution and the idea of the nation': null,
  'The making of Germany and Italy': null,
  'The Non-Cooperation Movement': null,
  'Civil Disobedience and the Salt March': null,
  'Income and other goals': 'development',
  'Comparing countries and states': 'development',
};

export const TOPIC_MOTIONS: Readonly<Record<string, string>> = {
  'Modes of nutrition': 'everyday-4',
  Excretion: 'ethics-4',
  'Inherited traits': 'science-3',
  'Ozone and waste': 'environment-1',
  'Income and other goals': 'future-3',
  'Comparing countries and states': 'environment-5',
};

export const DEBATE_SESSION_MOTION = 'everyday-4';

export const TOPIC_DIFFICULTY: Readonly<Record<string, number>> = {
  Respiration: -0.06,
  Excretion: -0.03,
  'Modes of nutrition': 0.05,
  'Resistors in series and parallel': -0.06,
  'Heating effect and power': -0.05,
  "Ohm's law": 0.05,
  'Real Numbers, part 2': -0.1,
  'Completing the square and the formula': -0.12,
  'Nature of roots': -0.05,
};

export const SECTION_LEANS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  G10C: { 'Completing the square and the formula': -0.26, Respiration: -0.22 },
  G10E: { 'Resistors in series and parallel': -0.26, 'Heating effect and power': -0.14 },
  G10A: {
    Excretion: -0.18,
    'Polynomials, part 2': -0.24,
    'Civil Disobedience and the Salt March': -0.3,
    'Land use and soil conservation': -0.16,
    'Faith and irony': -0.28,
    'The Black Aeroplane': -0.14,
    "Gopiyon ka vyangya: the gopis' irony": -0.3,
  },
};

export interface PersonalLean {
  subjects: Readonly<Record<string, number>>;
  topics: Readonly<Record<string, number>>;
  byDraw?: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export const PERSONAL_LEANS: Readonly<Record<number, PersonalLean>> = {
  1210: {
    subjects: { SCI: 0.06 },
    topics: { Respiration: -0.28, 'Completing the square and the formula': 0.3 },
    byDraw: { mindmap: { Respiration: 0.3 }, practice: { Respiration: 0.45 } },
  },
  1209: { subjects: { SCI: 0.15 }, topics: { 'Resistors in series and parallel': -0.2 } },
};

export interface TermCoverage {
  taught: readonly number[];
  in_progress: Readonly<Record<number, readonly string[]>>;
}

export const TERM_COVERAGE: Readonly<Record<string, TermCoverage>> = {
  SCI: { taught: [1, 2, 3, 4, 5, 11], in_progress: { 6: ['Nervous system'] } },
  MATH: { taught: [1, 2, 4], in_progress: { 3: ['Graphical method'] } },
  SST: { taught: [1, 2, 3], in_progress: { 4: ['Belgium and Sri Lanka'] } },
  ENG: { taught: [1, 2, 3], in_progress: { 4: ['Diary writing'] } },
  HIN: { taught: [1, 2, 3], in_progress: { 4: ['Charitra-chitran: character sketch'] } },
};

export interface SyllabusRange {
  from: number;
  to: number;
}

export const GAP_SYLLABUS: Readonly<Record<string, Readonly<Record<string, SyllabusRange>>>> = {
  '10-SST': { UT1: { from: 1, to: 2 }, HY: { from: 1, to: 3 } },
  '10-ENG': { UT1: { from: 1, to: 2 }, HY: { from: 1, to: 3 } },
  '10-HIN': { UT1: { from: 1, to: 2 }, HY: { from: 1, to: 3 } },
};

export const EVIDENCE_PAPERS = {
  mathsSheet: { paperId: 'paper-1', subject: 'MATH', date: '2026-09-12' },
} as const;

export const LIVE_DEMO_PAPERS: readonly string[] = ['mock-paper-1', 'paper-omr-1'];

export interface PracticeSitting {
  paperId: string;
  title: string;
  subject: string;
  chapter: string;
  date: string;
  attempt: number;
  draw: string;
  share: number;
  marksPerTopic: number;
}

export const PRACTICE_SITTINGS: readonly PracticeSitting[] = [
  { paperId: 'paper-3', title: 'Practice set: Life processes', subject: 'SCI', chapter: 'Life Processes', date: '2026-08-02', attempt: 1, draw: 'practice', share: 0.6, marksPerTopic: 5 },
  { paperId: 'paper-3', title: 'Practice set: Life processes, second attempt', subject: 'SCI', chapter: 'Life Processes', date: '2026-09-22', attempt: 2, draw: 'retake', share: 0.35, marksPerTopic: 5 },
  { paperId: 'practice-electricity', title: 'Practice quiz: Electricity', subject: 'SCI', chapter: 'Electricity', date: '2026-09-16', attempt: 1, draw: 'electricity-quiz', share: 0.95, marksPerTopic: 5 },
  { paperId: 'practice-polynomials', title: 'Practice set: Polynomials', subject: 'MATH', chapter: 'Polynomials', date: '2026-08-08', attempt: 1, draw: 'polynomials-set', share: 0.8, marksPerTopic: 5 },
  { paperId: 'practice-quadratics', title: 'Practice quiz: Quadratic Equations', subject: 'MATH', chapter: 'Quadratic Equations', date: '2026-09-24', attempt: 1, draw: 'quadratics-quiz', share: 0.9, marksPerTopic: 5 },
  { paperId: 'practice-nationalism-india', title: 'Practice quiz: Nationalism in India', subject: 'SST', chapter: 'Nationalism in India', date: '2026-08-20', attempt: 1, draw: 'nationalism-quiz', share: 0.95, marksPerTopic: 5 },
  { paperId: 'practice-resources', title: 'Practice set: Resources and Development', subject: 'SST', chapter: 'Resources and Development', date: '2026-09-15', attempt: 1, draw: 'resources-set', share: 0.7, marksPerTopic: 5 },
  { paperId: 'practice-letter-to-god', title: 'Practice quiz: A Letter to God', subject: 'ENG', chapter: 'A Letter to God', date: '2026-08-12', attempt: 1, draw: 'letter-quiz', share: 0.95, marksPerTopic: 5 },
  { paperId: 'practice-flying', title: 'Practice set: Two Stories about Flying', subject: 'ENG', chapter: 'Two Stories about Flying', date: '2026-09-10', attempt: 1, draw: 'flying-set', share: 0.7, marksPerTopic: 5 },
  { paperId: 'practice-surdas', title: 'Practice quiz: Surdas ke Pad', subject: 'HIN', chapter: 'Surdas ke Pad (सूरदास के पद)', date: '2026-08-14', attempt: 1, draw: 'surdas-quiz', share: 0.95, marksPerTopic: 5 },
  { paperId: 'practice-netaji', title: 'Practice set: Netaji ka Chashma', subject: 'HIN', chapter: 'Netaji ka Chashma (नेताजी का चश्मा)', date: '2026-09-12', attempt: 1, draw: 'netaji-set', share: 0.7, marksPerTopic: 5 },
];

export const ERP_EXAM_CODES: readonly string[] = ['UT1', 'HY'];

export interface SeededCheckerPaper {
  examId: string;
  subject: string;
  date: string;
  sameSittingAs: string | null;
}

export const SEEDED_CHECKER_PAPERS: readonly SeededCheckerPaper[] = [
  { examId: 'seed-control', subject: 'SCI', date: '2026-08-28', sameSittingAs: null },
  { examId: 'seed-heredity', subject: 'SCI', date: '2026-09-18', sameSittingAs: null },
  { examId: 'seed-light', subject: 'SCI', date: '2026-09-30', sameSittingAs: 'HY' },
  { examId: 'seed-online', subject: 'SCI', date: '2026-10-03', sameSittingAs: null },
];

export const SEEDED_OMR = { klass: 'G10A', subject: 'SCI', date: '2026-09-26' } as const;

export const MASTERY_WINDOW = { from: '2026-09-08', days: 18 } as const;
export const CONTROL_WINDOW = { from: '2026-10-01', days: 4 } as const;
export const FLASHCARD_WINDOW = { from: '2026-09-04', days: 24 } as const;
export const DEBATE_DATE = '2026-09-27';

export const SHARE = { mastery: 0.75, control: 0.3, flashcards: 0.55, debate: 0.08, absent: 0.05 } as const;

export interface ClaimPair {
  topic: string;
  right: string;
  wrong: string;
  wrongAs: FactAssessment;
}

export const DEBATE_CLAIMS: readonly ClaimPair[] = [
  { topic: 'Respiration', right: 'Muscles make lactic acid when they run short of oxygen.', wrong: 'Muscles make alcohol when they run short of oxygen.', wrongAs: 'incorrect' },
  { topic: 'Modes of nutrition', right: 'Humans are heterotrophs and cannot make their own food.', wrong: 'Humans digest the cellulose in plant cell walls for energy.', wrongAs: 'incorrect' },
  { topic: 'Transportation', right: 'A four-chambered heart keeps oxygenated and deoxygenated blood apart.', wrong: 'Veins carry blood away from the heart to the body.', wrongAs: 'incorrect' },
];
