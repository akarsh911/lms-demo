import type { FeatureKey } from '@/constants/features';

const TEACHER_TOOLS: readonly FeatureKey[] = ['emerge.learning.lessonplanner', 'emerge.learning.paper_setter', 'emerge.learning.answer_sheets', 'emerge.learning.papers', 'emerge.grasp'];
const STUDY_TOOLS: readonly FeatureKey[] = ['emerge.learning.mindmap', 'emerge.learning.flashcards', 'emerge.learning.labs', 'emerge.learning.playground', 'emerge.learning.timeline', 'emerge.learning.debate', 'emerge.jerry'];

// What a persona's sidebar leaves out although the user holds it: a lens that narrows, never a permission.
const HIDDEN: Readonly<Record<string, ReadonlySet<FeatureKey>>> = {
  student: new Set(TEACHER_TOOLS),
  parent: new Set(TEACHER_TOOLS),
  teacher: new Set(STUDY_TOOLS),
  // The school's leader is offered the school, not a personal week, unless they also teach under another hat.
  principal: new Set<FeatureKey>(['emerge.timetable']),
};

export const hiddenFor = (personaSlug: string, feature: FeatureKey): boolean => HIDDEN[personaSlug]?.has(feature) ?? false;
