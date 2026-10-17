export interface TopicLinks {
  mindmap: { item_id: string; section_id: string; page_start: number | null; page_end: number | null } | null;
  flashcards_chapter: string | null;
  playground_thread: string | null;
  debate_motion: { id: string; text: string } | null;
}

export interface CatalogTopic {
  id: string;
  title: string;
  aliases: readonly string[];
  links: TopicLinks;
}

export interface CatalogChapter {
  id: string;
  title: string;
  sequence: number;
  unit: string | null;
  topics: readonly CatalogTopic[];
}

export interface CatalogSubject {
  code: string;
  name: string;
  grade: number;
  curriculum_id: string;
  chapters: readonly CatalogChapter[];
}

export interface TopicHome {
  subject: CatalogSubject;
  chapter: CatalogChapter;
  topic: CatalogTopic;
}

const folded = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const named = (topic: CatalogTopic, text: string): boolean =>
  [topic.title, ...topic.aliases].some((name) => folded(name) === folded(text));

export function chapterNamed(subject: CatalogSubject, title: string): CatalogChapter | null {
  return subject.chapters.find((chapter) => folded(chapter.title) === folded(title)) ?? null;
}

export function topicInChapter(chapter: CatalogChapter, label: string): CatalogTopic | null {
  return chapter.topics.find((topic) => named(topic, label)) ?? null;
}

export function resolvePath(subject: CatalogSubject, path: string): CatalogTopic | null {
  const [head = '', ...rest] = path.split('>').map((part) => part.trim());
  const chapter = chapterNamed(subject, head);
  if (!chapter) return null;
  for (const segment of [...rest].reverse()) {
    const topic = topicInChapter(chapter, segment);
    if (topic) return topic;
  }
  return chapter.topics.length === 1 ? (chapter.topics[0] ?? null) : null;
}

export function topicIndex(subjects: readonly CatalogSubject[]): ReadonlyMap<string, TopicHome> {
  const out = new Map<string, TopicHome>();
  for (const subject of subjects) {
    for (const chapter of subject.chapters) {
      for (const topic of chapter.topics) out.set(topic.id, { subject, chapter, topic });
    }
  }
  return out;
}

export function chaptersInRange(subject: CatalogSubject, from: number, to: number): CatalogChapter[] {
  return subject.chapters.filter((chapter) => chapter.sequence >= from && chapter.sequence <= to);
}
