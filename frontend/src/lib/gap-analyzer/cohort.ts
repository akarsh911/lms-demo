import type {
  ClassAnalysis,
  ClassTopicSummary,
  GapSource,
  LearnerRef,
  SchoolAnalysis,
  SchoolSectionRow,
  SchoolTopicRow,
  ScopeSection,
  ScopeSubject,
  SubjectAnalysis,
  TopicAnalysis,
} from '@/types/gap-analyzer';

import type { CatalogSubject } from './catalog';
import { CLASS_WIDE_MIN_LEARNERS, CLASS_WIDE_SHARE, DIFFUSE_SOURCES, WEAK_BELOW, round3 } from './model';
import { actionsFor } from './recommend';

export interface LearnerSubject {
  learner: LearnerRef;
  analysis: SubjectAnalysis;
}

const WEAKEST_LISTED = 8;

const specific = (topic: TopicAnalysis): boolean => topic.sources.some((source) => !DIFFUSE_SOURCES.has(source));
const hasData = (topic: TopicAnalysis): boolean => topic.score !== null && topic.coverage !== 'not_taught' && specific(topic);
const isWeak = (topic: TopicAnalysis): boolean => hasData(topic) && (topic.score ?? 1) < WEAK_BELOW;

function topicsOf(rows: readonly LearnerSubject[]): Map<string, TopicAnalysis[]> {
  const out = new Map<string, TopicAnalysis[]>();
  for (const row of rows) {
    for (const topic of row.analysis.chapters.flatMap((chapter) => chapter.topics)) {
      const list = out.get(topic.topic_id);
      if (list) list.push(topic);
      else out.set(topic.topic_id, [topic]);
    }
  }
  return out;
}

function classMeans(topics: readonly TopicAnalysis[]): Map<GapSource, number> {
  const sums = new Map<GapSource, { total: number; n: number }>();
  for (const row of topics.flatMap((topic) => topic.evidence)) {
    const acc = sums.get(row.source) ?? { total: 0, n: 0 };
    acc.total += row.signal;
    acc.n += 1;
    sums.set(row.source, acc);
  }
  return new Map([...sums.entries()].map(([source, acc]) => [source, round3(acc.total / acc.n)]));
}

function weakShare(topics: readonly TopicAnalysis[]): { withData: number; weak: number; share: number; mean: number | null } {
  const data = topics.filter(hasData);
  const weak = data.filter(isWeak).length;
  const mean = data.length > 0 ? round3(data.reduce((sum, topic) => sum + (topic.score ?? 0), 0) / data.length) : null;
  return { withData: data.length, weak, share: data.length > 0 ? round3(weak / data.length) : 0, mean };
}

export function classAnalysis(section: ScopeSection, subject: ScopeSubject, catalog: CatalogSubject, rows: readonly LearnerSubject[], asOf: string): ClassAnalysis {
  const grouped = topicsOf(rows);
  const offering = subject.mine ? subject.offering_id : null;
  const topics: ClassTopicSummary[] = catalog.chapters.flatMap((chapter) =>
    chapter.topics.map((topic) => {
      const list = grouped.get(topic.id) ?? [];
      const { withData, weak, share, mean } = weakShare(list);
      const coverage = list[0]?.coverage ?? 'unrecorded';
      const classWide = coverage !== 'not_taught' && withData >= CLASS_WIDE_MIN_LEARNERS && share >= CLASS_WIDE_SHARE;
      return {
        topic_id: topic.id,
        title: topic.title,
        chapter_id: chapter.id,
        chapter_title: chapter.title,
        coverage,
        learners_with_data: withData,
        weak,
        weak_share: share,
        mean_score: mean,
        class_wide: classWide,
        actions: classWide ? actionsFor('gap', catalog, chapter, topic, classMeans(list), { kind: 'class', offering_id: offering }) : [],
      };
    }),
  );
  return {
    section,
    subject,
    as_of: asOf,
    learners: rows.map((row) => row.learner),
    chapters: catalog.chapters.map((chapter) => ({ chapter_id: chapter.id, title: chapter.title, topic_ids: chapter.topics.map((topic) => topic.id) })),
    topics,
    cells: rows.flatMap((row) =>
      row.analysis.chapters.flatMap((chapter) =>
        chapter.topics.map((topic) => ({ student_id: row.learner.student_id, topic_id: topic.topic_id, status: topic.status, score: topic.score, confidence_band: topic.confidence_band, topic_specific: specific(topic) })),
      ),
    ),
    reteach: topics.filter((topic) => topic.class_wide).sort((a, b) => b.weak_share - a.weak_share),
  };
}

export interface SectionRows {
  section_id: string;
  label: string;
  rows: readonly LearnerSubject[];
}

export function schoolAnalysis(grade: number, catalog: CatalogSubject, subjects: readonly { code: string; name: string }[], sections: readonly SectionRows[], asOf: string): SchoolAnalysis {
  const sectionRows: SchoolSectionRow[] = sections.map(({ section_id, label, rows }) => {
    const grouped = topicsOf(rows);
    const all = [...grouped.values()].flat();
    const data = all.filter(hasData);
    return {
      section_id,
      label,
      learners: rows.length,
      chapters: catalog.chapters.map((chapter) => {
        const { withData, share } = weakShare(chapter.topics.flatMap((topic) => grouped.get(topic.id) ?? []));
        return { chapter_id: chapter.id, weak_share: withData > 0 ? share : null, learners_with_data: withData };
      }),
      gap_rate: data.length > 0 ? round3(data.filter((topic) => topic.status === 'gap').length / data.length) : null,
    };
  });

  const perSection = sections.map(({ rows }) => topicsOf(rows));
  const everyone = topicsOf(sections.flatMap(({ rows }) => rows));
  const weakest: SchoolTopicRow[] = catalog.chapters
    .flatMap((chapter) =>
      chapter.topics.map((topic) => {
        const { withData, share } = weakShare(everyone.get(topic.id) ?? []);
        const affected = perSection.filter((grouped) => {
          const local = weakShare(grouped.get(topic.id) ?? []);
          return local.withData >= CLASS_WIDE_MIN_LEARNERS && local.share >= CLASS_WIDE_SHARE;
        }).length;
        return { topic_id: topic.id, title: topic.title, chapter_title: chapter.title, weak_share: share, sections_affected: affected, withData };
      }),
    )
    .filter((row) => row.withData > 0)
    .sort((a, b) => b.weak_share - a.weak_share)
    .slice(0, WEAKEST_LISTED)
    .map(({ withData: _withData, ...row }) => row);

  return {
    grade,
    subject_code: catalog.code,
    subject_name: catalog.name,
    subjects: [...subjects],
    as_of: asOf,
    chapters: catalog.chapters.map((chapter) => ({ chapter_id: chapter.id, title: chapter.title, sequence: chapter.sequence })),
    sections: sectionRows,
    weakest,
  };
}
