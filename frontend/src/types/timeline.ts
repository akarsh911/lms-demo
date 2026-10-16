export interface TimelineEvent {
  index: number;
  id: string;
  code: string;
  cls: number;
  book: string;
  chapter: number | null;
  chapterTitle: string;
  page: number | null;
  year: number;
  yearEnd: number | null;
  approx: boolean;
  label: string;
  quote: string;
  pdf: string | null;
  place: string | null;
  lat: number | null;
  lon: number | null;
  region: string;
  themes: readonly string[];
  note: string | null;
  fromPage: boolean;
}

export interface TimelineChapter {
  key: string;
  code: string;
  cls: number;
  book: string;
  chapter: number | null;
  title: string;
  count: number;
  from: number;
  to: number;
  region: string;
}

export interface TimelineView {
  from: number;
  to: number;
}

export interface TimelineBounds {
  earliest: number;
  latest: number;
}

export interface TimelineFilter {
  cls: number | null;
  chapter: string | null;
  theme: string | null;
  region: string | null;
  query: string;
}

export interface TimelineData {
  events: readonly TimelineEvent[];
  chapterPages: ReadonlyMap<string, string>;
}

export type TimelineContext = Readonly<Record<string, string>>;
