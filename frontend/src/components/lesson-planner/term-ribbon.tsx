'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme, type Theme } from '@mui/material/styles';
import { Flag } from 'lucide-react';

import { formatShortDate } from '@/lib/dates';
import type { TermPlanView } from '@/lib/lesson-planner/term';
import type { TimelineWeek } from '@/lib/lesson-planner/timeline';

import { INNER_GAP } from './spacing';
import { chapterColours } from './term-palette';

export interface PlanRequest {
  chapterId: string;
  periods: number;
  firstDate: string;
}

type Tick = { key: string; kind: 'chapter'; chapterId: string; past: boolean; extra: boolean } | { key: string; kind: 'revision' | 'free' | 'exam' | 'closed'; past: boolean };

interface Span {
  id: string;
  start: number;
  end: number;
  periods: number;
  next: PlanRequest | null;
}

const COL_MIN = 16;
const LABEL_SPAN = 3;
const NAMED_BAR = 3;
const TICK = 10;
const BAR = 22;
const OUTSIDE = 'Outside the term';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function ticksOf(week: TimelineWeek): Tick[] {
  return week.days.flatMap((day): Tick[] => {
    if (day.closed === OUTSIDE) return [];
    const past = day.cells.some((c) => c.past);
    if (day.exam || day.closed) {
      const kind = day.exam ? 'exam' : 'closed';
      return Array.from({ length: day.lost }, (_, i) => ({ key: `${day.date}-${kind}-${i}`, kind, past }));
    }
    return day.cells.map((cell) =>
      cell.use.kind === 'chapter'
        ? { key: cell.key, kind: 'chapter', chapterId: cell.use.chapterId, past: cell.past, extra: cell.extra }
        : { key: cell.key, kind: cell.use.kind, past: cell.past },
    );
  });
}

function tickStyle(theme: Theme, tick: Tick, sequenceOf: (id: string) => number): React.CSSProperties {
  const base: React.CSSProperties = { height: TICK, borderRadius: 2, opacity: tick.past ? 0.4 : 1 };
  switch (tick.kind) {
    case 'chapter': {
      const { bg, fg } = chapterColours(theme, sequenceOf(tick.chapterId));
      return tick.extra ? { ...base, backgroundColor: bg, outline: `1px dashed ${fg}` } : { ...base, backgroundColor: fg };
    }
    case 'revision':
      return { ...base, backgroundColor: theme.hues.amber };
    case 'exam':
      return { ...base, backgroundColor: theme.hues.red };
    case 'closed':
      return { ...base, backgroundImage: `repeating-linear-gradient(135deg, ${theme.brand.line2} 0 2px, transparent 2px 4px)` };
    case 'free':
      return { ...base, boxShadow: `inset 0 0 0 1px ${theme.brand.line2}` };
    default: {
      const unknown: never = tick;
      return unknown;
    }
  }
}

function spansOf(weeks: readonly TimelineWeek[], from: string): Span[] {
  const spans = new Map<string, Span>();
  weeks.forEach((week, i) => {
    for (const chapter of week.chapters) {
      const current = spans.get(chapter.id);
      const upcoming = chapter.firstDate >= from ? { chapterId: chapter.id, periods: chapter.periods, firstDate: chapter.firstDate } : null;
      spans.set(chapter.id, {
        id: chapter.id,
        start: current?.start ?? i,
        end: i,
        periods: (current?.periods ?? 0) + chapter.periods,
        next: current?.next ?? upcoming,
      });
    }
  });
  return [...spans.values()];
}

function lanesOf(spans: readonly Span[]): Span[][] {
  const lanes: Span[][] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    const lane = lanes.find((l) => (l[l.length - 1]?.end ?? -1) < span.start);
    if (lane) lane.push(span);
    else lanes.push([span]);
  }
  return lanes;
}

const monthOf = (week: TimelineWeek): number => Number((week.days.find((day) => day.closed !== OUTSIDE)?.date ?? week.monday).slice(5, 7));

function monthLabels(weeks: readonly TimelineWeek[]): string[] {
  let last = -LABEL_SPAN;
  return weeks.map((week, i) => {
    const previous = weeks[i - 1];
    const firstOfMonth = !previous || monthOf(previous) !== monthOf(week);
    if (!firstOfMonth || i - last < LABEL_SPAN) return '';
    last = i;
    return MONTHS[monthOf(week) - 1] ?? '';
  });
}

function mainChapter(week: TimelineWeek, from: string): PlanRequest | null {
  const best = [...week.chapters].filter((c) => c.firstDate >= from).sort((a, b) => b.periods - a.periods)[0];
  return best ? { chapterId: best.id, periods: best.periods, firstDate: best.firstDate } : null;
}

export function TermRibbon({ weeks, view, onPlan }: { weeks: readonly TimelineWeek[]; view: TermPlanView; onPlan: (request: PlanRequest) => void }): React.ReactElement {
  const theme = useTheme();
  const byId = new Map(view.chapters.map((c) => [c.id, c]));
  const sequenceOf = (id: string): number => byId.get(id)?.sequence ?? 1;
  const titleOf = (id: string): string => byId.get(id)?.title ?? 'Chapter';
  const lanes = React.useMemo(() => lanesOf(spansOf(weeks, view.from)), [weeks, view.from]);
  const grid = { display: 'grid', gridTemplateColumns: `repeat(${weeks.length}, minmax(${COL_MIN}px, 1fr))`, columnGap: '3px' } as const;

  const weekLabel = (week: TimelineWeek): string => {
    const parts = week.chapters.map((c) => `${titleOf(c.id)} ${c.periods}`);
    const closures = [...new Set(week.days.flatMap((d) => (d.exam ? [d.exam.name] : d.closed && d.closed !== OUTSIDE ? [d.closed] : [])))];
    return [`Week of ${formatShortDate(week.monday)}`, ...parts, ...closures].join(', ');
  };

  return (
    <Stack>
      <Box sx={{ overflowX: 'auto', border: `1px solid ${theme.brand.line}`, borderRadius: `${theme.band.radius.md}px` }}>
        <Stack spacing={0.25} sx={{ minWidth: weeks.length * (COL_MIN + 3) + 16, pb: 1 }}>
          <Box sx={{ ...grid, px: 1, py: 0.5, bgcolor: theme.brand.subtle, borderBottom: `1px solid ${theme.brand.line}` }} aria-hidden>
            {monthLabels(weeks).map((label, i) => (
              <Typography key={weeks[i]?.monday ?? i} variant="eyebrow" component="div" color="text.secondary" sx={{ whiteSpace: 'nowrap', overflow: 'visible' }}>
                {label}
              </Typography>
            ))}
          </Box>

          <Box sx={{ ...grid, minHeight: 14, px: 1 }}>
            {weeks.map((week) => (
              <Box key={week.monday} sx={{ display: 'flex', justifyContent: 'center' }}>
                {week.examsStarting.map((exam) => (
                  <Tooltip key={exam.id} title={`${exam.name}, ${formatShortDate(exam.start)}`} arrow>
                    <Box component="span" aria-label={`${exam.name} starts ${formatShortDate(exam.start)}`} sx={{ color: theme.hues.red, display: 'inline-flex' }}>
                      <Flag size={14} fill="currentColor" />
                    </Box>
                  </Tooltip>
                ))}
              </Box>
            ))}
          </Box>

          <Box sx={{ ...grid, alignItems: 'stretch', px: 1 }}>
            {weeks.map((week) => {
              const next = mainChapter(week, view.from);
              return (
                <Tooltip key={week.monday} title={weekLabel(week)} arrow>
                  <ButtonBase
                    aria-label={weekLabel(week)}
                    disabled={!next}
                    onClick={() => next && onPlan(next)}
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      justifyContent: 'flex-start',
                      gap: '2px',
                      p: '3px',
                      minHeight: 7 * (TICK + 2) + 6,
                      borderRadius: 1,
                      outline: week.current ? `2px solid ${theme.brand.accent}` : 'none',
                      '&:hover': { bgcolor: theme.brand.subtle },
                      '&:focus-visible': { outline: `2px solid ${theme.brand.accent}` },
                    }}
                  >
                    {ticksOf(week).map((tick) => (
                      <Box key={tick.key} style={tickStyle(theme, tick, sequenceOf)} />
                    ))}
                  </ButtonBase>
                </Tooltip>
              );
            })}
          </Box>

          {lanes.map((lane, i) => (
            <Box key={i} sx={{ ...grid, px: 1 }}>
              {lane.map((span) => {
                const { bg, fg } = chapterColours(theme, sequenceOf(span.id));
                const title = titleOf(span.id);
                const next = span.next;
                return (
                  <Tooltip key={span.id} title={`${sequenceOf(span.id)}. ${title}, ${span.periods} periods`} arrow>
                    <ButtonBase
                      aria-label={`Plan ${title}`}
                      disabled={!next}
                      onClick={() => next && onPlan(next)}
                      sx={{
                        gridColumn: `${span.start + 1} / ${span.end + 2}`,
                        height: BAR,
                        px: 0.75,
                        borderRadius: '6px',
                        justifyContent: 'flex-start',
                        bgcolor: bg,
                        color: fg,
                        borderLeft: `3px solid ${fg}`,
                        fontSize: 11.5,
                        fontWeight: 600,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        display: 'block',
                        textAlign: 'left',
                        lineHeight: `${BAR}px`,
                        '&:hover': { boxShadow: `inset 0 0 0 1px ${fg}` },
                        '&:focus-visible': { outline: `2px solid ${theme.brand.accent}` },
                      }}
                    >
                      {span.end - span.start + 1 >= NAMED_BAR ? title : sequenceOf(span.id)}
                    </ButtonBase>
                  </Tooltip>
                );
              })}
            </Box>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}

export function RibbonLegend(): React.ReactElement {
  const theme = useTheme();
  const items = [
    { label: 'Revision', sx: { bgcolor: theme.hues.amber } },
    { label: 'Exam', sx: { bgcolor: theme.hues.red } },
    { label: 'Closed', sx: { backgroundImage: `repeating-linear-gradient(135deg, ${theme.brand.line2} 0 2px, transparent 2px 4px)` } },
  ];
  return (
    <Stack direction="row" component="span" spacing={1.5} sx={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center' }}>
      {items.map((item) => (
        <Stack key={item.label} direction="row" component="span" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Box component="span" sx={{ width: 10, height: 10, borderRadius: '2px', display: 'inline-block', ...item.sx }} />
          <span>{item.label}</span>
        </Stack>
      ))}
    </Stack>
  );
}
