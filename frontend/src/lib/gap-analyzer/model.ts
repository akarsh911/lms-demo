import type { GapSource } from '@/types/gap-analyzer';

export const SOURCE_WEIGHTS: Readonly<Record<GapSource, number>> = {
  exam: 1,
  omr: 0.9,
  answer_sheet: 0.85,
  paper: 0.7,
  mindmap: 0.5,
  flashcards: 0.4,
  debate: 0.3,
  read: 0.1,
};

export const SOURCE_LABELS: Readonly<Record<GapSource, string>> = {
  exam: 'Exam marks',
  omr: 'OMR',
  answer_sheet: 'Answer sheet',
  paper: 'Paper',
  mindmap: 'Mind map',
  flashcards: 'Flashcards',
  debate: 'Debate',
  read: 'Mind map read',
};

export const ASSESSED_SOURCES: ReadonlySet<GapSource> = new Set<GapSource>(['omr', 'answer_sheet', 'paper']);

export const EXPOSURE_ONLY: ReadonlySet<GapSource> = new Set<GapSource>(['read']);

export const DIFFUSE_SOURCES: ReadonlySet<GapSource> = new Set<GapSource>(['exam', 'read']);

export const HALF_LIFE_DAYS = 45;
export const WEAK_BELOW = 0.5;
export const SECURE_FROM = 0.7;
export const VOLUME_SCALE = 1.2;
export const SINGLE_SOURCE_DISCOUNT = 0.8;
export const HIGH_CONFIDENCE = 0.6;
export const MEDIUM_CONFIDENCE = 0.3;
export const TREND_WINDOW_DAYS = 21;
export const TREND_STEP = 0.08;
export const EXAM_MIN_SPECIFICITY = 0.15;
export const CLASS_WIDE_SHARE = 0.45;
export const CLASS_WIDE_MIN_LEARNERS = 5;
export const QUIZ_QUESTIONS = 5;
export const MASTERY_SIGNAL = { known: 1, shaky: 0.6, missed: 0.15, read: 0.6 } as const;
export const FACT_SIGNAL = { correct: 1, mostly_correct: 0.8, partially_correct: 0.5, incorrect: 0 } as const;

const DAY_MS = 86_400_000;

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const round3 = (value: number): number => Math.round(value * 1000) / 1000;

export const percent = (value: number | null): string => (value === null ? '—' : `${Math.round(value * 100)}%`);
