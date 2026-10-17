'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Segmented } from '@/components/ui/segmented';
import {
  WidgetDegraded,
  WidgetEmpty,
  WidgetError,
  WidgetLoading,
} from '@/components/widgets/widget-states';
import { useTimetableGrants } from '@/components/school/timetable-grants';
import { useSectionCalendar } from '@/hooks/query/use-section-calendar';
import {
  usePeriods,
  useRooms,
  useSectionOfferings,
  useSectionTeachers,
  useTeacherDirectory,
} from '@/hooks/query/use-school';
import {
  lessonsByCell,
  periodAxis,
  schemeOf,
  sessionStateOf,
  sittingsByCell,
} from '@/lib/classroom/section-calendar';
import { shiftWeek, shortRange, weekOf, type Week } from '@/lib/classroom/week';
import { byId, offeringLabel, roomLabel, shortId, teacherNames } from '@/lib/school/names';
import { monthLabel, monthMatrix, shiftMonth } from '@/lib/school/time';
import { DeviationDialog, type DeviationTarget } from './deviation-dialog';
import {
  CalendarList,
  CalendarMonth,
  CalendarWeek,
  type CalendarNames,
} from './section-calendar-views';

export type CalendarView = 'week' | 'month' | 'list';

export function CalendarTab({
  sectionId,
  sectionName,
  branchId,
  anchor,
  today,
  onAnchor,
  view,
  onView,
}: {
  sectionId: string;
  sectionName: string;
  branchId: string | undefined;
  anchor: string;
  today: string;
  onAnchor: (date: string | null) => void;
  view: CalendarView;
  onView: (next: CalendarView) => void;
}): React.ReactElement {
  const [target, setTarget] = React.useState<DeviationTarget | null>(null);

  const week: Week = weekOf(anchor);
  const range = React.useMemo(() => {
    if (view !== 'month') return weekOf(anchor);
    const weeks = monthMatrix(anchor);
    const first = weeks[0]?.[0] ?? anchor;
    const last = weeks[weeks.length - 1]?.[6] ?? anchor;
    return { from: first, to: last };
  }, [view, anchor]);

  const calendar = useSectionCalendar(sectionId, range.from, range.to);
  const days = React.useMemo(() => calendar.data?.days ?? [], [calendar.data]);
  const branch = calendar.data?.branch_id ?? branchId ?? null;

  const grants = useTimetableGrants();
  const schemeId = React.useMemo(() => schemeOf(days), [days]);
  const periodsQuery = usePeriods(schemeId);
  const offeringsQuery = useSectionOfferings(sectionId);
  const roomsQuery = useRooms(grants.mayWrite ? branch : null);
  const assignmentsQuery = useSectionTeachers(grants.mayWrite ? sectionId : null);

  const teacherIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const row of assignmentsQuery.data ?? []) {
      if (row.teacher_id) ids.add(row.teacher_id);
    }
    for (const day of days) {
      for (const lesson of day.lessons ?? []) {
        if (lesson.teacher_id) ids.add(lesson.teacher_id);
        if (lesson.planned_teacher_id) ids.add(lesson.planned_teacher_id);
      }
    }
    return [...ids];
  }, [assignmentsQuery.data, days]);

  const directoryQuery = useTeacherDirectory(teacherIds.length > 0);

  const periods = React.useMemo(
    () => periodAxis(days, periodsQuery.data?.rows ?? []),
    [days, periodsQuery.data],
  );
  const lessons = React.useMemo(() => lessonsByCell(days), [days]);
  const sittings = React.useMemo(() => sittingsByCell(days), [days]);

  const names = React.useMemo<CalendarNames>(() => {
    const offerings = byId(offeringsQuery.data ?? []);
    const rooms = byId(roomsQuery.data?.rows ?? []);
    const people = teacherNames(directoryQuery.data?.rows ?? []);
    const denied = directoryQuery.isError;
    return {
      offering: (id) => (id ? offeringLabel(offerings.get(id)) : 'Lesson'),
      room: (id) => (id ? roomLabel(rooms.get(id)) : 'No room'),
      teacher: (id) => {
        if (!id) return 'No teacher';
        const name = people.get(id);
        if (name) return name;
        return denied ? 'Teacher (name withheld)' : `Teacher ${shortId(id)}`;
      },
    };
  }, [offeringsQuery.data, roomsQuery.data, directoryQuery.data, directoryQuery.isError]);

  const teacherChoices = React.useMemo(
    () => teacherIds.map((id) => ({ id, label: names.teacher(id) })),
    [teacherIds, names],
  );
  const roomChoices = React.useMemo(
    () => (roomsQuery.data?.rows ?? []).map((room) => ({ id: room.id, label: roomLabel(room) })),
    [roomsQuery.data],
  );
  const offeringChoices = React.useMemo(
    () =>
      (offeringsQuery.data ?? []).map((offering) => ({
        id: offering.id,
        label: offeringLabel(offering),
      })),
    [offeringsQuery.data],
  );

  const anythingScheduled = days.some(
    (day) => (day.lessons ?? []).length > 0 || (day.exam_sittings ?? []).length > 0,
  );
  const doubleBooked = days.some((day) => {
    const taken = new Set((day.exam_sittings ?? []).map((sitting) => sitting.period_id));
    return (day.lessons ?? []).some(
      (lesson) => lesson.state !== 'cancelled' && taken.has(lesson.period_id),
    );
  });
  const unreadableDays = days.filter((day) => sessionStateOf(day) === 'unknown').length;

  const stepBack = (): void =>
    onAnchor(view === 'month' ? shiftMonth(anchor, -1) : shiftWeek(week, -1).from);
  const stepOn = (): void =>
    onAnchor(view === 'month' ? shiftMonth(anchor, 1) : shiftWeek(week, 1).from);

  const rangeLabel = view === 'month' ? monthLabel(anchor) : shortRange(week);

  const navigation = (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Button
        size="small"
        startIcon={<ChevronLeft size={16} />}
        onClick={stepBack}
        aria-label={view === 'month' ? 'Previous month' : 'Previous week'}
      >
        {view === 'month' ? 'Previous month' : 'Previous week'}
      </Button>
      <Button size="small" onClick={() => onAnchor(null)}>
        Today
      </Button>
      <Button
        size="small"
        endIcon={<ChevronRight size={16} />}
        onClick={stepOn}
        aria-label={view === 'month' ? 'Next month' : 'Next week'}
      >
        {view === 'month' ? 'Next month' : 'Next week'}
      </Button>
      <Typography variant="body2" color="text.secondary" aria-live="polite">
        {rangeLabel}
      </Typography>
      <Box sx={{ flexGrow: 1 }} />
      <Segmented
        ariaLabel="How to show this class's calendar"
        value={view}
        onChange={onView}
        options={[
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'list', label: 'List' },
        ]}
      />
    </Stack>
  );

  return (
    <Stack spacing={2.5}>
      {navigation}

      {calendar.isPending ? <WidgetLoading rows={6} /> : null}
      {calendar.isError ? (
        <WidgetError error={calendar.error} onRetry={() => void calendar.refetch()} />
      ) : null}

      {calendar.data && unreadableDays > 0 ? (
        <Alert severity="info" variant="outlined">
          {unreadableDays === 1
            ? 'One date in this range has a calendar entry this account may not read, so whether the school is open then is unknown rather than closed.'
            : `${unreadableDays} dates in this range have calendar entries this account may not read, so whether the school is open on them is unknown rather than closed.`}
        </Alert>
      ) : null}

      {calendar.data && doubleBooked ? (
        <Alert severity="warning" variant="outlined">
          A lesson and an examination are shown on the same period. Scheduling an exam
          sitting does not yet cancel the lesson it displaces, so both are drawn rather
          than one being guessed away. Cancel the lesson for that date if the exam is
          what happens.
        </Alert>
      ) : null}

      {calendar.data && !anythingScheduled ? (
        <WidgetEmpty message="Nothing is scheduled for this class in this range." />
      ) : null}

      {offeringsQuery.isError ? (
        <WidgetDegraded
          error={offeringsQuery.error}
          denied="Subject names are not readable by this account, so lessons are shown by their period alone."
          unavailable="Subject names could not be loaded, so lessons are shown by their period alone."
        />
      ) : null}

      {calendar.data ? (
        <Box sx={{ opacity: calendar.isPlaceholderData ? 0.6 : 1 }}>
          {view === 'week' ? (
            <CalendarWeek
              days={days}
              periods={periods}
              lessons={lessons}
              sittings={sittings}
              names={names}
              today={today}
              mayWrite={grants.mayWrite}
              onAct={setTarget}
            />
          ) : null}

          {view === 'month' ? (
            <CalendarMonth
              anchor={anchor}
              days={days}
              today={today}
              onPickDate={(date) => {
                onAnchor(date);
                onView('week');
              }}
            />
          ) : null}

          {view === 'list' ? (
            <CalendarList
              days={days}
              periods={periods}
              lessons={lessons}
              sittings={sittings}
              names={names}
              today={today}
              mayWrite={grants.mayWrite}
              onAct={setTarget}
            />
          ) : null}
        </Box>
      ) : null}

      {grants.mayWrite ? (
        <DeviationDialog
          target={target}
          onClose={() => setTarget(null)}
          sectionId={sectionId}
          sectionName={sectionName}
          periods={periods}
          offerings={offeringChoices}
          rooms={roomChoices}
          teachers={teacherChoices}
          mayDelete={grants.mayDelete}
        />
      ) : null}
    </Stack>
  );
}
