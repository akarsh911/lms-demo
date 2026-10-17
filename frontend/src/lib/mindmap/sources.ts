import type { MapNode, MapSource, MapSourceKind } from '@/types/mindmap';

export const SOURCE_LABEL: Readonly<Record<MapSourceKind, string>> = {
  textbook: 'Textbook',
  teacher_note: 'Teacher note',
  notes: 'Notes',
  pyq: 'Past board question',
  exemplar: 'Exemplar',
};

export function sourcesOf(node: MapNode): MapSource[] {
  if (node.sources && node.sources.length > 0) return node.sources;
  if (node.kind !== 'atom' || !node.text) return [];
  return [{ kind: 'textbook', quote: node.text, title: 'Textbook', page: node.citation?.page ?? node.page }];
}

export function sourceMeta(source: MapSource): string {
  const marks = source.marks ? `${source.marks} mark${source.marks === 1 ? '' : 's'}` : null;
  return [source.title, source.page ? `page ${source.page}` : null, source.author, source.date, marks]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}
