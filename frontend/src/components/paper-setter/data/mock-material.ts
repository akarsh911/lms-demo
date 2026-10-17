import { CONTENT_ITEMS, CURRICULA, CURRICULUM_NODES, PLACEMENTS } from '@/fixtures/data/library';
import { SETTER_PAPERS } from '@/fixtures/data/papersetter';
import { recordComposedPaper } from '@/fixtures/papers';
import { fitsSampleFiles, holdSampleFiles } from '@/fixtures/paper-files';
import { GRADE_LEVELS, SUBJECTS } from '@/fixtures/data/structure';
import { seedId } from '@/fixtures/ids';
import type { CurriculumNode } from '@/types/library';
import type { Paper } from '@/types/papersetter';

import type {
  BlueprintShape,
  ChapterTarget,
  ComposeBook,
  ComposeRequest,
  NodeAvailability,
} from '../contract';
import { blueprintTotals } from '../pattern-draft';
import { drawQuestions } from './mock-questions';
import { recordDrawnScheme } from './mock-scheme';
import { normaliseShares } from '../state';

const UNMAPPED = 'unmapped';
const LOCATED = 'located';

export interface CurriculumMaterial {
  subject: string;
  classLabel: string;
  books: ComposeBook[];
  picked: CurriculumNode[];
}

function nodeById(nodeId: string): CurriculumNode | undefined {
  return CURRICULUM_NODES.find((node) => node.id === nodeId);
}

function chapterOf(node: CurriculumNode): CurriculumNode {
  if (node.kind !== 'topic' || !node.parent_id) return node;
  return nodeById(node.parent_id) ?? node;
}

function topicsUnder(curriculumId: string, chapterTitle: string): CurriculumNode[] {
  const chapter = CURRICULUM_NODES.find((node) => node.curriculum_id === curriculumId && node.kind === 'chapter' && node.title === chapterTitle);
  return chapter ? CURRICULUM_NODES.filter((node) => node.parent_id === chapter.id && node.kind === 'topic') : [];
}

function chaptersOf(curriculumId: string): CurriculumNode[] {
  return CURRICULUM_NODES.filter(
    (node) => node.curriculum_id === curriculumId && node.kind === 'chapter',
  );
}

export function curriculumMaterial(request: ComposeRequest): CurriculumMaterial | null {
  const curriculum = CURRICULA.find((row) => row.id === request.source.curriculum_id);
  if (!curriculum) return null;

  const subject = SUBJECTS.find((row) => row.id === curriculum.subject_id)?.name ?? '';
  const grade = GRADE_LEVELS.find((row) => row.id === curriculum.grade_level_id);
  const books: ComposeBook[] = CONTENT_ITEMS.filter(
    (item) =>
      item.kind === 'book' &&
      item.subject_id === curriculum.subject_id &&
      item.grade_level_id === curriculum.grade_level_id,
  ).map((item) => ({
    id: item.id,
    title: item.title ?? '',
    content_item_id: item.id,
    engine_document_id: item.id,
    unit_id: '',
    unit_title: subject,
    resolved: true,
    reason: '',
  }));

  const named = request.source.node_ids
    .map(nodeById)
    .filter((node): node is CurriculumNode => node !== undefined);

  return {
    subject,
    classLabel: grade ? String(grade.sequence) : '',
    books,
    picked: named.length > 0 ? named : chaptersOf(curriculum.id),
  };
}

export function targetShares(request: ComposeRequest, picked: readonly CurriculumNode[]): Record<string, number> {
  const weighted = normaliseShares(request.weights);
  if (Object.keys(weighted).length > 0) return weighted;
  if (picked.length === 0) return {};
  return Object.fromEntries(picked.map((node) => [node.id, 1 / picked.length]));
}

function placementsBehind(node: CurriculumNode, bookIds: ReadonlySet<string>) {
  const chapter = chapterOf(node);
  return PLACEMENTS.filter(
    (row) =>
      bookIds.has(row.content_item_id ?? '') &&
      (row.curriculum_node_id === node.id || row.curriculum_node_id === chapter.id),
  );
}

const AVAILABILITY_KINDS: readonly NodeAvailability['kind'][] = ['unit', 'chapter', 'topic'];

function availabilityKind(kind: string | undefined): NodeAvailability['kind'] {
  return AVAILABILITY_KINDS.find((known) => known === kind) ?? '';
}

export function materialRows(request: ComposeRequest, material: CurriculumMaterial): NodeAvailability[] {
  const shares = targetShares(request, material.picked);
  const bookIds = new Set(material.books.map((book) => book.id));
  const covered = material.books.length > 0;

  const counted = material.picked.map((node) => {
    const found = placementsBehind(node, bookIds);
    const held = covered ? Math.max(found.length, 1) : 0;
    return {
      node,
      held,
      exact: found.filter((row) => row.curriculum_node_id === node.id).length,
    };
  });
  const totalHeld = counted.reduce((sum, row) => sum + row.held, 0);

  return counted.map(({ node, held, exact }) => ({
    node_id: node.id,
    title: node.title ?? '',
    kind: availabilityKind(node.kind),
    target_share: shares[node.id] ?? 0,
    available_share: totalHeld === 0 ? 0 : held / totalHeld,
    placements: held,
    readable: held,
    unreadable: 0,
    exact,
    indexed: held,
    stale: 0,
    not_indexed: 0,
    unpublished: 0,
    source_deleted: 0,
    supply: held > 0 ? LOCATED : UNMAPPED,
  }));
}

export function materialTargets(request: ComposeRequest, material: CurriculumMaterial): ChapterTarget[] {
  const book = material.books[0];
  if (!book) return [];
  const shares = targetShares(request, material.picked);
  const byChapter = new Map<string, { chapter: CurriculumNode; share: number }>();

  for (const node of material.picked) {
    const chapter = chapterOf(node);
    const entry = byChapter.get(chapter.id) ?? { chapter, share: 0 };
    entry.share += shares[node.id] ?? 0;
    byChapter.set(chapter.id, entry);
  }

  return [...byChapter.values()]
    .sort((left, right) => (left.chapter.sequence ?? 0) - (right.chapter.sequence ?? 0))
    .map(({ chapter, share }) => ({
      document_id: book.id,
      document_title: book.title,
      chapter_index: chapter.sequence ?? 0,
      chapter_display: `${chapter.sequence ?? ''}. ${chapter.title ?? ''}`.trim(),
      share,
    }));
}

function topicTitle(node: CurriculumNode): string {
  return node.title ?? 'the chosen topic';
}

export function setPaperFrom(
  request: ComposeRequest,
  blueprint: BlueprintShape,
  material: CurriculumMaterial | null,
): Paper {
  const picked = material?.picked ?? [];
  const chapters = [...new Set(picked.map((node) => chapterOf(node).title ?? ''))].filter(Boolean);
  const { sections, drawn } = drawQuestions(blueprint, {
    subject: material?.subject ?? blueprint.subject ?? '',
    classLabel: material?.classLabel ?? '',
    chapters,
    topics: picked.flatMap((node) => {
      const children = node.kind === 'chapter' ? CURRICULUM_NODES.filter((child) => child.parent_id === node.id && child.kind === 'topic') : [];
      return children.length > 0 ? children.map(topicTitle) : [topicTitle(node)];
    }),
    focus: request.overrides.focus ?? [],
  });

  const paper: Paper = {
    paper_id: seedId('set-paper', SETTER_PAPERS.length, Date.now()),
    title: request.overrides.exam_name?.trim() || blueprint.name,
    class_id: material?.classLabel || request.overrides.class_id,
    section_id: request.overrides.section_id ?? null,
    subject: material?.subject || blueprint.subject || null,
    kind: request.overrides.kind,
    marks: blueprintTotals(blueprint.sections ?? []).marks,
    minutes: blueprint.duration_min ?? null,
    created_at: new Date().toISOString(),
    status: 'draft',
    sections,
  };
  if (fitsSampleFiles(paper.subject, material?.classLabel)) holdSampleFiles(paper.paper_id);
  recordDrawnScheme(paper.paper_id, material?.books[0]?.title ?? paper.subject ?? '', drawn, (chapter) => topicsUnder(request.source.curriculum_id, chapter));
  return recordComposedPaper(paper);
}

export function holdSampleFilesFor(request: ComposeRequest, paperId: string): void {
  const material = curriculumMaterial(request);
  if (fitsSampleFiles(material?.subject, material?.classLabel)) holdSampleFiles(paperId);
}

export function drawnFromSentence(material: CurriculumMaterial | null): string | null {
  if (!material || material.picked.length === 0) return null;
  const titles = material.picked.map(topicTitle);
  return `Questions are drawn from ${titles.join(', ')}.`;
}
