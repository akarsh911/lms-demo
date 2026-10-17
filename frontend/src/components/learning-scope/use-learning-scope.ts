'use client';

import * as React from 'react';

import { MINDMAP_CAPABILITIES } from '@/constants/mindmap';

import { parseScope, recallScope, rememberScope, serializeScope } from './scope-memory';
import { adaptChoice, choiceOf, offersMine, resolveScope, type MultiScope, type ScopeChoice, type ScopeGrade, type ScopeMode, type ScopeReach, type SectionSeed } from './scope-model';
import { useScopeOptions, type ScopeOptions } from './use-scope-options';
import { useScopeUrl } from './use-scope-url';

export interface LegacyScope {
  keys: readonly string[];
  resolve: (grades: readonly ScopeGrade[]) => ScopeChoice | null;
}

export interface ScopeSpec {
  mode: ScopeMode;
  capability?: string;
  grades?: readonly number[];
  sections?: readonly string[];
  reach?: ScopeReach;
  legacy?: LegacyScope;
  initial?: (grades: readonly ScopeGrade[]) => ScopeChoice | null;
  preferMine?: boolean;
  fallback?: readonly SectionSeed[];
}

const MINE: ScopeChoice = { grade: null, sections: [], learner: null, mine: true };

const isBlank = (choice: ScopeChoice): boolean => choice.grade === null && choice.sections.length === 0 && choice.learner === null && !choice.pick && !choice.mine;

const noSubscription = (): (() => void) => () => undefined;

function useRecalled(userId: string | null): string | null {
  return React.useSyncExternalStore(
    noSubscription,
    () => {
      const stored = userId ? recallScope(userId) : null;
      return stored ? serializeScope(stored) : null;
    },
    () => null,
  );
}

export function useLearningScope(spec: ScopeSpec): { options: ScopeOptions; choice: ScopeChoice; scope: MultiScope | null; go: (next: ScopeChoice) => void } {
  const { mode, capability = MINDMAP_CAPABILITIES.masteryRead, grades, sections, reach, legacy, initial, preferMine, fallback } = spec;
  const options = useScopeOptions({ capability, offered: grades, preferred: reach, allowedSections: sections, fallback });
  const url = useScopeUrl(legacy?.keys);
  const ready = options.status === 'ready' ? options : null;

  const untouched = url.choice.sections.length === 0 && url.choice.learner === null && !url.choice.pick && !url.choice.mine;
  const linked = untouched && ready && legacy && legacy.keys.some(url.carries) ? legacy.resolve(ready.grades) : null;
  const blank = !linked && ready !== null && isBlank(url.choice);
  const defaulted = blank ? (initial?.(ready.grades) ?? (preferMine && offersMine(ready.reach, mode, ready.grades) ? MINE : null)) : null;
  const recalledRaw = useRecalled(ready?.userId ?? null);
  const recalled = recalledRaw ? parseScope(recalledRaw) : null;
  const restored = blank && !defaulted && recalled ? adaptChoice(recalled, ready.reach, mode, ready.grades, ready.learners) : null;
  const choice = linked ?? defaulted ?? restored ?? url.choice;
  const scope = ready ? resolveScope(ready.reach, mode, ready.grades, ready.learners, choice) : null;

  const resolved = scope ? choiceOf(scope) : null;
  const remembered = resolved ? serializeScope(resolved) : null;
  const userId = ready?.userId ?? null;
  React.useEffect(() => {
    if (userId && remembered) rememberScope(userId, mode, remembered);
  }, [userId, remembered, mode]);

  const asked = url.choice.sections.join(',');
  const settled = resolved?.sections.join(',') ?? null;
  const correction = restored ? serializeScope(restored) : asked !== '' && settled !== null && settled !== asked ? remembered : null;
  const go = url.go;
  React.useEffect(() => {
    const next = correction ? parseScope(correction) : null;
    if (next) go(next, 'replace');
  }, [correction, go]);

  return { options, choice, scope, go };
}
