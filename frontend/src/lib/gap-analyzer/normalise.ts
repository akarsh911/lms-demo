import type { OmrOutcome } from '@/types/answer-checker';
import type { FactAssessment } from '@/types/debate';
import type { ReportTopic } from '@/types/flashcards';
import type { GapEvidence, GapRef, GapSource } from '@/types/gap-analyzer';
import type { MasteryMap } from '@/types/mastery';

import { chapterNamed, resolvePath, topicInChapter, type CatalogChapter, type CatalogSubject, type CatalogTopic } from './catalog';
import { EXAM_MIN_SPECIFICITY, FACT_SIGNAL, MASTERY_SIGNAL, SOURCE_WEIGHTS, clamp01, round3 } from './model';

export interface ExamMarkRecord {
  mark_id: string;
  student_id: string;
  exam_id: string;
  exam_name: string;
  subject_name: string;
  marks: number;
  max: number;
  date: string;
  syllabus: readonly CatalogChapter[];
}

export interface MarkedQuestion {
  n: number;
  awarded: number;
  max: number;
  section_path: string;
}

export interface AnswerSheetRecord {
  sheet_id: string;
  student_id: string;
  paper_id: string;
  paper_title: string;
  date: string;
  questions: readonly MarkedQuestion[];
}

export interface OmrRecord {
  sheet_id: string;
  student_id: string;
  paper_id: string;
  paper_title: string;
  date: string;
  questions: readonly { n: number; outcome: OmrOutcome; section_path: string }[];
}

export interface PracticeRecord {
  attempt_id: string;
  student_id: string;
  paper_id: string;
  paper_title: string;
  date: string;
  topics: readonly { section_path: string; awarded: number; max: number }[];
}

export interface MasteryRecord {
  record_id: string;
  student_id: string;
  item_id: string;
  section_id: string;
  map_title: string;
  date: string;
  states: MasteryMap;
  topic_of: ReadonlyMap<string, string>;
  label_of: ReadonlyMap<string, string>;
}

export interface FlashcardRecord {
  deck_id: string;
  student_id: string;
  date: string;
  title: string;
  chapter_title: string;
  standings: readonly ReportTopic[];
}

export interface DebateRecord {
  session_id: string;
  student_id: string;
  date: string;
  motion: string;
  chapter_title: string;
  fact_checks: readonly { claim: string; assessment: FactAssessment; topic: string }[];
}

const SCORED_OMR: ReadonlySet<OmrOutcome> = new Set<OmrOutcome>(['correct', 'incorrect', 'blank', 'multiple', 'out_of_range']);

const volumeFactor = (units: number, full: number): number => Math.min(1, units / full);

function event(source: GapSource, topic: CatalogTopic, ref: GapRef, signal: number, weightFactor: number, date: string, label: string, detail: string): GapEvidence {
  return {
    id: `${ref.kind}:${ref.record_id}:${topic.id}`,
    student_id: ref.student_id,
    topic_id: topic.id,
    source,
    signal: round3(clamp01(signal)),
    weight: round3(SOURCE_WEIGHTS[source] * weightFactor),
    date,
    label,
    detail,
    ref,
  };
}

function grouped<T>(rows: readonly T[], topicOf: (row: T) => CatalogTopic | null): Map<CatalogTopic, T[]> {
  const out = new Map<CatalogTopic, T[]>();
  for (const row of rows) {
    const topic = topicOf(row);
    if (topic) out.set(topic, [...(out.get(topic) ?? []), row]);
  }
  return out;
}

const sumOf = <T>(rows: readonly T[], value: (row: T) => number): number => rows.reduce((total, row) => total + value(row), 0);

export function fromExamMark(record: ExamMarkRecord): GapEvidence[] {
  if (record.max <= 0 || record.syllabus.length === 0) return [];
  const specificity = Math.max(EXAM_MIN_SPECIFICITY, 1 / record.syllabus.length);
  const ref: GapRef = { kind: 'exam_mark', record_id: record.mark_id, title: `${record.exam_name}, ${record.subject_name}`, student_id: record.student_id, exam_id: record.exam_id };
  const chapters = record.syllabus.map((chapter) => chapter.title).join(', ');
  return record.syllabus.flatMap((chapter) =>
    chapter.topics.map((topic) =>
      event('exam', topic, ref, record.marks / record.max, specificity, record.date, `${record.marks}/${record.max} overall`, `The whole-paper mark, spread over the ${record.syllabus.length} chapters it examined: ${chapters}.`),
    ),
  );
}

export function fromAnswerSheet(record: AnswerSheetRecord, subject: CatalogSubject): GapEvidence[] {
  const byTopic = grouped(record.questions, (question) => resolvePath(subject, question.section_path));
  return [...byTopic.entries()].map(([topic, questions]) => {
    const awarded = sumOf(questions, (q) => q.awarded);
    const max = sumOf(questions, (q) => q.max);
    const label = `${questions.map((q) => `Q${q.n}`).join(', ')} · ${awarded}/${max}`;
    const ref: GapRef = { kind: 'answer_sheet', record_id: record.sheet_id, title: record.paper_title, student_id: record.student_id, paper_id: record.paper_id, question: questions.map((q) => String(q.n)).join(',') };
    return event('answer_sheet', topic, ref, max > 0 ? awarded / max : 0, volumeFactor(max, 4), record.date, label, `Checked against the marking scheme of ${record.paper_title}.`);
  });
}

export function fromOmr(record: OmrRecord, subject: CatalogSubject): GapEvidence[] {
  const scored = record.questions.filter((question) => SCORED_OMR.has(question.outcome));
  const byTopic = grouped(scored, (question) => resolvePath(subject, question.section_path));
  return [...byTopic.entries()].map(([topic, questions]) => {
    const right = questions.filter((q) => q.outcome === 'correct').length;
    const ref: GapRef = { kind: 'omr_sheet', record_id: record.sheet_id, title: record.paper_title, student_id: record.student_id, paper_id: record.paper_id, question: questions.map((q) => String(q.n)).join(',') };
    const blank = questions.filter((q) => q.outcome === 'blank').length;
    const detail = blank > 0 ? `${blank} left blank, counted as not known.` : 'Every bubble read cleanly.';
    return event('omr', topic, ref, right / questions.length, volumeFactor(questions.length, 4), record.date, `${right} of ${questions.length} bubbles right`, detail);
  });
}

export function fromPractice(record: PracticeRecord, subject: CatalogSubject): GapEvidence[] {
  const byTopic = grouped(record.topics, (row) => resolvePath(subject, row.section_path));
  return [...byTopic.entries()].map(([topic, rows]) => {
    const awarded = sumOf(rows, (row) => row.awarded);
    const max = sumOf(rows, (row) => row.max);
    const ref: GapRef = { kind: 'practice_paper', record_id: record.attempt_id, title: record.paper_title, student_id: record.student_id, paper_id: record.paper_id };
    return event('paper', topic, ref, max > 0 ? awarded / max : 0, volumeFactor(max, 4), record.date, `${awarded}/${max} on this topic`, `A practice paper from the paper setter.`);
  });
}

export function fromMastery(record: MasteryRecord, subject: CatalogSubject): GapEvidence[] {
  const topicsById = new Map(subject.chapters.flatMap((chapter) => chapter.topics.map((topic) => [topic.id, topic] as const)));
  const byTopic = grouped(Object.entries(record.states), ([nodeId]) => topicsById.get(record.topic_of.get(nodeId) ?? '') ?? null);
  return [...byTopic.entries()].flatMap(([topic, entries]) => {
    const ref: GapRef = { kind: 'mastery', record_id: record.record_id, title: `Mind map · ${record.map_title}`, student_id: record.student_id };
    const drilled = entries.filter(([, state]) => state !== 'read');
    const read = entries.filter(([, state]) => state === 'read');
    const out: GapEvidence[] = [];
    if (drilled.length > 0) {
      const missed = drilled.filter(([, state]) => state === 'missed').map(([id]) => record.label_of.get(id) ?? id);
      const signal = sumOf(drilled, ([, state]) => MASTERY_SIGNAL[state]) / drilled.length;
      const detail = missed.length > 0 ? `Missed in the drill: ${missed.join(', ')}.` : 'Every drilled concept answered.';
      out.push(event('mindmap', topic, ref, signal, volumeFactor(drilled.length, 3), record.date, `${drilled.length - missed.length} of ${drilled.length} concepts held`, detail));
    }
    if (read.length > 0) {
      out.push({ ...event('read', topic, ref, MASTERY_SIGNAL.read, 1, record.date, `${read.length} concepts read`, 'Read on the map, not yet drilled.'), id: `read:${record.record_id}:${topic.id}` });
    }
    return out;
  });
}

export function fromFlashcards(record: FlashcardRecord, subject: CatalogSubject): GapEvidence[] {
  const chapter = chapterNamed(subject, record.chapter_title);
  if (!chapter) return [];
  return record.standings.flatMap((standing) => {
    const topic = topicInChapter(chapter, standing.label);
    if (!topic || standing.cards === 0) return [];
    const ref: GapRef = { kind: 'flashcard_report', record_id: record.deck_id, title: record.title, student_id: record.student_id };
    return [event('flashcards', topic, ref, standing.correct / standing.cards, volumeFactor(standing.cards, 3), record.date, `${standing.correct} of ${standing.cards} cards right`, 'From the deck report the flashcard engine returned.')];
  });
}

export function fromDebate(record: DebateRecord, subject: CatalogSubject): GapEvidence[] {
  const chapter = chapterNamed(subject, record.chapter_title);
  if (!chapter) return [];
  const checked = record.fact_checks.filter((item) => item.assessment !== 'unverified');
  const byTopic = grouped(checked, (item) => topicInChapter(chapter, item.topic));
  return [...byTopic.entries()].map(([topic, items]) => {
    const signal = sumOf(items, (item) => (item.assessment === 'unverified' ? 0 : FACT_SIGNAL[item.assessment])) / items.length;
    const wrong = items.filter((item) => item.assessment === 'incorrect').map((item) => `“${item.claim}”`);
    const ref: GapRef = { kind: 'debate_report', record_id: record.session_id, title: `Debate · ${record.motion}`, student_id: record.student_id };
    const detail = wrong.length > 0 ? `Fact-checked as incorrect: ${wrong.join('; ')}.` : 'Every claim on this topic held up in the fact-check.';
    return event('debate', topic, ref, signal, volumeFactor(items.length, 2), record.date, `${items.length} claim${items.length === 1 ? '' : 's'} fact-checked`, detail);
  });
}
