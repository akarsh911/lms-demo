'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { CheckCircle2, ChevronLeft, ChevronRight, Plus } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmptyState } from '@/components/ui/empty-state';
import { SlotGrid, type SlotGridColumn, type SlotGridRow } from '@/components/ui/slot-grid';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { usePlannerWeeks } from '@/hooks/query/use-lesson-planner';
import { clockOf, formatShortDate } from '@/lib/dates';
import type { WeekLesson } from '@/types/lesson-planner';

import { CARD_PAD, INNER_GAP } from './spacing';
import { WeekLessonDialog } from './week-lesson-dialog';

const DAY_MS = 86_400_000;
const CELL_WIDTH = 132;

const shift = (iso: string, days: number): string => new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);

function LessonChip({ lesson, onOpen, onPlan }: { lesson: WeekLesson; onOpen: () => void; onPlan: () => void }): React.ReactElement {
  const theme = useTheme();
  if (!lesson.plan_id) {
    return (
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, pl: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" noWrap component="p" sx={{ fontWeight: 700 }}>
            {lesson.subject_name}
          </Typography>
          <Typography variant="caption" noWrap component="p" color="text.secondary">
            {lesson.section_label}
          </Typography>
        </Box>
        <Tooltip title="Plan">
          <IconButton size="small" onClick={onPlan} aria-label={`Plan ${lesson.subject_name} for ${lesson.section_label}`}>
            <Plus size={14} />
          </IconButton>
        </Tooltip>
      </Stack>
    );
  }
  const tone = lesson.taught ? 'green' : 'blue';
  return (
    <ButtonBase
      onClick={onOpen}
      sx={{ width: '100%', textAlign: 'left', display: 'block', borderRadius: 1, p: INNER_GAP, bgcolor: theme.tints[tone], color: theme.onTint[tone], '&:focus-visible': { outline: `2px solid ${theme.brand.accent}` } }}
      aria-label={`${lesson.plan_title}, period ${lesson.period_sequence} of ${lesson.period_count}${lesson.taught ? ', taught' : ''}`}
    >
      <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {lesson.plan_title}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        {lesson.taught ? <CheckCircle2 size={12} aria-hidden /> : null}
        <Typography variant="caption">
          {lesson.period_sequence}/{lesson.period_count}
        </Typography>
      </Stack>
    </ButtonBase>
  );
}

export function WeekView({
  sectionIds,
  today,
  onOpenPlan,
  onPlanFor,
}: {
  sectionIds: readonly string[] | null;
  today: string;
  onOpenPlan: (planId: string) => void;
  onPlanFor: (offeringId: string) => void;
}): React.ReactElement {
  const theme = useTheme();
  const [from, setFrom] = React.useState(today);
  const [open, setOpen] = React.useState<WeekLesson | null>(null);
  const week = usePlannerWeeks(from, sectionIds);

  const range = week.data ? `${formatShortDate(week.data.from)} to ${formatShortDate(week.data.to)}` : ' ';
  const nav = (
    <>
      <Tooltip title="Previous week" arrow>
        <IconButton size="small" aria-label="Previous week" onClick={() => setFrom(shift(week.data?.from ?? from, -7))}>
          <ChevronLeft size={18} />
        </IconButton>
      </Tooltip>
      <Button variant="outlined" size="small" onClick={() => setFrom(today)}>
        Today
      </Button>
      <Tooltip title="Next week" arrow>
        <IconButton size="small" aria-label="Next week" onClick={() => setFrom(shift(week.data?.from ?? from, 7))}>
          <ChevronRight size={18} />
        </IconButton>
      </Tooltip>
    </>
  );
  const frame = (summary: string | undefined, body: React.ReactNode): React.ReactElement => (
    <Card>
      <CardHeader title="This week" subheader={<span aria-live="polite">{range}</span>} action={nav} />
      <CardContent>
        <Stack spacing={CARD_PAD}>
          <CardToolbar summary={summary} />
          {week.isFetching && !week.isPending ? <LinearProgress aria-label="Loading the week" /> : null}
          {body}
        </Stack>
      </CardContent>
    </Card>
  );

  if (week.isError) return frame(undefined, <WidgetError error={week.error} onRetry={() => void week.refetch()} />);
  if (week.isPending || !week.data) return frame(undefined, <WidgetLoading rows={6} />);

  const { days, periods, lessons } = week.data;
  const columns: SlotGridColumn[] = days.map((day) => {
    const date = formatShortDate(day.date);
    const label = day.open ? date : (
      <>
        {date}
        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 400 }}>
          {day.name ?? 'Closed'}
        </Typography>
      </>
    );
    return { key: day.date, label, short: date.split(' ')[0], highlight: day.date === today };
  });
  const rows: SlotGridRow[] = periods.map((period) => ({
    key: period.period_id,
    label: period.period_name,
    meta: `${clockOf(period.start_minute)}–${clockOf(period.end_minute)}`,
  }));
  const hatch = `repeating-linear-gradient(135deg, ${theme.brand.line2} 0 2px, transparent 2px 6px)`;

  const planned = lessons.filter((lesson) => lesson.plan_id).length;

  return (
    <>
      {frame(
        lessons.length > 0 ? `${planned} of ${lessons.length} planned` : undefined,
        lessons.length === 0 && days.some((d) => d.open) ? (
          <EmptyState title="No lessons" />
        ) : (
          <SlotGrid
            ariaLabel="Lessons this week"
            columns={columns}
            rows={rows}
            minColumnWidth={CELL_WIDTH + 12}
            renderCell={(row, column) => {
              const day = days.find((candidate) => candidate.date === column.key);
              if (day && !day.open) return <Box aria-hidden sx={{ width: CELL_WIDTH, minHeight: 40, height: '100%', backgroundImage: hatch, borderRadius: 1 }} />;
              return (
                <Stack spacing={0.5} sx={{ width: CELL_WIDTH }}>
                  {lessons
                    .filter((lesson) => lesson.date === column.key && lesson.period_id === row.key)
                    .map((lesson) => (
                      <LessonChip key={`${lesson.offering_id}-${lesson.date}-${lesson.period_id}`} lesson={lesson} onOpen={() => setOpen(lesson)} onPlan={() => onPlanFor(lesson.offering_id)} />
                    ))}
                </Stack>
              );
            }}
          />
        ),
      )}
      {open?.plan_id ? <WeekLessonDialog planId={open.plan_id} sequence={open.period_sequence ?? 1} onClose={() => setOpen(null)} onOpenPlan={onOpenPlan} /> : null}
    </>
  );
}
