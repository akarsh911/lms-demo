'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ApiError } from '@/services/api';
import { blueprintService } from '@/services/blueprints';
import type {
  BlueprintConstraintCreate,
  BlueprintConstraintRow,
  BlueprintCreate,
  BlueprintPatch,
  BlueprintRow,
  BlueprintSectionCreate,
  BlueprintSectionRow,
} from '@/types/blueprints';

function useBlueprintWrite<TData, TVars>(mutationFn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.blueprints.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.papers.all });
    },
  });
}

export function useCreateBlueprint() {
  return useBlueprintWrite<BlueprintRow, BlueprintCreate>((body) =>
    blueprintService.createBlueprint(body),
  );
}

export function useUpdateBlueprint() {
  return useBlueprintWrite<BlueprintRow, { id: string; patch: BlueprintPatch }>(
    ({ id, patch }) => blueprintService.updateBlueprint(id, patch),
  );
}

export function useDeleteBlueprint() {
  return useBlueprintWrite<void, string>((id) => blueprintService.deleteBlueprint(id));
}

export function useCreateBlueprintSection(blueprintId: string | null) {
  return useBlueprintWrite<BlueprintSectionRow, BlueprintSectionCreate>((body) => {
    if (!blueprintId) throw noBlueprint();
    return blueprintService.createSection(blueprintId, body);
  });
}

export function useCreateBlueprintConstraint(sectionId: string | null) {
  return useBlueprintWrite<BlueprintConstraintRow, BlueprintConstraintCreate>((body) => {
    if (!sectionId) throw noSection();
    return blueprintService.createConstraint(sectionId, body);
  });
}

function noBlueprint(): ApiError {
  return new ApiError(400, 'no_blueprint', 'Choose a pattern first.');
}

function noSection(): ApiError {
  return new ApiError(400, 'no_section', 'Choose a section first.');
}
