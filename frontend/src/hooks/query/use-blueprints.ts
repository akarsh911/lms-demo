'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { blueprintService } from '@/services/blueprints';
import type { ApiError } from '@/services/api';
import type { BlueprintDetail, BlueprintRow } from '@/types/blueprints';
import type { SchoolPage } from '@/types/school';

export type BlueprintScope = 'all' | 'reusable' | { sessionId: string };

function scopeKey(scope: BlueprintScope): string {
  if (scope === 'all' || scope === 'reusable') return scope;
  return scope.sessionId;
}

function scopeQuery(scope: BlueprintScope): Record<string, string | boolean> {
  if (scope === 'all') return {};
  if (scope === 'reusable') return { reusable: true };
  return { academic_session_id: scope.sessionId };
}

export function useBlueprints(scope: BlueprintScope) {
  return useQuery<SchoolPage<BlueprintRow>, ApiError>({
    queryKey: queryKeys.blueprints.list(scopeKey(scope)),
    queryFn: ({ signal }) => blueprintService.listBlueprints(scopeQuery(scope), signal),
  });
}

export function useBlueprint(blueprintId: string | null) {
  return useQuery<BlueprintDetail, ApiError>({
    queryKey: queryKeys.blueprints.blueprint(blueprintId ?? ''),
    queryFn: ({ signal }) => blueprintService.getBlueprint(blueprintId!, signal),
    enabled: Boolean(blueprintId),
  });
}
