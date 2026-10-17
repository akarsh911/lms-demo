import type { PlannerTerm } from '@/types/lesson-planner';

import { seedId } from '../ids';
import { CURRENT_SESSION } from './structure';

export const PLANNER_TERMS: PlannerTerm[] = [
  { id: seedId('term', CURRENT_SESSION.id, 1), name: 'Term 1', start: '2026-04-01', end: '2026-09-30' },
  { id: seedId('term', CURRENT_SESSION.id, 2), name: 'Term 2', start: '2026-10-01', end: '2027-03-31' },
];

export const DEFAULT_WEIGHT = 6;

export const CHAPTER_WEIGHTS: Readonly<Record<string, number>> = {
  'Real Numbers': 6,
  Polynomials: 5,
  'Pair of Linear Equations in Two Variables': 7,
  'Quadratic Equations': 7,
  'Arithmetic Progressions': 6,
  Triangles: 7,
  'Coordinate Geometry': 5,
  'Introduction to Trigonometry': 6,
  'Some Applications of Trigonometry': 4,
  Circles: 4,
  'Areas Related to Circles': 4,
  'Surface Areas and Volumes': 6,
  Statistics: 6,
  Probability: 3,
  'Chemical Reactions and Equations': 7,
  'Acids, Bases and Salts': 7,
  'Metals and Non-metals': 6,
  'Carbon and its Compounds': 8,
  'Life Processes': 8,
  'Control and Coordination': 6,
  'How do Organisms Reproduce?': 6,
  Heredity: 5,
  'Light: Reflection and Refraction': 8,
  'The Human Eye and the Colourful World': 5,
  Electricity: 8,
  'Magnetic Effects of Electric Current': 6,
  'Our Environment': 4,
};

export const CHAPTER_UNITS: Readonly<Record<string, string>> = {
  'Real Numbers': 'Number systems',
  Polynomials: 'Algebra',
  'Pair of Linear Equations in Two Variables': 'Algebra',
  'Quadratic Equations': 'Algebra',
  'Arithmetic Progressions': 'Algebra',
  Triangles: 'Geometry',
  'Coordinate Geometry': 'Coordinate geometry',
  'Introduction to Trigonometry': 'Trigonometry',
  'Some Applications of Trigonometry': 'Trigonometry',
  Circles: 'Geometry',
  'Areas Related to Circles': 'Mensuration',
  'Surface Areas and Volumes': 'Mensuration',
  Statistics: 'Statistics and probability',
  Probability: 'Statistics and probability',
  'Chemical Reactions and Equations': 'Chemical substances',
  'Acids, Bases and Salts': 'Chemical substances',
  'Metals and Non-metals': 'Chemical substances',
  'Carbon and its Compounds': 'Chemical substances',
  'Life Processes': 'The world of the living',
  'Control and Coordination': 'The world of the living',
  'How do Organisms Reproduce?': 'The world of the living',
  Heredity: 'The world of the living',
  'Light: Reflection and Refraction': 'Natural phenomena',
  'The Human Eye and the Colourful World': 'Natural phenomena',
  Electricity: 'Effects of current',
  'Magnetic Effects of Electric Current': 'Effects of current',
  'Our Environment': 'Natural resources',
};

export interface SyllabusRule {
  from: number;
  to: number;
  deferrable: readonly number[];
}

export const EVENT_EXAM_CODES: Readonly<Record<string, string>> = {
  'Periodic test 1': 'PT1',
  'Periodic test 2': 'PT2',
  'Pre-board examination': 'PB',
};

export const REVISION_PERIODS: Readonly<Record<string, number>> = { UT1: 1, PT1: 1, PT2: 1, HY: 4, PB: 4, ANN: 4 };

export const SYLLABUS_FRACTIONS: Readonly<Record<string, [number, number]>> = {
  PT1: [0, 0.15],
  UT1: [0, 0.3],
  HY: [0, 0.5],
  PT2: [0.5, 0.75],
  PB: [0, 1],
  ANN: [0, 1],
};

export const SYLLABUS_RULES: Readonly<Record<string, Readonly<Record<string, SyllabusRule>>>> = {
  '10-MATH': {
    PT1: { from: 1, to: 1, deferrable: [] },
    UT1: { from: 1, to: 2, deferrable: [2] },
    HY: { from: 1, to: 2, deferrable: [] },
    PT2: { from: 3, to: 6, deferrable: [6] },
    PB: { from: 1, to: 14, deferrable: [14] },
    ANN: { from: 1, to: 14, deferrable: [] },
  },
  '10-SCI': {
    PT1: { from: 1, to: 2, deferrable: [] },
    UT1: { from: 1, to: 3, deferrable: [3] },
    HY: { from: 1, to: 5, deferrable: [] },
    PT2: { from: 6, to: 8, deferrable: [8] },
    PB: { from: 1, to: 13, deferrable: [13] },
    ANN: { from: 1, to: 13, deferrable: [] },
  },
};
