import type { PageInfo } from './roster';

/**
 * The library and the curriculum.
 *
 * Same envelope and same `has_more`-without-a-total contract as everything else
 * under emerge-core. Three things are specific to this corner and all three
 * read as a fault if you do not know them.
 *
 * ## 1. `index_status` is `none` for everything, today
 *
 * Indexing sits behind a flag that is off, so nothing has been handed to the
 * retrieval engine. Every item therefore reports that it is not indexed, and
 * every curriculum node resolves as `unindexed`. **The content is present and
 * readable either way** — what is missing is the ability to SEARCH it. Drawing
 * that as an error, or as missing content, tells a teacher their material was
 * lost when it is sitting right there.
 *
 * ## 2. Assets need an object store that a deployment may not have
 *
 * `POST /library/assets` answers **503** without one, and `GET /assets/{id}/link`
 * cannot mint a link either. Uploading and opening are both offered — see
 * `AssetUploadGrant`, `AssetLink` and `services/library.ts` — and a deployment
 * without a store surfaces that 503 as itself rather than as a missing file.
 *
 * ## 3. Resolution is a six-valued answer, not a success flag
 *
 * `resolutionOf` returns exactly one of `unmapped`, `restricted`, `resolved`,
 * `unindexed`, `source_deleted` or `unpublished`
 * (`internal/transport/http/resolve.go`), in that order of precedence, and each
 * means something a user can act on differently. `constants/library.ts` is the
 * only place that mapping to a sentence lives.
 */

export interface ContentItem {
  id: string;
  kind?: string;
  title?: string;
  description?: string;
  subject_id?: string;
  grade_level_id?: string;
  section_id?: string;
  subject_offering_id?: string;
  language?: string;
  author?: string;
  publisher?: string;
  isbn?: string;
  asset_id?: string;
  owner_person_id?: string;
  audience?: string;
  status?: string;
  ingest_mode?: IngestMode;
  /** `none` | `pending` | `indexed` | `failed` | `parked`. See note 1. */
  index_status?: string;
  indexed_at?: string;
  engine_document_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LibraryPage {
  rows: ContentItem[];
  count: number;
  page: PageInfo;
}

export interface Curriculum {
  id: string;
  name?: string;
  code?: string;
  academic_session_id?: string;
  subject_id?: string;
  grade_level_id?: string;
  board?: string;
  description?: string;
  origin?: string;
  status?: string;
  created_at?: string;
}

export interface CurriculumNode {
  id: string;
  curriculum_id?: string;
  parent_id?: string;
  kind?: string;
  title?: string;
  sequence?: number;
  description?: string;
  status?: string;
}

/** One placement, as `resolveCurriculumNodeContent` reports it. */
export interface ResolvedPlacement {
  placement_id: string;
  placement_status: string;
  content_item_id: string;
  content_node_id?: string | null;
  page_start?: number | null;
  page_end?: number | null;
  grain: string;
  curriculum_node_id?: string | null;
  exact: boolean;
  /** `current` | `stale` | `not_indexed` | `unpublished` | `source_deleted`. */
  retrieval_state: string;
  index_state: string;
  content_status?: string;
  engine_document_id?: string;
}

export interface ResolvedCounts {
  placements: number;
  /** Placements whose content item this caller may read. */
  readable: number;
  unreadable: number;
  exact: number;
  indexed: number;
  stale: number;
  not_indexed: number;
  unpublished: number;
  source_deleted: number;
}

export interface NodeContent {
  curriculum_node_id: string;
  curriculum_id: string;
  /** One of six. See `constants/library.ts`. */
  resolution: string;
  content: ResolvedPlacement[];
  count: number;
  counts: ResolvedCounts;
  include_proposed: boolean;
  include_ancestors: boolean;
}

export type AssetStatus = 'pending' | 'ready' | 'deleted';

export interface AssetRow {
  id: string;
  storage_key?: string;
  file_name?: string;
  mime_type?: string;
  size_bytes?: number;
  sha256?: string;
  uploaded_by?: string;
  status?: AssetStatus;
  created_at?: string;
  updated_at?: string;
}

export interface AssetWrite {
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
}

export interface AssetUploadGrant extends AssetRow {
  upload_url: string;
  upload_headers: Record<string, string>;
  upload_expires_at: string;
}

export interface AssetLink {
  asset_id: string;
  download_url: string;
  download_expires_at: string;
}

export type ContentAudience = 'school' | 'grade' | 'section' | 'offering' | 'owner';
export type ContentKind = 'book' | 'note' | 'document' | 'paper';
export type ContentStatus = 'draft' | 'published' | 'archived';
export type IngestMode = 'now' | 'defer';

export interface ContentItemWrite {
  title: string;
  audience: ContentAudience;
  kind?: ContentKind;
  description?: string;
  subject_id?: string;
  grade_level_id?: string;
  section_id?: string;
  subject_offering_id?: string;
  language?: string;
  author?: string;
  publisher?: string;
  asset_id?: string;
  status?: ContentStatus;
  ingest_mode?: IngestMode;
}

export const CURRICULUM_NODE_KINDS = ['unit', 'chapter', 'topic'] as const;
export type CurriculumNodeKind = (typeof CURRICULUM_NODE_KINDS)[number];

export const CURRICULUM_NODE_STATUSES = ['active', 'inactive'] as const;
export type CurriculumNodeStatus = (typeof CURRICULUM_NODE_STATUSES)[number];

export interface CurriculumNodeCreate {
  title: string;
  sequence: number;
  kind?: CurriculumNodeKind;
  parent_id?: string;
  description?: string;
  status?: CurriculumNodeStatus;
}

export interface CurriculumNodePatch {
  title?: string;
  sequence?: number;
  kind?: CurriculumNodeKind;
  parent_id?: string;
  description?: string;
  status?: CurriculumNodeStatus;
}

export interface CurriculumCreate {
  name: string;
  code: string;
  academic_session_id: string;
  subject_id: string;
  grade_level_id: string;
  board?: string;
  description?: string;
}

export const PLACEMENT_GRAINS = ['curriculum', 'node'] as const;
export type PlacementGrain = (typeof PLACEMENT_GRAINS)[number];

export type PlacementOrigin = 'manual' | 'inferred';
export type PlacementStatus = 'proposed' | 'confirmed' | 'rejected';

export interface ContentPlacement {
  id: string;
  curriculum_id?: string;
  curriculum_node_id?: string | null;
  content_item_id?: string;
  content_node_id?: string | null;
  copied_from_placement_id?: string | null;
  grain?: PlacementGrain;
  page_start?: number | null;
  page_end?: number | null;
  origin?: PlacementOrigin;
  confidence?: number | null;
  status?: PlacementStatus;
  created_by?: string | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PlacementCreate {
  curriculum_id: string;
  content_item_id: string;
  grain: PlacementGrain;
  curriculum_node_id?: string;
  page_start?: number;
  page_end?: number;
}

export interface PlacementPatch {
  page_start?: number;
  page_end?: number;
  status?: PlacementStatus;
}
