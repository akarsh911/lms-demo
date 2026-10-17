'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { CLOSED_DAY_TYPES, DAY_TYPE_LABELS } from '@/constants/school';
import {
  useAttachDaySchedule,
  useCreateCalendarDay,
  useDeleteCalendarDay,
  useDetachDaySchedule,
  useUpdateCalendarDay,
  useUpdateDaySchedule,
} from '@/hooks/mutation/use-school';
import { useDaySchedules } from '@/hooks/query/use-school';
import { longDate } from '@/lib/school/time';
import { DAY_TYPES, type BellSchedule, type CalendarDay, type DayType } from '@/types/school';

/**
 * One day of the year: what kind of day it is, which halves the school is open,
 * what it is called, and which bell rings.
 *
 * ## The instructional rule is enforced here because the database enforces it
 *
 * `calendar_days_instructional_open` is a CHECK constraint:
 * `day_type <> 'instructional' OR forenoon_open OR afternoon_open`. A teaching
 * day with both halves shut is refused by Postgres, and what comes back is a
 * driver error, not a sentence a principal can act on. The form says it first,
 * in its own words, and keeps the save control out of reach until it is true.
 *
 * ## A holiday is a row, not a missing row
 *
 * Deleting a day does not make it a holiday — it makes it a date with no row,
 * which means NOT IN SESSION and no label anywhere. A holiday is this same
 * record with both halves shut and a name on it. The delete control says so.
 */
export interface CalendarDayDialogProps {
  open: boolean;
  onClose: () => void;
  date: string;
  day: CalendarDay | undefined;
  branchId: string | null;
  sessionId: string | null;
  schemeId: string | null;
  bells: readonly BellSchedule[];
}

/**
 * The form is MOUNTED when the dialog opens and keyed on the date it is
 * pointed at, so its fields are initialised once from props and never
 * synchronised back from them. Mirroring props into state from an effect costs
 * a second render on every refetch and discards whatever the user had typed
 * when one lands mid-edit — which is what `react-hooks/set-state-in-effect`
 * exists to catch.
 */
export function CalendarDayDialog(props: CalendarDayDialogProps): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      {props.open ? <DayForm key={`${props.date}:${props.day?.id ?? 'new'}`} {...props} /> : null}
    </Dialog>
  );
}

function DayForm({
  onClose,
  date,
  day,
  branchId,
  sessionId,
  schemeId,
  bells,
}: CalendarDayDialogProps): React.ReactElement {
  const create = useCreateCalendarDay();
  const update = useUpdateCalendarDay();
  const remove = useDeleteCalendarDay();

  const schedules = useDaySchedules(day?.id ?? null);
  const attach = useAttachDaySchedule();
  const editSchedule = useUpdateDaySchedule();
  const detach = useDetachDaySchedule();

  const [dayType, setDayType] = React.useState<DayType>(day?.day_type ?? 'instructional');
  const [forenoon, setForenoon] = React.useState(day?.forenoon_open ?? true);
  const [afternoon, setAfternoon] = React.useState(day?.afternoon_open ?? true);
  const [name, setName] = React.useState(day?.name ?? '');
  const [notes, setNotes] = React.useState(day?.notes ?? '');

  const scheduleRow = schedules.data?.rows.find(
    (row) => row.period_scheme_id === schemeId,
  );
  // Read straight from the server's answer rather than mirrored into state:
  // this control saves on change, so the query IS the value.
  const bellId = scheduleRow?.bell_schedule_id ?? '';

  const chooseType = (next: DayType): void => {
    setDayType(next);
    if (CLOSED_DAY_TYPES.includes(next)) {
      setForenoon(false);
      setAfternoon(false);
    } else if (next === 'instructional' && !forenoon && !afternoon) {
      setForenoon(true);
      setAfternoon(true);
    }
  };

  const shutAndTeaching = dayType === 'instructional' && !forenoon && !afternoon;
  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const save = (): void => {
    if (shutAndTeaching) return;
    if (day) {
      update.mutate(
        {
          id: day.id,
          patch: {
            day_type: dayType,
            forenoon_open: forenoon,
            afternoon_open: afternoon,
            name: name.trim() === '' ? null : name.trim(),
            notes: notes.trim() === '' ? null : notes.trim(),
          },
        },
        { onSuccess: onClose },
      );
      return;
    }
    if (!branchId || !sessionId) return;
    create.mutate(
      {
        academic_session_id: sessionId,
        branch_id: branchId,
        calendar_date: date,
        day_type: dayType,
        forenoon_open: forenoon,
        afternoon_open: afternoon,
        ...(name.trim() === '' ? {} : { name: name.trim() }),
        ...(notes.trim() === '' ? {} : { notes: notes.trim() }),
      },
      { onSuccess: onClose },
    );
  };

  const saveBell = (next: string): void => {
    if (!day || !schemeId) return;
    if (next === '') {
      if (scheduleRow) detach.mutate(scheduleRow.id);
      return;
    }
    if (scheduleRow) editSchedule.mutate({ id: scheduleRow.id, bell_schedule_id: next });
    else
      attach.mutate({
        dayId: day.id,
        period_scheme_id: schemeId,
        bell_schedule_id: next,
      });
  };

  return (
    <>
      <DialogTitle>{longDate(date)}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {!day ? (
            <Typography variant="body2" color="text.secondary">
              There is no record for this date, so the school is not in session on it.
              Creating one is what puts it in the year.
            </Typography>
          ) : null}

          <TextField
            select
            label="Kind of day"
            size="small"
            value={dayType}
            onChange={(event) => chooseType(event.target.value as DayType)}
          >
            {DAY_TYPES.map((value) => (
              <MenuItem key={value} value={value}>
                {DAY_TYPE_LABELS[value]}
              </MenuItem>
            ))}
          </TextField>

          <Stack direction="row" spacing={3}>
            <FormControlLabel
              control={
                <Switch
                  checked={forenoon}
                  onChange={(event) => setForenoon(event.target.checked)}
                />
              }
              label="Forenoon open"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={afternoon}
                  onChange={(event) => setAfternoon(event.target.checked)}
                />
              }
              label="Afternoon open"
            />
          </Stack>

          {shutAndTeaching ? (
            <Alert severity="warning" variant="outlined">
              A teaching day has to be open for at least one half. Open a half, or
              call this a holiday.
            </Alert>
          ) : null}

          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            helperText="What this day is called — Diwali, Sports Day, Half-yearly exams."
          />

          <TextField
            label="Notes"
            size="small"
            multiline
            minRows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />

          {day ? (
            <>
              <Divider />
              <TextField
                select
                label="Bell schedule"
                size="small"
                value={bellId}
                onChange={(event) => saveBell(event.target.value)}
                disabled={!schemeId || bells.length === 0}
                helperText={
                  schemeId
                    ? 'Which set of times this day runs to. Saved as you choose it.'
                    : 'This branch has no period scheme, so there is no bell to attach.'
                }
              >
                <MenuItem value="">No bell attached</MenuItem>
                {bells.map((bell) => (
                  <MenuItem key={bell.id} value={bell.id}>
                    {bell.name ?? bell.code ?? bell.id}
                    {bell.is_default ? ' (default)' : ''}
                  </MenuItem>
                ))}
              </TextField>
            </>
          ) : null}

          {failure ? (
            <Alert severity="error" variant="outlined">
              {failure.message}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <span>
          {day ? (
            <Button
              color="error"
              size="small"
              disabled={busy}
              onClick={() => remove.mutate(day.id, { onSuccess: onClose })}
            >
              Remove from the year
            </Button>
          ) : null}
        </span>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={busy || shutAndTeaching || (!day && (!branchId || !sessionId))}
          >
            {day ? 'Save' : 'Add to the year'}
          </Button>
        </Stack>
      </DialogActions>
    </>
  );
}
