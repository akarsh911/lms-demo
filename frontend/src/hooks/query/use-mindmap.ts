'use client';

import { useQuery } from '@tanstack/react-query';

import { MINDMAP_BOOKS_PAGE_SIZE } from '@/constants/mindmap';
import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { mindmapService } from '@/services/mindmap';
import type {
  ChaptersResponse,
  CurriculumMindmapsResponse,
  MapNodeDetail,
  MindMapResponse,
  MindmapBooksPage,
  TracePath,
} from '@/types/mindmap';

/**
 * A compiled map is expensive upstream and never changes between re-ingests, so
 * it is held for a long time. The engine caches it too, keyed on the extraction
 * report, which is what makes a re-ingest invalidate rather than serve a map of
 * atoms that no longer exist.
 */
export const MAP_STALE_MS = 30 * 60 * 1000;

export function useMindMapBooks(enabled = true) {
  return useQuery<MindmapBooksPage, ApiError>({
    queryKey: queryKeys.mindmap.books(),
    queryFn: ({ signal }) =>
      mindmapService.books({ limit: MINDMAP_BOOKS_PAGE_SIZE, offset: 0 }, signal),
    enabled,
  });
}

export function useMindMapChapters(itemId: string | null | undefined, enabled = true) {
  return useQuery<ChaptersResponse, ApiError>({
    queryKey: queryKeys.mindmap.chapters(itemId ?? ''),
    queryFn: ({ signal }) => mindmapService.chapters(itemId!, signal),
    enabled: enabled && Boolean(itemId),
    staleTime: MAP_STALE_MS,
  });
}

export function useMindMap(
  itemId: string | null | undefined,
  sectionId: string | null | undefined,
) {
  return useQuery<MindMapResponse, ApiError>({
    queryKey: queryKeys.mindmap.map(itemId ?? '', sectionId ?? ''),
    queryFn: ({ signal }) => mindmapService.map(itemId!, sectionId!, signal),
    enabled: Boolean(itemId && sectionId),
    staleTime: MAP_STALE_MS,
  });
}

/**
 * One node in full.
 *
 * Fetched rather than read out of the map already in hand, because the map's
 * node row does not carry its relations: `neighbours` quotes the book's sentence
 * for each one, both directions, and that is the whole point of opening a node.
 */
export function useMindMapNode(
  itemId: string | null | undefined,
  sectionId: string | null | undefined,
  nodeId: string | null | undefined,
) {
  return useQuery<MapNodeDetail, ApiError>({
    queryKey: queryKeys.mindmap.node(itemId ?? '', sectionId ?? '', nodeId ?? ''),
    queryFn: ({ signal }) => mindmapService.node(itemId!, sectionId!, nodeId!, signal),
    enabled: Boolean(itemId && sectionId && nodeId),
    staleTime: MAP_STALE_MS,
  });
}

/**
 * How two concepts connect.
 *
 * `found: false` is a successful query, not an error: most pairs in a chapter
 * genuinely have no stated link, because 55% of atoms carry no typed relation.
 * Callers render the absence, they do not retry it.
 */
export function useMindMapTrace(
  itemId: string | null | undefined,
  sectionId: string | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined,
) {
  return useQuery<TracePath, ApiError>({
    queryKey: queryKeys.mindmap.trace(itemId ?? '', sectionId ?? '', from ?? '', to ?? ''),
    queryFn: ({ signal }) => mindmapService.trace(itemId!, sectionId!, from!, to!, 6, signal),
    enabled: Boolean(itemId && sectionId && from && to && from !== to),
    staleTime: MAP_STALE_MS,
  });
}

export function useCurriculumMindmaps(nodeId: string) {
  return useQuery<CurriculumMindmapsResponse, ApiError>({
    queryKey: queryKeys.mindmap.curriculumNode(nodeId),
    queryFn: ({ signal }) => mindmapService.forCurriculumNode(nodeId, signal),
    enabled: false,
  });
}
