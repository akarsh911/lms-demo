import { trimNumber } from '@/lib/exams/exam';
import type {
  DifficultyLabel,
  QuestionRow,
  QuestionSource,
  QuestionStatus,
  QuestionType,
  QuestionVersionRow,
} from '@/types/questions';
import type { ChipTone } from '@/components/ui/chip';

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'Multiple choice',
  multi_select: 'Multiple answers',
  true_false: 'True or false',
  fill_blank: 'Fill in the blank',
  match: 'Matching',
  short_answer: 'Short answer',
  long_answer: 'Long answer',
  numeric: 'Numeric',
  assertion_reason: 'Assertion and reason',
  case_study: 'Case study',
  code: 'Code',
};

export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  draft: 'Draft',
  reviewed: 'Reviewed',
  published: 'Published',
  retired: 'Retired',
};

export const QUESTION_STATUS_TONES: Record<QuestionStatus, ChipTone> = {
  draft: 'grey',
  reviewed: 'blue',
  published: 'green',
  retired: 'amber',
};

export const DIFFICULTY_LABELS: Record<DifficultyLabel, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export const SOURCE_LABELS: Record<QuestionSource, string> = {
  original: 'Written here',
  pyq: 'A past paper',
  ai: 'Generated',
  imported: 'Imported',
};

export const NO_ANSWERS_IN_THE_PICKER =
  'The bank holds an answer against every version. None of it is asked for ' +
  'here and none of it is drawn: a paper records which version it printed, ' +
  'not what the answer to it is.';

export function questionHeadline(question: QuestionRow): string {
  return question.canonical_key ?? question.id;
}

export function questionFacts(question: QuestionRow): string {
  const parts: string[] = [];
  if (question.question_type) parts.push(QUESTION_TYPE_LABELS[question.question_type]);
  if (question.status) parts.push(QUESTION_STATUS_LABELS[question.status]);
  if (question.difficulty_label) parts.push(DIFFICULTY_LABELS[question.difficulty_label]);
  else if (typeof question.difficulty_score === 'number') {
    parts.push(`Difficulty ${trimNumber(question.difficulty_score)}`);
  }
  if (question.bloom_level) parts.push(question.bloom_level);
  if (question.source_type) parts.push(SOURCE_LABELS[question.source_type]);
  return parts.length > 0 ? parts.join(' · ') : 'Nothing else was recorded';
}

export function versionHeadline(version: QuestionVersionRow): string {
  const number = version.version_number;
  return typeof number === 'number' ? `Version ${number}` : 'An unnumbered version';
}

export function versionStem(version: QuestionVersionRow): string {
  const stem = version.stem?.trim() ?? '';
  return stem === '' ? 'The wording is not shown to your account.' : stem;
}

export function matchesSearch(question: QuestionRow, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle === '') return true;
  return [question.canonical_key, question.bloom_level, question.language].some(
    (value) => typeof value === 'string' && value.toLowerCase().includes(needle),
  );
}
