import type {
  Annotation,
  AnnotationColour,
  AnnotationKind,
  Box,
  BookletResult,
  Deduction,
  Outlier,
  PointAward,
  QuestionResult,
  Rubric,
  RubricQuestion,
  Strictness,
} from '@/types/answer-checker';

import { PAGE_WIDTH, wrap, type PlacedLine, type WrittenLine } from './answer-checker-pages';
import { seedId } from './ids';

type PointState = 'full' | 'partial' | 'missing';

export interface Objective {
  options: readonly string[];
  answer: number;
}

export type Objectives = ReadonlyMap<string, Objective>;

export interface QuestionObservation {
  number: string;
  attempted: boolean;
  points: PointState[];
  misspelt: boolean;
  doubtful: boolean;
  chosen: number | null;
}

const QUANTUM = 0.5;

function fmix32(value: number): number {
  let h = value >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export const chance = (...parts: (string | number)[]): number =>
  fmix32(Number.parseInt(seedId(...parts).slice(0, 8), 16)) / 0xffffffff;

export const quantise = (value: number): number => Math.round(value / QUANTUM) * QUANTUM;

const shortId = (...parts: (string | number)[]): string => seedId(...parts).replace(/-/g, '').slice(0, 12);

const optionLabel = (index: number): string => `(${String.fromCharCode(97 + index)})`;

export function observe(studentKey: string, rubric: Rubric, objectives: Objectives): QuestionObservation[] {
  const ability = 0.45 + chance('ability', studentKey) * 0.5;
  return rubric.questions.map((question) => {
    const objective = objectives.get(question.number);
    const attempted = chance('attempt', studentKey, question.number) > 0.05;
    if (objective) {
      const right = chance('mcq', studentKey, question.number) < ability + 0.1;
      const { answer, options } = objective;
      const wrong = (answer + 1 + Math.floor(chance('wrong', studentKey, question.number) * (options.length - 1))) % options.length;
      return { number: question.number, attempted, points: [right ? 'full' : 'missing'], misspelt: false, doubtful: false, chosen: right ? answer : wrong };
    }
    const points = question.key_points.map<PointState>((_, index) => {
      const roll = chance('point', studentKey, question.number, index);
      if (roll < ability * 0.8) return 'full';
      return roll < ability ? 'partial' : 'missing';
    });
    return {
      number: question.number,
      attempted,
      points,
      misspelt: chance('spelling', studentKey, question.number) < 0.3,
      doubtful: chance('doubt', studentKey, question.number) < 0.08,
      chosen: null,
    };
  });
}

function misspell(text: string): string {
  const words = text.split(' ');
  const target = words.findIndex((word) => /^[a-z]{6,}$/i.test(word));
  if (target < 0) return text;
  const word = words[target] ?? '';
  const middle = Math.floor(word.length / 2);
  words[target] = `${word.slice(0, middle)}${word[middle] ?? ''}${word.slice(middle)}`;
  return words.join(' ');
}

export function writtenLines(rubric: Rubric, observations: readonly QuestionObservation[], objectives: Objectives): WrittenLine[] {
  return observations.flatMap((observation) => {
    const question = rubric.questions.find((row) => row.number === observation.number);
    if (!question || !observation.attempted) return [];
    const objective = objectives.get(question.number);
    if (objective && observation.chosen !== null) {
      return [{ question: question.number, text: `${optionLabel(observation.chosen)} ${objective.options[observation.chosen] ?? ''}`, pointIndex: 0 }];
    }
    let first = true;
    return question.key_points.flatMap((point, index) => {
      const state = observation.points[index];
      if (state === 'missing' || state === undefined) return [];
      const words = point.text.split(' ');
      const said = state === 'partial' ? words.slice(0, Math.max(2, Math.ceil(words.length * 0.55))).join(' ') : point.text;
      const sentence = first && observation.misspelt ? misspell(said) : said;
      first = false;
      return wrap(`${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`).map((text) => ({ question: question.number, text, pointIndex: index }));
    });
  });
}

function annotation(id: string, kind: AnnotationKind, page: number, box: Box, colour: AnnotationColour, extra: Partial<Annotation> = {}): Annotation {
  return {
    id,
    kind,
    target: { page_index: page, line_indices: [], word_indices: [], box },
    colour,
    text: '',
    question_number: null,
    reason: '',
    key_point_id: null,
    source: 'ai',
    confidence: 1,
    points: [],
    deleted: false,
    ...extra,
  };
}

function pointAward(question: RubricQuestion, index: number, state: PointState, level: Strictness, placed: readonly PlacedLine[]): PointAward {
  const point = question.key_points[index];
  const marks = point?.marks ?? 0;
  const partial = level === 'easy' ? marks : level === 'strict' ? 0 : quantise(marks / 2);
  const lines = placed.filter((entry) => entry.pointIndex === index);
  const line = lines[0];
  return {
    key_point_id: point?.id ?? `${question.number}-${index}`,
    key_point_text: point?.text ?? '',
    max_marks: marks,
    awarded: state === 'full' ? marks : state === 'partial' ? partial : 0,
    found: state !== 'missing',
    evidence: lines.map((entry) => entry.text).join(' '),
    evidence_line_indices: line ? [line.line.index] : [],
    evidence_page_index: line?.page ?? null,
    confidence: state === 'partial' ? 0.82 : 0.93,
    reason: state === 'full' ? 'stated clearly' : state === 'partial' ? 'the idea is there but incomplete' : 'not found in the answer',
  };
}

export function priceQuestion(
  bookletId: string,
  question: RubricQuestion,
  observation: QuestionObservation,
  level: Strictness,
  placed: readonly PlacedLine[],
): QuestionResult {
  const lines = placed.filter((entry) => entry.question === question.number);
  const awards = question.key_points.map((_, index) =>
    pointAward(question, index, observation.attempted ? (observation.points[index] ?? 'missing') : 'missing', level, lines),
  );
  const firstLine = lines[0];
  const deductions: Deduction[] = [];
  const annotations: Annotation[] = [];
  const id = (...parts: (string | number)[]): string => shortId(bookletId, question.number, ...parts);

  if (firstLine) {
    const { box } = firstLine.line;
    annotations.push(annotation(id('number'), 'question_number', firstLine.page, { x: 52, y: box.y + 4, w: 54, h: box.h - 6 }, 'red', { text: question.number, question_number: question.number }));
    if (observation.misspelt) {
      const word = firstLine.words.find((entry, index) => /(.)\1/.test(firstLine.text.split(' ')[index] ?? '') && entry.box.w > 60) ?? firstLine.words[1];
      if (word) {
        const reason = level === 'strict' ? 'spelling error' : 'spelling error (meaning is clear, so not deducted)';
        deductions.push({ kind: 'spelling', marks: level === 'strict' ? QUANTUM : 0, reason, word_indices: [word.index], line_indices: [firstLine.line.index], page_index: firstLine.page, confidence: 0.95, suppressed: false, suppressed_reason: '' });
        annotations.push(annotation(id('circle'), 'circle', firstLine.page, { x: word.box.x - 8, y: word.box.y + 2, w: word.box.w + 16, h: word.box.h - 4 }, 'red', { question_number: question.number, reason, confidence: 0.95 }));
        annotations.push(annotation(id('sp'), 'margin_shorthand', firstLine.page, { x: PAGE_WIDTH - 230, y: box.y, w: 80, h: box.h }, 'red', { text: 'sp.', question_number: question.number, reason }));
      }
    }
  }

  awards.forEach((award, index) => {
    const line = lines.find((entry) => entry.pointIndex === index);
    if (!line) return;
    const { box } = line.line;
    const end = { x: box.x + box.w + 12, y: box.y, w: 56, h: box.h };
    if (!award.found) {
      annotations.push(annotation(id('cross', index), 'cross', line.page, end, 'red', { question_number: question.number, key_point_id: award.key_point_id, reason: 'not the keyed answer', confidence: award.confidence }));
      return;
    }
    if (award.awarded >= award.max_marks) {
      annotations.push(annotation(id('tick', index), 'double_tick', line.page, end, 'green', { question_number: question.number, key_point_id: award.key_point_id, reason: award.reason, confidence: award.confidence }));
    } else {
      annotations.push(annotation(id('tick', index), 'tick', line.page, end, 'green', { question_number: question.number, key_point_id: award.key_point_id, reason: award.reason, confidence: award.confidence }));
      annotations.push(annotation(id('wavy', index), 'wavy_underline', line.page, box, 'red', { question_number: question.number, key_point_id: award.key_point_id, reason: award.reason, confidence: award.confidence }));
    }
  });

  const gained = awards.reduce((sum, award) => sum + award.awarded, 0);
  const lost = deductions.reduce((sum, deduction) => sum + (deduction.suppressed ? 0 : deduction.marks), 0);
  const marks = observation.attempted ? quantise(Math.min(question.max_marks, Math.max(0, gained - lost))) : 0;

  if (firstLine) {
    annotations.push(annotation(id('marks'), 'question_marks', firstLine.page, { x: PAGE_WIDTH - 140, y: firstLine.line.box.y - 6, w: 120, h: 60 }, 'red', { text: `${marks}/${question.max_marks}`, question_number: question.number }));
  }

  const missing = awards.filter((award) => !award.found).map((award) => award.key_point_text);
  const weak = awards.filter((award) => award.found && award.awarded < award.max_marks).map((award) => award.key_point_text);
  const comment = !observation.attempted
    ? 'Not attempted.'
    : missing.length === 0 && weak.length === 0
      ? 'Complete and precise.'
      : [missing[0] ? `Missing: ${missing[0]}` : null, weak[0] ? `Say more about: ${weak[0]}` : null].filter(Boolean).join('; ');

  const lastLine = lines[lines.length - 1];
  if (lastLine && observation.attempted) {
    const remark = comment.length > 64 ? `${comment.slice(0, 61)}…` : comment;
    annotations.push(annotation(id('remark'), 'note', lastLine.page, { x: 150, y: lastLine.line.box.y + 56, w: 760, h: 30 }, 'red', { text: remark, question_number: question.number, reason: comment }));
  }

  return {
    question_number: question.number,
    max_marks: question.max_marks,
    point_awards: awards,
    deductions,
    is_attempted: observation.attempted,
    counted: true,
    not_counted_reason: '',
    comment,
    confidence: observation.doubtful ? 0.58 : 0.9,
    review_reasons: observation.doubtful ? ['low_confidence'] : [],
    annotations,
    teacher_marks_override: null,
    teacher_comment: null,
    needs_review: observation.doubtful,
    ai_marks: marks,
    marks,
  };
}

export function withOverride(result: QuestionResult, override: number | null): QuestionResult {
  const marks = override === null ? result.ai_marks : quantise(Math.min(result.max_marks, Math.max(0, override)));
  return { ...result, teacher_marks_override: override, marks };
}

export function withTotals(result: Omit<BookletResult, 'total_marks' | 'total_possible' | 'mean_confidence'>): BookletResult {
  const counted = result.results.filter((row) => row.counted);
  const attempted = result.results.filter((row) => row.is_attempted);
  return {
    ...result,
    total_marks: quantise(counted.reduce((sum, row) => sum + row.marks, 0)),
    total_possible: counted.reduce((sum, row) => sum + row.max_marks, 0),
    mean_confidence: attempted.length ? attempted.reduce((sum, row) => sum + row.confidence, 0) / attempted.length : 0,
  };
}

export function overallComment(total: number, possible: number): string {
  const share = possible > 0 ? total / possible : 0;
  if (share >= 0.85) return 'Excellent work: accurate, complete and well expressed.';
  if (share >= 0.6) return 'Good grasp of the ideas; finish every answer and use the exact terms.';
  if (share >= 0.4) return 'Several answers are incomplete. Revise the chapter and practise writing full answers.';
  return 'Needs support: go over the key ideas of this chapter with your teacher.';
}


export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  return sorted.length % 2 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function findOutliers(results: readonly BookletResult[], tolerance = 1, minPeers = 4): Outlier[] {
  const byQuestion = new Map<string, { booklet: string; marks: number }[]>();
  for (const booklet of results) {
    for (const question of booklet.results) {
      if (!question.is_attempted || !question.counted) continue;
      const list = byQuestion.get(question.question_number) ?? [];
      list.push({ booklet: booklet.booklet_id, marks: question.marks });
      byQuestion.set(question.question_number, list);
    }
  }
  const out: Outlier[] = [];
  for (const [number, entries] of byQuestion) {
    if (entries.length < minPeers) continue;
    const marks = entries.map((entry) => entry.marks);
    const middle = median(marks);
    const spread = median(marks.map((value) => Math.abs(value - middle)));
    const threshold = Math.max(tolerance, spread * 3);
    for (const entry of entries) {
      if (Math.abs(entry.marks - middle) <= threshold) continue;
      out.push({
        booklet_id: entry.booklet,
        question_number: number,
        marks: entry.marks,
        peer_median: middle,
        peer_count: entries.length,
        note: `${entry.marks} against a class median of ${middle} over ${entries.length} answers`,
      });
    }
  }
  return out;
}

const STOP_WORDS = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'into', 'are', 'for', 'its', 'their', 'they', 'which', 'when', 'than', 'then', 'there', 'have', 'has', 'was', 'were', 'will', 'only', 'more', 'some']);

const contentWords = (text: string): string[] =>
  text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word));

function coverage(point: string, answer: string): number {
  const wanted = contentWords(point);
  if (wanted.length === 0) return 0;
  const said = new Set(contentWords(answer));
  return wanted.filter((word) => said.has(word) || [...said].some((other) => other.startsWith(word.slice(0, 5)))).length / wanted.length;
}

function chosenOption(answer: string, objective: Objective): number | null {
  const letter = /\(?([a-d])\)?/i.exec(answer.trim())?.[1];
  if (letter) return letter.toLowerCase().charCodeAt(0) - 97;
  const index = objective.options.findIndex((option) => answer.toLowerCase().includes(option.toLowerCase()));
  return index >= 0 ? index : null;
}

export function typedObservations(rubric: Rubric, typed: Readonly<Record<string, string>>, objectives: Objectives): QuestionObservation[] {
  return rubric.questions.map((question) => {
    const answer = typed[question.number] ?? '';
    const attempted = answer.trim().length > 0;
    const objective = objectives.get(question.number);
    if (objective) {
      const chosen = attempted ? chosenOption(answer, objective) : null;
      return { number: question.number, attempted, points: [chosen === objective.answer ? 'full' : 'missing'], misspelt: false, doubtful: chosen === null && attempted, chosen };
    }
    const points = question.key_points.map<PointState>((point) => {
      const share = coverage(point.text, answer);
      if (share >= 0.6) return 'full';
      return share >= 0.3 ? 'partial' : 'missing';
    });
    return { number: question.number, attempted, points, misspelt: false, doubtful: attempted && answer.trim().split(/\s+/).length < 4, chosen: null };
  });
}

export function typedLines(rubric: Rubric, typed: Readonly<Record<string, string>>): WrittenLine[] {
  return rubric.questions.flatMap((question) => {
    const answer = typed[question.number]?.trim() ?? '';
    if (!answer) return [];
    return wrap(answer).map((text) => {
      const scores = question.key_points.map((point) => coverage(point.text, text));
      const best = scores.reduce((top, score, index) => (score > (scores[top] ?? 0) ? index : top), 0);
      return { question: question.number, text, pointIndex: (scores[best] ?? 0) > 0 ? best : null };
    });
  });
}
