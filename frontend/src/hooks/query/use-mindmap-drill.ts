'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { mindmapService } from '@/services/mindmap';
import type { Drill, DrillKind } from '@/types/mindmap';

/**
 * A recall drill over one chapter.
 *
 * **Fetched without the marking key.** emerge-core asks the engine to strip
 * `answer` from every item, so the browser cannot be read for the answers of
 * the drill it is currently sitting. Grading posts the same `(kind, n, seed)`
 * back and the server rebuilds the identical drill, which it can because
 * selection is seeded and deterministic. Nothing is stored between the two
 * calls.
 *
 * The consequence for this hook: the seed must be stable for as long as the
 * drill is on screen. Generating one per render would silently swap the
 * questions underneath the student and grade an attempt against a drill they
 * never saw.
 */
export function useMindMapDrill(
  itemId: string | null | undefined,
  sectionId: string | null | undefined,
  kind: DrillKind,
  n: number,
  seed: number,
  topicId: string | null = null,
  enabled = true,
) {
  return useQuery<Drill, ApiError>({
    queryKey: queryKeys.mindmap.drill(itemId ?? '', sectionId ?? '', kind, n, seed, topicId ?? ''),
    queryFn: ({ signal }) =>
      mindmapService.drill(itemId!, sectionId!, { kind, n, seed, ...(topicId ? { topic_id: topicId } : {}) }, signal),
    enabled: enabled && Boolean(itemId && sectionId),
    // A drill is a pure function of (chapter, kind, n, seed), so it can never go
    // stale for a given key. Refetching would return byte-identical questions.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
