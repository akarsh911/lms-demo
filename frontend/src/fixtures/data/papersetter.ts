import type { Paper } from '@/types/papersetter';

import { ENGLISH_ANNUAL_PAPER } from './english-annual-2026';
import { SCIENCE_TERM_PAPER } from './science-term-10a';

// paper-setter is its own service with its own vocabulary: plain class and section labels, not core ids.
export const SETTER_PAPERS: Paper[] = [
  ENGLISH_ANNUAL_PAPER,
  SCIENCE_TERM_PAPER,
  {
    paper_id: 'paper-1',
    title: 'Half-yearly examination',
    class_id: '10',
    // 10C, where the demo teacher teaches Mathematics, so their checker has a paper of their own.
    section_id: '10C',
    subject: 'Mathematics',
    kind: 'term',
    marks: 80,
    minutes: 180,
    created_at: '2026-09-12T09:30:00Z',
    status: 'ready',
    sections: [
      {
        title: 'Section A — Very short answer',
        questions: [
          { n: 1, text: 'State the fundamental theorem of arithmetic.', marks: 1, type: 'short' },
          { n: 2, text: 'Find the HCF of 96 and 404 by prime factorisation.', marks: 2, type: 'short' },
          { n: 3, text: 'Is 6^n able to end in the digit zero for any natural number n? Justify.', marks: 2, type: 'short' },
        ],
      },
      {
        title: 'Section B — Long answer',
        questions: [
          {
            n: 4,
            text: 'Prove that the square root of 5 is irrational, and hence show that 3 plus 2 times the square root of 5 is irrational.',
            marks: 5,
            type: 'long',
          },
          { n: 5, text: 'Solve the quadratic equation 2x^2 - 7x + 3 = 0 by completing the square.', marks: 5, type: 'long' },
        ],
      },
    ],
  },
  {
    paper_id: 'paper-3',
    title: 'Practice set: Life processes',
    class_id: '10',
    section_id: '10B',
    subject: 'Science',
    kind: 'practice',
    marks: 20,
    minutes: 45,
    created_at: '2026-08-02T05:15:00Z',
    status: 'ready',
    sections: [
      {
        title: 'Section A — Objective',
        questions: [
          { n: 1, text: 'Which substance in the stomach kills bacteria that enter with food? (a) bile  (b) hydrochloric acid  (c) mucus  (d) pepsin', marks: 1, type: 'mcq' },
          { n: 2, text: 'In which part of a cell does the breakdown of pyruvate into carbon dioxide and water take place? (a) cytoplasm  (b) chloroplast  (c) mitochondria  (d) nucleus', marks: 1, type: 'mcq' },
          { n: 3, text: 'Name the tissue that carries water and minerals from the roots to the leaves.', marks: 1, type: 'one_word' },
          { n: 4, text: 'Name the basic filtration unit of the kidney.', marks: 1, type: 'one_word' },
        ],
      },
      {
        title: 'Section B — Answer in detail',
        questions: [
          { n: 5, text: 'Describe how food is digested and absorbed in the small intestine. Name the juices that act on it there.', marks: 4, type: 'long' },
          { n: 6, text: 'Compare aerobic and anaerobic respiration, giving one example of where each happens in living things.', marks: 4, type: 'long' },
          { n: 7, text: 'Explain why the heart has four chambers in mammals and birds, and trace the path of blood through it.', marks: 4, type: 'long' },
          { n: 8, text: 'Describe how urine is formed in a nephron, and state how the amount of urine produced is regulated.', marks: 4, type: 'long' },
        ],
      },
    ],
  },
];
