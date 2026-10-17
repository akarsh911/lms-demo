import type { ChapterAnalysis, Coverage, GapEvidence, GapStatus, StatusCounts, SubjectAnalysis, TopicAnalysis } from '@/types/gap-analyzer';

import type { CatalogChapter, CatalogSubject, CatalogTopic } from './catalog';
import { classify } from './classify';
import { round3 } from './model';
import { actionsFor, type Audience } from './recommend';
import { scoreTopic, trendOf, trendSeries } from './score';

export interface ChapterCoverageRecord {
  chapter_id: string;
  state: 'taught' | 'in_progress' | 'not_taught';
  taught_topic_ids: readonly string[];
}

export const STATUS_ORDER: readonly GapStatus[] = ['gap', 'at_risk', 'strong', 'not_taught', 'no_data'];

export function topicCoverage(records: readonly ChapterCoverageRecord[], chapterId: string, topicId: string): Coverage {
  const record = records.find((row) => row.chapter_id === chapterId);
  if (!record) return 'unrecorded';
  if (record.state === 'taught') return 'taught';
  if (record.state === 'not_taught') return 'not_taught';
  return record.taught_topic_ids.includes(topicId) ? 'taught' : 'not_taught';
}

export function countStatuses(statuses: readonly GapStatus[]): StatusCounts {
  const counts: StatusCounts = { gap: 0, at_risk: 0, not_taught: 0, strong: 0, no_data: 0 };
  for (const status of statuses) counts[status] += 1;
  return counts;
}

function weightedScore(rows: readonly { score: number | null; weight: number }[]): number | null {
  const scored = rows.filter((row): row is { score: number; weight: number } => row.score !== null && row.weight > 0);
  const total = scored.reduce((sum, row) => sum + row.weight, 0);
  return total > 0 ? round3(scored.reduce((sum, row) => sum + row.score * row.weight, 0) / total) : null;
}

const evidenceWeight = (topic: TopicAnalysis): number => topic.evidence.reduce((sum, row) => sum + row.effective_weight, 0);

export function analyzeTopic(
  subject: CatalogSubject,
  chapter: CatalogChapter,
  topic: CatalogTopic,
  evidence: readonly GapEvidence[],
  coverage: Coverage,
  asOf: string,
  audience: Audience,
): TopicAnalysis {
  const scored = scoreTopic(evidence, asOf);
  const points = trendSeries(evidence, asOf);
  const trend = trendOf(points);
  const { status, assessed, reasons } = classify(coverage, scored, trend);
  return {
    topic_id: topic.id,
    title: topic.title,
    chapter_id: chapter.id,
    status,
    coverage,
    score: scored.score,
    confidence: scored.confidence,
    confidence_band: scored.confidence_band,
    agreement: scored.agreement,
    assessed,
    sources: [...scored.source_means.keys()],
    trend,
    trend_points: points,
    reasons,
    evidence: scored.evidence,
    actions: actionsFor(status, subject, chapter, topic, scored.source_means, audience),
  };
}

function chapterCoverage(topics: readonly TopicAnalysis[]): Coverage {
  if (topics.some((topic) => topic.coverage === 'taught')) return 'taught';
  return topics.every((topic) => topic.coverage === 'not_taught') && topics.length > 0 ? 'not_taught' : 'unrecorded';
}

export function analyzeSubject(
  subject: CatalogSubject,
  evidenceByTopic: ReadonlyMap<string, readonly GapEvidence[]>,
  coverage: readonly ChapterCoverageRecord[],
  asOf: string,
  audience: Audience,
): SubjectAnalysis {
  const chapters: ChapterAnalysis[] = subject.chapters.map((chapter) => {
    const topics = chapter.topics.map((topic) =>
      analyzeTopic(subject, chapter, topic, evidenceByTopic.get(topic.id) ?? [], topicCoverage(coverage, chapter.id, topic.id), asOf, audience),
    );
    return {
      chapter_id: chapter.id,
      title: chapter.title,
      sequence: chapter.sequence,
      unit: chapter.unit,
      coverage: chapterCoverage(topics),
      score: weightedScore(topics.map((topic) => ({ score: topic.score, weight: topic.coverage === 'not_taught' ? 0 : evidenceWeight(topic) }))),
      counts: countStatuses(topics.map((topic) => topic.status)),
      topics,
    };
  });
  const allTopics = chapters.flatMap((chapter) => chapter.topics);
  return {
    subject_code: subject.code,
    subject_name: subject.name,
    curriculum_id: subject.curriculum_id,
    score: weightedScore(allTopics.map((topic) => ({ score: topic.score, weight: topic.coverage === 'not_taught' ? 0 : evidenceWeight(topic) }))),
    counts: countStatuses(allTopics.map((topic) => topic.status)),
    chapters,
  };
}

export function byTopic(evidence: readonly GapEvidence[]): Map<string, GapEvidence[]> {
  const out = new Map<string, GapEvidence[]>();
  for (const row of evidence) {
    const list = out.get(row.topic_id);
    if (list) list.push(row);
    else out.set(row.topic_id, [row]);
  }
  return out;
}
