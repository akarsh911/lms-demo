import type { GraspQuestion, ReadbackItem, StudentAnswer } from '@/types/grasp';

interface Mcq {
  readonly prompt: string;
  readonly options: readonly string[];
  readonly answer: number;
}

/** Readback material written for one idea a good answer to a question contains. */
export interface ClaimMaterial {
  readonly id: string;
  readonly questionId: string;
  readonly topic: string;
  /** Lower-case words or phrases that show the idea is in the student's answer. */
  readonly cues: readonly string[];
  readonly fast: Mcq;
  readonly slow: Mcq;
}

interface Candidate {
  readonly key: string;
  readonly questionId: string;
  readonly topic: string;
  readonly source: string;
  readonly fast: Mcq;
  readonly slow: Mcq;
}

export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function shuffled(mcq: Mcq, rand: () => number): Mcq {
  const order = mcq.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j] ?? i, order[i] ?? j];
  }
  return { prompt: mcq.prompt, options: order.map((i) => mcq.options[i] ?? ''), answer: order.indexOf(mcq.answer) };
}

const sentencesOf = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const STOP = new Set(
  'the a an and or but of to in on at for from by with as is are was were be been being it its this that these those which who whom into than then so such can could would should will may might has have had do does did not no also very more most when where while because there their they them we our you your he she his her i my me about over under between both each other some any all only just'.split(' '),
);

const wordsOf = (text: string): string[] => text.toLowerCase().match(/[a-z][a-z-]+|\d+(?:\.\d+)?/g) ?? [];

const contentWords = (text: string): string[] => wordsOf(text).filter((w) => !STOP.has(w) && (/\d/.test(w) || w.length >= 5));

const clip = (text: string, max = 110): string => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

function numberDistractors(value: string): string[] {
  const n = Number(value);
  const step = Number.isInteger(n) ? Math.max(1, Math.round(Math.abs(n) * 0.25)) : 0.5;
  return [String(n + step), String(n === 0 ? 2 : n * 2), String(n - step)].filter((v) => v !== value);
}

function gapItem(question: GraspQuestion, line: { s: string; words: string[] }, n: number, pool: readonly string[]): Candidate | null {
  const key = line.words.find((w) => /\d/.test(w)) ?? [...line.words].sort((a, b) => b.length - a.length)[0];
  if (!key) return null;
  const others = /\d/.test(key) ? numberDistractors(key) : pool.filter((w) => w !== key && !/\d/.test(w) && !line.words.includes(w));
  const picks = [...new Set(others)].slice(0, 2);
  if (picks.length < 2) return null;
  const pattern = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  const gapped = line.s.replace(pattern, '____').replace(/[.!?]$/, '');
  return {
    key: `x-${question.id}-${n}`,
    questionId: question.id,
    topic: `Q${question.number} in their own words`,
    source: line.s,
    fast: { prompt: `Q${question.number}, your words: “${clip(gapped, 90)}”. What fills the gap?`, options: [key, ...picks], answer: 0 },
    slow: { prompt: `Which line is the one you wrote for Q${question.number}?`, options: [clip(line.s), ...picks.map((w) => clip(line.s.replace(pattern, w)))], answer: 0 },
  };
}

// For a question the bank has no material for: gaps in the student's own sentences, and an untimed twin.
function extractive(question: GraspQuestion, text: string, pool: readonly string[]): Candidate[] {
  const weight = (x: { words: string[] }): number => x.words.length + (x.words.some((w) => /\d/.test(w)) ? 3 : 0);
  return sentencesOf(text)
    .map((s) => ({ s, words: contentWords(s) }))
    .filter((x) => x.words.length >= 2)
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, 2)
    .flatMap((line, n) => gapItem(question, line, n, pool) ?? []);
}

function sourceLine(text: string, cues: readonly string[]): string {
  const lines = sentencesOf(text);
  return lines.find((l) => cues.some((c) => l.toLowerCase().includes(c))) ?? lines[0] ?? '';
}

export function buildReadback({
  questions,
  answers,
  claims,
  count,
  seed,
}: {
  questions: readonly GraspQuestion[];
  answers: readonly StudentAnswer[];
  claims: readonly ClaimMaterial[];
  count: number;
  seed: string;
}): ReadbackItem[] {
  const rand = seededRandom(seed);
  const textOf = new Map(answers.map((a) => [a.questionId, a.text.trim()]));
  const answered = questions.filter((q) => (textOf.get(q.id) ?? '').length > 0);
  const pool = [...new Set(answered.flatMap((q) => contentWords(textOf.get(q.id) ?? '')).filter((w) => w.length >= 6))].sort(() => rand() - 0.5);

  const perQuestion = answered.map((q) => {
    const text = textOf.get(q.id) ?? '';
    const lower = text.toLowerCase();
    const own = claims.filter((c) => c.questionId === q.id);
    const scored = own.map((c) => ({ c, hits: c.cues.filter((cue) => lower.includes(cue)).length }));
    const matched = scored.filter((x) => x.hits > 0).sort((a, b) => b.hits - a.hits);
    const unmatched = scored.filter((x) => x.hits === 0);
    const fromClaims = [...matched, ...unmatched].map(({ c }): Candidate => ({ key: c.id, questionId: q.id, topic: c.topic, source: sourceLine(text, c.cues), fast: c.fast, slow: c.slow }));
    return own.length > 0 ? fromClaims : extractive(q, text, pool);
  });

  const picked: Candidate[] = [];
  for (let round = 0; picked.length < count && perQuestion.some((list) => list.length > round); round += 1) {
    for (const list of perQuestion) {
      const c = list[round];
      if (c && picked.length < count) picked.push(c);
    }
  }
  const twin = picked[0];
  if (!twin) return [];

  const item = (c: Candidate, kind: 'fast' | 'slow', n: number): ReadbackItem => {
    const mcq = shuffled(kind === 'fast' ? c.fast : c.slow, rand);
    return { id: `${kind}-${n}-${c.key}`, questionId: c.questionId, kind, prompt: mcq.prompt, options: mcq.options, answer: mcq.answer, source: c.source, topic: c.topic };
  };
  return [...picked.map((c, n) => item(c, 'fast', n)), item(twin, 'slow', 0)];
}
