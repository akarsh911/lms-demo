import { MINDMAP_LINK_PARAMS } from '@/constants/mindmap';

import type { PageRange } from './atlas-layout';

export interface MindmapTarget {
  itemId: string;
  sectionId?: string | null;
  range?: PageRange | null;
}

export function mindmapQuery(target: MindmapTarget): string {
  const query = new URLSearchParams();
  query.set(MINDMAP_LINK_PARAMS.item, target.itemId);
  if (target.sectionId) query.set(MINDMAP_LINK_PARAMS.section, target.sectionId);
  if (target.range) {
    query.set(MINDMAP_LINK_PARAMS.from, String(target.range.from));
    query.set(MINDMAP_LINK_PARAMS.to, String(target.range.to));
  }
  return query.toString();
}

function pageOf(raw: string | null): number | null {
  if (raw === null) return null;
  const page = Number.parseInt(raw, 10);
  return Number.isFinite(page) && page > 0 ? page : null;
}

export function pageRangeOf(from: string | null, to: string | null): PageRange | null {
  const start = pageOf(from);
  const end = pageOf(to);
  if (start === null && end === null) return null;
  const low = start ?? end!;
  const high = end ?? start!;
  return { from: Math.min(low, high), to: Math.max(low, high) };
}

export function pageRangeLabel(range: PageRange): string {
  return range.from === range.to ? `Page ${range.from}` : `Pages ${range.from}–${range.to}`;
}
