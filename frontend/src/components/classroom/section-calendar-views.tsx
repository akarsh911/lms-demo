'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { SectionHeader } from '@/components/ui/layout';
import { Row } from '@/components/ui/row';
import { SlotGrid, type SlotGridColumn, type SlotGridRow } from '@/components/ui/slot-grid';
import { MonthGrid } from '@/components/ui/month-grid';
import { occurrencePresentation } from '@/constants/classroom';
import { DAY_TYPE_LABELS } from '@/constants/school';
import { HALVES_LABELS, SESSION_PRESENTATION } from '@/constants/section-calendar';
import {
  cellKey,
  halvesOf,
  sessionStateOf,
  tallyOf,
  type PeriodAxisRow,
  type SessionState,
} from '@/lib/classroom/section-calendar';
import { longDay, shortDay } from '@/lib/classroom/week';
import { longDate, minuteSpan } from '@/lib/school/time';
import type { DayType } from '@/types/school';
import type { OccurrenceRow } from '@/types/classroom';
import type { ExamSittingRow, SectionCalendarDay } from '@/types/section-calendar';
import type { DeviationTarget } from './deviation-dialog';

export interface CalendarNames {
  offering: (id?: string) => string;
  teacher: (id?: string) => string;
  room: (id?: string) => string;
}

export interface CalendarViewProps {
  days: readonly SectionCalendarDay[];
  periods: readonly PeriodAxisRow[];
  lessons: ReadonlyMap<string, OccurrenceRow[]>;
  sittings: ReadonlyMap<string, ExamSittingRow[]>;
  names: CalendarNames;
  today: string;
  mayWrite: boolean;
  onAct: (target: DeviationTarget) => void;
}

const STACKED_SPAN = {
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '3px',
  minWidth: 0,
} as const;

function dayTypeLabel(dayType: string | undefined): string | null {
  if (!dayType) return null;
  return DAY_TYPE_LABELS[dayType as DayType] ?? dayType;
}

export function SessionChip({
  day,
  showType,
}: {
  day: SectionCalendarDay | undefined;
  showType?: boolean;
}): React.ReactElement {
  const state = sessionStateOf(day);
  const presentation = SESSION_PRESENTATION[state];
  const halves = HALVES_LABELS[halvesOf(day)];
  const type = showType && state !== 'unknown' ? dayTypeLabel(day?.day_type) : null;

  return (
    <Box component="span" sx={STACKED_SPAN}>
      <EmergeChip label={presentation.label} tone={presentation.tone} dot />
      {type ? (
        <Typography variant="caption" color="text.secondary" noWrap>
          {type}
        </Typography>
      ) : null}
      {halves ? (
        <Typography variant="caption" color="text.secondary" noWrap>
          {halves}
        </Typography>
      ) : null}
      {day?.name ? (
        <Typography variant="caption" sx={{ fontWeight: 600 }} noWrap title={day.name}>
          {day.name}
        </Typography>
      ) : null}
    </Box>
  );
}

function lessonTitle(lesson: OccurrenceRow, names: CalendarNames): string {
  if (lesson.label) return lesson.label;
  if (lesson.subject_offering_id) return names.offering(lesson.subject_offering_id);
  return lesson.period_name ?? 'Lesson';
}

function lessonDetail(lesson: OccurrenceRow, names: CalendarNames): string[] {
  const parts: string[] = [];
  if (lesson.times_resolved) {
    const span = minuteSpan(lesson.start_minute, lesson.end_minute);
    if (span) parts.push(span);
  }
  if (lesson.teacher_id) parts.push(names.teacher(lesson.teacher_id));
  if (lesson.room_id) parts.push(names.room(lesson.room_id));
  return parts;
}

export function LessonCard({
  lesson,
  names,
  onEdit,
}: {
  lesson: OccurrenceRow;
  names: CalendarNames;
  onEdit: (() => void) | undefined;
}): React.ReactElement {
  const presentation = occurrencePresentation(lesson.state);
  const title = lessonTitle(lesson, names);
  const detail = lessonDetail(lesson, names);

  const body = (
    <Stack spacing={0.25} sx={{ minWidth: 0, width: '100%' }}>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 700,
          lineHeight: 1.2,
          textDecoration: presentation.struck ? 'line-through' : 'none',
        }}
        title={title}
      >
        {title}
      </Typography>
      {presentation.label ? (
        <Box>
          <EmergeChip label={presentation.label} tone={presentation.tone} dot />
        </Box>
      ) : null}
      {detail.length > 0 ? (
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
          {detail.join(' · ')}
        </Typography>
      ) : null}
      {lesson.reason ? (
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
          {lesson.reason}
        </Typography>
      ) : null}
    </Stack>
  );

  if (!onEdit) {
    return (
      <Box
        sx={{
          borderRadius: 1.5,
          border: '1px solid',
          borderColor: 'divider',
          p: 1,
        }}
      >
        {body}
      </Box>
    );
  }

  return (
    <ButtonBase
      onClick={onEdit}
      aria-label={`Change ${title}`}
      sx={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        p: 1,
      }}
    >
      {body}
    </ButtonBase>
  );
}

export function SittingCard({
  sitting,
  names,
}: {
  sitting: ExamSittingRow;
  names: CalendarNames;
}): React.ReactElement {
  return (
    <Box
      sx={{
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        p: 1,
      }}
    >
      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          Examination
        </Typography>
        <Box>
          <EmergeChip label="Exam sitting" tone="violet" dot />
        </Box>
        {sitting.room_id ? (
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
            {names.room(sitting.room_id)}
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}

function AddCell({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <ButtonBase
      onClick={onClick}
      aria-label={label}
      sx={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        borderRadius: 1.5,
        border: '1px dashed',
        borderColor: 'divider',
        color: 'text.disabled',
        px: 1,
        py: 0.75,
      }}
    >
      <Typography variant="caption">Add a lesson</Typography>
    </ButtonBase>
  );
}

function mayAddOn(state: SessionState): boolean {
  return state === 'open' || state === 'unknown';
}

export function CalendarWeek({
  days,
  periods,
  lessons,
  sittings,
  names,
  today,
  mayWrite,
  onAct,
}: CalendarViewProps): React.ReactElement {
  const columns: SlotGridColumn[] = days.map((day) => ({
    key: day.date,
    label: (
      <Box component="span" sx={STACKED_SPAN}>
        <span>{longDay(day.date)}</span>
        <SessionChip day={day} showType />
      </Box>
    ),
    short: (
      <Box component="span" sx={STACKED_SPAN}>
        <span>{shortDay(day.date)}</span>
        <SessionChip day={day} />
      </Box>
    ),
    highlight: day.date === today,
  }));

  const rows: SlotGridRow[] = periods.map((period) => ({
    key: period.id,
    label: period.name,
    meta: minuteSpan(period.startMinute, period.endMinute) ?? undefined,
    muted: period.kind !== undefined && period.kind !== 'teaching',
  }));

  const byDate = new Map(days.map((day) => [day.date, day]));

  return (
    <SlotGrid
      ariaLabel="Lessons and exams for this class, by period and date"
      columns={columns}
      rows={rows}
      renderCell={(row, column) => {
        const day = byDate.get(column.key);
        const state = sessionStateOf(day);
        const key = cellKey(column.key, row.key);
        const here = lessons.get(key) ?? [];
        const exams = sittings.get(key) ?? [];
        const period = periods.find((entry) => entry.id === row.key);

        return (
          <Stack spacing={0.75} sx={{ minHeight: 34 }}>
            {here.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                names={names}
                onEdit={
                  mayWrite
                    ? () => onAct({ date: column.key, period, lesson, sessionState: state })
                    : undefined
                }
              />
            ))}
            {exams.map((sitting) => (
              <SittingCard key={sitting.id} sitting={sitting} names={names} />
            ))}
            {here.length > 0 && exams.length > 0 ? (
              <Typography variant="caption" color="warning.main" sx={{ lineHeight: 1.3 }}>
                Both are on this period.
              </Typography>
            ) : null}
            {mayWrite && mayAddOn(state) ? (
              <AddCell
                label={`Add a lesson on ${longDate(column.key)}, ${period?.name ?? 'this period'}`}
                onClick={() =>
                  onAct({ date: column.key, period, lesson: undefined, sessionState: state })
                }
              />
            ) : null}
          </Stack>
        );
      }}
    />
  );
}

export function CalendarMonth({
  anchor,
  days,
  today,
  onPickDate,
}: {
  anchor: string;
  days: readonly SectionCalendarDay[];
  today: string;
  onPickDate: (date: string) => void;
}): React.ReactElement {
  const byDate = new Map(days.map((day) => [day.date, day]));

  return (
    <MonthGrid
      anchor={anchor}
      ariaLabel="This class, month by month"
      onSelect={(cell) => onPickDate(cell.date)}
      dayLabel={(cell) => {
        const day = byDate.get(cell.date);
        const tally = tallyOf(day);
        return `${longDate(cell.date)} — ${SESSION_PRESENTATION[sessionStateOf(day)].label}, ${tally.lessons} lessons, ${tally.sittings} exam sittings`;
      }}
      renderDay={(cell) => {
        const day = byDate.get(cell.date);
        const tally = tallyOf(day);
        return (
          <Stack spacing={0.5} sx={{ minWidth: 0 }}>
            <SessionChip day={day} showType />
            {tally.lessons > 0 ? (
              <Typography variant="caption" color="text.secondary">
                {tally.lessons} {tally.lessons === 1 ? 'lesson' : 'lessons'}
                {tally.cancelled > 0 ? `, ${tally.cancelled} cancelled` : ''}
                {tally.changed > 0 ? `, ${tally.changed} changed` : ''}
              </Typography>
            ) : null}
            {tally.sittings > 0 ? (
              <Typography variant="caption" color="text.secondary">
                {tally.sittings} {tally.sittings === 1 ? 'exam' : 'exams'}
              </Typography>
            ) : null}
            {cell.date === today ? (
              <Typography variant="caption" color="text.secondary">
                Today
              </Typography>
            ) : null}
          </Stack>
        );
      }}
    />
  );
}

export function CalendarList({
  days,
  periods,
  lessons,
  sittings,
  names,
  mayWrite,
  onAct,
}: CalendarViewProps): React.ReactElement {
  return (
    <Stack spacing={2.5}>
      {days.map((day) => {
        const state = sessionStateOf(day);
        const onThisDay = day.lessons ?? [];
        const examsToday = day.exam_sittings ?? [];

        return (
          <Box key={day.date} component="section" aria-label={longDate(day.date)}>
            <SectionHeader title={longDate(day.date)} />
            <Box sx={{ pb: 1 }}>
              <SessionChip day={day} showType />
            </Box>

            {onThisDay.length === 0 && examsToday.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {state === 'open'
                  ? 'Nothing is scheduled for this class on this date.'
                  : SESSION_PRESENTATION[state].note}
              </Typography>
            ) : null}

            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {onThisDay.map((lesson) => {
                const presentation = occurrencePresentation(lesson.state);
                const period = periods.find((entry) => entry.id === lesson.period_id);
                const detail = lessonDetail(lesson, names);
                const clashes =
                  (sittings.get(cellKey(day.date, lesson.period_id ?? '')) ?? []).length > 0;

                return (
                  <Box component="li" key={lesson.id}>
                    <Row
                      title={
                        <Box
                          component="span"
                          sx={{
                            textDecoration: presentation.struck ? 'line-through' : 'none',
                          }}
                        >
                          {lessonTitle(lesson, names)}
                        </Box>
                      }
                      subtitle={[
                        period?.name ?? lesson.period_name ?? 'Period',
                        ...detail,
                        lesson.reason ?? '',
                        clashes ? 'An exam is on this period as well' : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      trailing={
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          {presentation.label ? (
                            <EmergeChip
                              label={presentation.label}
                              tone={presentation.tone}
                              dot
                            />
                          ) : null}
                          {mayWrite ? (
                            <ButtonBase
                              aria-label={`Change ${lessonTitle(lesson, names)} on ${longDate(day.date)}`}
                              onClick={() =>
                                onAct({
                                  date: day.date,
                                  period,
                                  lesson,
                                  sessionState: state,
                                })
                              }
                              sx={{
                                px: 1,
                                py: 0.5,
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: 'divider',
                              }}
                            >
                              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                Change
                              </Typography>
                            </ButtonBase>
                          ) : null}
                        </Stack>
                      }
                    />
                  </Box>
                );
              })}

              {examsToday.map((sitting) => (
                <Box component="li" key={sitting.id}>
                  <Row
                    title="Examination"
                    subtitle={[
                      periods.find((entry) => entry.id === sitting.period_id)?.name ??
                        'Period',
                      sitting.room_id ? names.room(sitting.room_id) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    trailing={<EmergeChip label="Exam sitting" tone="violet" dot />}
                  />
                </Box>
              ))}
            </Box>

            {mayWrite && mayAddOn(state) ? (
              <Box sx={{ pt: 1, maxWidth: 220 }}>
                <AddCell
                  label={`Add a lesson on ${longDate(day.date)}`}
                  onClick={() =>
                    onAct({
                      date: day.date,
                      period: undefined,
                      lesson: undefined,
                      sessionState: state,
                    })
                  }
                />
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Stack>
  );
}
