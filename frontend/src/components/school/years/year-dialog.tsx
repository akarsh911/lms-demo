'use client';

import * as React from 'react';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useSaveYear } from '@/hooks/mutation/use-foundation';
import { dateInput } from '@/lib/dates';
import { suggestedYearName, yearCode } from '@/lib/school/years';
import type { AcademicSession } from '@/types/mdm';

// A year's own record: its name and its dates. Everything else about a year is set up in its workspace, over days.
export function YearDialog({
  year,
  onClose,
  onSaved,
}: {
  year?: AcademicSession;
  onClose: () => void;
  onSaved?: (saved: AcademicSession) => void;
}): React.ReactElement {
  const [name, setName] = React.useState(year?.name ?? '');
  const [start, setStart] = React.useState(dateInput(year?.start_date));
  const [end, setEnd] = React.useState(dateInput(year?.end_date));
  const save = useSaveYear();
  const notify = useToast();

  const datesWrong = start !== '' && end !== '' && end <= start;
  const canSubmit = name.trim() !== '' && start !== '' && end !== '' && !datesWrong;

  const submit = (): void => {
    const body = { name: name.trim(), start_date: `${start}T00:00:00Z`, end_date: `${end}T00:00:00Z` };
    save.mutate(year ? { id: year.id, body } : { body: { ...body, code: yearCode(start, end), status: 'upcoming', is_current: false } }, {
      onSuccess: (saved) => {
        notify(year ? 'Academic year updated' : 'Academic year created as a draft');
        onSaved?.(saved);
        onClose();
      },
    });
  };

  return (
    <FormDialog
      open
      title={year ? 'Edit basic details' : 'Add academic year'}
      description={year ? undefined : 'This creates the year as a draft and opens its setup. Nothing changes for the year the school is running now.'}
      submitLabel={year ? 'Save changes' : 'Create and start setup'}
      pending={save.isPending}
      error={save.error}
      canSubmit={canSubmit}
      onClose={onClose}
      onSubmit={submit}
    >
      <TextField label="Academic year" required autoFocus placeholder="2027 to 2028" value={name} onChange={(event) => setName(event.target.value)} disabled={save.isPending} fullWidth />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Start date"
          type="date"
          required
          value={start}
          onChange={(event) => {
            setStart(event.target.value);
            // Offered once, while the name is still empty: never typed over.
            if (name.trim() === '') setName(suggestedYearName(event.target.value));
          }}
          disabled={save.isPending}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="End date"
          type="date"
          required
          value={end}
          onChange={(event) => setEnd(event.target.value)}
          error={datesWrong}
          helperText={datesWrong ? 'The year has to end after it starts.' : undefined}
          disabled={save.isPending}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>
    </FormDialog>
  );
}
