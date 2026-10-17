'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { MonthGrid, type MonthGridDay } from '@/components/ui/month-grid';
import { Segmented } from '@/components/ui/segmented';
import { DAY_TYPE_LABELS } from '@/constants/school';
import { useCalendarDays, useDaySchedules } from '@/hooks/query/use-school';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import {
  dateOnly,
  datesBetween,
  isoDayOf,
  longDate,
  monthBounds,
  monthLabel,
  shiftMonth,
  todayISO,
} from '@/lib/school/time';
import { CalendarDayDialog } from './calendar-day-dialog';
import { CalendarFillDialog } from './calendar-fill-dialog';
import { SchoolScopeBar, useSchoolScope } from './school-scope';
import { useUrlState } from './url-state';
import type { CalendarDay } from '@/types/school';

/**
 * The year: which dates the school is open, for which half, and what each one
 * is called.
 *
 * ## Every date in the month is drawn, including the ones with no record
 *
 * A date is in session if and only if a `calendar_days` row exists for
 * (branch, date) AND the relevant half is open. Absence of a row means NOT in
 * session. So this lists DATES, not rows, and a date with nothing behind it
 * says exactly that — listing only the rows would show a term with its holidays
 * missing and no way to tell a holiday from a date nobody has entered yet.
 *
 * A holiday is a row with both halves shut and a name on it: the same fact with
 * a label, not a competing representation.
 */
export function CalendarBoard(): React.ReactElement {
  const scope = useSchoolScope();
  const { get, put } = useUrlState();

  const anchor = get('month') ?? todayISO();
  const { from, to } = monthBounds(anchor);

  const days = useCalendarDays(scope.branchId, from, to);
  const rows = days.data ?? [];

  const view = get('view') === 'list' ? 'list' : 'calendar';

  const [editing, setEditing] = React.useState<string | null>(null);
  const [filling, setFilling] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(new Set());

  const paint = React.useCallback((dates: string[], select: boolean) => {
    setPicked((current) => {
      const next = new Set(current);
      for (const date of dates) {
        if (select) next.add(date);
        else next.delete(date);
      }
      return next;
    });
  }, []);

  const byDate = new Map(rows.map((row) => [dateOnly(row.calendar_date), row]));
  const dates = datesBetween(from, to, 31);

  const open = rows.filter((row) => row.forenoon_open || row.afternoon_open).length;

  return (
    <Stack spacing={2.5}>
      <SchoolScopeBar scope={scope} />

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <IconButton
            size="small"
            aria-label="Previous month"
            onClick={() => put({ month: shiftMonth(anchor, -1) })}
          >
            <ChevronLeft size={18} />
          </IconButton>
          <Typography variant="h4" component="h3" sx={{ minWidth: 180, textAlign: 'center' }}>
            {monthLabel(anchor)}
          </Typography>
          <IconButton
            size="small"
            aria-label="Next month"
            onClick={() => put({ month: shiftMonth(anchor, 1) })}
          >
            <ChevronRight size={18} />
          </IconButton>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary" aria-live="polite">
            {open} of {dates.length} dates in session
          </Typography>
          <Segmented
            ariaLabel="How to show the year"
            value={view}
            onChange={(next) => put({ view: next === 'calendar' ? null : next })}
            options={[
              { value: 'calendar', label: 'Calendar' },
              { value: 'list', label: 'List' },
            ]}
          />
          {view === 'calendar' ? (
            <Button
              size="small"
              variant={picking ? 'contained' : 'outlined'}
              onClick={() => {
                setPicking((on) => !on);
                setPicked(new Set());
              }}
              disabled={!scope.branchId || !scope.sessionId}
            >
              {picking ? 'Done picking' : 'Pick dates'}
            </Button>
          ) : null}
          <Button
            size="small"
            variant="outlined"
            startIcon={<CalendarPlus size={16} />}
            onClick={() => setFilling(true)}
            disabled={!scope.branchId || !scope.sessionId}
          >
            Fill a range
          </Button>
        </Stack>
      </Stack>

      {days.isPending && scope.branchId ? <WidgetLoading rows={6} /> : null}
      {days.isError ? (
        <WidgetError error={days.error} onRetry={() => void days.refetch()} />
      ) : null}

      {days.data && dates.length === 0 ? (
        <WidgetEmpty message="This month has no dates, which should be impossible." />
      ) : null}

      {picking ? (
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Typography variant="body2" aria-live="polite">
            {picked.size} {picked.size === 1 ? 'date' : 'dates'} picked. Drag across the
            grid to pick a run of days.
          </Typography>
          <Button
            size="small"
            variant="contained"
            disabled={picked.size === 0}
            onClick={() => setFilling(true)}
          >
            Fill these
          </Button>
          <Button size="small" disabled={picked.size === 0} onClick={() => setPicked(new Set())}>
            Clear
          </Button>
        </Stack>
      ) : null}

      {days.data && view === 'calendar' ? (
        <MonthGrid
          anchor={anchor}
          ariaLabel={`${monthLabel(anchor)}, every date and whether the school is open`}
          selected={picking ? picked : undefined}
          onPaint={picking ? paint : undefined}
          onSelect={(day: MonthGridDay) => setEditing(day.date)}
          dayLabel={(day: MonthGridDay) =>
            `${longDate(day.date)}, ${openLabel(byDate.get(day.date))}`
          }
          renderDay={(day: MonthGridDay) => (
            <CalendarCell day={byDate.get(day.date)} inMonth={day.inMonth} />
          )}
        />
      ) : null}

      {days.data && view === 'list' ? (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Kind</TableCell>
                <TableCell>Open</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Bell</TableCell>
                <TableCell align="right">Edit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dates.map((date) => (
                <CalendarRow
                  key={date}
                  date={date}
                  day={byDate.get(date)}
                  schemeId={scope.schemeId}
                  onEdit={() => setEditing(date)}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      <CalendarDayDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        date={editing ?? from}
        day={editing ? byDate.get(editing) : undefined}
        branchId={scope.branchId}
        sessionId={scope.sessionId}
        schemeId={scope.schemeId}
        bells={scope.bells}
      />

      <CalendarFillDialog
        open={filling}
        onClose={() => {
          setFilling(false);
          setPicked(new Set());
          setPicking(false);
        }}
        dates={picking && picked.size > 0 ? [...picked].sort() : undefined}
        from={from}
        to={to}
        existing={rows}
        branchId={scope.branchId}
        sessionId={scope.sessionId}
        schemeId={scope.schemeId}
        bells={scope.bells}
      />
    </Stack>
  );
}

function CalendarCell({
  day,
  inMonth,
}: {
  day: CalendarDay | undefined;
  inMonth: boolean;
}): React.ReactElement {
  if (!day) {
    return (
      <Typography variant="caption" color="text.secondary">
        {inMonth ? 'No record' : ''}
      </Typography>
    );
  }

  return (
    <Stack spacing={0.5} sx={{ minWidth: 0 }}>
      <EmergeChip
        label={DAY_TYPE_LABELS[day.day_type ?? 'instructional']}
        tone={day.forenoon_open || day.afternoon_open ? 'green' : 'grey'}
        dot
      />
      {day.name ? (
        <Typography variant="caption" sx={{ fontWeight: 600 }} noWrap title={day.name}>
          {day.name}
        </Typography>
      ) : null}
      <Typography variant="caption" color="text.secondary">
        {openLabel(day)}
      </Typography>
    </Stack>
  );
}

function CalendarRow({
  date,
  day,
  schemeId,
  onEdit,
}: {
  date: string;
  day: CalendarDay | undefined;
  schemeId: string | null;
  onEdit: () => void;
}): React.ReactElement {
  return (
    <TableRow hover sx={{ opacity: day ? 1 : 0.65 }}>
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: day ? 700 : 400 }}>
          {longDate(date)}
        </Typography>
      </TableCell>
      <TableCell>
        {day ? (
          <EmergeChip label={DAY_TYPE_LABELS[day.day_type ?? 'instructional']} />
        ) : (
          <Typography variant="body2" color="text.secondary">
            No record
          </Typography>
        )}
      </TableCell>
      <TableCell>
        <Typography variant="body2" color={day ? 'text.primary' : 'text.secondary'}>
          {openLabel(day)}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2">{day?.name ?? '—'}</Typography>
      </TableCell>
      <TableCell>
        {day ? <BellCell dayId={day.id} schemeId={schemeId} /> : <span>—</span>}
      </TableCell>
      <TableCell align="right">
        <Button size="small" onClick={onEdit}>
          {day ? 'Edit' : 'Add'}
        </Button>
      </TableCell>
    </TableRow>
  );
}

/**
 * Which bell rings on this day.
 *
 * One query per day that has a row, which is up to 31 on a month — acceptable
 * because `/calendar-days/{id}/schedules` is the only way to ask: the day row
 * carries no schedule edge, and there is no filter that would fetch a month's
 * worth in one request. TanStack caches each by day id, so paging back to a
 * month costs nothing.
 */
function BellCell({
  dayId,
  schemeId,
}: {
  dayId: string;
  schemeId: string | null;
}): React.ReactElement {
  const schedules = useDaySchedules(dayId);
  const row = schedules.data?.rows.find((entry) => entry.period_scheme_id === schemeId);

  if (schedules.isPending) return <span>…</span>;
  if (schedules.isError) return <span>—</span>;
  return (
    <Typography variant="body2" color={row ? 'text.primary' : 'text.secondary'}>
      {row ? 'Attached' : 'None'}
    </Typography>
  );
}

function openLabel(day: CalendarDay | undefined): string {
  if (!day) return 'Not in session';
  const fn = day.forenoon_open ?? false;
  const an = day.afternoon_open ?? false;
  if (fn && an) return 'Both halves';
  if (fn) return 'Forenoon only';
  if (an) return 'Afternoon only';
  return 'Closed all day';
}
