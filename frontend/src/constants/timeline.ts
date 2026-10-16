import type { ChipTone } from '@/components/ui/chip';
import { PLAYGROUND_BASE } from '@/constants/playground';
import type { HueName } from '@/styles/theme';

export const TIMELINE_ROUTE_KEY = 'learning-timeline';

export const TIMELINE_TOOL_ID = 'timeline';

export const TIMELINE_SOURCES = {
  events: { src: `${PLAYGROUND_BASE}/data/timeline-events.js`, global: 'TIMELINE_EVENTS' },
  curriculum: { src: `${PLAYGROUND_BASE}/data/curriculum.js`, global: 'CURRICULUM' },
  context: { src: (code: string) => `${PLAYGROUND_BASE}/data/history/${code}.js`, global: 'TL_CTX' },
} as const;

export const TIMELINE_PARAMS = { class: 'class', chapter: 'chapter', query: 'q', event: 'event' } as const;

export const TIMELINE_CLASSES = [6, 7, 8, 9, 10, 11, 12] as const;

export const TIMELINE_ERAS = [
  { label: 'Ancient', from: -3500, to: -200 },
  { label: 'Classical', from: -200, to: 1200 },
  { label: 'Medieval', from: 1200, to: 1750 },
  { label: 'Colonial', from: 1750, to: 1947 },
  { label: 'Modern', from: 1900, to: 2030 },
] as const;

export const TIMELINE_REGIONS = [
  'South Asia',
  'West Asia',
  'Central Asia',
  'East Asia',
  'Southeast Asia',
  'Europe',
  'Africa',
  'Americas',
  'Oceania',
  'World',
] as const;

export const REGION_COLOURS: Readonly<Record<string, { hue: HueName; tone: ChipTone }>> = {
  'South Asia': { hue: 'coral', tone: 'coral' },
  'West Asia': { hue: 'gold', tone: 'amber' },
  'Central Asia': { hue: 'rose', tone: 'rose' },
  'East Asia': { hue: 'green', tone: 'green' },
  'Southeast Asia': { hue: 'teal', tone: 'teal' },
  Europe: { hue: 'blue', tone: 'blue' },
  Africa: { hue: 'lilac', tone: 'lilac' },
  Americas: { hue: 'violet', tone: 'violet' },
  Oceania: { hue: 'indigo', tone: 'indigo' },
};

export const OTHER_REGION_TONE: ChipTone = 'grey';

export const TIMELINE_MEANWHILE = { years: 100, count: 6 } as const;

export const TIMELINE_SEARCH_LIMIT = 250;
