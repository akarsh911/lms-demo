'use client';

import * as React from 'react';

import { LEARNER_SCOPED } from '@/components/learning-scope/scope-model';
import { useScopeOptions } from '@/components/learning-scope/use-scope-options';
import { MINDMAP_CAPABILITIES } from '@/constants/mindmap';
import type { PaperSummary } from '@/types/papersetter';

export type CheckingReach =
  | { status: 'pending' }
  | { status: 'learner' }
  | { status: 'all' }
  | { status: 'sections'; reaches: (paper: PaperSummary) => boolean; reachesCode: (sectionCode: string) => boolean };

export function useCheckingReach(): CheckingReach {
  const options = useScopeOptions({ capability: MINDMAP_CAPABILITIES.masteryRead });
  return React.useMemo<CheckingReach>(() => {
    if (options.status === 'pending') return { status: 'pending' };
    if (options.status === 'unreachable') return { status: 'learner' };
    if (options.status === 'unavailable' || options.reach === 'school') return { status: 'all' };
    if (LEARNER_SCOPED.has(options.reach)) return { status: 'learner' };
    const held = new Set(options.grades.flatMap((grade) => grade.sections.flatMap((section) => [section.id, section.label])));
    return { status: 'sections', reaches: (paper) => Boolean(paper.section_id && held.has(paper.section_id)), reachesCode: (code) => held.has(code.replace(/^G/i, '')) };
  }, [options]);
}

export const mayCheck = (reach: CheckingReach, paper: PaperSummary, startedFor?: string | null): boolean =>
  reach.status === 'all' || (reach.status === 'sections' && reach.reaches(paper) && (!startedFor || reach.reachesCode(startedFor)));
