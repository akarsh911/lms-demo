import { TIMELINE_SOURCES } from '@/constants/timeline';
import { parseChapterPages, parseTimelineContext, parseTimelineEvents } from '@/lib/timeline/parse';
import type { TimelineContext, TimelineData } from '@/types/timeline';

const requested = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const pending = requested.get(src);
  if (pending) return pending;
  const loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      requested.delete(src);
      script.remove();
      reject(new Error(`${src} did not load. Run npm run sync:playground.`));
    };
    document.head.appendChild(script);
  });
  requested.set(src, loading);
  return loading;
}

function globalNamed(name: string): unknown {
  return (window as unknown as Record<string, unknown>)[name];
}

export const timelineService = {
  data: async (): Promise<TimelineData> => {
    await Promise.all([loadScript(TIMELINE_SOURCES.events.src), loadScript(TIMELINE_SOURCES.curriculum.src)]);
    const events = parseTimelineEvents(globalNamed(TIMELINE_SOURCES.events.global));
    if (events.length === 0) throw new Error('The timeline data holds no events in the shape the history build writes.');
    return { events, chapterPages: parseChapterPages(globalNamed(TIMELINE_SOURCES.curriculum.global)) };
  },
  context: async (code: string): Promise<TimelineContext> => {
    await loadScript(TIMELINE_SOURCES.context.src(code));
    return parseTimelineContext(globalNamed(TIMELINE_SOURCES.context.global));
  },
};
