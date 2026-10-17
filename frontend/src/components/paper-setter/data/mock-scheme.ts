import { config } from '@/config';
import { MARKING_SCHEMES, type MarkingScheme, type SchemePoint, type SchemeQuestion } from '@/fixtures/data/answer-checker';
import type { CurriculumNode } from '@/types/library';

import type { DrawnQuestion } from './mock-questions';

const HALF = 2;

const optionLabel = (index: number, option: string): string => `(${String.fromCharCode(97 + index)}) ${option}`;

const words = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);

function scaled(points: readonly (readonly [string, number])[], marks: number): SchemePoint[] {
  const total = points.reduce((sum, [, value]) => sum + value, 0);
  if (points.length === 0 || total <= 0) return [{ text: 'answers the question correctly', marks }];
  if (total === marks) return points.map(([text, value]) => ({ text, marks: value }));
  const shares = points.map(([text, value]) => ({ text, marks: Math.round((value / total) * marks * HALF) / HALF }));
  const drift = marks - shares.reduce((sum, point) => sum + point.marks, 0);
  const last = shares[shares.length - 1]!;
  last.marks = Math.max(0, last.marks + drift);
  return shares.filter((point) => point.marks > 0);
}

function topicOf(question: DrawnQuestion, topics: readonly CurriculumNode[]): string | null {
  const text = new Set(words(question.text));
  let best: { title: string; score: number } | null = null;
  for (const topic of topics) {
    const score = words(topic.title ?? '').filter((word) => text.has(word)).length;
    if (score > 0 && (!best || score > best.score)) best = { title: topic.title ?? '', score };
  }
  return best?.title ?? null;
}

const GENERAL_POINT = 'answers the question correctly, with relevant working or explanation';

function schemeQuestion(question: DrawnQuestion, topicsOf: (chapter: string) => readonly CurriculumNode[]): SchemeQuestion {
  const source = question.source;
  const topic = topicOf(question, topicsOf(question.chapter));
  const path = topic ? `${question.chapter} > ${topic}` : question.chapter;
  const reference = { section_path: path, page: 0, text: topic ?? question.chapter };
  if (!source) return { n: question.n, points: [{ text: GENERAL_POINT, marks: question.marks }], model_answer: '', reference };
  if (source.options && source.answer !== undefined) {
    const keyed = optionLabel(source.answer, source.options[source.answer] ?? '');
    return { n: question.n, points: [{ text: keyed, marks: question.marks }], options: [...source.options], answer: source.answer, model_answer: keyed, reference };
  }
  const points = scaled(source.points ?? [], question.marks);
  return { n: question.n, points, model_answer: points.map((point) => point.text).join('. '), reference };
}

export function recordDrawnScheme(paperId: string, book: string, drawn: readonly DrawnQuestion[], topicsOf: (chapter: string) => readonly CurriculumNode[]): void {
  if (!config.devBypass || drawn.length === 0) return;
  const questions = drawn.map((question) => schemeQuestion(question, topicsOf));
  const generated = drawn.some((question) => question.source === null);
  const scheme: MarkingScheme = { paper_id: paperId, book, questions, ...(generated ? { generated } : {}) };
  const at = MARKING_SCHEMES.findIndex((row) => row.paper_id === paperId);
  if (at >= 0) MARKING_SCHEMES.splice(at, 1, scheme);
  else MARKING_SCHEMES.push(scheme);
}
