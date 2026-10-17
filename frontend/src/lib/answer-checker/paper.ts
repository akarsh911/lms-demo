import type { CheckerQuestionType } from '@/types/answer-checker';
import type { Paper, PaperSummary } from '@/types/papersetter';

export interface SetQuestion {
  n: number;
  text: string;
  marks: number;
  type: string;
  section: string;
}

export type CheckingMode = 'scan' | 'omr';

const OPTION_TYPES = new Set(['mcq', 'assertion_reason']);

const NOT_YET = new Set(['awaiting_approval', 'rejected']);

const LINK_SUFFIX = /\s\[([^\]]+)\]$/;

const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CHECKER_TYPES: Readonly<Record<string, CheckerQuestionType>> = {
  mcq: 'mcq',
  assertion_reason: 'mcq',
  true_false: 'true_false',
  fill_blank: 'fill_blank',
  one_word: 'one_word',
  very_short: 'short_answer',
  short: 'short_answer',
  differentiate: 'short_answer',
  numerical: 'numerical',
  long: 'long_answer',
  case_based: 'long_answer',
  source_based: 'long_answer',
  data_interpretation: 'long_answer',
  diagram_label: 'diagram',
  map_work: 'diagram',
  match_following: 'match_following',
};

export function checkerQuestionType(setterType: string): CheckerQuestionType {
  return CHECKER_TYPES[setterType] ?? 'unknown';
}

export function setQuestions(paper: Paper): SetQuestion[] {
  return (paper.sections ?? []).flatMap((section, index) =>
    (section.questions ?? []).flatMap((question) => {
      if (typeof question.n !== 'number') return [];
      return [
        {
          n: question.n,
          text: question.text ?? '',
          marks: question.marks ?? 0,
          type: question.type ?? '',
          section: section.title ?? `Section ${index + 1}`,
        },
      ];
    }),
  );
}

export function questionTotal(questions: readonly SetQuestion[]): number {
  return questions.reduce((sum, question) => sum + question.marks, 0);
}

export function isObjectivePaper(questions: readonly SetQuestion[]): boolean {
  return questions.length > 0 && questions.every((question) => OPTION_TYPES.has(question.type));
}

export function modesFor(questions: readonly SetQuestion[]): CheckingMode[] {
  return isObjectivePaper(questions) ? ['omr', 'scan'] : ['scan'];
}

export function readyToCheck(paper: PaperSummary): boolean {
  return !NOT_YET.has(paper.status ?? '') && typeof paper.marks === 'number' && paper.marks > 0;
}

export function paperTitle(paper: PaperSummary): string {
  return paper.title?.trim() || 'Untitled paper';
}

export function linkedExamName(paper: PaperSummary): string {
  return `${paperTitle(paper)} [${paper.paper_id}]`;
}

export function linkedPaperId(examName: string): string | null {
  return LINK_SUFFIX.exec(examName)?.[1] ?? null;
}

export function paperClassLine(paper: PaperSummary, checkedSection?: string | null): string {
  const parts = [
    paper.class_id ? `Class ${paper.class_id}` : null,
    checkedSection || (paper.section_id && !RECORD_ID.test(paper.section_id) ? paper.section_id : null),
    paper.subject ?? null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : 'Class not recorded';
}

export function sectionLetter(paper: PaperSummary): string | null {
  const section = paper.section_id?.trim();
  if (!section || RECORD_ID.test(section)) return null;
  const klass = paper.class_id?.trim() ?? '';
  const letter = section.startsWith(klass) ? section.slice(klass.length) : section;
  return letter.trim() || null;
}

export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}
