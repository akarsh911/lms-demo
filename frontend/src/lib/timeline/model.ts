import { TIMELINE_CLASSES, TIMELINE_MEANWHILE } from '@/constants/timeline';
import type {
  TimelineBounds,
  TimelineChapter,
  TimelineEvent,
  TimelineFilter,
  TimelineView,
} from '@/types/timeline';

export const NOW = new Date().getFullYear();

const SPAN_MIN = 10;
const BEFORE_EARLIEST = 100;
const AFTER_LATEST = 60;
const TICK_STEPS = [
  1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000,
  1e6, 2e6, 5e6,
];

const astronomical = (year: number): number => (year < 0 ? year + 1 : year);

export function yearsBetween(a: number, b: number): number {
  return astronomical(b) - astronomical(a);
}

export function endOf(event: TimelineEvent): number {
  return event.yearEnd ?? event.year;
}

export function lasts(event: TimelineEvent): boolean {
  return event.yearEnd !== null && event.yearEnd !== event.year;
}

export function yearLabel(year: number, brief = false): string {
  if (year <= -100000) return `${(Math.abs(yearsBetween(year, NOW)) / 1e6).toFixed(1)} million years ago`;
  if (year <= -10000) return `${(Math.abs(yearsBetween(year, NOW)) / 1000).toFixed(0)} 000 years ago`;
  if (year < 0) return brief ? String(-year) : `${-year} BCE`;
  return brief ? String(year) : `${year} CE`;
}

export function overviewLabel(year: number): string {
  const ago = Math.abs(yearsBetween(year, NOW));
  if (year <= -1e6) return `${Math.round(ago / 1e6)}M years ago`;
  if (year <= -10000) return `${Math.round(ago / 10000) * 10}k years ago`;
  return yearLabel(year);
}

export function shortYear(year: number): string {
  return year < 0 && year > -10000 ? `${-year} BCE` : yearLabel(year, true);
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${n % 10 > 3 ? 'th' : suffix}`;
}

function centuriesOf(event: TimelineEvent): { first: number; last: number; era: 'CE' | 'BCE' } | null {
  const end = event.yearEnd;
  if (end === null || end <= event.year) return null;
  if (event.year > 0 && event.year % 100 === 1 && end % 100 === 0) {
    return { first: (event.year - 1) / 100 + 1, last: end / 100, era: 'CE' };
  }
  if (end < 0 && -event.year % 100 === 0 && (-end - 1) % 100 === 0) {
    return { first: -event.year / 100, last: (-end - 1) / 100 + 1, era: 'BCE' };
  }
  return null;
}

function centuryLabel(event: TimelineEvent): string | null {
  const span = centuriesOf(event);
  if (!span) return null;
  const range = span.first === span.last ? ordinal(span.first) : `${ordinal(span.first)}–${ordinal(span.last)}`;
  return `${range} century ${span.era}`;
}

export function rowYear(event: TimelineEvent): string {
  const span = centuriesOf(event);
  if (!span) return shortYear(event.year);
  return `${ordinal(span.first)} c.${span.era === 'BCE' ? ' BCE' : ''}`;
}

export function whenLabel(event: TimelineEvent): string {
  const about = event.approx ? 'about ' : '';
  const century = centuryLabel(event);
  if (century) return `${event.approx ? 'about the ' : 'the '}${century}`;
  if (event.yearEnd === null || event.yearEnd === event.year) return `${about}${yearLabel(event.year)}`;
  const start = yearLabel(event.year);
  const end = yearLabel(event.yearEnd);
  const span = Math.abs(yearsBetween(event.year, event.yearEnd));
  const shared = start.replace(/ (BCE|CE)$/, (era: string, name: string) => (end.includes(name) ? '' : era));
  return `${about}${shared} to ${end} (${span} year${span === 1 ? '' : 's'})`;
}

export function boundsOf(events: readonly TimelineEvent[]): TimelineBounds {
  if (events.length === 0) return { earliest: -3500, latest: NOW };
  return {
    earliest: Math.min(...events.map((event) => event.year)),
    latest: Math.max(NOW, ...events.map(endOf)),
  };
}

export function clampView(view: TimelineView, bounds: TimelineBounds): TimelineView {
  const widest = yearsBetween(bounds.earliest, bounds.latest) + BEFORE_EARLIEST * 2;
  const span = Math.max(SPAN_MIN, Math.min(view.to - view.from, widest));
  let from = view.from;
  let to = from + span;
  if (from < bounds.earliest - BEFORE_EARLIEST) {
    from = bounds.earliest - BEFORE_EARLIEST;
    to = from + span;
  }
  if (to > bounds.latest + AFTER_LATEST) {
    to = bounds.latest + AFTER_LATEST;
    from = to - span;
  }
  return { from, to };
}

export function deepTime(bounds: TimelineBounds): TimelineView {
  return { from: bounds.earliest - BEFORE_EARLIEST, to: bounds.latest + AFTER_LATEST };
}

export function zoomAt(view: TimelineView, year: number, factor: number, bounds: TimelineBounds): TimelineView {
  const span = (view.to - view.from) * factor;
  const along = (year - view.from) / (view.to - view.from);
  const from = year - along * span;
  return clampView({ from, to: from + span }, bounds);
}

export function panBy(view: TimelineView, years: number, bounds: TimelineBounds): TimelineView {
  return clampView({ from: view.from + years, to: view.to + years }, bounds);
}

export function centredOn(view: TimelineView, year: number, bounds: TimelineBounds): TimelineView {
  const span = view.to - view.from;
  return clampView({ from: year - span / 2, to: year + span / 2 }, bounds);
}

export function framing(view: TimelineView, event: TimelineEvent, bounds: TimelineBounds): TimelineView {
  if (event.year >= view.from && endOf(event) <= view.to) return view;
  return centredOn(view, (event.year + endOf(event)) / 2, bounds);
}

export function ticks(from: number, to: number, want: number): { step: number; years: number[] } {
  const raw = (to - from) / want;
  const step = TICK_STEPS.find((candidate) => candidate >= raw) ?? TICK_STEPS[TICK_STEPS.length - 1] ?? 1;
  const years: number[] = [];
  for (let year = Math.ceil(from / step) * step; year <= to; year += step) {
    years.push(year === 0 ? 1 : year);
  }
  return { step, years };
}

export function cluster<T>(items: readonly T[], xOf: (item: T) => number, px: number): { x: number; items: T[] }[] {
  const byCell = new Map<number, T[]>();
  for (const item of items) {
    const cell = Math.round(xOf(item) / px);
    byCell.set(cell, [...(byCell.get(cell) ?? []), item]);
  }
  return [...byCell.entries()].sort((a, b) => a[0] - b[0]).map(([cell, members]) => ({ x: cell * px, items: members }));
}

export function overviewScale(bounds: TimelineBounds): { x: (year: number, width: number) => number; year: (x: number, width: number) => number } {
  const distance = (year: number): number => Math.log10(1 + Math.max(0, yearsBetween(year, NOW)));
  const furthest = distance(bounds.earliest) || 1;
  return {
    x: (year, width) => width * (1 - distance(year) / furthest),
    year: (x, width) => NOW - (10 ** ((1 - x / width) * furthest) - 1),
  };
}

export function chapterKey(event: TimelineEvent): string {
  return `${event.code}~${event.chapterTitle}`;
}

export function chaptersOf(events: readonly TimelineEvent[], cls: number | null): TimelineChapter[] {
  const byKey = new Map<string, TimelineChapter & { regions: Map<string, number> }>();
  for (const event of events) {
    if (cls !== null && event.cls !== cls) continue;
    const key = chapterKey(event);
    const found = byKey.get(key) ?? {
      key,
      code: event.code,
      cls: event.cls,
      book: event.book,
      chapter: event.chapter,
      title: event.chapterTitle,
      count: 0,
      from: event.year,
      to: endOf(event),
      region: event.region,
      regions: new Map<string, number>(),
    };
    found.count += 1;
    found.from = Math.min(found.from, event.year);
    found.to = Math.max(found.to, endOf(event));
    found.regions.set(event.region, (found.regions.get(event.region) ?? 0) + 1);
    found.region = [...found.regions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? event.region;
    byKey.set(key, found);
  }
  return [...byKey.values()]
    .map(({ regions: _regions, ...chapter }) => chapter)
    .sort(
      (a, b) =>
        a.cls - b.cls ||
        a.book.localeCompare(b.book) ||
        a.code.localeCompare(b.code) ||
        (a.chapter ?? 0) - (b.chapter ?? 0),
    );
}

export function chapterView(events: readonly TimelineEvent[], key: string, bounds: TimelineBounds): TimelineView | null {
  const members = events.filter((event) => chapterKey(event) === key);
  if (members.length === 0) return null;
  const low = Math.min(...members.map((event) => event.year));
  const high = Math.max(...members.map(endOf));
  const pad = Math.max(8, Math.abs(yearsBetween(low, high)) * 0.08 + 5);
  return clampView({ from: low - pad, to: high + pad }, bounds);
}

export function isOtherClass(event: TimelineEvent, filter: TimelineFilter): boolean {
  return filter.cls !== null && event.cls !== filter.cls;
}

export function matches(event: TimelineEvent, filter: TimelineFilter): boolean {
  const query = filter.query.trim().toLowerCase();
  if (query === '' && isOtherClass(event, filter)) return false;
  if (query === '' && filter.chapter !== null && chapterKey(event) !== filter.chapter) return false;
  if (filter.theme !== null && !event.themes.includes(filter.theme)) return false;
  if (filter.region !== null && event.region !== filter.region) return false;
  if (query === '') return true;
  return `${event.label} ${event.quote} ${event.place ?? ''} ${event.chapterTitle}`.toLowerCase().includes(query);
}

export function inDateOrder(events: readonly TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => a.year - b.year || a.index - b.index);
}

export function inView(events: readonly TimelineEvent[], view: TimelineView): TimelineEvent[] {
  return events.filter((event) => endOf(event) >= view.from && event.year <= view.to);
}

export function fitView(events: readonly TimelineEvent[], bounds: TimelineBounds): TimelineView | null {
  if (events.length === 0) return null;
  const starts = events.map((event) => event.year).sort((a, b) => a - b);
  const ends = events.map(endOf).sort((a, b) => a - b);
  let low = starts[0] ?? 0;
  let high = ends[ends.length - 1] ?? 0;
  if (starts.length >= 20) {
    const bodyLow = starts[Math.floor(starts.length * 0.03)] ?? low;
    const bodyHigh = ends[Math.ceil(ends.length * 0.97) - 1] ?? high;
    if (Math.abs(yearsBetween(low, high)) > 3 * Math.abs(yearsBetween(bodyLow, bodyHigh))) {
      low = bodyLow;
      high = bodyHigh;
    }
  }
  const pad = Math.max(6, Math.abs(yearsBetween(low, high)) * 0.06 + 4);
  return clampView({ from: low - pad, to: high + pad }, bounds);
}

export function yearView(view: TimelineView, year: number, bounds: TimelineBounds): TimelineView {
  const span = Math.max(20, Math.min(view.to - view.from, 400));
  return clampView({ from: year - span / 2, to: year + span / 2 }, bounds);
}

export function parseYear(input: string): number | null {
  const typed = input.trim().toLowerCase();
  if (!typed) return null;
  const millions = /^(-?[\d,]+(?:\.\d+)?)\s*(ma|million years ago|mya)$/.exec(typed);
  if (millions?.[1]) return Math.round(NOW - parseFloat(millions[1].replace(/,/g, '')) * 1e6);
  const ago = /^([\d,]+)\s*(?:years )?ago$/.exec(typed);
  if (ago?.[1]) return Math.round(NOW - parseFloat(ago[1].replace(/,/g, '')));
  const plain = /^(-?[\d,]+)\s*(bce|bc)?$/.exec(typed);
  if (!plain?.[1]) return null;
  const year = parseInt(plain[1].replace(/,/g, ''), 10);
  if (!Number.isFinite(year) || year === 0) return null;
  return plain[2] ? -Math.abs(year) : year;
}

export function nearestTo(events: readonly TimelineEvent[], year: number): TimelineEvent | null {
  let best: TimelineEvent | null = null;
  for (const event of events) {
    if (best === null || Math.abs(yearsBetween(event.year, year)) < Math.abs(yearsBetween(best.year, year))) best = event;
  }
  return best;
}

export function meanwhile(events: readonly TimelineEvent[], event: TimelineEvent, cls: number | null): TimelineEvent[] {
  return events
    .filter(
      (other) =>
        other.index !== event.index &&
        other.region !== event.region &&
        Math.abs(yearsBetween(other.year, event.year)) <= TIMELINE_MEANWHILE.years &&
        (cls === null || other.cls === cls),
    )
    .sort((a, b) => Math.abs(yearsBetween(a.year, event.year)) - Math.abs(yearsBetween(b.year, event.year)))
    .slice(0, TIMELINE_MEANWHILE.count);
}

export function timelineClass(raw: string | null): number | null {
  const value = Number(raw);
  return raw !== null && (TIMELINE_CLASSES as readonly number[]).includes(value) ? value : null;
}

export function shortTitle(title: string): string {
  return title.split(':')[0] ?? title;
}

export function bookName(book: string): string {
  return book.replace(/\s*\(.*$/, '');
}
