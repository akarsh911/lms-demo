'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ApiError } from '@/services/api';
import { libraryService } from '@/services/library';
import type {
  AssetLink,
  ContentPlacement,
  Curriculum,
  CurriculumCreate,
  CurriculumNode,
  CurriculumNodeCreate,
  CurriculumNodePatch,
  PlacementCreate,
  PlacementPatch,
  PlacementStatus,
} from '@/types/library';

export interface Resequence {
  id: string;
  sequence: number;
}

function refreshCurriculum(queryClient: QueryClient, curriculumId: string | null): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.library.curricula() });
  if (curriculumId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.library.nodes(curriculumId) });
  }
}

function useCurriculumWrite<TData, TVars>(
  curriculumId: string | null,
  mutationFn: (vars: TVars) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn,
    onSettled: () => refreshCurriculum(queryClient, curriculumId),
  });
}

export function useCreateCurriculum() {
  return useCurriculumWrite<Curriculum, CurriculumCreate>(null, (body) =>
    libraryService.createCurriculum(body),
  );
}

export function useCreateCurriculumNode(curriculumId: string | null) {
  return useCurriculumWrite<CurriculumNode, CurriculumNodeCreate>(curriculumId, (body) => {
    if (!curriculumId) throw noCurriculum();
    return libraryService.createNode(curriculumId, body);
  });
}

export function useUpdateCurriculumNode(curriculumId: string | null) {
  return useCurriculumWrite<CurriculumNode, { id: string; patch: CurriculumNodePatch }>(
    curriculumId,
    ({ id, patch }) => libraryService.updateNode(id, patch),
  );
}

export function useDeleteCurriculumNode(curriculumId: string | null) {
  return useCurriculumWrite<void, string>(curriculumId, (id) =>
    libraryService.deleteNode(id),
  );
}

export function useResequenceCurriculumNodes(curriculumId: string | null) {
  return useCurriculumWrite<void, readonly Resequence[]>(curriculumId, async (moves) => {
    for (const move of moves) {
      await libraryService.updateNode(move.id, { sequence: move.sequence });
    }
  });
}

export interface PlacementDecision {
  id: string;
  nodeId: string | null;
  status: PlacementStatus;
}

export interface PlacementApply {
  creates: readonly PlacementCreate[];
  revise: { id: string; nodeId: string | null; patch: PlacementPatch } | null;
  removes: readonly { id: string; nodeId: string | null }[];
  decides: readonly PlacementDecision[];
}

export type PlacementAction = 'create' | 'revise' | 'remove' | 'decide';

export interface PlacementFailure {
  nodeId: string | null;
  action: PlacementAction;
  status: number;
  message: string;
}

export interface PlacementResult {
  created: ContentPlacement[];
  removed: (string | null)[];
  decided: ContentPlacement[];
  revised: boolean;
  failures: PlacementFailure[];
}

function usePlacementWrite<TData, TVars>(mutationFn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
    },
  });
}

export function useRemovePlacement() {
  return usePlacementWrite<void, string>((id) => libraryService.deletePlacement(id));
}

export function useAssetLink() {
  return useMutation<AssetLink, ApiError, string>({
    mutationFn: (assetId) => libraryService.getAssetLink(assetId),
  });
}

function refusalOf(
  nodeId: string | null,
  action: PlacementAction,
  error: unknown,
): PlacementFailure {
  if (error instanceof ApiError) {
    return { nodeId, action, status: error.status, message: error.message };
  }
  return {
    nodeId,
    action,
    status: 0,
    message: 'The request did not reach your school.',
  };
}

export function useApplyPlacements() {
  return usePlacementWrite<PlacementResult, PlacementApply>(async (plan) => {
    const result: PlacementResult = {
      created: [],
      removed: [],
      decided: [],
      revised: false,
      failures: [],
    };

    for (const decision of plan.decides) {
      try {
        result.decided.push(
          await libraryService.updatePlacement(decision.id, { status: decision.status }),
        );
      } catch (error) {
        result.failures.push(refusalOf(decision.nodeId, 'decide', error));
      }
    }

    for (const payload of plan.creates) {
      try {
        result.created.push(await libraryService.createPlacement(payload));
      } catch (error) {
        result.failures.push(
          refusalOf(payload.curriculum_node_id ?? null, 'create', error),
        );
      }
    }

    if (plan.revise) {
      try {
        await libraryService.updatePlacement(plan.revise.id, plan.revise.patch);
        result.revised = true;
      } catch (error) {
        result.failures.push(refusalOf(plan.revise.nodeId, 'revise', error));
      }
    }

    for (const row of plan.removes) {
      try {
        await libraryService.deletePlacement(row.id);
        result.removed.push(row.nodeId);
      } catch (error) {
        result.failures.push(refusalOf(row.nodeId, 'remove', error));
      }
    }

    return result;
  });
}

function noCurriculum(): ApiError {
  return new ApiError(400, 'no_curriculum', 'There is no curriculum to add this to yet.');
}
