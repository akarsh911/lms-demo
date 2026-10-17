import type { Paper, PaperSection } from '@/types/papersetter';

import type { MarkingScheme, SchemeQuestion } from './answer-checker';
import { SCIENCE_10_BANK, type BankQuestion } from './science-10-bank';

export const SCIENCE_TERM_PAPER_ID = 'paper-science-term-10a-2026';

const BOOK = 'Science, Class 10 (NCERT)';
const SET_AT = '2026-09-29T05:30:00Z';

const CHAPTERS = [
  'Chemical Reactions and Equations',
  'Acids, Bases and Salts',
  'Metals and Non-metals',
  'Carbon and its Compounds',
  'Life Processes',
  'Control and Coordination',
] as const;

type Pick = readonly [chapter: number, index: number, marks: number, type: string];

const PARTS: readonly { title: string; picks: readonly Pick[] }[] = [
  { title: 'Section A — Objective', picks: [[0, 0, 1, 'mcq'], [1, 0, 1, 'mcq'], [2, 0, 1, 'mcq'], [3, 0, 1, 'mcq'], [4, 0, 1, 'mcq'], [5, 0, 1, 'mcq'], [0, 1, 1, 'mcq'], [1, 1, 1, 'mcq'], [2, 1, 1, 'mcq'], [3, 1, 1, 'mcq'], [4, 1, 1, 'mcq'], [5, 1, 1, 'mcq'], [0, 2, 1, 'mcq'], [1, 2, 1, 'mcq'], [2, 2, 1, 'mcq'], [3, 2, 1, 'mcq'], [4, 5, 1, 'assertion_reason'], [5, 5, 1, 'assertion_reason'], [0, 5, 1, 'assertion_reason'], [1, 5, 1, 'assertion_reason']] },
  { title: 'Section B — Very Short Answer', picks: [[2, 7, 2, 'very_short'], [3, 7, 2, 'very_short'], [4, 7, 2, 'very_short'], [5, 7, 2, 'very_short'], [0, 7, 2, 'very_short'], [1, 7, 2, 'very_short']] },
  { title: 'Section C — Short Answer', picks: [[2, 11, 3, 'short'], [3, 11, 3, 'short'], [4, 11, 3, 'short'], [5, 11, 3, 'short'], [0, 11, 3, 'short'], [1, 11, 3, 'short'], [2, 12, 3, 'short']] },
  { title: 'Section D — Long Answer', picks: [[3, 15, 5, 'long'], [4, 15, 5, 'long'], [5, 15, 5, 'long']] },
  { title: 'Section E — Case-Based Questions', picks: [[0, 16, 4, 'case_based'], [1, 16, 4, 'case_based'], [2, 16, 4, 'case_based']] },
];

interface Placed {
  n: number;
  marks: number;
  type: string;
  chapter: string;
  question: BankQuestion;
}

function placed(): { title: string; questions: Placed[] }[] {
  let n = 0;
  return PARTS.map((part) => ({
    title: part.title,
    questions: part.picks.map(([chapterIndex, index, marks, type]) => {
      const chapter = CHAPTERS[chapterIndex] ?? '';
      const question = SCIENCE_10_BANK[chapter]?.[index];
      if (!question) throw new Error(`No bank question ${index} in ${chapter}`);
      n += 1;
      return { n, marks, type, chapter, question };
    }),
  }));
}

const PLACED = placed();

const optionLabel = (index: number, option: string): string => `(${String.fromCharCode(97 + index)}) ${option}`;

const printed = (question: BankQuestion): string =>
  question.options ? `${question.text} ${question.options.map((option, index) => optionLabel(index, option)).join('  ')}` : question.text;

const sections: PaperSection[] = PLACED.map((part) => ({
  title: part.title,
  questions: part.questions.map((row) => ({ n: row.n, text: printed(row.question), marks: row.marks, type: row.type })),
}));

export const SCIENCE_TERM_PAPER: Paper = {
  paper_id: SCIENCE_TERM_PAPER_ID,
  title: 'Term 1 Examination 2026',
  class_id: '10',
  section_id: '10A',
  subject: 'Science',
  kind: 'class_exam',
  marks: PLACED.flatMap((part) => part.questions).reduce((sum, row) => sum + row.marks, 0),
  minutes: 180,
  created_at: SET_AT,
  status: 'ready',
  sections,
};

function schemeQuestion(row: Placed): SchemeQuestion {
  const { question } = row;
  if (question.options && question.answer !== undefined) {
    const keyed = optionLabel(question.answer, question.options[question.answer] ?? '');
    return { n: row.n, points: [{ text: keyed, marks: row.marks }], options: [...question.options], answer: question.answer, model_answer: keyed };
  }
  const points = (question.points ?? []).map(([text, marks]) => ({ text, marks }));
  return { n: row.n, points, model_answer: points.map((point) => point.text).join('. ') };
}

export const SCIENCE_TERM_SCHEME: MarkingScheme = {
  paper_id: SCIENCE_TERM_PAPER_ID,
  book: BOOK,
  questions: PLACED.flatMap((part) => part.questions).map(schemeQuestion),
};
