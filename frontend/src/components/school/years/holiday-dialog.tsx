'use client';

import * as React from 'react';
import FormHelperText from '@mui/material/FormHelperText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useSaveHoliday } from '@/hooks/mutation/use-foundation';
import { dateInput, formatDay } from '@/lib/dates';
import { datesBetween, type Holiday } from '@/lib/school/holidays';
import type { AcademicSession } from '@/types/mdm';
import type { CalendarDay } from '@/types/school';

// Longer than any school break, and each date is its own write.
const MAX_DAYS = 62;

export function HolidayDialog({
  year,
  branchId,
  holiday,
  holidays,
  calendar,
  onClose,
}: {
  year: AcademicSession;
  branchId: string;
  // Set when renaming or annotating one that exists; its dates are then fixed.
  holiday?: Holiday;
  holidays: readonly Holiday[];
  calendar: readonly CalendarDay[];
  onClose: () => void;
}): React.ReactElement {
  const [name, setName] = React.useState(holiday?.name ?? '');
  const [from, setFrom] = React.useState(holiday?.from ?? '');
  const [to, setTo] = React.useState(holiday && holiday.to !== holiday.from ? holiday.to : '');
  const [notes, setNotes] = React.useState(holiday?.notes ?? '');
  const mutation = useSaveHoliday();
  const notify = useToast();

  const yearFrom = dateInput(year.start_date);
  const yearTo = dateInput(year.end_date);
  const until = to === '' ? from : to;
  const dates = from === '' ? [] : datesBetween(from, until);

  const problem =
    from === ''
      ? null
      : until < from
        ? 'The holiday cannot end before it starts.'
        : from < yearFrom || until > yearTo
          ? `A holiday has to fall inside the year, ${formatDay(yearFrom)} to ${formatDay(yearTo)}.`
          : dates.length > MAX_DAYS
            ? `A holiday can cover at most ${MAX_DAYS} days.`
            : null;

  // Allowed, but said: two holidays on one date is usually a mistake.
  const overlap = holiday ? undefined : holidays.find((other) => from !== '' && from <= other.to && other.from <= until);

  const submit = (): void => {
    const recordOn = new Map(calendar.map((day) => [(day.calendar_date ?? '').slice(0, 10), day.id]));
    mutation.mutate(
      {
        yearId: year.id,
        branchId,
        name: name.trim(),
        notes: notes.trim(),
        days: holiday ? holiday.days.map((day) => ({ id: day.id, date: (day.calendar_date ?? '').slice(0, 10) })) : dates.map((date) => ({ id: recordOn.get(date), date })),
      },
      {
        onSuccess: () => {
          notify(holiday ? 'Holiday updated' : 'Holiday added');
          onClose();
        },
      },
    );
  };

  return (
    <FormDialog
      open
      title={holiday ? 'Edit holiday' : 'Add holiday'}
      description="The whole school is closed on these dates."
      submitLabel={holiday ? 'Save changes' : 'Add Holiday'}
      pending={mutation.isPending}
      error={mutation.error}
      warning={overlap && !problem ? `${overlap.name} is already on these dates. Saving replaces it there.` : null}
      canSubmit={name.trim() !== '' && from !== '' && problem === null}
      onClose={onClose}
      onSubmit={submit}
    >
      <TextField label="Name" required autoFocus placeholder="Diwali break" value={name} onChange={(event) => setName(event.target.value)} disabled={mutation.isPending} fullWidth />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Date"
          type="date"
          required
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          disabled={mutation.isPending || Boolean(holiday)}
          fullWidth
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: yearFrom, max: yearTo } }}
        />
        <TextField
          label="End date"
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          helperText={holiday ? undefined : 'Only for more than one day'}
          disabled={mutation.isPending || Boolean(holiday)}
          fullWidth
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from || yearFrom, max: yearTo } }}
        />
      </Stack>
      {problem ? <FormHelperText error role="alert">{problem}</FormHelperText> : null}
      <TextField label="Notes" multiline minRows={2} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={mutation.isPending} fullWidth />
    </FormDialog>
  );
}
