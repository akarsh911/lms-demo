'use client';

import * as React from 'react';

import { useCapabilities } from '@/hooks/query/use-capabilities';
import { useYearEnrollments } from '@/hooks/query/use-foundation';
import { useIdentity } from '@/hooks/query/use-identity';
import { useMdmSessions } from '@/hooks/query/use-mdm';
import { useEverySection } from '@/hooks/query/use-sections';
import { useYearStructure } from '@/hooks/query/use-structure';
import type { CoreRoles } from '@/types/core';

import {
  gradesFromSeeds,
  gradesOf,
  LEARNER_SCOPED,
  learnersOf,
  reachOf,
  seedsOfRows,
  type ScopeGrade,
  type ScopeLearner,
  type ScopeReach,
  type SectionSeed,
} from './scope-model';

export type ScopeOptions =
  | { status: 'pending' }
  | { status: 'unavailable' }
  | { status: 'unreachable' }
  | { status: 'ready'; userId: string; reach: ScopeReach; grades: readonly ScopeGrade[]; learners: readonly ScopeLearner[]; unoffered: readonly ScopeGrade[] };

export interface ScopeQuery {
  capability: string;
  offered?: readonly number[];
  preferred?: ScopeReach;
  allowedSections?: readonly string[];
  fallback?: readonly SectionSeed[];
}

function visibleIds(reach: ScopeReach, roles: CoreRoles | undefined, allowedKey: string | null): ReadonlySet<string> | null {
  const own = reach === 'teacher_assignment' ? (roles?.section_ids ?? []) : null;
  const allowed = allowedKey === null ? null : allowedKey.split(',').filter(Boolean);
  const ids = own === null ? allowed : allowed === null ? own : own.filter((id) => allowed.includes(id));
  return ids === null ? null : new Set(ids);
}

function learnersFromRoles(reach: ScopeReach, roles: CoreRoles | undefined, grades: readonly ScopeGrade[]): ScopeLearner[] {
  const studentId = roles?.student_ids?.[0];
  const sectionId = roles?.section_ids?.[0];
  if (reach !== 'self' || !studentId || !sectionId) return [];
  const grade = grades.find((option) => option.sections.some((section) => section.id === sectionId));
  return grade ? [{ id: studentId, name: '', grade: grade.level, sectionId }] : [];
}

export function useScopeOptions({ capability, offered, preferred, allowedSections, fallback }: ScopeQuery): ScopeOptions {
  const capabilities = useCapabilities();
  const identity = useIdentity();
  const sessions = useMdmSessions();
  const yearId = sessions.data?.rows.find((row) => row.is_current)?.id ?? '';
  const structure = useYearStructure(yearId || undefined);
  const structureDown = structure.isError || sessions.isError || (sessions.isSuccess && !yearId);
  const every = useEverySection(structureDown && !fallback);
  const reach = capabilities.data ? reachOf(capabilities.data.capabilities, capability, preferred) : null;
  const needsLearners = reach !== null && LEARNER_SCOPED.has(reach);
  const enrollments = useYearEnrollments(needsLearners && !structureDown ? yearId : '');
  const roles = identity.data?.roles;

  const offeredKey = offered?.join(',') ?? null;
  const allowedKey = allowedSections?.join(',') ?? null;
  const reachable = React.useMemo(() => {
    if (reach === null) return null;
    const ids = visibleIds(reach, roles, allowedKey);
    if (structure.data) return gradesOf(structure.data.classes, ids);
    if (!structureDown) return null;
    const seeds = fallback ?? (every.data ? seedsOfRows(every.data.rows) : null);
    return seeds ? gradesFromSeeds(seeds, ids) : null;
  }, [structure.data, structureDown, every.data, fallback, reach, roles, allowedKey]);

  const allLearners = React.useMemo(() => {
    if (!needsLearners || reach === null || reachable === null) return null;
    if (enrollments.data) return learnersOf(enrollments.data, roles?.student_ids ?? [], reachable);
    if (structureDown || enrollments.isError) return learnersFromRoles(reach, roles, reachable);
    return null;
  }, [needsLearners, reach, enrollments.data, enrollments.isError, structureDown, roles, reachable]);

  const split = React.useMemo(() => {
    if (reachable === null) return null;
    const allowed = offeredKey === null ? null : new Set(offeredKey.split(',').filter(Boolean).map(Number));
    const isOffered = (level: number): boolean => allowed === null || allowed.has(level);
    const learners = allLearners ?? [];
    const learnerLevels = new Set(learners.map((learner) => learner.grade));
    const relevant = needsLearners ? reachable.filter((grade) => learnerLevels.has(grade.level)) : reachable;
    return {
      grades: reachable.filter((grade) => isOffered(grade.level)),
      learners: learners.filter((learner) => isOffered(learner.grade)),
      unoffered: relevant.filter((grade) => !isOffered(grade.level)),
    };
  }, [reachable, allLearners, needsLearners, offeredKey]);

  if (capabilities.isError || identity.isError) return { status: 'unavailable' };
  if (!capabilities.data || !identity.data) return { status: 'pending' };
  if (reach === null) return { status: 'unreachable' };
  if (structureDown && !fallback && every.isError) return { status: 'unavailable' };
  if (structureDown && reachable !== null && reachable.length === 0) return { status: 'unavailable' };
  if (needsLearners && allLearners !== null && allLearners.length === 0 && (structureDown || enrollments.isError)) return { status: 'unavailable' };
  if (!split || (needsLearners && allLearners === null)) return { status: 'pending' };
  return { status: 'ready', userId: identity.data.cas_user_id, reach, ...split };
}
