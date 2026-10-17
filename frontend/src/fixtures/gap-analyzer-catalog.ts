import type { CatalogChapter, CatalogSubject, CatalogTopic, TopicLinks } from '@/lib/gap-analyzer/catalog';

import { TOPIC_ALIASES, TOPIC_MOTIONS, TOPIC_THREADS } from './data/gap-analyzer';
import { FLASHCARD_CHAPTERS, PLAYGROUND_THREADS } from './data/lesson-planner';
import { CHAPTER_UNITS } from './data/lesson-term';
import { CONTENT_ITEMS, CURRICULA, CURRICULUM_NODES } from './data/library';
import { subjectByCode } from './data/structure';
import { DEBATE_CATALOG } from './debate-catalog';
import { curriculumNodeMindmaps, mindmapTopicGroups } from './engines';
import { buildDeck } from './flashcards';

export interface MindmapTopic {
  id: string;
  title: string;
  chapter_title: string;
  item_id: string;
  section_id: string;
  section_title: string;
  page_start: number | null;
  page_end: number | null;
  atoms: readonly { id: string; label: string }[];
}

export const TEXTBOOK_ID = CONTENT_ITEMS.find((item) => item.title === 'Science Textbook, Class 10')?.id ?? '';

let mindmapCache: MindmapTopic[] | null = null;

export function mindmapTopics(): MindmapTopic[] {
  mindmapCache ??= mindmapTopicGroups().filter((group) => group.item_id === TEXTBOOK_ID);
  return mindmapCache;
}

function chapterMindmap(chapterId: string): TopicLinks['mindmap'] {
  const link = curriculumNodeMindmaps(chapterId).mindmaps.find((row) => row.mindmap_state === 'available' && row.sections.length > 0);
  const best = link?.sections[0];
  if (!link || !best) return null;
  return { item_id: link.content_item_id, section_id: best.section_id, page_start: link.page_start, page_end: link.page_end };
}

export function debateMotionById(id: string | undefined): TopicLinks['debate_motion'] {
  const motion = id ? DEBATE_CATALOG.categories.flatMap((category) => category.topics).find((topic) => topic.id === id) : undefined;
  return motion ? { id: motion.id, text: motion.text } : null;
}

function topicHasCards(chapterId: string, title: string): boolean {
  try {
    return buildDeck({ spec: { chapter: chapterId, topic: title }, locator: {} }).cards.length > 0;
  } catch {
    return false;
  }
}

function flashcardsChapter(chapterTitle: string, title: string): string | null {
  const chapterId = FLASHCARD_CHAPTERS[chapterTitle];
  return chapterId && topicHasCards(chapterId, title) ? chapterId : null;
}

const playgroundThread = (chapterTitle: string, title: string): string | null =>
  title in TOPIC_THREADS ? (TOPIC_THREADS[title] ?? null) : (PLAYGROUND_THREADS[chapterTitle]?.[0] ?? null);

function topic(id: string, title: string, chapterTitle: string, mindmap: TopicLinks['mindmap']): CatalogTopic {
  return {
    id,
    title,
    aliases: TOPIC_ALIASES[title] ?? [],
    links: {
      mindmap,
      flashcards_chapter: flashcardsChapter(chapterTitle, title),
      playground_thread: playgroundThread(chapterTitle, title),
      debate_motion: debateMotionById(TOPIC_MOTIONS[title]),
    },
  };
}

const mapLink = (row: MindmapTopic): TopicLinks['mindmap'] => ({ item_id: row.item_id, section_id: row.section_id, page_start: row.page_start, page_end: row.page_end });

function topicsOf(chapterId: string, chapterTitle: string): CatalogTopic[] {
  const shared = chapterMindmap(chapterId);
  const maps = new Map(mindmapTopics().map((row) => [row.id, row]));
  const fromCurriculum = CURRICULUM_NODES.filter((node) => node.parent_id === chapterId && node.kind === 'topic').sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  if (fromCurriculum.length > 0) {
    return fromCurriculum.map((node) => {
      const mapped = maps.get(node.id);
      return topic(node.id, node.title ?? 'Topic', chapterTitle, mapped ? mapLink(mapped) : shared);
    });
  }
  const fromMaps = mindmapTopics().filter((row) => row.chapter_title === chapterTitle);
  if (fromMaps.length > 0) return fromMaps.map((row) => topic(row.id, row.title, chapterTitle, mapLink(row)));
  return [topic(chapterId, chapterTitle, chapterTitle, shared)];
}

const catalogCache = new Map<string, CatalogSubject | null>();

export function catalogFor(grade: number, code: string): CatalogSubject | null {
  const key = `${grade}|${code}`;
  const cached = catalogCache.get(key);
  if (cached !== undefined) return cached;
  const curriculum = CURRICULA.find((row) => row.code === `${code}-${grade}`);
  const built: CatalogSubject | null = curriculum
    ? {
        code,
        name: subjectByCode(code).name ?? code,
        grade,
        curriculum_id: curriculum.id,
        chapters: CURRICULUM_NODES.filter((node) => node.curriculum_id === curriculum.id && node.kind === 'chapter')
          .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
          .map<CatalogChapter>((node) => ({
            id: node.id,
            title: node.title ?? 'Chapter',
            sequence: node.sequence ?? 0,
            unit: CHAPTER_UNITS[node.title ?? ''] ?? null,
            topics: topicsOf(node.id, node.title ?? 'Chapter'),
          })),
      }
    : null;
  catalogCache.set(key, built);
  return built;
}

export const subjectCodesFor = (grade: number): string[] =>
  CURRICULA.filter((row) => row.code?.endsWith(`-${grade}`)).map((row) => (row.code ?? '').split('-')[0] ?? '').filter(Boolean);

export const gradesWithCurriculum = (): number[] =>
  [...new Set(CURRICULA.map((row) => Number.parseInt((row.code ?? '').split('-')[1] ?? '', 10)).filter(Number.isFinite))].sort((a, b) => a - b);
