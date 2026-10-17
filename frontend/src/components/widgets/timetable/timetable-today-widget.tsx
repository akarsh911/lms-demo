'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { useTimetableToday } from '@/hooks/query/use-timetable-today';
import { formatLongDate } from '@/lib/dates';
import { dayStatus, type DayStatus } from '@/lib/timetable/day-status';
import type { TimetableDay, TimetablePeriod } from '@/types/timetable';
import type { WidgetProps } from '@/types/widget';

import { WidgetEmpty, WidgetError, WidgetLoading } from '../widget-states';

const clock = (iso: string): string => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const ON_INK_QUIET = 'rgb(255 255 255 / 0.62)';

export function TimetableTodayWidget({ title, personaSlug }: WidgetProps): React.ReactElement {
  const { data, isPending, isError, error, refetch, dataUpdatedAt } = useTimetableToday(personaSlug);
  // Read against the moment the answer arrived, so render stays pure and a refetch moves "now" forward.
  const status = React.useMemo(() => dayStatus(data?.periods ?? [], dataUpdatedAt), [data, dataUpdatedAt]);
  const inProgress = status.phase === 'during' || status.phase === 'between';

  return (
    <Card sx={{ height: '100%', display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 34%) 1fr' } }}>
      <DayPanel title={title} day={data} status={status} />

      <Box sx={{ p: 2.5, minWidth: 0 }}>
        {isPending ? <WidgetLoading rows={5} /> : null}
        {isError ? <WidgetError error={error} onRetry={() => void refetch()} /> : null}
        {data && data.periods.length === 0 ? <WidgetEmpty message="No classes scheduled today." /> : null}
        {data && data.periods.length > 0 ? (
          <List disablePadding aria-label={title}>
            {data.periods.map((period, i) => (
              // No rule under the last row: the card already ends there.
              <ListItem
                key={period.id}
                disableGutters
                divider={i < data.periods.length - 1}
                sx={{ gap: 2, py: 1.25, opacity: inProgress && status.past.has(period.id) ? 0.5 : 1 }}
              >
                <Typography variant="eyebrow" component="span" color="text.secondary" sx={{ width: 52, flex: 'none', fontSize: 12, letterSpacing: '0.02em' }}>
                  {clock(period.startsAt)}
                </Typography>
                <ListItemText
                  primary={period.subject}
                  secondary={(period.section ? [period.section, period.room] : [period.room, period.teacherName]).filter(Boolean).join(' · ')}
                  slotProps={{ primary: { variant: 'subtitle1' }, secondary: { variant: 'body2' } }}
                  sx={{ my: 0, minWidth: 0 }}
                />
                {status.current?.id === period.id ? <Chip size="small" color="primary" label="Now" /> : null}
                {status.next?.id === period.id ? <Chip size="small" label="Next" /> : null}
              </ListItem>
            ))}
          </List>
        ) : null}
      </Box>
    </Card>
  );
}

// The dashboard's one dark tile: how big the day is, and where in it you are.
function DayPanel({
  title,
  day,
  status,
}: {
  title: string;
  day: TimetableDay | undefined;
  status: DayStatus;
}): React.ReactElement {
  const periods = day?.periods ?? [];
  const first = periods[0];
  const last = periods[periods.length - 1];

  return (
    <Stack
      sx={{
        justifyContent: 'space-between',
        gap: 3,
        p: 2.5,
        backgroundColor: (theme) => theme.brand.ink,
        color: 'common.white',
        minHeight: { md: 300 },
      }}
    >
      <div>
        <Typography variant="eyebrow" component="p" sx={{ color: ON_INK_QUIET }}>
          {day ? formatLongDate(day.date) : 'Today'}
        </Typography>
        <Typography variant="h4" component="h2" sx={{ mt: 0.5 }}>
          {title}
        </Typography>

        {day ? (
          <>
            <Typography variant="figure" component="p" sx={{ fontSize: { xs: 56, md: 76 }, mt: 3 }}>
              {periods.length}
            </Typography>
            <Typography variant="body2" sx={{ color: ON_INK_QUIET, mt: 0.75 }}>
              {periods.length === 1 ? 'period' : 'periods'}
              {first && last ? `, ${clock(first.startsAt)} to ${clock(last.endsAt)}` : ''}
            </Typography>
          </>
        ) : (
          <Skeleton variant="rounded" width={96} height={76} sx={{ mt: 3, bgcolor: 'rgb(255 255 255 / 0.12)' }} />
        )}
      </div>

      <Marker status={status} total={periods.length} />
    </Stack>
  );
}

function Marker({ status, total }: { status: DayStatus; total: number }): React.ReactElement | null {
  if (total === 0) return null;

  const lesson: TimetablePeriod | null = status.current ?? status.next;
  const label = status.current ? 'Now' : status.next ? 'Next' : 'Day complete';

  return (
    <div>
      <LinearProgress
        variant="determinate"
        value={(status.past.size / total) * 100}
        aria-label={`${status.past.size} of ${total} lessons finished`}
        sx={{ mb: 1.5, height: 6, bgcolor: 'rgb(255 255 255 / 0.16)', '& .MuiLinearProgress-bar': { bgcolor: 'common.white' } }}
      />
      <Typography variant="eyebrow" component="p" sx={{ color: status.current ? 'primary.light' : ON_INK_QUIET }}>
        {label}
      </Typography>
      <Typography variant="subtitle1" component="p" sx={{ mt: 0.25 }}>
        {lesson ? lesson.subject : 'Every lesson has finished.'}
      </Typography>
      {lesson ? (
        <Typography variant="body2" sx={{ color: ON_INK_QUIET }}>
          {[`${clock(lesson.startsAt)} to ${clock(lesson.endsAt)}`, lesson.room].filter(Boolean).join(' · ')}
        </Typography>
      ) : null}
    </div>
  );
}
