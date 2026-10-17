import type { CurriculumNode } from '@/types/library';

export type NodeKind = 'unit' | 'chapter' | 'topic';

export interface TreeNode {
  id: string;
  title: string;
  kind: string;
  sequence: number | null;
  depth: number;
  parentId: string | null;
  children: TreeNode[];
}

export const UNTITLED_NODE = 'Untitled topic';

export const MAX_CURRICULUM_DEPTH = 3;

function titleOf(row: CurriculumNode): string {
  const title = row.title?.trim();
  return title === undefined || title === '' ? UNTITLED_NODE : title;
}

function sequenceOf(row: CurriculumNode): number | null {
  return typeof row.sequence === 'number' ? row.sequence : null;
}

function bySequenceThenArrival(
  a: { sequence: number | null; arrival: number },
  b: { sequence: number | null; arrival: number },
): number {
  if (a.sequence === null && b.sequence !== null) return 1;
  if (b.sequence === null && a.sequence !== null) return -1;
  if (a.sequence !== null && b.sequence !== null && a.sequence !== b.sequence) {
    return a.sequence - b.sequence;
  }
  return a.arrival - b.arrival;
}

export function buildNodeTree(rows: readonly CurriculumNode[]): TreeNode[] {
  const present = new Set(rows.map((row) => row.id));
  const byParent = new Map<string, { row: CurriculumNode; arrival: number }[]>();

  rows.forEach((row, arrival) => {
    const declared = row.parent_id;
    const parentKey =
      declared === undefined || declared === null || declared === '' || !present.has(declared)
        ? ''
        : declared;
    const siblings = byParent.get(parentKey) ?? [];
    siblings.push({ row, arrival });
    byParent.set(parentKey, siblings);
  });

  const seen = new Set<string>();

  const build = (parentKey: string, depth: number): TreeNode[] => {
    const siblings = byParent.get(parentKey) ?? [];
    return siblings
      .map((entry) => ({
        entry,
        sequence: sequenceOf(entry.row),
        arrival: entry.arrival,
      }))
      .sort(bySequenceThenArrival)
      .flatMap(({ entry, sequence }) => {
        if (seen.has(entry.row.id)) return [];
        seen.add(entry.row.id);
        return [
          {
            id: entry.row.id,
            title: titleOf(entry.row),
            kind: entry.row.kind ?? 'topic',
            sequence,
            depth,
            parentId: parentKey === '' ? null : parentKey,
            children: build(entry.row.id, depth + 1),
          },
        ];
      });
  };

  return build('', 0);
}

export function flattenTree(tree: readonly TreeNode[]): TreeNode[] {
  return tree.flatMap((node) => [node, ...flattenTree(node.children)]);
}

export function descendantIds(node: TreeNode): string[] {
  return node.children.flatMap((child) => [child.id, ...descendantIds(child)]);
}

export function nodeIndex(tree: readonly TreeNode[]): Map<string, TreeNode> {
  return new Map(flattenTree(tree).map((node) => [node.id, node]));
}

export function coveredByAncestor(
  tree: readonly TreeNode[],
  selected: readonly string[],
): Set<string> {
  const chosen = new Set(selected);
  const covered = new Set<string>();

  const walk = (nodes: readonly TreeNode[], underSelection: boolean): void => {
    for (const node of nodes) {
      if (underSelection) covered.add(node.id);
      walk(node.children, underSelection || chosen.has(node.id));
    }
  };

  walk(tree, false);
  return covered;
}

export function ancestorChain(
  tree: readonly TreeNode[],
  nodeId: string,
): TreeNode[] {
  const walk = (nodes: readonly TreeNode[], trail: TreeNode[]): TreeNode[] | null => {
    for (const node of nodes) {
      if (node.id === nodeId) return trail;
      const found = walk(node.children, [...trail, node]);
      if (found) return found;
    }
    return null;
  };
  return walk(tree, []) ?? [];
}

export function unitOf(tree: readonly TreeNode[], nodeId: string): TreeNode | null {
  const node = nodeIndex(tree).get(nodeId);
  if (node?.kind === 'unit') return node;
  return ancestorChain(tree, nodeId).find((ancestor) => ancestor.kind === 'unit') ?? null;
}

export function chapterOf(tree: readonly TreeNode[], nodeId: string): TreeNode | null {
  const node = nodeIndex(tree).get(nodeId);
  if (node?.kind === 'chapter') return node;
  return (
    [...ancestorChain(tree, nodeId)].reverse().find((ancestor) => ancestor.kind === 'chapter') ??
    null
  );
}

export function chaptersOf(tree: readonly TreeNode[]): TreeNode[] {
  return flattenTree(tree).filter((node) => node.kind === 'chapter');
}

export function unitsOf(tree: readonly TreeNode[]): TreeNode[] {
  return flattenTree(tree).filter((node) => node.kind === 'unit');
}

export type ShapeFault =
  | 'topic_outside_a_chapter'
  | 'topic_with_children'
  | 'unit_below_the_root'
  | 'chapter_inside_a_chapter'
  | 'parent_not_in_this_curriculum'
  | 'deeper_than_a_topic'
  | 'kind_not_recognised';

export interface MalformedNode {
  id: string;
  title: string;
  kind: string;
  fault: ShapeFault;
  parentTitle: string | null;
}

export const SHAPE_FAULT_SENTENCE: Record<ShapeFault, string> = {
  topic_outside_a_chapter:
    'This is a topic that sits outside any chapter. A curriculum is chapters, and topics live inside them, so this topic has no chapter to take its material from. It is shown here rather than hidden, because dropping it would quietly shrink the syllabus.',
  topic_with_children:
    'This topic has things nested inside it. A topic is the deepest level a curriculum goes, so whatever is beneath it cannot be reached by a paper. Nothing has been lost; the nesting needs correcting in the library.',
  unit_below_the_root:
    'This unit is nested inside something else. A unit is a top-level grouping that stands for one book, so a nested one has no book to stand for.',
  chapter_inside_a_chapter:
    'This chapter sits inside another chapter. A chapter belongs to the curriculum or to a unit, never to another chapter, so its page range cannot be worked out.',
  parent_not_in_this_curriculum:
    'This node names a parent that is not in this curriculum, so it has been drawn at the top level. It is shown rather than dropped, because a missing row reads as a syllabus somebody shortened.',
  deeper_than_a_topic:
    'This node is nested deeper than a topic, which is as deep as a curriculum goes. A paper cannot reach it.',
  kind_not_recognised:
    'This node is of a kind this screen has no rule for. It is listed so that it is visible, and it is treated as a topic.',
};

export interface CurriculumShape {
  tree: TreeNode[];
  malformed: MalformedNode[];
  hasUnits: boolean;
}

function faultOf(node: TreeNode, parent: TreeNode | null): ShapeFault | null {
  if (parent?.kind === 'topic') return 'deeper_than_a_topic';
  if (node.depth >= MAX_CURRICULUM_DEPTH) return 'deeper_than_a_topic';

  if (node.kind === 'unit') return parent === null ? null : 'unit_below_the_root';

  if (node.kind === 'chapter') {
    if (parent === null || parent.kind === 'unit') return null;
    return parent.kind === 'chapter' ? 'chapter_inside_a_chapter' : 'topic_outside_a_chapter';
  }

  if (node.kind === 'topic') {
    if (node.children.length > 0) return 'topic_with_children';
    return parent !== null && parent.kind === 'chapter' ? null : 'topic_outside_a_chapter';
  }

  return 'kind_not_recognised';
}

export function curriculumShape(rows: readonly CurriculumNode[]): CurriculumShape {
  const tree = buildNodeTree(rows);
  const present = new Set(rows.map((row) => row.id));
  const orphaned = new Set(
    rows
      .filter((row) => {
        const declared = row.parent_id;
        if (declared === undefined || declared === null || declared === '') return false;
        return !present.has(declared);
      })
      .map((row) => row.id),
  );

  const malformed: MalformedNode[] = [];

  const walk = (nodes: readonly TreeNode[], parent: TreeNode | null): void => {
    for (const node of nodes) {
      const fault = orphaned.has(node.id) ? 'parent_not_in_this_curriculum' : faultOf(node, parent);
      if (fault) {
        malformed.push({
          id: node.id,
          title: node.title,
          kind: node.kind,
          fault,
          parentTitle: parent?.title ?? null,
        });
      }
      walk(node.children, node);
    }
  };

  walk(tree, null);

  return { tree, malformed, hasUnits: unitsOf(tree).length > 0 };
}

export function duplicateTitles(tree: readonly TreeNode[]): Set<string> {
  const counts = new Map<string, number>();
  for (const node of flattenTree(tree)) {
    const key = `${node.parentId ?? ''}|${node.title}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repeated = new Set<string>();
  for (const node of flattenTree(tree)) {
    const key = `${node.parentId ?? ''}|${node.title}`;
    if ((counts.get(key) ?? 0) > 1) repeated.add(node.id);
  }
  return repeated;
}
