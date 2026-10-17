import { config } from '@/config';
import * as fixtures from '@/fixtures/engines';

import { ApiError, apiErrorCode, coreApi, serviceUrl } from './api';
import { dev } from './dev-bypass';
import type {
  ChaptersResponse,
  CurriculumMindmapsResponse,
  Drill,
  DrillGrade,
  DrillGradeRequest,
  DrillKind,
  DrillResult,
  MapNodeDetail,
  MindMapResponse,
  MindmapBook,
  MindmapBooksPage,
  TracePath,
} from '@/types/mindmap';
import type { PageInfo } from '@/types/roster';

const BOOKS = 'learning/mindmaps';

const bookPath = (itemId: string): string => `${BOOKS}/${encodeURIComponent(itemId)}`;

export const chapterPath = (itemId: string, sectionId: string): string =>
  `${bookPath(itemId)}/chapters/${encodeURIComponent(sectionId)}`;

interface BooksEnvelope {
  mindmaps?: MindmapBook[];
  count?: number;
  page?: PageInfo;
}

async function listBooks(
  query: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<MindmapBooksPage> {
  const body = await coreApi.get<BooksEnvelope>(BOOKS, query, signal);
  return {
    rows: Array.isArray(body.mindmaps) ? body.mindmaps : [],
    count: typeof body.count === 'number' ? body.count : 0,
    page: body.page ?? { limit: query.limit, offset: query.offset, has_more: false },
  };
}

const MASTERY_RECORDED_HEADER = 'x-mastery-recorded';

function recordedOf(header: string | null): boolean | null {
  if (header === null) return null;
  return header.trim().toLowerCase() === 'true';
}

async function gradeDrill(
  itemId: string,
  sectionId: string,
  request: DrillGradeRequest,
): Promise<DrillGrade> {
  const res = await fetch(serviceUrl('core', `${chapterPath(itemId, sectionId)}/drill/grade`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    credentials: 'same-origin',
  });
  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      res.status,
      apiErrorCode(payload),
      payload?.message ?? `Request failed with status ${res.status}`,
      payload,
    );
  }

  return {
    result: payload as DrillResult,
    recorded: recordedOf(res.headers.get(MASTERY_RECORDED_HEADER)),
  };
}

/**
 * The mind-map engine, reached through emerge-core. Transport only, like every
 * service here.
 *
 * Note what is NOT here: no layout, no re-ranking, no relabelling. The engine
 * returns positions, a relation grammar and four `*_basis` strings describing
 * how each part of its answer was arrived at, and the job of this layer is to
 * hand all of that through unaltered. Anything computed here would be a second
 * answer to a question the engine has already answered.
 */
export const mindmapService = {
  books: (query: { limit: number; offset: number }, signal?: AbortSignal) =>
    config.devBypass ? dev(() => fixtures.mindmapBooks(query)) : listBooks(query, signal),

  /** One book's chapters. A forward of the syllabus tree. */
  chapters: (itemId: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => fixtures.mindmapChapters(itemId))
      : coreApi.get<ChaptersResponse>(`${bookPath(itemId)}/chapters`, undefined, signal),

  map: (itemId: string, sectionId: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => fixtures.mindmapOf(itemId, sectionId))
      : coreApi.get<MindMapResponse>(chapterPath(itemId, sectionId), undefined, signal),

  /** One node in full, with every typed relation touching it, both directions. */
  node: (itemId: string, sectionId: string, nodeId: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => fixtures.mindmapNode(itemId, sectionId, nodeId))
      : coreApi.get<MapNodeDetail>(
          `${chapterPath(itemId, sectionId)}/nodes/${encodeURIComponent(nodeId)}`,
          undefined,
          signal,
        ),

  /**
   * How two concepts connect. `found: false` is a 200 and a true answer about
   * the corpus, so this is a normal result and never an error path.
   */
  trace: (
    itemId: string,
    sectionId: string,
    from: string,
    to: string,
    maxHops = 6,
    signal?: AbortSignal,
  ) =>
    config.devBypass
      ? dev(() => fixtures.mindmapTrace(itemId, sectionId, from, to, maxHops))
      : coreApi.get<TracePath>(
          `${chapterPath(itemId, sectionId)}/trace`,
          { from, to, max_hops: maxHops },
          signal,
        ),

  /**
   * Build a recall drill.
   *
   * emerge-core always asks for it without the marking key. The client then
   * posts its answers with the same `(kind, n, seed)` and the server rebuilds
   * the identical drill to grade against, because selection is seeded and
   * deterministic. That is what lets a stateless service mark an attempt, and
   * it is why the seed must be carried from here to the grade call unchanged.
   */
  drill: (
    itemId: string,
    sectionId: string,
    params: { kind: DrillKind; n: number; seed: number; topic_id?: string },
    signal?: AbortSignal,
  ) =>
    config.devBypass
      ? dev(() => fixtures.mindmapDrill(itemId, sectionId, params))
      : coreApi.get<Drill>(`${chapterPath(itemId, sectionId)}/drill`, params, signal),

  grade: (itemId: string, sectionId: string, request: DrillGradeRequest) =>
    config.devBypass
      ? dev(() => fixtures.mindmapGrade(itemId, sectionId, request))
      : gradeDrill(itemId, sectionId, request),

  forCurriculumNode: (nodeId: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => fixtures.curriculumNodeMindmaps(nodeId))
      : coreApi.get<CurriculumMindmapsResponse>(
          `curriculum-nodes/${encodeURIComponent(nodeId)}/mindmaps`,
          undefined,
          signal,
        ),
};
