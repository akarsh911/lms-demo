import { normalisedName, normalisedRoll } from '@/lib/answer-checker/roster-match';
import type { BookletRef, OmrOutcome } from '@/types/answer-checker';
import type { DeckReport, ReportTopic } from '@/types/flashcards';
import type { LearnerAnalysis, SubjectAnalysis } from '@/types/gap-analyzer';
import type { MasteryMap, MasteryState } from '@/types/mastery';
import type { DrillResult, MindMapResponse } from '@/types/mindmap';

import type { MarkedQuestion } from './normalise';

export type SourceRecord =
  | { type: 'mastery'; date: string; record_id: string; student_id: string; item_id: string; section_id: string; map_title: string; states: MasteryMap; topic_of: Record<string, string>; label_of: Record<string, string> }
  | { type: 'flashcards'; date: string; deck_id: string; student_id: string; title: string; chapter_title: string; standings: ReportTopic[] }
  | { type: 'omr'; date: string; sheet_id: string; student_id: string; paper_id: string; paper_title: string; questions: { n: number; outcome: OmrOutcome; section_path: string }[] }
  | { type: 'answer_sheet'; date: string; sheet_id: string; student_id: string; paper_id: string; paper_title: string; questions: MarkedQuestion[] };

export interface RecordWrite {
  grade: number;
  subject_code: string;
  record: SourceRecord;
}

export interface EvidenceWrite {
  records: RecordWrite[];
}

export interface EvidenceAccepted {
  accepted: number;
}

const folded = (text: string): string => text.toLowerCase().replace(/^\d+(\.\d+)*\.?\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function stateForScore(score: number): MasteryState {
  if (score >= 1) return 'known';
  return score >= 0.5 ? 'shaky' : 'missed';
}

export function drilledStates(result: DrillResult): MasteryMap {
  const states: MasteryMap = {};
  for (const row of result.results) {
    if (row.given.trim() !== '') states[row.node_id] = stateForScore(result.node_scores[row.node_id] ?? 0);
  }
  return states;
}

export function topicsOfMap(map: MindMapResponse): { topic_of: Record<string, string>; label_of: Record<string, string>; title: string } {
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  const topicOf = (id: string): string | null => {
    let node = byId.get(id);
    while (node && node.kind !== 'topic') node = node.parent_id ? byId.get(node.parent_id) : undefined;
    return node?.id ?? null;
  };
  const topic_of: Record<string, string> = {};
  const label_of: Record<string, string> = {};
  for (const node of map.nodes.filter((row) => row.kind === 'atom')) {
    const topic = topicOf(node.id);
    if (topic) topic_of[node.id] = topic;
    label_of[node.id] = node.label;
  }
  const chapter = map.nodes.find((node) => node.kind === 'chapter');
  return { topic_of, label_of, title: chapter?.label ?? 'Mind map' };
}

export function subjectWithTopic(learner: LearnerAnalysis, topicIds: readonly string[]): SubjectAnalysis | null {
  const wanted = new Set(topicIds);
  return learner.subjects.find((subject) => subject.chapters.some((chapter) => chapter.topics.some((topic) => wanted.has(topic.topic_id)))) ?? null;
}

export function subjectNamed(learner: LearnerAnalysis, name: string | null | undefined): SubjectAnalysis | null {
  if (!name) return null;
  return learner.subjects.find((subject) => folded(subject.subject_name) === folded(name) || folded(subject.subject_code) === folded(name)) ?? null;
}

export interface DeckScope {
  topic: string | null;
  chapter: string | null;
  title: string | null;
}

const SECTION_ID_PREFIX = 'sec_';

export const chapterName = (title: string | null | undefined): string | null =>
  title ? (title.split(' · ')[0] ?? title).replace(/^\d+(\.\d+)*\.?\s*/, '').trim() || null : null;

export function standingsOf(report: DeckReport, deck: DeckScope | null): ReportTopic[] {
  const named = deck?.topic?.trim() || chapterName(deck?.title ?? report.title);
  const isSection = (label: string): boolean => label.startsWith(SECTION_ID_PREFIX) || (deck?.chapter !== null && label === deck?.chapter);
  const listed = [...report.strong, ...report.needs_practice].flatMap((row) => (isSection(row.label) ? (named ? [{ ...row, label: named }] : []) : [row]));
  if (listed.length > 0) return listed;
  return named && report.attempted > 0 ? [{ label: named, cards: report.attempted, correct: report.correct }] : [];
}

export function chapterLevel(standings: readonly ReportTopic[], chapter: string | null): boolean {
  return chapter !== null && standings.every((row) => folded(row.label) === folded(chapter));
}

export function chapterForLabels(learner: LearnerAnalysis, labels: readonly string[], chapterHint: string | null): { subject: SubjectAnalysis; chapterTitle: string } | null {
  const wanted = new Set(labels.map(folded));
  for (const subject of learner.subjects) {
    for (const chapter of subject.chapters) {
      if (chapter.topics.some((topic) => wanted.has(folded(topic.title))) || (chapterHint !== null && folded(chapter.title) === folded(chapterHint))) {
        return { subject, chapterTitle: chapter.title };
      }
    }
  }
  return null;
}

export interface CheckedExam {
  klass: string;
  booklets: readonly Pick<BookletRef, 'id' | 'student'>[];
}

export interface ClassMemberOf {
  roll: string | null;
  name: string;
}

export function rosterMatch<T extends ClassMemberOf>(roster: readonly T[], roll: string | null, name: string | null): T | null {
  const wantedName = normalisedName(name);
  if (!wantedName) return null;
  const wantedRoll = normalisedRoll(roll);
  const matches = roster.filter((row) => normalisedName(row.name) === wantedName && (!wantedRoll || normalisedRoll(row.roll) === wantedRoll));
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

export function bookletOfLearner(exam: CheckedExam, sectionCode: string | null, learner: ClassMemberOf): string | null {
  if (!sectionCode || exam.klass !== sectionCode) return null;
  if (!normalisedRoll(learner.roll)) return null;
  const holders = exam.booklets.filter((ref) => normalisedRoll(ref.student.roll_number) !== null && rosterMatch([learner], ref.student.roll_number, ref.student.name) !== null);
  return holders.length === 1 ? (holders[0]?.id ?? null) : null;
}
