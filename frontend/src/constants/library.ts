/**
 * emerge-core's library vocabulary, translated into sentences a teacher reads.
 *
 * The same shape as `constants/cas.ts` and for the same reason: the values are
 * the API's, the wording is ours, and the mapping lives in exactly one place so
 * two screens cannot describe the same state differently.
 *
 * NOTHING HERE IS A FILTER LIST. These maps are consulted with whatever value
 * arrived; an unrecognised one falls through to a neutral sentence rather than
 * being dropped, so a value added to emerge-core degrades to "unfamiliar"
 * instead of vanishing.
 */

/**
 * `resolutionOf` returns exactly one of these, in this order of precedence
 * (`internal/transport/http/resolve.go`). The order matters: `restricted`
 * outranks everything except `unmapped`, so a node with content the caller
 * cannot read never reports "resolved".
 */
export const RESOLUTION_MEANING: Record<string, string> = {
  unmapped: 'No material has been mapped to this topic yet.',
  restricted: 'Material is mapped to this topic, but none of it is yours to read.',
  resolved: 'Material is mapped and has been indexed for search.',
  // The common case today. The content IS there and readable; what is missing
  // is that it has not been handed to the retrieval engine, because indexing is
  // behind a flag that is off. Saying "not found" here would be false.
  unindexed: 'Material is mapped and readable, but it has not been indexed for search yet.',
  unpublished: 'The material mapped here is still a draft.',
  source_deleted: 'The material mapped here has been removed.',
};

/**
 * Per-placement retrieval state. `not_indexed` is the near-universal answer
 * today and is deliberately phrased as a pending step rather than a fault.
 */
export const RETRIEVAL_STATE_MEANING: Record<string, string> = {
  current: 'Indexed and searchable',
  stale: 'Indexed, but the source has changed since',
  not_indexed: 'Not indexed for search yet',
  unpublished: 'Still a draft',
  source_deleted: 'Source removed',
};

/**
 * `content_items.index_status`. Five values, of which only `none` is common
 * while indexing is switched off.
 */
export const INDEX_STATUS_MEANING: Record<string, string> = {
  none: 'Not indexed for search',
  pending: 'Waiting to be indexed',
  indexed: 'Indexed and searchable',
  failed: 'Indexing failed',
  parked: 'Indexing paused',
};

/** A value emerge-core sent that this build has no sentence for. */
export function meaningOf(map: Record<string, string>, value: string | undefined): string {
  if (!value) return 'Not stated';
  return map[value] ?? value;
}

/** Items a library page asks for. Same reasoning as `ROSTER_PAGE_SIZE`. */
export const LIBRARY_PAGE_SIZE = 20;

export const CONTENT_KINDS = [
  { value: 'note', label: 'Notes' },
  { value: 'document', label: 'Document' },
  { value: 'book', label: 'Book' },
] as const;

export const MAX_ASSET_BYTES = 200 * 1024 * 1024;
