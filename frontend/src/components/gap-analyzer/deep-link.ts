import { SCOPE_PARAMS } from '@/components/learning-scope/use-scope-url';

export const GAP_ROUTE_KEY = 'learning-gaps';

export const GAP_LINK_PARAMS = { tab: 'tab', classesTab: 'classes', subject: 'class_subject' } as const;

export interface SectionGapsTarget {
  grade: number;
  section: string;
  subjectCode?: string | null;
}

export function sectionGapsQuery(target: SectionGapsTarget): string {
  const query = new URLSearchParams({
    [GAP_LINK_PARAMS.tab]: GAP_LINK_PARAMS.classesTab,
    [SCOPE_PARAMS.grade]: String(target.grade),
    [SCOPE_PARAMS.sections]: target.section,
  });
  if (target.subjectCode) query.set(GAP_LINK_PARAMS.subject, target.subjectCode);
  return query.toString();
}

export const RETEACH_LINK_PARAMS = { tab: 'tab', planTab: 'plan', offering: 'offering', chapter: 'chapter', topic: 'topic' } as const;

export interface ReteachTarget {
  offeringId: string;
  chapterId: string;
  topics: readonly string[];
}

export function reteachQuery(target: ReteachTarget): string {
  const query = new URLSearchParams({
    [RETEACH_LINK_PARAMS.tab]: RETEACH_LINK_PARAMS.planTab,
    [RETEACH_LINK_PARAMS.offering]: target.offeringId,
    [RETEACH_LINK_PARAMS.chapter]: target.chapterId,
  });
  for (const topic of target.topics) query.append(RETEACH_LINK_PARAMS.topic, topic);
  return query.toString();
}
