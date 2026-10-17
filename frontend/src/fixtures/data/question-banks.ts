import { ENGLISH_10_BANK } from './english-annual-2026';
import { HINDI_10_BANK } from './hindi-10-bank';
import { MATHS_10_BANK } from './maths-10-bank';
import { SCIENCE_10_BANK, type BankQuestion } from './science-10-bank';
import { SOCIAL_SCIENCE_10_BANK } from './social-science-10-bank';

export type QuestionBank = Readonly<Record<string, readonly BankQuestion[]>>;

const CLASS_10_BANKS: Readonly<Record<string, QuestionBank>> = {
  science: SCIENCE_10_BANK,
  mathematics: MATHS_10_BANK,
  english: ENGLISH_10_BANK,
  'social science': SOCIAL_SCIENCE_10_BANK,
  hindi: HINDI_10_BANK,
};

const CLASS_10 = '10';

export const bankFor = (subject: string, grade: string): QuestionBank | null =>
  grade.trim() === CLASS_10 ? (CLASS_10_BANKS[subject.trim().toLowerCase()] ?? null) : null;
