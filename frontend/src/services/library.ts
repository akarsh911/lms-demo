import { config } from '@/config';
import { ASSETS, CONTENT_ITEMS, CURRICULA, CURRICULUM_NODES, PLACEMENTS } from '@/fixtures/data/library';
import * as fixtures from '@/fixtures/library';

import { ApiError, apiErrorCode, coreApi, serviceUrl } from './api';
import { dev, devCreate, devDelete, devGet, devList, devPatch } from './dev-bypass';
import type {
  AssetLink,
  AssetRow,
  AssetUploadGrant,
  AssetWrite,
  ContentItem,
  ContentItemWrite,
  ContentPlacement,
  Curriculum,
  CurriculumCreate,
  CurriculumNode,
  CurriculumNodeCreate,
  CurriculumNodePatch,
  LibraryPage,
  NodeContent,
  PlacementCreate,
  PlacementPatch,
} from '@/types/library';
import type { PageInfo } from '@/types/roster';

/**
 * The library and the curriculum.
 *
 * Transport only. `POST /library/assets` needs an object store the deployment
 * may not have and answers 503 without one, which `uploadAsset` surfaces as
 * itself rather than as a failure of the file. `GET /library/assets/{id}/link`
 * mints a five-minute presigned URL on the object store's own origin; it is
 * called when someone asks to open a file, never while a list is painting.
 *
 * The bytes go to `PUT /library/assets/{id}/content`, through the same
 * same-origin proxy as every other call, and never to the object store's own
 * origin. The digest is still computed before the file is sent, because the
 * server compares it and answers 422 when what arrived does not match — but no
 * per-tenant store host has to be reachable from the browser, served over
 * https, or named in the content security policy. See `putAssetContent`.
 */
interface Envelope {
  count?: number;
  page?: PageInfo;
  [key: string]: unknown;
}

interface ListQuery {
  limit: number;
  offset: number;
  filters?: Record<string, string | undefined>;
}

async function list<T>(
  path: string,
  key: string,
  query: ListQuery,
  signal?: AbortSignal,
): Promise<{ rows: T[]; count: number; page: PageInfo }> {
  const body = await coreApi.get<Envelope>(
    path,
    { limit: query.limit, offset: query.offset, ...(query.filters ?? {}) },
    signal,
  );
  const rows = body[key];
  return {
    rows: Array.isArray(rows) ? (rows as T[]) : [],
    count: typeof body.count === 'number' ? body.count : 0,
    page: body.page ?? { limit: query.limit, offset: query.offset, has_more: false },
  };
}

const paging = (query: ListQuery) => ({ limit: query.limit, offset: query.offset, ...query.filters });

export type UploadRefusal =
  | 'unreachable'
  | 'mismatch'
  | 'duplicate'
  | 'unknown_asset'
  | 'refused';

export class AssetUploadError extends Error {
  readonly kind: UploadRefusal;
  readonly status: number;

  constructor(kind: UploadRefusal, status: number, message: string) {
    super(message);
    this.name = 'AssetUploadError';
    this.kind = kind;
    this.status = status;
  }
}

const UNREACHABLE =
  'The file did not finish sending. The record of it was created, but the file ' +
  'itself did not arrive.';

function refusalFor(cause: unknown): AssetUploadError {
  if (!(cause instanceof ApiError)) {
    return new AssetUploadError('unreachable', 0, UNREACHABLE);
  }

  switch (cause.status) {
    case 422:
      return new AssetUploadError(
        'mismatch',
        422,
        'The file did not arrive intact — what reached your school does not ' +
          'match the file on this machine. The record was created; send the ' +
          'file again.',
      );
    case 409:
      return new AssetUploadError(
        'duplicate',
        409,
        'A file is already attached to this record, so this one was not sent.',
      );
    case 404:
      return new AssetUploadError(
        'unknown_asset',
        404,
        'That record is no longer there to attach a file to, so the file was ' +
          'not sent.',
      );
    case 502:
    case 503:
    case 504:
      return new AssetUploadError('unreachable', cause.status, UNREACHABLE);
    default:
      return new AssetUploadError(
        'refused',
        cause.status,
        `Your school refused the file (${cause.status}). ${cause.message}`.trim(),
      );
  }
}

async function putAssetContent(assetId: string, file: File): Promise<void> {
  if (config.devBypass) return dev(() => fixtures.receiveAssetContent(assetId));
  try {
    await coreApi.put<void>(`library/assets/${assetId}/content`, file);
  } catch (cause) {
    throw refusalFor(cause);
  }
}

function assetContentUrl(id: string): string {
  return serviceUrl('core', `library/assets/${encodeURIComponent(id)}/content`);
}

async function probeAssetContent(id: string, signal?: AbortSignal): Promise<void> {
  if (config.devBypass) return dev(() => fixtures.probeAsset(id));
  const res = await fetch(assetContentUrl(id), {
    method: 'GET',
    headers: { range: 'bytes=0-0' },
    credentials: 'same-origin',
    signal,
  });

  if (res.ok) {
    void res.body?.cancel();
    return;
  }

  const payload = await res.json().catch(() => null);
  throw new ApiError(
    res.status,
    apiErrorCode(payload),
    payload?.message ?? `Request failed with status ${res.status}`,
    payload,
  );
}

export const libraryService = {
  createAsset: (body: AssetWrite) =>
    config.devBypass
      ? dev(() => fixtures.createAsset(body))
      : coreApi.post<AssetUploadGrant>('library/assets', body),

  putAssetContent,

  markAssetReady: (id: string) =>
    config.devBypass
      ? dev(() => fixtures.markAssetReady(id))
      : coreApi.post<AssetRow>(`library/assets/${id}/ready`),

  getAsset: (id: string, signal?: AbortSignal) =>
    config.devBypass ? devGet(ASSETS, id) : coreApi.get<AssetRow>(`library/assets/${id}`, undefined, signal),

  getAssetLink: (id: string) =>
    config.devBypass ? dev(() => fixtures.assetLink(id)) : coreApi.get<AssetLink>(`library/assets/${id}/link`),

  assetContentUrl,

  probeAssetContent,

  createItem: (body: ContentItemWrite) =>
    config.devBypass ? devCreate(CONTENT_ITEMS, body) : coreApi.post<ContentItem>('library', body),

  listItems: (query: ListQuery, signal?: AbortSignal): Promise<LibraryPage> =>
    config.devBypass
      ? devList(CONTENT_ITEMS, paging(query))
      : list<ContentItem>('library', 'content_items', query, signal),

  getItem: (id: string, signal?: AbortSignal) =>
    config.devBypass ? devGet(CONTENT_ITEMS, id) : coreApi.get<ContentItem>(`library/${id}`, undefined, signal),

  listCurricula: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList(CURRICULA, paging(query))
      : list<Curriculum>('curricula', 'curricula', query, signal),

  createCurriculum: (body: CurriculumCreate) =>
    config.devBypass ? devCreate(CURRICULA, body) : coreApi.post<Curriculum>('curricula', body),

  listNodes: (curriculumId: string, query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList(CURRICULUM_NODES, { ...paging(query), curriculum_id: curriculumId })
      : list<CurriculumNode>(
          `curricula/${curriculumId}/nodes`,
          'curriculum_nodes',
          query,
          signal,
        ),

  createNode: (curriculumId: string, body: CurriculumNodeCreate) =>
    config.devBypass
      ? devCreate(CURRICULUM_NODES, { ...body, curriculum_id: curriculumId })
      : coreApi.post<CurriculumNode>(`curricula/${curriculumId}/nodes`, body),

  updateNode: (id: string, patch: CurriculumNodePatch) =>
    config.devBypass
      ? devPatch(CURRICULUM_NODES, id, patch)
      : coreApi.patch<CurriculumNode>(`curriculum-nodes/${id}`, patch),

  deleteNode: (id: string) =>
    config.devBypass ? devDelete(CURRICULUM_NODES, id) : coreApi.delete<void>(`curriculum-nodes/${id}`),

  /**
   * What is mapped to one curriculum node.
   *
   * Gated by TWO capabilities, not one: `core.content_placements.read` for the
   * mapping and `core.library.read` for the material, and the handler answers
   * 403 naming whichever is missing. It also refuses outright, with a 403, if
   * the caller field policy denies any column the resolution needs — so a
   * partial answer is never invented from an incomplete placement.
   *
   * No `include_ancestors` and no `include_proposed` are sent. Both widen the
   * answer, and widening a first read silently is how "this topic has material"
   * comes to mean "something above it does".
   */
  getNodeContent: (nodeId: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => fixtures.nodeContent(nodeId))
      : coreApi.get<NodeContent>(`curriculum-nodes/${nodeId}/content`, undefined, signal),

  listPlacements: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList(PLACEMENTS, paging(query))
      : list<ContentPlacement>('placements', 'content_placements', query, signal),

  createPlacement: (body: PlacementCreate) =>
    config.devBypass ? devCreate(PLACEMENTS, body) : coreApi.post<ContentPlacement>('placements', body),

  updatePlacement: (id: string, patch: PlacementPatch) =>
    config.devBypass
      ? devPatch(PLACEMENTS, id, patch)
      : coreApi.patch<ContentPlacement>(`placements/${id}`, patch),

  deletePlacement: (id: string) =>
    config.devBypass ? devDelete(PLACEMENTS, id) : coreApi.delete<void>(`placements/${id}`),
};
