import type { NodeAvailability, WeightMap } from './contract';
import type { TreeNode } from './node-tree';

export type ChapterPick = 'whole' | 'partial' | 'none';

export interface ChapterSelection {
  chapterId: string;
  title: string;
  unitId: string | null;
  unitTitle: string | null;
  topicCount: number;
  pickedTopicIds: string[];
  pick: ChapterPick;
}

function walkChapters(
  nodes: readonly TreeNode[],
  unit: TreeNode | null,
  visit: (chapter: TreeNode, unit: TreeNode | null) => void,
): void {
  for (const node of nodes) {
    if (node.kind === 'chapter') {
      visit(node, unit);
      continue;
    }
    walkChapters(node.children, node.kind === 'unit' ? node : unit, visit);
  }
}

export function chapterSelections(
  tree: readonly TreeNode[],
  selected: readonly string[],
): ChapterSelection[] {
  const chosen = new Set(selected);
  const out: ChapterSelection[] = [];

  walkChapters(tree, null, (chapter, unit) => {
    const topics = chapter.children;
    const pickedTopicIds = topics.filter((topic) => chosen.has(topic.id)).map((topic) => topic.id);
    const pick: ChapterPick = chosen.has(chapter.id)
      ? 'whole'
      : pickedTopicIds.length > 0
        ? 'partial'
        : 'none';

    out.push({
      chapterId: chapter.id,
      title: chapter.title,
      unitId: unit?.id ?? null,
      unitTitle: unit?.title ?? null,
      topicCount: topics.length,
      pickedTopicIds,
      pick,
    });
  });

  return out;
}

export interface SelectionSummary {
  wholeChapters: number;
  partialChapters: number;
  pickedTopics: number;
  units: { id: string; title: string }[];
}

export function selectionSummary(
  tree: readonly TreeNode[],
  selected: readonly string[],
): SelectionSummary {
  const chapters = chapterSelections(tree, selected);
  const units = new Map<string, string>();

  for (const chapter of chapters) {
    if (chapter.pick === 'none') continue;
    if (chapter.unitId !== null) units.set(chapter.unitId, chapter.unitTitle ?? chapter.unitId);
  }

  const chosen = new Set(selected);
  for (const node of tree) {
    if (node.kind === 'unit' && chosen.has(node.id)) units.set(node.id, node.title);
  }

  return {
    wholeChapters: chapters.filter((chapter) => chapter.pick === 'whole').length,
    partialChapters: chapters.filter((chapter) => chapter.pick === 'partial').length,
    pickedTopics: chapters.reduce((sum, chapter) => sum + chapter.pickedTopicIds.length, 0),
    units: [...units.entries()].map(([id, title]) => ({ id, title })),
  };
}

export function selectedUnitIds(
  tree: readonly TreeNode[],
  selected: readonly string[],
): string[] {
  return selectionSummary(tree, selected).units.map((unit) => unit.id);
}

function positive(weights: WeightMap, nodeId: string): boolean {
  return (weights[nodeId] ?? 0) > 0;
}

export function weightContainment(
  tree: readonly TreeNode[],
  weights: WeightMap,
): Map<string, string> {
  const covered = new Map<string, string>();

  const walk = (nodes: readonly TreeNode[], holder: string | null): void => {
    for (const node of nodes) {
      if (holder !== null) covered.set(node.id, holder);
      walk(node.children, positive(weights, node.id) ? node.id : holder);
    }
  };

  walk(tree, null);
  return covered;
}

export interface WeightConflict {
  holderId: string;
  holderTitle: string;
  containedId: string;
  containedTitle: string;
}

export function weightConflicts(
  tree: readonly TreeNode[],
  weights: WeightMap,
): WeightConflict[] {
  const covered = weightContainment(tree, weights);
  const titles = new Map<string, string>();

  const collect = (nodes: readonly TreeNode[]): void => {
    for (const node of nodes) {
      titles.set(node.id, node.title);
      collect(node.children);
    }
  };
  collect(tree);

  return [...covered.entries()]
    .filter(([containedId]) => positive(weights, containedId))
    .map(([containedId, holderId]) => ({
      holderId,
      holderTitle: titles.get(holderId) ?? holderId,
      containedId,
      containedTitle: titles.get(containedId) ?? containedId,
    }));
}

export function countedWeightTotal(
  tree: readonly TreeNode[],
  nodeIds: readonly string[],
  weights: WeightMap,
): number {
  const covered = weightContainment(tree, weights);
  return nodeIds.reduce((sum, nodeId) => {
    if (covered.has(nodeId)) return sum;
    return sum + (weights[nodeId] ?? 0);
  }, 0);
}

export interface ForeignWeightKey {
  key: string;
}

export function foreignWeightKeys(
  tree: readonly TreeNode[],
  weights: WeightMap,
): ForeignWeightKey[] {
  const known = new Set<string>();
  const collect = (nodes: readonly TreeNode[]): void => {
    for (const node of nodes) {
      known.add(node.id);
      collect(node.children);
    }
  };
  collect(tree);

  if (known.size === 0) return [];

  return Object.keys(weights)
    .filter((key) => (weights[key] ?? 0) > 0 && !known.has(key))
    .map((key) => ({ key }));
}

export interface UnderstatedChapter {
  chapterId: string;
  title: string;
  topicsWithMaterial: number;
}

export function understatedChapters(
  tree: readonly TreeNode[],
  rows: readonly NodeAvailability[],
): UnderstatedChapter[] {
  const byNode = new Map(rows.map((row) => [row.node_id, row]));
  const out: UnderstatedChapter[] = [];

  walkChapters(tree, null, (chapter) => {
    const own = byNode.get(chapter.id);
    if (!own || own.placements > 0) return;

    const topicsWithMaterial = chapter.children.filter((topic) => {
      const row = byNode.get(topic.id);
      return row !== undefined && row.placements > 0;
    }).length;

    if (topicsWithMaterial > 0) {
      out.push({ chapterId: chapter.id, title: chapter.title, topicsWithMaterial });
    }
  });

  return out;
}

export interface AvailabilityGroup {
  unitId: string | null;
  unitTitle: string | null;
  rows: NodeAvailability[];
}

export function availabilityGroups(
  tree: readonly TreeNode[],
  rows: readonly NodeAvailability[],
): AvailabilityGroup[] {
  const unitFor = new Map<string, { id: string; title: string } | null>();

  const walk = (nodes: readonly TreeNode[], unit: TreeNode | null): void => {
    for (const node of nodes) {
      const own = node.kind === 'unit' ? node : unit;
      unitFor.set(node.id, own ? { id: own.id, title: own.title } : null);
      walk(node.children, own);
    }
  };
  walk(tree, null);

  const groups = new Map<string, AvailabilityGroup>();
  const order: string[] = [];

  for (const row of rows) {
    const unit = unitFor.get(row.node_id) ?? null;
    const key = unit?.id ?? '';
    if (!groups.has(key)) {
      groups.set(key, {
        unitId: unit?.id ?? null,
        unitTitle: unit?.title ?? null,
        rows: [],
      });
      order.push(key);
    }
    groups.get(key)!.rows.push(row);
  }

  return order.flatMap((key) => {
    const group = groups.get(key);
    return group ? [group] : [];
  });
}
