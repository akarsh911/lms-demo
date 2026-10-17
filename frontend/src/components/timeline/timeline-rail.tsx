'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';

import { TIMELINE_SEARCH_LIMIT } from '@/constants/timeline';
import { bookName, chapterKey, inDateOrder, isOtherClass, rowYear, shortTitle, yearLabel } from '@/lib/timeline/model';
import type { TimelineChapter, TimelineEvent, TimelineFilter } from '@/types/timeline';

import { useRegionColour } from './region-colour';

function EventRow({
  event,
  current,
  dimmed,
  withChapter,
  onSelect,
}: {
  event: TimelineEvent;
  current: boolean;
  dimmed: boolean;
  withChapter: boolean;
  onSelect: (event: TimelineEvent) => void;
}): React.ReactElement {
  const colour = useRegionColour();
  return (
    <ButtonBase
      data-current={current ? 'true' : undefined}
      aria-current={current ? 'true' : undefined}
      onClick={() => onSelect(event)}
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: '76px minmax(0, 1fr)',
        columnGap: 1.25,
        width: '100%',
        textAlign: 'left',
        alignItems: 'start',
        py: 0.75,
        pl: 1,
        pr: 1.25,
        borderRadius: `${theme.band.radius.sm}px`,
        borderLeft: `3px solid ${current ? colour(event.region) : 'transparent'}`,
        backgroundColor: current ? theme.brand.sunken : 'transparent',
        opacity: dimmed ? 0.6 : 1,
        '&:hover': { backgroundColor: theme.brand.subtle },
        '&.Mui-focusVisible': { outline: `2px solid ${theme.brand.accent}`, outlineOffset: -2 },
      })}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textAlign: 'right', pt: 0.25, fontVariantNumeric: 'tabular-nums' }}>
        {rowYear(event)}
      </Typography>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: current ? 600 : 400 }}>
          {event.label}
        </Typography>
        {withChapter ? (
          <Typography variant="caption" color="text.secondary" component="p">
            Class {event.cls} · Ch {event.chapter ?? '—'} {shortTitle(event.chapterTitle)}
          </Typography>
        ) : null}
      </Box>
    </ButtonBase>
  );
}

function ChapterButton({ chapter, open, onToggle }: { chapter: TimelineChapter; open: boolean; onToggle: () => void }): React.ReactElement {
  const colour = useRegionColour();
  const tone = colour(chapter.region);
  return (
    <ButtonBase
      aria-expanded={open}
      onClick={onToggle}
      sx={(theme) => ({
        display: 'flex',
        gap: 1.25,
        alignItems: 'center',
        width: '100%',
        textAlign: 'left',
        px: 1.25,
        py: 1,
        borderRadius: `${theme.band.radius.sm}px`,
        borderLeft: `3px solid ${tone}`,
        backgroundColor: open ? theme.tints.orange : 'transparent',
        '&:hover': { backgroundColor: open ? theme.tints.orange : theme.brand.subtle },
        '&.Mui-focusVisible': { outline: `2px solid ${theme.brand.accent}`, outlineOffset: -2 },
      })}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, minWidth: 34, fontVariantNumeric: 'tabular-nums' }}>
        {chapter.chapter ? `Ch ${chapter.chapter}` : '—'}
      </Typography>
      <Typography variant="body2" sx={{ flex: 1, fontWeight: open ? 600 : 500 }}>
        {shortTitle(chapter.title)}
      </Typography>
      <Box
        component="span"
        sx={(theme) => ({
          flex: 'none',
          px: 1,
          borderRadius: '999px',
          fontSize: 11,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          backgroundColor: theme.tints.grey,
          color: theme.onTint.grey,
        })}
      >
        {chapter.count}
      </Box>
    </ButtonBase>
  );
}

function Heading({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Typography variant="eyebrow" component="h3" color="text.secondary" sx={{ display: 'block', px: 1.25, pt: 1, pb: 0.75 }}>
      {children}
    </Typography>
  );
}

export function TimelineRail({
  events,
  shown,
  chapters,
  filter,
  selected,
  onChapter,
  onSelect,
}: {
  events: readonly TimelineEvent[];
  shown: readonly TimelineEvent[];
  chapters: readonly TimelineChapter[];
  filter: TimelineFilter;
  selected: TimelineEvent | null;
  onChapter: (key: string) => void;
  onSelect: (event: TimelineEvent) => void;
}): React.ReactElement {
  const railRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const rail = railRef.current;
    const row = rail?.querySelector<HTMLElement>('[data-current="true"]');
    if (!rail || !row) return;
    const outer = rail.getBoundingClientRect();
    const inner = row.getBoundingClientRect();
    if (inner.top < outer.top + 6 || inner.bottom > outer.bottom - 6) {
      rail.scrollTop += inner.top - outer.top - rail.clientHeight / 3;
    }
  }, [selected, filter.chapter]);

  const searching = filter.query.trim() !== '';
  let body: React.ReactNode;
  if (searching) {
    const list = inDateOrder(shown);
    body = (
      <>
        <Heading>Matches, in date order</Heading>
        {list.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1.25 }}>
            No event in these books says that. Try a shorter word: a person, a place or a treaty.
          </Typography>
        ) : (
          list.slice(0, TIMELINE_SEARCH_LIMIT).map((event) => (
            <EventRow
              key={event.index}
              event={event}
              current={selected?.index === event.index}
              dimmed={isOtherClass(event, filter)}
              withChapter
              onSelect={onSelect}
            />
          ))
        )}
        {list.length > TIMELINE_SEARCH_LIMIT ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1.25, pt: 1 }}>
            And {list.length - TIMELINE_SEARCH_LIMIT} more. Add a word to narrow it.
          </Typography>
        ) : null}
      </>
    );
  } else if (chapters.length === 0) {
    body = (
      <>
        <Heading>Chapters</Heading>
        <Typography variant="body2" color="text.secondary" sx={{ px: 1.25 }}>
          This class has no dated history chapters.
        </Typography>
      </>
    );
  } else {
    body = (
      <>
        <Heading>{filter.cls === null ? 'Every chapter, Classes 6 to 12' : `Class ${filter.cls} chapters`}</Heading>
        {chapters.map((chapter, position) => {
          const open = filter.chapter === chapter.key;
          const newBook = position === 0 || chapters[position - 1]?.book !== chapter.book;
          const members = open ? inDateOrder(events.filter((event) => chapterKey(event) === chapter.key)) : [];
          return (
            <React.Fragment key={chapter.key}>
              {newBook ? (
                <Typography variant="caption" component="h4" color="text.secondary" sx={{ display: 'block', fontWeight: 700, px: 1.25, pt: position === 0 ? 0.5 : 1.5, pb: 0.5 }}>
                  {filter.cls === null ? `Class ${chapter.cls} · ` : ''}
                  {bookName(chapter.book)}
                </Typography>
              ) : null}
              <ChapterButton chapter={chapter} open={open} onToggle={() => onChapter(chapter.key)} />
              {open ? (
                <Box sx={{ pl: 3, pb: 1 }}>
                  <Typography variant="caption" color="text.secondary" component="p" sx={{ px: 1.25, py: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                    {yearLabel(chapter.from)} to {yearLabel(chapter.to)}
                  </Typography>
                  {members.map((event) => (
                    <EventRow
                      key={event.index}
                      event={event}
                      current={selected?.index === event.index}
                      dimmed={false}
                      withChapter={false}
                      onSelect={onSelect}
                    />
                  ))}
                </Box>
              ) : null}
            </React.Fragment>
          );
        })}
      </>
    );
  }

  return (
    <Box
      component="nav"
      ref={railRef}
      aria-label={searching ? 'Search matches' : 'Chapters'}
      sx={(theme) => ({
        minHeight: 0,
        flex: { lg: '1 1 0' },
        maxHeight: { xs: 480, lg: 'none' },
        overflowY: 'auto',
        scrollbarGutter: 'stable',
        p: 1,
        border: `1px solid ${theme.brand.line}`,
        borderRadius: `${theme.band.radius.md}px`,
        backgroundColor: theme.brand.surface,
      })}
    >
      {body}
    </Box>
  );
}
