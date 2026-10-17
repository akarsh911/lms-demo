'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { ArrowLeft } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { WidgetFrame, useWidgetFrame } from '@/components/widgets/widget-frame';
import { PLAYGROUND_PARAMS } from '@/constants/playground';
import { SCOPE_PARAMS } from '@/components/learning-scope/use-scope-url';
import { TIMELINE_CLASSES, TIMELINE_PARAMS, TIMELINE_REGIONS } from '@/constants/timeline';
import { bandOfClass, pageIn } from '@/lib/playground/manifest';
import {
  bookName,
  boundsOf,
  chapterKey,
  chapterView,
  chaptersOf,
  clampView,
  fitView,
  framing,
  inDateOrder,
  inView,
  isOtherClass,
  matches,
  meanwhile,
  nearestTo,
  parseYear,
  yearLabel,
  timelineClass,
  yearView,
} from '@/lib/timeline/model';
import { chapterPageOf } from '@/lib/timeline/parse';
import type { PlaygroundManifest } from '@/types/playground';
import type { TimelineData, TimelineEvent, TimelineFilter, TimelineView } from '@/types/timeline';

import { TimelineEventPanel, type PlayLink } from './timeline-event';
import { TimelineRail } from './timeline-rail';
import { TimelineRibbon } from './timeline-ribbon';

const EVERY = 'all';
const STEP_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'Home', 'End']);
const TYPING = 'input, textarea, select, [role="combobox"], [role="listbox"], [role="option"]';
const WIDE_VIEW: TimelineView = { from: -3500, to: 2030 };

interface StartState {
  filter: TimelineFilter;
  search: string;
  selected: number | null;
  view: TimelineView;
}

function startFrom(data: TimelineData, cls: number | null, params: URLSearchParams): StartState {
  const { events } = data;
  const bounds = boundsOf(events);
  const search = params.get(TIMELINE_PARAMS.query) ?? '';
  const asked = params.get(TIMELINE_PARAMS.chapter);
  const known = asked !== null && events.some((event) => chapterKey(event) === asked && (cls === null || event.cls === cls)) ? asked : null;
  const chapter = known ?? (cls !== null && search === '' ? (chaptersOf(events, cls)[0]?.key ?? null) : null);
  const filter: TimelineFilter = { cls, chapter, theme: null, region: null, query: search };
  const shown = events.filter((event) => matches(event, filter));
  const wanted = params.get(TIMELINE_PARAMS.event);
  const named = wanted ? shown.find((event) => event.id === wanted) : undefined;
  const first = chapter !== null ? inDateOrder(shown)[0] : undefined;
  const selected = named ?? first ?? null;
  const base = (chapter !== null ? chapterView(events, chapter, bounds) : fitView(shown, bounds)) ?? clampView(WIDE_VIEW, bounds);
  return { filter, search, selected: selected?.index ?? null, view: selected ? framing(base, selected, bounds) : base };
}

function playLinkOf(
  event: TimelineEvent,
  data: TimelineData,
  manifest: PlaygroundManifest | undefined,
  playgroundHref: string | null,
): PlayLink | null {
  if (!manifest || !playgroundHref) return null;
  const [threadId, bandId] = (chapterPageOf(data.chapterPages, event.cls, event.chapterTitle) ?? '').split('/');
  const thread = manifest.threads.find((candidate) => candidate.id === threadId);
  const band = manifest.bands.find((candidate) => candidate.id === bandId);
  const page = thread && band ? pageIn(thread, band.id) : null;
  if (!thread || !band || !page) return null;
  const cls = band.classes.includes(event.cls) ? event.cls : band.classes[0];
  if (cls === undefined || bandOfClass(manifest, cls)?.id !== band.id) return null;
  const query = new URLSearchParams({ [PLAYGROUND_PARAMS.class]: String(cls), [PLAYGROUND_PARAMS.thread]: thread.id });
  return { href: `${playgroundHref}?${query.toString()}`, title: page.title };
}

function heading(
  filter: TimelineFilter,
  shown: readonly TimelineEvent[],
  data: TimelineData,
): { title: string; eyebrow: string } {
  const count = `${shown.length} ${shown.length === 1 ? 'event' : 'events'}`;
  if (filter.query.trim() !== '') return { title: `“${filter.query.trim()}”`, eyebrow: `Search · ${count}, every class` };
  const chapter = filter.chapter !== null ? chaptersOf(data.events, null).find((c) => c.key === filter.chapter) : undefined;
  if (chapter) {
    return {
      title: `${chapter.chapter ? `Chapter ${chapter.chapter} · ` : ''}${chapter.title}`,
      eyebrow: `Class ${chapter.cls} · ${bookName(chapter.book)} · ${count}`,
    };
  }
  const chapters = new Set(shown.map(chapterKey)).size;
  return {
    title: filter.cls === null ? 'History, Classes 6 to 12' : `Class ${filter.cls} history`,
    eyebrow: `Timeline · ${count} across ${chapters} ${chapters === 1 ? 'chapter' : 'chapters'}`,
  };
}

function Filters({
  data,
  filter,
  onClass,
  onTheme,
  onRegion,
}: {
  data: TimelineData;
  filter: TimelineFilter;
  onClass: ((cls: number | null) => void) | null;
  onTheme: (theme: string | null) => void;
  onRegion: (region: string | null) => void;
}): React.ReactElement {
  const { container } = useWidgetFrame();
  const menu = { MenuProps: { container, slotProps: { paper: { sx: { maxHeight: 420 } } } } };
  const themes = React.useMemo(() => [...new Set(data.events.flatMap((event) => event.themes))].sort(), [data.events]);
  const regions = TIMELINE_REGIONS.filter((region) => data.events.some((event) => event.region === region));

  return (
    <>
      {onClass ? (
        <TextField
          select
          size="small"
          label="Class"
          value={filter.cls === null ? EVERY : String(filter.cls)}
          onChange={(event) => onClass(event.target.value === EVERY ? null : Number(event.target.value))}
          sx={{ minWidth: 140 }}
          slotProps={{ select: menu }}
        >
          <MenuItem value={EVERY}>Every class</MenuItem>
          {TIMELINE_CLASSES.map((cls) => (
            <MenuItem key={cls} value={String(cls)}>
              Class {cls}
            </MenuItem>
          ))}
        </TextField>
      ) : null}
      <TextField
        select
        size="small"
        label="Region"
        value={filter.region ?? EVERY}
        onChange={(event) => onRegion(event.target.value === EVERY ? null : event.target.value)}
        sx={{ minWidth: 160 }}
        slotProps={{ select: menu }}
      >
        <MenuItem value={EVERY}>Every region</MenuItem>
        {regions.map((region) => (
          <MenuItem key={region} value={region}>
            {region}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label="Theme"
        value={filter.theme ?? EVERY}
        onChange={(event) => onTheme(event.target.value === EVERY ? null : event.target.value)}
        sx={{ minWidth: 160 }}
        slotProps={{ select: menu }}
      >
        <MenuItem value={EVERY}>Every theme</MenuItem>
        {themes.map((theme) => (
          <MenuItem key={theme} value={theme} sx={{ textTransform: 'capitalize' }}>
            {theme.replace(/-/g, ' ')}
          </MenuItem>
        ))}
      </TextField>
    </>
  );
}

export function TimelineViewer({
  data,
  grade,
  manifest,
  playgroundHref,
}: {
  data: TimelineData;
  grade: number | null;
  manifest: PlaygroundManifest | undefined;
  playgroundHref: string | null;
}): React.ReactElement {
  const params = useSearchParams();
  const { events } = data;
  const bounds = React.useMemo(() => boundsOf(events), [events]);
  const [start] = React.useState(() => startFrom(data, grade ?? timelineClass(params.get(TIMELINE_PARAMS.class)), new URLSearchParams(params)));
  const [filter, setFilter] = React.useState<TimelineFilter>(start.filter);
  const [search, setSearch] = React.useState(start.search);
  const [view, setView] = React.useState<TimelineView>(start.view);
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(start.selected);
  const [bigMap, setBigMap] = React.useState(false);

  const typedYear = parseYear(search);
  const query = typedYear === null ? search : '';
  const active = React.useMemo<TimelineFilter>(() => ({ ...filter, query }), [filter, query]);
  const shown = React.useMemo(() => events.filter((event) => matches(event, active)), [events, active]);
  const ordered = React.useMemo(() => inDateOrder(shown), [shown]);
  const chapters = React.useMemo(() => chaptersOf(events, filter.cls), [events, filter.cls]);
  const selected = selectedIndex !== null ? (events[selectedIndex] ?? null) : null;
  const visible = inView(shown, view);
  const position = selected ? ordered.findIndex((event) => event.index === selected.index) : -1;

  React.useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const put = (key: string, value: string | null): void => {
      if (value === null || value === '') query.delete(key);
      else query.set(key, value);
    };
    const cls = filter.cls === null ? null : String(filter.cls);
    put(TIMELINE_PARAMS.class, grade === null ? cls : null);
    put(SCOPE_PARAMS.grade, grade === null ? null : cls);
    put(TIMELINE_PARAMS.chapter, filter.chapter);
    put(TIMELINE_PARAMS.query, typedYear === null ? search.trim() : null);
    put(TIMELINE_PARAMS.event, selected?.id ?? null);
    const next = query.toString();
    window.history.replaceState(window.history.state, '', next ? `${window.location.pathname}?${next}` : window.location.pathname);
  }, [grade, filter.cls, filter.chapter, search, typedYear, selected?.id]);

  const select = (event: TimelineEvent): void => {
    setView((current) => framing(current, event, bounds));
    setSelectedIndex(event.index);
  };

  const step = (direction: 1 | -1 | 'first' | 'last'): void => {
    if (ordered.length === 0) return;
    const at = position;
    const target =
      direction === 'first'
        ? 0
        : direction === 'last'
          ? ordered.length - 1
          : at < 0
            ? direction > 0
              ? 0
              : ordered.length - 1
            : Math.min(ordered.length - 1, Math.max(0, at + direction));
    const event = ordered[target];
    if (event) select(event);
  };

  const narrow = (next: TimelineFilter, nextSearch: string): void => {
    const year = parseYear(nextSearch);
    const matched = events.filter((event) => matches(event, { ...next, query: year === null ? nextSearch : '' }));
    setFilter(next);
    setSearch(nextSearch);
    const fitted = year === null ? fitView(matched, bounds) : null;
    if (fitted) setView(fitted);
    if (selected && !matched.includes(selected)) setSelectedIndex(null);
  };

  const chooseClass = (cls: number | null): void => {
    narrow({ ...filter, cls, chapter: null }, search);
    setSelectedIndex(null);
  };

  const reveal = (event: TimelineEvent): void => {
    if (!shown.includes(event)) {
      setFilter({ ...filter, chapter: null, theme: null, region: null });
      setSearch('');
    }
    select(event);
  };

  const toggleChapter = (key: string): void => {
    if (filter.chapter === key) {
      setFilter({ ...filter, chapter: null });
      return;
    }
    setFilter({ ...filter, chapter: key });
    const framed = chapterView(events, key, bounds);
    if (framed) setView(framed);
    const first = inDateOrder(events.filter((event) => chapterKey(event) === key))[0];
    setSelectedIndex(first?.index ?? null);
  };

  const openCluster = (members: readonly TimelineEvent[]): void => {
    const years = members.map((event) => event.year);
    const low = Math.min(...years);
    const high = Math.max(...years);
    const pad = Math.max(2, (high - low) * 0.6 + 2);
    setView(clampView({ from: low - pad, to: high + pad }, bounds));
    const first = members[0];
    if (first) setSelectedIndex(first.index);
  };

  const goToYear = (submit: React.FormEvent<HTMLFormElement>): void => {
    submit.preventDefault();
    if (typedYear === null) return;
    const next: TimelineFilter = { ...filter, chapter: null };
    setFilter(next);
    setSearch('');
    const target = yearView(view, typedYear, bounds);
    setView(target);
    const nearest = nearestTo(events.filter((event) => matches(event, { ...next, query: '' })), typedYear);
    setSelectedIndex(nearest?.index ?? null);
  };

  const fit = (): void => {
    const fitted = fitView(shown, bounds);
    if (fitted) setView(fitted);
  };

  const keys = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (!STEP_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest(TYPING)) return;
    event.preventDefault();
    if (event.key === 'ArrowRight') step(1);
    else if (event.key === 'ArrowLeft') step(-1);
    else if (event.key === 'Home') step('first');
    else step('last');
  };

  const head = heading(active, shown, data);
  const searching = active.query.trim() !== '';
  const back =
    !searching && filter.chapter !== null ? (
    <Button variant="outlined" size="small" startIcon={<ArrowLeft size={16} />} onClick={() => setFilter({ ...filter, chapter: null })}>
      All chapters
    </Button>
  ) : null;

  return (
    <WidgetFrame title={head.title} eyebrow={head.eyebrow} actions={back} bodySx={{ backgroundColor: (t) => t.brand.canvas }}>
      <Box
        onKeyDown={keys}
        sx={{
          height: '100%',
          display: 'grid',
          gap: 2,
          p: { xs: 1.5, md: 2.5 },
          overflow: { md: 'auto', lg: 'hidden' },
          alignContent: 'start',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(400px, 44%)' },
          gridTemplateRows: { lg: 'auto minmax(0, 1fr)' },
          gridTemplateAreas: { xs: '"tools" "main" "detail"', lg: '"tools tools" "main detail"' },
        }}
      >
        <Box sx={{ gridArea: 'tools', minWidth: 0 }}>
          <CardToolbar
            start={
              <Box component="form" role="search" onSubmit={goToYear} sx={{ display: 'contents' }}>
                <SearchField label="Search, or type a year" value={search} onChange={(value) => narrow(filter, value)} width={300} />
              </Box>
            }
            summary={typedYear !== null ? `Press Enter to go to ${yearLabel(typedYear)}` : null}
          >
            <Filters
              data={data}
              filter={filter}
              onClass={grade === null ? chooseClass : null}
              onTheme={(theme) => narrow({ ...filter, theme }, search)}
              onRegion={(region) => narrow({ ...filter, region }, search)}
            />
          </CardToolbar>
        </Box>

        <Box sx={{ gridArea: 'main', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, minHeight: 0 }}>
          <TimelineRibbon
            events={shown}
            view={view}
            bounds={bounds}
            selected={selected}
            showEras={!searching && filter.chapter === null}
            isOther={(event) => isOtherClass(event, active)}
            onView={setView}
            onFit={fit}
            onSelect={select}
            onCluster={openCluster}
          />
          <TimelineRail
            events={events}
            shown={shown}
            chapters={chapters}
            filter={active}
            selected={selected}
            onChapter={toggleChapter}
            onSelect={select}
          />
        </Box>

        <Box sx={{ gridArea: 'detail', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          {selected ? (
            <TimelineEventPanel
              key={selected.index}
              event={selected}
              position={position}
              total={ordered.length}
              inViewEvents={visible}
              meanwhile={meanwhile(events, selected, filter.cls)}
              play={playLinkOf(selected, data, manifest, playgroundHref)}
              bigMap={bigMap}
              onBigMap={setBigMap}
              onStep={step}
              onSelect={reveal}
            />
          ) : (
            <Box
              sx={(theme) => ({
                border: `1px solid ${theme.brand.line}`,
                borderRadius: `${theme.band.radius.md}px`,
                backgroundColor: theme.brand.surface,
              })}
            >
              <EmptyState
                title="Pick a chapter, or any dot on the line"
                body={`A chapter opens its events in the order the book tells them, each in the textbook’s own words. The arrow keys step through all ${shown.length} events here, in date order.`}
              />
            </Box>
          )}
        </Box>
      </Box>
    </WidgetFrame>
  );
}
