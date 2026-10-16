export const MINDMAP_BOOKS_PAGE_SIZE = 200;

export const MINDMAP_AVAILABLE = 'available';

export const MINDMAP_FLAT_STRUCTURE = 'flat';

export const MINDMAP_ROUTE_KEY = 'learning-mindmap';

export const MINDMAP_LINK_PARAMS = {
  item: 'item',
  section: 'section',
  from: 'from',
  to: 'to',
  view: 'view',
  topic: 'topic',
} as const;

export const MINDMAP_CAPABILITIES = {
  read: 'core.mindmaps.read',
  masteryRead: 'core.concept_mastery.read',
  masteryWrite: 'core.concept_mastery.write',
} as const;

export const MINDMAP_ERROR_CODES = {
  disabled: 'mindmap_disabled',
  tenantUnmapped: 'mindmap_tenant_unmapped',
  notIndexed: 'mindmap_not_indexed',
  upstreamRefused: 'mindmap_upstream_refused',
  engineUnavailable: 'mindmap_engine_unavailable',
  serviceUnavailable: 'mindmap_service_unavailable',
  linkUnbounded: 'mindmap_link_unbounded',
} as const;

export const MINDMAP_STATE_LABEL: Record<string, string> = {
  available: 'Ready',
  held: 'Not ready yet',
  parked: 'Waiting for chapters',
  pending: 'Being prepared',
  failed: 'Could not be prepared',
  not_indexed: 'Not prepared yet',
};
export const MINDMAP_STATE_MEANING: Record<string, string> = {
  available: 'You can open a mind map for this book.',
  held: 'This book is uploaded. Its mind map will be ready soon.',
  parked: 'This book is uploaded, but its chapters need to be confirmed before a mind map can be made.',
  pending: 'This book is being prepared. Its mind map will appear when that finishes.',
  failed: 'Something went wrong preparing this book. Ask your school to upload it again.',
  not_indexed: 'This book has not been prepared for mind maps yet.',
};

export const MATCH_BASIS_MEANING: Record<string, string> = {
  page_overlap: 'Matched to a chapter by the pages this mapping covers.',
  whole_item: 'Mapped to the whole book, with no page range to pick a chapter by.',
  none: 'No chapter of this book covers the pages this mapping names.',
};
