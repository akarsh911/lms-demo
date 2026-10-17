import type { TimelineContext, TimelineEvent } from '@/types/timeline';

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseEvent(value: unknown, index: number): TimelineEvent | null {
  if (!isFields(value)) return null;
  const id = text(value.id);
  const code = text(value.code);
  const cls = number(value.cls);
  const year = number(value.year);
  const label = text(value.label);
  const quote = text(value.quote);
  const chapterTitle = text(value.chapter_title);
  if (!id || !code || cls === null || year === null || !label || !quote || !chapterTitle) return null;
  const lat = number(value.lat);
  const lon = number(value.lon);
  return {
    index,
    id,
    code,
    cls,
    book: text(value.book) ?? '',
    chapter: number(value.chapter),
    chapterTitle,
    page: number(value.page),
    year,
    yearEnd: number(value.year_end),
    approx: value.approx === true,
    label,
    quote,
    pdf: text(value.pdf),
    place: text(value.place),
    lat: lat !== null && lon !== null ? lat : null,
    lon: lat !== null && lon !== null ? lon : null,
    region: text(value.region) ?? 'World',
    themes: Array.isArray(value.themes) ? value.themes.filter((t): t is string => typeof t === 'string') : [],
    note: text(value.note),
    fromPage: value.src === 'page',
  };
}

export function parseTimelineEvents(value: unknown): TimelineEvent[] {
  if (!Array.isArray(value)) return [];
  const events: TimelineEvent[] = [];
  for (const raw of value) {
    const event = parseEvent(raw, events.length);
    if (event) events.push(event);
  }
  return events;
}

function chapterPageKey(cls: number, title: string): string {
  return `${cls}|${title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
}

export function chapterPageOf(pages: ReadonlyMap<string, string>, cls: number, title: string): string | null {
  return pages.get(chapterPageKey(cls, title)) ?? null;
}

function pagePath(value: unknown): string | null {
  if (typeof value === 'string') return text(value);
  return isFields(value) ? text(value.p) : null;
}

export function parseChapterPages(value: unknown): Map<string, string> {
  const pages = new Map<string, string>();
  if (!isFields(value) || !Array.isArray(value.classes)) return pages;
  for (const grade of value.classes) {
    if (!isFields(grade) || !Array.isArray(grade.subjects)) continue;
    const cls = number(grade.cls);
    if (cls === null) continue;
    for (const subject of grade.subjects) {
      if (!isFields(subject) || !Array.isArray(subject.books)) continue;
      for (const book of subject.books) {
        if (!isFields(book) || !Array.isArray(book.chapters)) continue;
        for (const chapter of book.chapters) {
          if (!isFields(chapter) || !Array.isArray(chapter.pages)) continue;
          const title = text(chapter.title);
          if (!title) continue;
          for (const page of chapter.pages) {
            const path = pagePath(page);
            if (path) pages.set(chapterPageKey(cls, title), path);
          }
        }
      }
    }
  }
  return pages;
}

export function parseTimelineContext(value: unknown): TimelineContext {
  if (!isFields(value)) return {};
  const context: Record<string, string> = {};
  for (const [id, passage] of Object.entries(value)) {
    if (typeof passage === 'string') context[id] = passage;
  }
  return context;
}
