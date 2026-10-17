import type { AnswerVerdict, CardStyle } from '@/types/flashcards';

export type AccentTone = 'blue' | 'indigo' | 'violet' | 'lilac' | 'teal' | 'coral' | 'rose';

export type VerdictTone = 'green' | 'amber' | 'red' | 'grey';

export const STYLE_ACCENT: Readonly<Record<CardStyle, { tone: AccentTone; label: string }>> = {
  definition: { tone: 'blue', label: 'Definition' },
  recall: { tone: 'indigo', label: 'Recall' },
  concept: { tone: 'violet', label: 'Concept' },
  reasoning: { tone: 'violet', label: 'Reasoning' },
  process: { tone: 'teal', label: 'Process' },
  application: { tone: 'teal', label: 'Application' },
  formula: { tone: 'lilac', label: 'Formula' },
  compare: { tone: 'coral', label: 'Compare' },
  cause_effect: { tone: 'coral', label: 'Cause and effect' },
  exam: { tone: 'rose', label: 'Exam' },
};

export const VERDICT_TONE: Readonly<Record<AnswerVerdict, VerdictTone>> = {
  correct: 'green',
  almost: 'amber',
  incorrect: 'red',
  needs_review: 'grey',
};

const STRONG_AT = 0.8;
const FAIR_AT = 0.5;

export function performanceTone(correct: number, cards: number): VerdictTone {
  if (cards === 0) return 'grey';
  const ratio = correct / cards;
  if (ratio >= STRONG_AT) return 'green';
  if (ratio >= FAIR_AT) return 'amber';
  return 'red';
}

export function pagesLabel(range: [number, number] | null): string | null {
  if (!range) return null;
  return range[0] === range[1] ? `p. ${range[0]}` : `pp. ${range[0]}–${range[1]}`;
}
