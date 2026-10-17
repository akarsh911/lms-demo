'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { LIBRARY_PAGE_SIZE } from '@/constants/library';
import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { libraryService } from '@/services/library';
import type {
  AssetRow,
  ContentPlacement,
  Curriculum,
  CurriculumNode,
  LibraryPage,
  NodeContent,
} from '@/types/library';
import type { PageInfo } from '@/types/roster';

/** One page of the catalogue. */
export function useLibraryItems(offset: number) {
  return useQuery<LibraryPage, ApiError>({
    queryKey: queryKeys.library.items(offset),
    queryFn: ({ signal }) =>
      libraryService.listItems({ limit: LIBRARY_PAGE_SIZE, offset }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useCurricula() {
  return useQuery<{ rows: Curriculum[]; count: number; page: PageInfo }, ApiError>({
    queryKey: queryKeys.library.curricula(),
    queryFn: ({ signal }) =>
      libraryService.listCurricula({ limit: LIBRARY_PAGE_SIZE, offset: 0 }, signal),
  });
}

export function useCurriculumNodes(curriculumId: string | null) {
  return useQuery<{ rows: CurriculumNode[]; count: number; page: PageInfo }, ApiError>({
    queryKey: queryKeys.library.nodes(curriculumId ?? ''),
    queryFn: ({ signal }) =>
      libraryService.listNodes(curriculumId!, { limit: LIBRARY_PAGE_SIZE, offset: 0 }, signal),
    enabled: Boolean(curriculumId),
  });
}

/**
 * What is mapped to one curriculum node.
 *
 * Today this almost always answers `resolution: "unindexed"`, because indexing
 * is behind a flag that is off. That is not an error and is not retried as one:
 * the material is mapped and readable, and only search is unavailable.
 */
export function useNodeContent(nodeId: string | null) {
  return useQuery<NodeContent, ApiError>({
    queryKey: queryKeys.library.nodeContent(nodeId ?? ''),
    queryFn: ({ signal }) => libraryService.getNodeContent(nodeId!, signal),
    enabled: Boolean(nodeId),
  });
}

const PLACEMENTS_PAGE_SIZE = 200;

export function usePlacements(curriculumId: string | null, enabled: boolean) {
  return useQuery<{ rows: ContentPlacement[]; count: number; page: PageInfo }, ApiError>({
    queryKey: queryKeys.library.placements(curriculumId ?? ''),
    queryFn: ({ signal }) =>
      libraryService.listPlacements(
        {
          limit: PLACEMENTS_PAGE_SIZE,
          offset: 0,
          filters: { curriculum_id: curriculumId ?? undefined },
        },
        signal,
      ),
    enabled: enabled && Boolean(curriculumId),
  });
}

const ASSET_FRESH_MS = 60_000;

export function useAsset(assetId: string | null) {
  return useQuery<AssetRow, ApiError>({
    queryKey: [...queryKeys.library.all, 'asset', assetId ?? ''] as const,
    queryFn: ({ signal }) => libraryService.getAsset(assetId!, signal),
    enabled: Boolean(assetId),
    staleTime: ASSET_FRESH_MS,
  });
}

export function useAssetContentReachable(assetId: string | null) {
  return useQuery<boolean, ApiError>({
    queryKey: [...queryKeys.library.all, 'asset-content', assetId ?? ''] as const,
    queryFn: async ({ signal }) => {
      await libraryService.probeAssetContent(assetId!, signal);
      return true;
    },
    enabled: Boolean(assetId),
    staleTime: ASSET_FRESH_MS,
  });
}
