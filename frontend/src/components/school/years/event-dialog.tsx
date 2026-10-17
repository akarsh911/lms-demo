'use client';

import * as React from 'react';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useCreateEvent } from '@/hooks/mutation/use-foundation';
import { dateInput } from '@/lib/dates';
import { KIND_LABEL } from '@/lib/school/events';
import { EVENT_KINDS, type EventKind } from '@/types/foundation';
import type { AcademicSession } from '@/types/mdm';

// Records something that happened, or will, to the whole school: a trip, a PTM, an internal test. Holidays and examinations come from their own records.
export function EventDialog({ year, onClose }: { year: AcademicSession; onClose: () => void }): React.ReactElement {
  const [kind, setKind] = React.useState<EventKind>('event');
  const [title, setTitle] = React.useState('');
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [audience, setAudience] = React.useState('Whole school');
  const [detail, setDetail] = React.useState('');
  const mutation = useCreateEvent(year.id);
  const notify = useToast();
  const kinds = EVENT_KINDS.filter((k) => k !== 'holiday' && k !== 'exam' && k !== 'personal');

  return (
    <FormDialog
      open
      title="Add an event"
      description={`Between ${dateInput(year.start_date)} and ${dateInput(year.end_date)}.`}
      submitLabel="Add event"
      pending={mutation.isPending}
      error={mutation.error}
      canSubmit={title.trim() !== '' && start !== '' && (end === '' || end >= start)}
      onClose={onClose}
      onSubmit={() =>
        mutation.mutate(
          { kind, title: title.trim(), start, end: end || start, audience: audience.trim() || null, detail: detail.trim() || null },
          {
            onSuccess: () => {
              notify(`${title.trim()} added to the calendar`);
              onClose();
            },
          },
        )
      }
    >
      <TextField select label="Kind" value={kind} onChange={(event) => setKind(event.target.value as EventKind)} fullWidth>
        {kinds.map((k) => (
          <MenuItem key={k} value={k}>
            {KIND_LABEL[k]}
          </MenuItem>
        ))}
      </TextField>
      <TextField label="Title" value={title} onChange={(event) => setTitle(event.target.value)} required fullWidth autoFocus />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="From" type="date" value={start} onChange={(event) => setStart(event.target.value)} required fullWidth slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: dateInput(year.start_date), max: dateInput(year.end_date) } }} />
        <TextField label="To" type="date" value={end} onChange={(event) => setEnd(event.target.value)} fullWidth helperText="Leave empty for one day" slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: start || dateInput(year.start_date), max: dateInput(year.end_date) } }} />
      </Stack>
      <TextField label="Who it is for" value={audience} onChange={(event) => setAudience(event.target.value)} fullWidth placeholder="Whole school, Class 8, Classes 9 to 12" />
      <TextField label="Detail" value={detail} onChange={(event) => setDetail(event.target.value)} fullWidth multiline minRows={2} />
    </FormDialog>
  );
}
