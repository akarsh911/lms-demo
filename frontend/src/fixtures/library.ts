import type { AssetLink, AssetRow, AssetUploadGrant, AssetWrite, NodeContent, ResolvedPlacement } from '@/types/library';

import { ASSETS, CONTENT_ITEMS, CURRICULUM_NODES, PLACEMENTS } from './data/library';
import { caller } from './identity';
import { fail, insert, must, patch } from './rows';

const GRANT_MS = 15 * 60 * 1000;
const NO_FILES = 'The dev bypass keeps no files. Turn DEV_BYPASS off to open or download one.';

const EMPTY_COUNTS = { placements: 0, readable: 0, unreadable: 0, exact: 0, indexed: 0, stale: 0, not_indexed: 0, unpublished: 0, source_deleted: 0 };

const expiry = (): string => new Date(Date.now() + GRANT_MS).toISOString();

// What a curriculum node resolves to: unmapped, restricted, unindexed or indexed, with the counts behind the verdict.
export function nodeContent(nodeId: string): NodeContent {
  const node = must(CURRICULUM_NODES, nodeId, 'curriculum node');
  const placements = PLACEMENTS.filter((p) => p.curriculum_node_id === nodeId && p.status === 'confirmed');
  const base = { curriculum_node_id: nodeId, curriculum_id: node.curriculum_id ?? '', include_proposed: false, include_ancestors: false };
  if (placements.length === 0) return { ...base, resolution: 'unmapped', content: [], count: 0, counts: EMPTY_COUNTS };

  const items = new Map(CONTENT_ITEMS.map((c) => [c.id, c]));
  const stateOf = (itemId: string | undefined) => (items.get(itemId ?? '')?.index_status === 'indexed' ? 'indexed' : 'not_indexed');
  const readable = placements.filter((p) => items.get(p.content_item_id ?? '')?.status === 'published');
  const indexed = readable.filter((p) => stateOf(p.content_item_id) === 'indexed');

  const content: ResolvedPlacement[] = readable.map((p) => ({
    placement_id: p.id,
    placement_status: p.status ?? 'confirmed',
    content_item_id: p.content_item_id ?? '',
    content_node_id: p.content_node_id ?? null,
    page_start: p.page_start ?? null,
    page_end: p.page_end ?? null,
    grain: p.grain ?? 'node',
    curriculum_node_id: nodeId,
    exact: true,
    retrieval_state: stateOf(p.content_item_id),
    index_state: stateOf(p.content_item_id),
    content_status: 'published',
  }));

  return {
    ...base,
    resolution: readable.length === 0 ? 'restricted' : indexed.length > 0 ? 'indexed' : 'unindexed',
    content,
    count: content.length,
    counts: {
      ...EMPTY_COUNTS,
      placements: placements.length,
      readable: readable.length,
      unreadable: placements.length - readable.length,
      exact: readable.length,
      indexed: indexed.length,
      not_indexed: readable.length - indexed.length,
    },
  };
}

// The record of a file is kept; the bytes are not, so a new asset can be attached to an item but never opened.
export function createAsset(body: AssetWrite): AssetUploadGrant {
  if (!body.file_name || !body.mime_type || !body.sha256 || typeof body.size_bytes !== 'number') {
    fail(400, 'invalid_input', 'file_name, mime_type, size_bytes and sha256 are required');
  }
  const asset = insert(ASSETS, {
    ...body,
    storage_key: `dev/${body.sha256.slice(0, 16)}/${body.file_name}`,
    uploaded_by: caller().personId,
    status: 'pending',
  });
  return { ...asset, upload_url: '', upload_headers: {}, upload_expires_at: expiry() };
}

export const receiveAssetContent = (id: string): void => void must(ASSETS, id, 'asset');

export const markAssetReady = (id: string): AssetRow => patch(ASSETS, id, { status: 'ready' }) ?? must(ASSETS, id, 'asset');

export const assetLink = (id: string): AssetLink => {
  must(ASSETS, id, 'asset');
  return fail(503, 'object_store_unavailable', NO_FILES);
};

export const probeAsset = (id: string): void => {
  must(ASSETS, id, 'asset');
  fail(503, 'object_store_unavailable', NO_FILES);
};
