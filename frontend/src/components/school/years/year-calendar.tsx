'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { Segmented } from '@/components/ui/segmented';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useYearEvents } from '@/hooks/query/use-foundation';
import { dateInput, formatDay } from '@/lib/dates';
import { KIND_LABEL, KIND_TONE, inMonth, monthLabel, monthWeeks, monthsOf, weekBars } from '@/lib/school/events';
import { EVENT_KINDS, type EventKind, type YearEvent } from '@/types/foundation';
import type { AcademicSession } from '@/types/mdm';

import { EventDialog } from './event-dialog';
import { useYearReadOnly } from './year-mode';

const LAYOUTS = [
  { value: 'list', label: 'List' },
  { value: 'month', label: 'Month' },
] as const;

type Layout = (typeof LAYOUTS)[number]['value'];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LANE = 22;
const MAX_LANES = 3;

const when = (event: YearEvent): string => (event.start === event.end ? formatDay(event.start) : `${formatDay(event.start)} to ${formatDay(event.end)}`);
const days = (event: YearEvent): number => Math.round((Date.parse(event.end) - Date.parse(event.start)) / 86_400_000) + 1;

// One week of the month: seven day cells with the events crossing it laid over them as bars, continuing across the edges.
function Week({ week, month, events, today }: { week: readonly string[]; month: string; events: readonly YearEvent[]; today: string }): React.ReactElement {
  const bars = weekBars(week, events);
  const lanes = Math.min(MAX_LANES, Math.max(0, ...bars.map((bar) => bar.lane + 1)));
  const hidden = week.map((day) => bars.filter((bar) => bar.lane >= MAX_LANES && week.indexOf(day) >= bar.from && week.indexOf(day) <= bar.to).length);
  return (
    <Box sx={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', minHeight: Math.max(64, 36 + lanes * LANE + (hidden.some(Boolean) ? 18 : 6)) }}>
      {week.map((day, column) => {
        const outside = day.slice(0, 7) !== month;
        return (
          <Box key={day} sx={(theme) => ({ borderRight: column < 6 ? `1px solid ${theme.brand.line}` : 0, borderBottom: `1px solid ${theme.brand.line}`, p: 0.75, bgcolor: outside ? theme.brand.subtle : theme.brand.surface })}>
            <Typography
              variant="body2"
              sx={(theme) => ({
                width: 24,
                height: 24,
                lineHeight: '24px',
                textAlign: 'center',
                borderRadius: '999px',
                fontWeight: day === today ? 700 : 500,
                bgcolor: day === today ? theme.brand.accent : 'transparent',
                color: day === today ? '#FFFFFF' : outside ? 'text.disabled' : column === 6 ? 'text.secondary' : 'text.primary',
              })}
            >
              {Number(day.slice(8, 10))}
            </Typography>
            {hidden[column] ? (
              <Typography variant="caption" color="text.secondary" sx={{ position: 'absolute', bottom: 2, ml: 0.25 }}>
                +{hidden[column]} more
              </Typography>
            ) : null}
          </Box>
        );
      })}
      {bars
        .filter((bar) => bar.lane < MAX_LANES)
        .map((bar) => (
          <Tooltip key={bar.event.id} title={`${bar.event.title} · ${when(bar.event)}${bar.event.audience ? ` · ${bar.event.audience}` : ''}`} arrow>
            <Box
              sx={(theme) => ({
                position: 'absolute',
                top: 34 + bar.lane * LANE,
                left: `calc(${(bar.from / 7) * 100}% + ${bar.starts ? 4 : 0}px)`,
                width: `calc(${((bar.to - bar.from + 1) / 7) * 100}% - ${(bar.starts ? 4 : 0) + (bar.ends ? 4 : 0)}px)`,
                height: LANE - 4,
                px: 0.75,
                borderRadius: `${bar.starts ? 6 : 0}px ${bar.ends ? 6 : 0}px ${bar.ends ? 6 : 0}px ${bar.starts ? 6 : 0}px`,
                bgcolor: theme.tints[KIND_TONE[bar.event.kind]],
                color: theme.onTint[KIND_TONE[bar.event.kind]],
                borderLeft: bar.starts ? `3px solid ${theme.onTint[KIND_TONE[bar.event.kind]]}` : 0,
                fontSize: 11.5,
                lineHeight: `${LANE - 4}px`,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                cursor: 'default',
              })}
            >
              {bar.event.title}
            </Box>
          </Tooltip>
        ))}
    </Box>
  );
}

function MonthGrid({ month, events, today }: { month: string; events: readonly YearEvent[]; today: string }): React.ReactElement {
  return (
    <Box sx={(theme) => ({ border: `1px solid ${theme.brand.line}`, borderRadius: `${theme.band.radius.md}px`, overflow: 'hidden' })}>
      <Box sx={(theme) => ({ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', bgcolor: theme.brand.subtle, borderBottom: `1px solid ${theme.brand.line}` })}>
        {WEEKDAYS.map((day) => (
          <Typography key={day} variant="eyebrow" component="div" color="text.secondary" sx={{ px: 1, py: 0.75, textAlign: 'center' }}>
            {day}
          </Typography>
        ))}
      </Box>
      {monthWeeks(month).map((week) => (
        <Week key={week[0]} week={week} month={month} events={events} today={today} />
      ))}
    </Box>
  );
}

// A list reads as a timeline: the date on a rail, the event beside it, grouped by month.
function EventList({ groups, today }: { groups: readonly { month: string; events: YearEvent[] }[]; today: string }): React.ReactElement {
  return (
    <Stack spacing={3}>
      {groups.map((group) => (
        <Box key={group.month}>
          <Typography variant="eyebrow" component="h3" color="text.secondary" sx={{ mb: 1 }}>
            {monthLabel(group.month)}
          </Typography>
          <Stack spacing={1}>
            {group.events.map((event) => {
              const past = event.end < today;
              return (
                <Box
                  key={event.id}
                  sx={(theme) => ({
                    display: 'grid',
                    gridTemplateColumns: { xs: '64px minmax(0, 1fr)', md: '64px 4px minmax(0, 1fr) auto' },
                    columnGap: 2,
                    alignItems: 'center',
                    p: 1.5,
                    border: `1px solid ${theme.brand.line}`,
                    borderRadius: `${theme.band.radius.md}px`,
                    backgroundColor: theme.brand.surface,
                    opacity: past ? 0.78 : 1,
                  })}
                >
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h3" component="p" sx={{ lineHeight: 1 }}>
                      {Number(event.start.slice(8, 10))}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {new Date(`${event.start}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}
                      {days(event) > 1 ? ` · ${days(event)}d` : ''}
                    </Typography>
                  </Box>
                  <Box sx={(theme) => ({ display: { xs: 'none', md: 'block' }, alignSelf: 'stretch', borderRadius: 2, bgcolor: theme.onTint[KIND_TONE[event.kind]] })} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" component="p" noWrap>
                      {event.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {when(event)}
                      {event.audience ? ` · ${event.audience}` : ''}
                      {event.detail ? ` · ${event.detail}` : ''}
                    </Typography>
                  </Box>
                  <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                    <EmergeChip label={KIND_LABEL[event.kind]} tone={KIND_TONE[event.kind]} />
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

// Everything that happened to the school in the year: a searchable list first, a month with the events drawn across their days beside it.
export function YearCalendar({ year }: { year: AcademicSession }): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useYearEvents(year.id);
  const readOnly = useYearReadOnly();
  const [adding, setAdding] = React.useState(false);
  if (isPending) return <WidgetLoading rows={8} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;
  return (
    <>
      <CalendarBoard
        events={data}
        from={dateInput(year.start_date)}
        to={dateInput(year.end_date)}
        yearName={year.name ?? 'the year'}
        action={
          readOnly ? undefined : (
            <Button variant="outlined" size="small" startIcon={<Plus size={16} />} onClick={() => setAdding(true)}>
              Add event
            </Button>
          )
        }
      />
      {adding ? <EventDialog year={year} onClose={() => setAdding(false)} /> : null}
    </>
  );
}

// The calendar card itself, shared by the year page and each person's own calendar.
export function CalendarBoard({ events: data, from, to, yearName, action }: { events: readonly YearEvent[]; from: string; to: string; yearName: string; action?: React.ReactNode }): React.ReactElement {
  const months = React.useMemo(() => monthsOf(from, to), [from, to]);
  const today = new Date().toISOString().slice(0, 10);
  const [layout, setLayout] = React.useState<Layout>('list');
  const [kind, setKind] = React.useState<EventKind | ''>('');
  const [search, setSearch] = React.useState('');
  const [month, setMonth] = React.useState(() => (months.includes(today.slice(0, 7)) ? today.slice(0, 7) : (months[0] ?? today.slice(0, 7))));

  const needle = search.trim().toLowerCase();
  const events = data.filter((event) => (kind === '' || event.kind === kind) && (needle === '' || event.title.toLowerCase().includes(needle) || (event.detail ?? '').toLowerCase().includes(needle) || (event.audience ?? '').toLowerCase().includes(needle)));
  const index = months.indexOf(month);
  const groups = months.map((m) => ({ month: m, events: events.filter((event) => event.start.slice(0, 7) === m) })).filter((group) => group.events.length > 0);
  const upcoming = data.filter((event) => event.end >= today).length;

  return (
    <Card>
      <CardHeader title="Calendar" subheader={`${data.length} events across ${yearName}${upcoming > 0 && upcoming < data.length ? ` · ${upcoming} still to come` : ''}`} action={action} />
      <CardContent>
        <Stack spacing={2}>
          <CardToolbar start={<SearchField label="Search events" value={search} onChange={setSearch} width={260} />} summary={layout === 'month' ? `${events.filter((event) => inMonth(event, month)).length} this month` : `${events.length} of ${data.length} events`}>
            <TextField select size="small" label="Kind" value={kind} onChange={(event) => setKind(event.target.value as EventKind | '')} sx={{ minWidth: 190 }}>
              <MenuItem value="">All kinds</MenuItem>
              {EVENT_KINDS.filter((k) => data.some((event) => event.kind === k)).map((k) => (
                <MenuItem key={k} value={k}>
                  {KIND_LABEL[k]} · {data.filter((event) => event.kind === k).length}
                </MenuItem>
              ))}
            </TextField>
            {layout === 'month' ? (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <IconButton size="small" aria-label="Previous month" disabled={index <= 0} onClick={() => setMonth(months[index - 1] ?? month)}>
                  <ChevronLeft size={18} />
                </IconButton>
                <Typography variant="subtitle1" component="span" sx={{ minWidth: 150, textAlign: 'center' }}>
                  {monthLabel(month)}
                </Typography>
                <IconButton size="small" aria-label="Next month" disabled={index >= months.length - 1} onClick={() => setMonth(months[index + 1] ?? month)}>
                  <ChevronRight size={18} />
                </IconButton>
              </Stack>
            ) : null}
            <Segmented ariaLabel="Calendar layout" value={layout} onChange={setLayout} options={LAYOUTS} />
          </CardToolbar>

          {layout === 'month' ? (
            <MonthGrid month={month} events={events.filter((event) => inMonth(event, month))} today={today} />
          ) : groups.length === 0 ? (
            <EmptyState title="Nothing recorded" body={needle || kind ? 'No event matches.' : 'No events have been recorded for this year.'} />
          ) : (
            <EventList groups={groups} today={today} />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
