'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { ChevronLeft, ChevronRight, ExternalLink, Shapes } from 'lucide-react';
import NextLink from 'next/link';

import { EmergeChip } from '@/components/ui/chip';
import { useWidgetFrame } from '@/components/widgets/widget-frame';
import { useTimelineContext } from '@/hooks/query/use-timeline';
import { rowYear, whenLabel } from '@/lib/timeline/model';
import type { TimelineEvent } from '@/types/timeline';

import { regionTone, useRegionColour } from './region-colour';
import { TimelineMap, placed } from './timeline-map';

export interface PlayLink {
  href: string;
  title: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Box component="section">
      <Typography variant="eyebrow" component="h4" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Passage({ event }: { event: TimelineEvent }): React.ReactElement {
  const context = useTimelineContext(event.code);
  const colour = useRegionColour();
  const passage = context.data?.[event.id] ?? null;

  if (context.isPending) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
        Fetching the passage around it…
      </Typography>
    );
  }
  if (context.isError || passage === null) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
        The passage around this quote is not available.
      </Typography>
    );
  }
  const at = passage.indexOf(event.quote);
  return (
    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
      {at < 0 ? (
        passage
      ) : (
        <>
          {passage.slice(0, at)}
          <Box component="mark" sx={{ backgroundColor: alpha(colour(event.region), 0.18), color: 'text.primary', borderRadius: 0.5, px: 0.25 }}>
            {event.quote}
          </Box>
          {passage.slice(at + event.quote.length)}
        </>
      )}
    </Typography>
  );
}

export function TimelineEventPanel({
  event,
  position,
  total,
  inViewEvents,
  meanwhile,
  play,
  bigMap,
  onBigMap,
  onStep,
  onSelect,
}: {
  event: TimelineEvent;
  position: number;
  total: number;
  inViewEvents: readonly TimelineEvent[];
  meanwhile: readonly TimelineEvent[];
  play: PlayLink | null;
  bigMap: boolean;
  onBigMap: (big: boolean) => void;
  onStep: (direction: 1 | -1) => void;
  onSelect: (event: TimelineEvent) => void;
}): React.ReactElement {
  const { container } = useWidgetFrame();
  const colour = useRegionColour();
  const hue = colour(event.region);
  const mapped = placed(inViewEvents).length;
  const located = event.lat !== null;
  const mapCaption = located
    ? bigMap
      ? `${event.place ?? event.label} is marked. The other dots are ${mapped - 1} events in the years you are looking at.`
      : (event.place ?? event.label)
    : `${mapped} places in view`;

  const map = (
    <Box component="figure" sx={{ m: 0 }}>
      <TimelineMap events={inViewEvents} selected={event} onSelect={onSelect} />
      <Stack direction="row" component="figcaption" sx={{ flexWrap: 'wrap', alignItems: 'baseline', columnGap: 1, mt: 0.75 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {mapCaption}
        </Typography>
        <Link component="button" type="button" variant="caption" underline="hover" aria-pressed={bigMap} onClick={() => onBigMap(!bigMap)} sx={{ fontWeight: 700 }}>
          {bigMap ? 'Shrink the map' : 'Enlarge the map'}
        </Link>
      </Stack>
    </Box>
  );

  return (
    <Box
      component="article"
      aria-label={event.label}
      sx={(theme) => ({
        position: 'relative',
        flex: { lg: '1 1 0' },
        minHeight: 0,
        overflowY: { lg: 'auto' },
        border: `1px solid ${theme.brand.line}`,
        borderTop: `4px solid ${hue}`,
        borderRadius: `${theme.band.radius.md}px`,
        backgroundColor: theme.brand.surface,
        p: 2.5,
      })}
    >
      <Stack spacing={2.25}>
        <Stack direction="row" spacing={0.75} sx={(theme) => ({ alignItems: 'center', pb: 1.5, borderBottom: `1px solid ${theme.brand.line}` })}>
          <Tooltip title="The event before this one (left arrow)" slotProps={{ popper: { container } }}>
            <span>
              <IconButton size="small" aria-label="Previous event" disabled={position <= 0} onClick={() => onStep(-1)} sx={(theme) => ({ border: `1px solid ${theme.brand.line2}` })}>
                <ChevronLeft size={16} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="The next event (right arrow)" slotProps={{ popper: { container } }}>
            <span>
              <IconButton size="small" aria-label="Next event" disabled={position < 0 || position >= total - 1} onClick={() => onStep(1)} sx={(theme) => ({ border: `1px solid ${theme.brand.line2}` })}>
                <ChevronRight size={16} />
              </IconButton>
            </span>
          </Tooltip>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', pl: 0.5 }}>
            {position < 0 ? `${total} ${total === 1 ? 'event' : 'events'}` : `${position + 1} of ${total}`}
          </Typography>
        </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, alignItems: 'start' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h3" component="h3">
              {event.label}
            </Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1 }}>
              <Typography variant="subtitle2" component="p">
                {whenLabel(event)}
              </Typography>
              <EmergeChip label={event.region} tone={regionTone(event.region)} dot />
              {event.note ? <EmergeChip label="The book gives another date too" tone="red" /> : null}
            </Stack>
          </Box>
          {bigMap ? null : <Box sx={{ maxWidth: 320 }}>{map}</Box>}
        </Box>
        {bigMap ? map : null}

        <Section title={event.fromPage ? 'What the book prints' : 'What the book says'}>
          <Box
            component="blockquote"
            sx={(theme) => ({
              m: 0,
              py: 1.5,
              px: 2,
              borderLeft: `3px solid ${hue}`,
              borderRadius: `0 ${theme.band.radius.sm}px ${theme.band.radius.sm}px 0`,
              backgroundColor: theme.brand.subtle,
            })}
          >
            <Typography variant="body1" sx={{ fontSize: 17, lineHeight: 1.5 }}>
              “{event.quote}”
            </Typography>
          </Box>
          {event.fromPage ? (
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
              Read off the printed page. This chapter’s PDF scrambles these words in its text layer, so they were transcribed from the
              page image instead. Open the chapter below and check them against the book.
            </Typography>
          ) : null}
        </Section>

        <Section title="How the chapter tells it">
          <Passage event={event} />
        </Section>

        <Stack direction="row" sx={(theme) => ({ flexWrap: 'wrap', alignItems: 'center', gap: 1.5, pt: 1.5, borderTop: `1px solid ${theme.brand.line}` })}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: '1 1 260px' }}>
            <Box component="b" sx={{ color: 'text.primary' }}>
              NCERT Class {event.cls}
            </Box>{' '}
            · {event.book} · Ch {event.chapter ?? '—'} {event.chapterTitle}
            {event.page ? ` · p. ${event.page}` : ''}
          </Typography>
          {event.pdf ? (
            <Button size="small" variant="outlined" component="a" href={event.pdf} target="_blank" rel="noopener" endIcon={<ExternalLink size={14} />}>
              Open the chapter
            </Button>
          ) : null}
          {play ? (
            <Button size="small" variant="contained" component={NextLink} href={play.href} startIcon={<Shapes size={16} />}>
              Play this chapter: {play.title}
            </Button>
          ) : null}
        </Stack>

        {meanwhile.length > 0 ? (
          <Section title="Meanwhile, elsewhere in the world">
            <Stack spacing={0.25}>
              {meanwhile.map((other) => (
                <ButtonBase
                  key={other.index}
                  onClick={() => onSelect(other)}
                  sx={(theme) => ({
                    display: 'grid',
                    gridTemplateColumns: '80px minmax(0, 1fr) auto',
                    columnGap: 1.25,
                    alignItems: 'center',
                    textAlign: 'left',
                    py: 0.5,
                    px: 0.75,
                    borderRadius: `${theme.band.radius.sm}px`,
                    '&:hover': { backgroundColor: theme.brand.subtle },
                    '&.Mui-focusVisible': { outline: `2px solid ${theme.brand.accent}`, outlineOffset: -2 },
                  })}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {rowYear(other)}
                  </Typography>
                  <Typography variant="body2">{other.label}</Typography>
                  <EmergeChip label={other.region} tone={regionTone(other.region)} />
                </ButtonBase>
              ))}
            </Stack>
          </Section>
        ) : null}
      </Stack>
    </Box>
  );
}
