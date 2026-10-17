'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';

import { BULK_FILL_MAX_DAYS, DAY_TYPE_LABELS } from '@/constants/school';
import { queryKeys } from '@/constants/query-keys';
import { ApiError } from '@/services/api';
import { schoolService } from '@/services/school';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { DAY_NAMES, DAY_SHORT, ISO_DAYS } from '@/constants/school';
import { datesBetween, isoDayOf, longDate } from '@/lib/school/time';
import { DAY_TYPES, type BellSchedule, type CalendarDay, type DayType } from '@/types/school';

/**
 * Filling a term.
 *
 * A term is about ninety-six days and nobody is going to click ninety-six
 * times. There is NO bulk endpoint — `POST /calendar-days` takes one date — so
 * this walks the range one request at a time, in order, reporting as it goes.
 * Sequential rather than parallel on purpose: a hundred simultaneous writes
 * against one tenant is a load test nobody asked for, and a failure halfway
 * through a parallel burst leaves a range that cannot be described.
 *
 * ## What it skips, and why it says so
 *
 * Which weekdays the school is shut is a CHOICE, not a constant. Sunday is only
 * the default because it is the commonest; a school that closes on Friday, or on
 * Friday and Saturday, says so here and the fill obeys it. A six-day school has a
 * genuinely different Saturday, which is what the separate bell schedule is for. A date
 * that ALREADY has a row is skipped rather than overwritten: the existing row
 * may be the holiday somebody entered by hand, and a range fill must not
 * quietly turn Diwali back into a teaching day.
 *
 * Every day created can be given the same bell schedule in the same pass, which
 * is the other ninety-six clicks.
 */
function closedLabel(closed: number[]): string {
  if (closed.length === 0) return 'No weekday is skipped.';
  const names = [...closed].sort((a, b) => a - b).map((day) => DAY_NAMES[day]);
  if (names.length === 1) return `${names[0]}s are skipped.`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are skipped.`;
}

export interface CalendarFillDialogProps {
  open: boolean;
  onClose: () => void;
  from: string;
  to: string;
  existing: readonly CalendarDay[];
  branchId: string | null;
  sessionId: string | null;
  schemeId: string | null;
  bells: readonly BellSchedule[];
  dates?: readonly string[];
}

/**
 * Mounted and keyed on the range it opened over, so the progress of one run is
 * never carried into the next. See `calendar-day-dialog.tsx` for why this is
 * not an effect that resets state.
 */
export function CalendarFillDialog(props: CalendarFillDialogProps): React.ReactElement {
  // Held out here so a click on the backdrop cannot dismiss a run that is
  // halfway through creating ninety-six days.
  const [running, setRunning] = React.useState(false);

  return (
    <Dialog
      open={props.open}
      onClose={running ? undefined : props.onClose}
      fullWidth
      maxWidth="sm"
    >
      {props.open ? (
        <FillForm
          key={`${props.from}:${props.to}:${(props.dates ?? []).join(',')}`}
          {...props}
          running={running}
          setRunning={setRunning}
        />
      ) : null}
    </Dialog>
  );
}

function FillForm({
  onClose,
  from,
  to,
  existing,
  branchId,
  sessionId,
  schemeId,
  bells,
  dates,
  running,
  setRunning,
}: CalendarFillDialogProps & {
  running: boolean;
  setRunning: (value: boolean) => void;
}): React.ReactElement {
  const queryClient = useQueryClient();

  const [start, setStart] = React.useState(from);
  const [end, setEnd] = React.useState(to);
  const [dayType, setDayType] = React.useState<DayType>('instructional');
  const [closedDays, setClosedDays] = React.useState<number[]>([7]);
  const [bellId, setBellId] = React.useState('');
  const [done, setDone] = React.useState(0);
  const [created, setCreated] = React.useState(0);
  const [failures, setFailures] = React.useState<string[]>([]);
  const [finished, setFinished] = React.useState(false);

  const taken = new Set(
    existing.map((day) => (day.calendar_date ?? '').slice(0, 10)).filter(Boolean),
  );

  const picked = dates !== undefined;

  const candidates = picked
    ? [...dates].filter((date) => !taken.has(date)).slice(0, BULK_FILL_MAX_DAYS)
    : datesBetween(start, end, BULK_FILL_MAX_DAYS).filter((date) => {
        if (closedDays.includes(isoDayOf(date))) return false;
        return !taken.has(date);
      });

  const tooLong = picked
    ? dates.length > BULK_FILL_MAX_DAYS
    : datesBetween(start, end, BULK_FILL_MAX_DAYS + 1).length > BULK_FILL_MAX_DAYS;

  const run = async (): Promise<void> => {
    if (!branchId || !sessionId) return;
    setRunning(true);
    setFinished(false);
    setDone(0);
    setCreated(0);
    setFailures([]);

    const problems: string[] = [];
    let made = 0;

    for (const date of candidates) {
      try {
        const day = await schoolService.createCalendarDay({
          academic_session_id: sessionId,
          branch_id: branchId,
          calendar_date: date,
          day_type: dayType,
          forenoon_open: true,
          afternoon_open: true,
        });
        made += 1;
        if (bellId && schemeId) {
          await schoolService.attachDaySchedule(day.id, {
            period_scheme_id: schemeId,
            bell_schedule_id: bellId,
          });
        }
      } catch (cause) {
        const why = cause instanceof ApiError ? cause.message : 'could not be created';
        problems.push(`${longDate(date)}: ${why}`);
      }
      setDone((count) => count + 1);
    }

    setCreated(made);
    setFailures(problems);
    setRunning(false);
    setFinished(true);
    void queryClient.invalidateQueries({ queryKey: queryKeys.school.all });
  };

  return (
    <>
      <DialogTitle>{picked ? 'Fill the dates you picked' : 'Fill a range'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {picked ? null : (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              type="date"
              label="From"
              size="small"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              type="date"
              label="To"
              size="small"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
          </Stack>
          )}

          <TextField
            select
            label="Kind of day"
            size="small"
            value={dayType}
            onChange={(event) => setDayType(event.target.value as DayType)}
          >
            {DAY_TYPES.map((value) => (
              <MenuItem key={value} value={value}>
                {DAY_TYPE_LABELS[value]}
              </MenuItem>
            ))}
          </TextField>

          {picked ? null : (
          <Stack spacing={0.75}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Closed every week on
            </Typography>
            <ToggleButtonGroup
              size="small"
              value={closedDays}
              onChange={(_event, next: number[]) => setClosedDays(next)}
              aria-label="Weekdays the school is closed"
            >
              {ISO_DAYS.map((day) => (
                <ToggleButton key={day} value={day} aria-label={DAY_NAMES[day]}>
                  {DAY_SHORT[day]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary">
              No day is created for these. Leave none selected to fill all seven.
            </Typography>
          </Stack>
          )}

          <TextField
            select
            label="Bell schedule for each day"
            size="small"
            value={bellId}
            onChange={(event) => setBellId(event.target.value)}
            disabled={!schemeId || bells.length === 0}
            helperText="Optional. Days can be given a bell one at a time afterwards."
          >
            <MenuItem value="">Leave unattached</MenuItem>
            {bells.map((bell) => (
              <MenuItem key={bell.id} value={bell.id}>
                {bell.name ?? bell.code ?? bell.id}
                {bell.is_default ? ' (default)' : ''}
              </MenuItem>
            ))}
          </TextField>

          <Typography variant="body2" color="text.secondary">
            {candidates.length} {candidates.length === 1 ? 'day' : 'days'} will be
            created. {picked ? '' : closedLabel(closedDays) + ' '}Dates that already
            have a record are left exactly as they are.
          </Typography>

          {tooLong ? (
            <Alert severity="info" variant="outlined">
              Only the first {BULK_FILL_MAX_DAYS} days of this range are considered.
              Fill it in two passes.
            </Alert>
          ) : null}

          {running || finished ? (
            <Stack spacing={1}>
              <LinearProgress
                variant="determinate"
                value={candidates.length === 0 ? 100 : (done / candidates.length) * 100}
              />
              <Typography variant="body2" color="text.secondary" aria-live="polite">
                {running
                  ? `${done} of ${candidates.length} done`
                  : `${created} created, ${failures.length} refused`}
              </Typography>
            </Stack>
          ) : null}

          {failures.length > 0 ? (
            <Alert severity="warning" variant="outlined">
              <Stack spacing={0.5}>
                {failures.slice(0, 5).map((line) => (
                  <Typography variant="body2" key={line}>
                    {line}
                  </Typography>
                ))}
                {failures.length > 5 ? (
                  <Typography variant="body2">
                    and {failures.length - 5} more.
                  </Typography>
                ) : null}
              </Stack>
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={running}>
          {finished ? 'Close' : 'Cancel'}
        </Button>
        <Button
          variant="contained"
          onClick={() => void run()}
          disabled={
            running || candidates.length === 0 || !branchId || !sessionId || finished
          }
        >
          Create {candidates.length} days
        </Button>
      </DialogActions>
    </>
  );
}
