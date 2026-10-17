'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { Metric } from '@/components/ui/metric';
import { Row } from '@/components/ui/row';
import { useFreeTime } from '@/hooks/query/use-free-time';
import { formatLongDate } from '@/lib/dates';
import { openingOf, shapeOfDay } from '@/lib/people/free-time';
import { joinFacts } from '@/lib/people/text';
import { formatMinuteOfDay, isoDay } from '@/lib/people/window';

import { Panel, PanelList, PanelNote } from './panel';

export function FreeTimeFinder({
  teacherId,
  branchId,
  branchPending,
  nameOffering,
}: {
  teacherId: string;
  branchId: string | null;
  branchPending: boolean;
  nameOffering: (offeringId: string | undefined) => string | null;
}): React.ReactElement {
  const [date, setDate] = React.useState(() => isoDay(new Date()));
  const finder = useFreeTime(teacherId, branchId, date);

  const opening = finder.day.isSuccess ? openingOf(finder.dayRow) : 'unknown';
  const shape = shapeOfDay(
    finder.periods.data?.rows ?? [],
    finder.bell.data?.rows ?? [],
    finder.occurrences.data?.occurrences ?? [],
  );

  const structureReady = finder.periods.isSuccess && finder.bell.isSuccess;

  const picker = (
    <TextField
      type="date"
      label="Day"
      size="small"
      value={date}
      onChange={(event) => setDate(event.target.value)}
      slotProps={{ inputLabel: { shrink: true } }}
      sx={{ maxWidth: 200 }}
    />
  );

  return (
    <Panel
      title="Free time"
      note="Periods with no lesson for this teacher on one day. Derived from the timetable; a day with no calendar entry is not in session, which is not the same as free."
      blocked={
        !branchId && !branchPending
          ? 'A day is resolved per campus, and no campus could be established for this teacher from what you may see. Nothing is listed rather than widening the question to the whole school.'
          : undefined
      }
      isPending={branchPending || finder.day.isPending || finder.occurrences.isPending}
      error={finder.day.error ?? finder.occurrences.error}
      denied="You do not have permission to read the school calendar or the timetable."
      onRetry={() => {
        void finder.day.refetch();
        void finder.occurrences.refetch();
      }}
    >
      <Stack spacing={2}>
        {picker}
        <DayBody
          opening={opening}
          dayName={finder.dayRow?.name}
          dayType={finder.dayRow?.day_type}
          date={date}
          structureReady={structureReady}
          structureError={Boolean(finder.periods.error ?? finder.bell.error)}
          schemeResolved={Boolean(finder.schemeId && finder.bellScheduleId)}
          schemeCount={finder.schemeCount}
          shape={shape}
          nameOffering={nameOffering}
        />
      </Stack>
    </Panel>
  );
}

function DayBody({
  opening,
  dayName,
  dayType,
  date,
  structureReady,
  structureError,
  schemeResolved,
  schemeCount,
  shape,
  nameOffering,
}: {
  opening: 'unknown' | 'closed' | 'open';
  dayName?: string;
  dayType?: string;
  date: string;
  structureReady: boolean;
  structureError: boolean;
  schemeResolved: boolean;
  schemeCount: number;
  shape: ReturnType<typeof shapeOfDay>;
  nameOffering: (offeringId: string | undefined) => string | null;
}): React.ReactElement {
  if (opening === 'unknown') {
    return (
      <Typography variant="body2" color="text.secondary">
        Working out whether {formatLongDate(date)} is a teaching day.
      </Typography>
    );
  }

  if (opening === 'closed') {
    return (
      <Alert severity="info" variant="outlined">
        {formatLongDate(date)} is not a teaching day for this campus, so there is no
        free time to report. A day with no calendar entry is closed, not empty.
        {dayName ? ` This day is recorded as ${dayName}.` : ''}
      </Alert>
    );
  }

  if (structureError) {
    return (
      <Alert severity="info" variant="outlined">
        {formatLongDate(date)} is a teaching day, but its period pattern is not one
        you may read, so the periods cannot be listed.
      </Alert>
    );
  }

  if (!schemeResolved) {
    return (
      <Alert severity="info" variant="outlined">
        {formatLongDate(date)} is a teaching day and this teacher has no lessons on it.
        The day&apos;s period pattern could not be resolved, so the individual periods
        are not listed rather than guessed at from another day.
      </Alert>
    );
  }

  if (!structureReady) {
    return (
      <Typography variant="body2" color="text.secondary">
        Reading the period pattern for {formatLongDate(date)}.
      </Typography>
    );
  }

  if (shape.slots.length === 0) {
    return (
      <Alert severity="info" variant="outlined">
        {formatLongDate(date)} is a teaching day, but its period pattern holds no
        periods.
      </Alert>
    );
  }

  return (
    <>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Metric label="free" value={shape.freeCount} />
        <Metric label="teaching" value={shape.busyCount} />
        <Metric label="cancelled" value={shape.cancelledCount} />
        {dayType ? <Metric label="day" value={dayType} /> : null}
      </Stack>

      <PanelList>
        {shape.slots.map((slot) => (
          <Box component="li" key={slot.periodId}>
            <Row
              title={slot.name}
              subtitle={joinFacts([
                timeRangeOf(slot.startMinute, slot.endMinute),
                slot.code,
                slot.kind,
                slot.state === 'free'
                  ? 'Nothing scheduled'
                  : slot.occurrences
                      .map(
                        (occurrence) =>
                          nameOffering(occurrence.subject_offering_id) ??
                          occurrence.label ??
                          'Lesson',
                      )
                      .join(', '),
                slot.state === 'cancelled'
                  ? 'Cancelled, so nobody is teaching it'
                  : null,
              ])}
              trailing={
                slot.state === 'free' ? (
                  <EmergeChip label="free" tone="green" />
                ) : slot.state === 'cancelled' ? (
                  <EmergeChip label="cancelled" tone="amber" />
                ) : (
                  <Stack direction="row" spacing={0.5}>
                    {slot.occurrences.map((occurrence) =>
                      occurrence.state ? (
                        <EmergeChip key={occurrence.id} label={occurrence.state} />
                      ) : null,
                    )}
                  </Stack>
                )
              }
            />
          </Box>
        ))}
      </PanelList>

      {shape.cancelledCount > 0 ? (
        <PanelNote>
          A cancelled period is counted on its own rather than as free time. Nobody is
          teaching it, but the slot was committed and may be reinstated, so it is not
          the same thing as a period that was never scheduled.
        </PanelNote>
      ) : null}

      {shape.unplaced.length > 0 ? (
        <PanelNote>
          {shape.unplaced.length === 1
            ? 'One lesson on this day sits outside the resolved period pattern and is not shown above.'
            : `${shape.unplaced.length} lessons on this day sit outside the resolved period pattern and are not shown above.`}
        </PanelNote>
      ) : null}

      {schemeCount > 1 ? (
        <PanelNote>
          This campus runs more than one period pattern on this day. The one shown is
          the pattern this teacher&apos;s own lessons fall under.
        </PanelNote>
      ) : null}
    </>
  );
}

function timeRangeOf(start: number | null, end: number | null): string | null {
  const from = formatMinuteOfDay(start ?? undefined);
  const to = formatMinuteOfDay(end ?? undefined);
  if (from && to) return `${from} to ${to}`;
  return from ?? to ?? 'Times not set';
}
