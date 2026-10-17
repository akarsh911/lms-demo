import type { GapAction, GapSource, GapStatus } from '@/types/gap-analyzer';

import type { CatalogChapter, CatalogSubject, CatalogTopic } from './catalog';
import { QUIZ_QUESTIONS, WEAK_BELOW, percent } from './model';

export type Audience = { kind: 'learner' } | { kind: 'class'; offering_id: string | null };

const ACTIONABLE: ReadonlySet<GapStatus> = new Set<GapStatus>(['gap', 'at_risk']);

const FOLLOWS_FROM: Readonly<Record<GapAction['kind'], readonly GapSource[]>> = {
  reteach: [],
  mindmap: ['mindmap', 'read', 'answer_sheet'],
  flashcards: ['flashcards', 'omr', 'paper'],
  playground: ['answer_sheet', 'exam'],
  debate: ['debate'],
  quiz: ['exam'],
};

function weakestAmong(kind: GapAction['kind'], means: ReadonlyMap<GapSource, number>): number {
  const related = FOLLOWS_FROM[kind].map((source) => means.get(source)).filter((value): value is number => value !== undefined);
  return related.length > 0 ? Math.min(...related) : 1;
}

function weakSourceNote(source: GapSource, means: ReadonlyMap<GapSource, number>, note: string): string | null {
  const mean = means.get(source);
  return mean !== undefined && mean < WEAK_BELOW ? `${note} (${percent(mean)}).` : null;
}

export function actionsFor(
  status: GapStatus,
  subject: CatalogSubject,
  chapter: CatalogChapter,
  topic: CatalogTopic,
  means: ReadonlyMap<GapSource, number>,
  audience: Audience,
): GapAction[] {
  if (!ACTIONABLE.has(status)) return [];
  const { links } = topic;
  const actions: GapAction[] = [];

  if (audience.kind === 'class' && audience.offering_id) {
    actions.push({ kind: 'reteach', title: `Re-teach ${topic.title}`, reason: `Add a revision period for ${topic.title} to the ${chapter.title} term plan.`, offering_id: audience.offering_id });
  }
  if (links.mindmap) {
    const reason = weakSourceNote('mindmap', means, 'Concepts were missed in the mind-map drill') ?? `See how the ideas in ${topic.title} connect before practising.`;
    actions.push({ kind: 'mindmap', title: `Mind map · ${topic.title}`, reason, ...links.mindmap });
  }
  if (links.flashcards_chapter) {
    const reason = weakSourceNote('flashcards', means, 'Flashcards on this topic went wrong') ?? `A short deck on ${topic.title} to fix the definitions.`;
    actions.push({ kind: 'flashcards', title: `Flashcards · ${topic.title}`, reason, chapter_id: links.flashcards_chapter, topic: topic.title });
  }
  if (links.playground_thread) {
    actions.push({ kind: 'playground', title: `Visual playground · ${topic.title}`, reason: 'Work it through visually, which helps where written answers fall short.', thread_id: links.playground_thread, grade: subject.grade });
  }
  if (links.debate_motion) {
    const reason = weakSourceNote('debate', means, 'Claims on this topic failed the fact-check') ?? 'Argue a motion that leans on this topic, and get every claim fact-checked.';
    actions.push({ kind: 'debate', title: `Debate · ${links.debate_motion.text}`, reason, motion_id: links.debate_motion.id });
  }
  actions.push({
    kind: 'quiz',
    title: `Quick quiz · ${topic.title}`,
    reason: `A ${QUIZ_QUESTIONS}-question check from the paper setter, to confirm it has been fixed.`,
    question_count: QUIZ_QUESTIONS,
    grade: subject.grade,
    subject_code: subject.code,
    subject_name: subject.name,
    chapter_id: chapter.id,
    chapter_title: chapter.title,
    topic_id: topic.id,
    topic_title: topic.title,
  });

  const rank = (action: GapAction): number => (action.kind === 'reteach' ? -1 : action.kind === 'quiz' ? 2 : weakestAmong(action.kind, means));
  return actions.map((action, index) => ({ action, index })).sort((a, b) => rank(a.action) - rank(b.action) || a.index - b.index).map(({ action }) => action);
}
