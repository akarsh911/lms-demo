'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CalendarOff, CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';

import { useUrlState } from '@/components/school/url-state';
import { EmptyState } from '@/components/ui/empty-state';
import { FactStrip } from '@/components/ui/fact-strip';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useCancelExtra } from '@/hooks/mutation/use-extra-classes';
import { useMyWeek } from '@/hooks/query/use-my-week';
import { useReach } from '@/hooks/query/use-reach';

import { ExtraClassDialog } from './extra-class-dialog';
import { TimelineDay } from './timeline-day';

const DAY = 86_400_000;
const shift = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const weekday = (date: string, style: 'short' | 'long'): string => new Intl.DateTimeFormat('en-IN', { weekday: style, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const dayNum = (date: string): string => String(Number(date.slice(8, 10)));
const range = (from: string, to: string): string => {
  const f = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${f.format(new Date(`${from}T00:00:00Z`))} to ${f.format(new Date(`${to}T00:00:00Z`))}`;
};
// Minutes past midnight in the school's day, read from when the answer arrived so render stays pure.
const minuteAt = (at: number): number => {
  const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).formatToParts(new Date(at));
  return Number(parts.find((p) => p.type === 'hour')?.value ?? 0) * 60 + Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
};

// A teacher's or a pupil's week as a timeline, a day at a time: where to be, when, and the way into each lesson.
export function MyTimetable({ personaSlug }: { personaSlug: string }): React.ReactElement {
  const { get, put } = useUrlState();
  const reach = useReach();
  const asked = get('week') ?? '';
  const { data, isPending, isError, error, refetch, dataUpdatedAt, isPlaceholderData } = useMyWeek(asked);
  const notify = useToast();
  const cancel = useCancelExtra();
  const [booking, setBooking] = React.useState(false);

  if (isPending || !reach) return <WidgetLoading rows={8} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const teaching = reach.kind === 'teaching';
  const days = data.days;
  const thisWeek = days.some((d) => d.date === data.today);
  const chosen = days.find((d) => d.date === get('day')) ?? days.find((d) => d.date === data.today && d.open) ?? days.find((d) => d.open) ?? days[0];
  const lessons = days.flatMap((d) => d.slots.filter((s) => s.kind === 'lesson'));
  const go = (weekOf: string | null): void => put({ week: weekOf, day: null });
  const extras = days.reduce((t, d) => t + d.slots.filter((s) => s.kind === 'extra').length, 0);
  const lessonsOn = (d: (typeof days)[number]): number => d.slots.filter((s) => s.kind === 'lesson').length;
  const busiest = days.filter((d) => d.open).sort((a, b) => lessonsOn(b) - lessonsOn(a))[0];

  return (
    <Stack spacing={2}>
      <FactStrip
        facts={[
          { label: 'Lessons this week', value: lessons.length, note: `${days.filter((d) => d.open && !d.closed_for).length} school days${extras > 0 ? ` · ${extras} extra ${extras === 1 ? 'class' : 'classes'}` : ''}` },
          teaching
            ? { label: 'Class teacher periods', value: lessons.filter((s) => s.register).length, note: 'Register taken in each' }
            : { label: 'Subjects', value: new Set(lessons.map((s) => s.subject)).size, note: 'On this week' },
          teaching ? { label: 'Covering', value: lessons.filter((s) => s.cover).length, note: 'For an absent colleague' } : { label: 'Free periods', value: days.reduce((t, d) => t + d.slots.filter((s) => s.kind === 'free').length, 0), note: 'Library and study' },
          { label: 'Busiest day', value: busiest ? weekday(busiest.date, 'long') : '—', note: teaching ? 'Most periods to teach' : 'Most lessons' },
        ]}
      />
      <Card sx={{ opacity: isPlaceholderData ? 0.6 : 1, transition: 'opacity 160ms' }}>
        <CardHeader
          title={`Week of ${range(data.week_of, shift(data.week_of, 5))}`}
          subheader={thisWeek ? 'This week' : data.week_of < data.today ? 'A past week' : 'A week ahead'}
          action={
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              {teaching ? (
                <Button variant="contained" size="small" startIcon={<CalendarPlus size={15} />} onClick={() => setBooking(true)} sx={{ mr: 1 }}>
                  Add Extra Class
                </Button>
              ) : null}
              <IconButton aria-label="Previous week" onClick={() => go(shift(data.week_of, -7))}>
                <ChevronLeft size={18} />
              </IconButton>
              {thisWeek ? null : (
                <Button size="small" variant="outlined" onClick={() => go(null)}>
                  This Week
                </Button>
              )}
              <IconButton aria-label="Next week" onClick={() => go(shift(data.week_of, 7))}>
                <ChevronRight size={18} />
              </IconButton>
            </Stack>
          }
          sx={{ '& .MuiCardHeader-action': { alignSelf: 'center', m: 0 } }}
        />
        <Box role="tablist" aria-label="Days of the week" sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 1, px: 2, pb: 2 }}>
          {days.map((d) => {
            const selected = d.date === chosen?.date;
            const count = d.slots.filter((s) => s.kind === 'lesson').length;
            const extra = d.slots.filter((s) => s.kind === 'extra').length;
            const caption = d.away ? 'On leave' : count > 0 ? `${count} ${count === 1 ? 'lesson' : 'lessons'}${extra > 0 ? ` + ${extra}` : ''}` : extra > 0 ? `${extra} extra ${extra === 1 ? 'class' : 'classes'}` : 'Closed';
            const short = d.away ? 'Leave' : count > 0 ? `${count}${extra > 0 ? `+${extra}` : ''}` : extra > 0 ? `+${extra}` : '–';
            const today = d.date === data.today;
            return (
              <ButtonBase
                key={d.date}
                role="tab"
                aria-selected={selected}
                onClick={() => put({ day: d.date })}
                sx={(theme) => ({
                  flexDirection: 'column',
                  py: 1.25,
                  borderRadius: `${theme.band.radius.sm}px`,
                  border: `1px solid ${selected ? theme.brand.accent : theme.brand.line}`,
                  bgcolor: selected ? theme.tints.rose : theme.brand.surface,
                  color: d.open ? 'text.primary' : 'text.disabled',
                })}
              >
                <Typography variant="eyebrow" sx={{ color: today ? 'primary.main' : 'inherit' }}>
                  {weekday(d.date, 'short')}
                </Typography>
                <Typography variant="h4" component="span" sx={{ color: 'inherit' }}>
                  {dayNum(d.date)}
                </Typography>
                <Typography variant="caption" sx={{ color: d.away ? 'info.main' : d.open ? 'text.secondary' : 'inherit' }}>
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                    {caption}
                  </Box>
                  <Box component="span" aria-hidden sx={{ display: { xs: 'inline', sm: 'none' } }}>
                    {short}
                  </Box>
                </Typography>
              </ButtonBase>
            );
          })}
        </Box>
      </Card>

      <Card sx={{ p: { xs: 2, sm: 3 } }}>
        {chosen ? (
          <Stack spacing={2}>
            <Typography variant="h4" component="h2">
              {weekday(chosen.date, 'long')} {dayNum(chosen.date)}
              {chosen.date === data.today ? ' · today' : ''}
            </Typography>
            {chosen.away ? (
              <Alert severity="info" variant="outlined" icon={<CalendarOff size={18} />}>
                On {chosen.away.half_day ? 'half-day ' : ''}leave: {chosen.away.reason}. The office arranges cover for these lessons.
              </Alert>
            ) : null}
            {chosen.open ? (
              <>
                {chosen.closed_for ? (
                  <Typography variant="body2" color="text.secondary">
                    {chosen.closed_for}; only extra classes are on.
                  </Typography>
                ) : null}
                <TimelineDay
                  slots={chosen.slots}
                  date={chosen.date}
                  now={chosen.date === data.today ? minuteAt(dataUpdatedAt) : null}
                  teaching={teaching}
                  personaSlug={personaSlug}
                  onCancelExtra={teaching ? (id) => cancel.mutate(id, { onSuccess: () => notify('Extra class cancelled') }) : undefined}
                />
              </>
            ) : (
              <EmptyState art={<CalendarOff size={36} aria-hidden />} title={chosen.closed_for ?? 'No school'} body="Nothing is timetabled on this day." />
            )}
          </Stack>
        ) : null}
      </Card>
      {booking && chosen ? <ExtraClassDialog date={chosen.date >= data.today ? chosen.date : data.today} onClose={() => setBooking(false)} /> : null}
    </Stack>
  );
}
