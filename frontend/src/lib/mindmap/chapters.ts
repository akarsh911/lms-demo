import type { ChapterDocument, ChapterNode } from '@/types/mindmap';

export interface ChapterOption {
  id: string;
  label: string;
  depth: number;
}

function labelOf(section: ChapterNode): string {
  return section.display_label || section.display || section.title;
}

function byReadingOrder(a: ChapterNode, b: ChapterNode): number {
  return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
}

function isUnpaged(section: ChapterNode): boolean {
  return section.page_start === null || section.page_start === undefined;
}

function bookRootOf(
  top: readonly ChapterNode[],
  childrenOf: ReadonlyMap<string, ChapterNode[]>,
): ChapterNode | null {
  const only = top.length === 1 ? top[0] : undefined;
  if (!only || !isUnpaged(only)) return null;
  return (childrenOf.get(only.id)?.length ?? 0) > 0 ? only : null;
}

export function chapterOptions(document: ChapterDocument): ChapterOption[] {
  const sections = document.sections ?? [];
  const known = new Set(sections.map((section) => section.id));
  const childrenOf = new Map<string, ChapterNode[]>();
  const top: ChapterNode[] = [];

  for (const section of sections) {
    const parentId = section.parent_id;
    if (!parentId || !known.has(parentId)) {
      top.push(section);
      continue;
    }
    childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), section]);
  }

  const root = bookRootOf(top, childrenOf);
  const chapters = root ? (childrenOf.get(root.id) ?? []) : top;

  const options: ChapterOption[] = [];
  const placed = new Set<string>();
  const place = (nodes: readonly ChapterNode[], depth: number): void => {
    for (const node of [...nodes].sort(byReadingOrder)) {
      if (placed.has(node.id)) continue;
      placed.add(node.id);
      options.push({ id: node.id, label: labelOf(node), depth });
      place(childrenOf.get(node.id) ?? [], depth + 1);
    }
  };
  place(chapters, 0);

  return options;
}
