import { safeStorage } from '@/lib/safe-storage';

import type { ScopeChoice, ScopeMode } from './scope-model';

const PREFIX = 'emerge.learningScope.';

const keyOf = (userId: string): string => `${PREFIX}${userId}`;

function isChoice(value: unknown): value is ScopeChoice {
  if (typeof value !== 'object' || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return (
    (row.grade === null || typeof row.grade === 'number') &&
    Array.isArray(row.sections) &&
    row.sections.every((name) => typeof name === 'string') &&
    (row.learner === null || typeof row.learner === 'string') &&
    (row.mine === undefined || typeof row.mine === 'boolean')
  );
}

export function recallScope(userId: string): ScopeChoice | null {
  const stored = safeStorage.json<unknown>(keyOf(userId));
  return isChoice(stored) ? stored : null;
}

export const serializeScope = (choice: ScopeChoice): string => JSON.stringify(choice);

export function parseScope(serialized: string): ScopeChoice | null {
  try {
    const value: unknown = JSON.parse(serialized);
    return isChoice(value) ? value : null;
  } catch {
    return null;
  }
}

function merged(previous: ScopeChoice | null, next: ScopeChoice, mode: ScopeMode): ScopeChoice {
  if (next.mine) return { grade: previous?.grade ?? null, sections: previous?.sections ?? [], learner: next.learner, mine: true };
  if (mode === 'grade-only' && previous?.grade === next.grade) return { ...next, sections: previous.sections };
  return { grade: next.grade, sections: next.sections, learner: next.learner };
}

export function rememberScope(userId: string, mode: ScopeMode, serialized: string): void {
  const next = parseScope(serialized);
  if (!next) return;
  safeStorage.set(keyOf(userId), serializeScope(merged(recallScope(userId), next, mode)));
}
