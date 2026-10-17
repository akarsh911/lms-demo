'use client';

import type { ScopeChoice, ScopeGrade } from '@/components/learning-scope/scope-model';
import { useLearningScope } from '@/components/learning-scope/use-learning-scope';
import { SCOPE_PARAMS } from '@/components/learning-scope/use-scope-url';
import type { Paper } from '@/types/papersetter';

export const SCOPE_RESETS: Record<string, null> = Object.fromEntries(Object.values(SCOPE_PARAMS).map((key) => [key, null]));

export function paperGrades(paper: Paper | undefined): number[] | undefined {
  const level = Number.parseInt(paper?.class_id ?? '', 10);
  return Number.isFinite(level) ? [level] : undefined;
}

export function sectionChoice(grades: readonly ScopeGrade[], sectionId: string | null): ScopeChoice | null {
  if (!sectionId) return null;
  for (const grade of grades) {
    const section = grade.sections.find((option) => option.id === sectionId || option.label === sectionId);
    if (section) return { grade: grade.level, sections: [section.name], learner: null };
  }
  return null;
}

export const paperInitial =
  (paper: Paper | undefined) =>
  (grades: readonly ScopeGrade[]): ScopeChoice | null =>
    sectionChoice(grades, paper?.section_id ?? null);

export function useScopedSection(paper: Paper | undefined): string | null {
  return useLearningScope({ mode: 'single', grades: paperGrades(paper), initial: paperInitial(paper) }).scope?.sections[0]?.id ?? null;
}
