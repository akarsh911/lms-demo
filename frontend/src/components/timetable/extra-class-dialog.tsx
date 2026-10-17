'use client';

import * as React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useScheduleExtra } from '@/hooks/mutation/use-extra-classes';
import { useClassRoles } from '@/hooks/query/use-class-roles';
import { useMySubjects } from '@/hooks/query/use-my-subjects';
import { minutesOf } from '@/lib/dates';
import type { ClassPupil } from '@/types/class-roles';

// Booking a lesson outside the timetable for one of the teacher's subjects: the whole section or a chosen few.
export function ExtraClassDialog({ date, onClose }: { date: string; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const schedule = useScheduleExtra();
  const subjects = useMySubjects();
  const [offeringId, setOfferingId] = React.useState('');
  const [day, setDay] = React.useState(date);
  const [from, setFrom] = React.useState('14:00');
  const [to, setTo] = React.useState('15:00');
  const [room, setRoom] = React.useState('');
  const [topic, setTopic] = React.useState('');
  const [who, setWho] = React.useState<'all' | 'some'>('all');
  const [pupils, setPupils] = React.useState<ClassPupil[]>([]);
  const offering = subjects.data?.find((s) => s.offering_id === offeringId);
  const roster = useClassRoles(offering?.section_id ?? '');
  const start = minutesOf(from);
  const end = minutesOf(to);

  return (
    <FormDialog
      open
      title="Add an extra class"
      description="It appears on your timetable and on the timetable of every pupil it is for."
      submitLabel="Book Extra Class"
      pending={schedule.isPending}
      error={schedule.error}
      canSubmit={Boolean(offering && start !== null && end !== null && end > start && topic.trim().length >= 3 && (who === 'all' || pupils.length > 0))}
      onClose={onClose}
      onSubmit={() =>
        schedule.mutate(
          { offering_id: offeringId, date: day, start: start ?? 0, end: end ?? 0, room, topic, student_ids: who === 'all' ? [] : pupils.map((p) => p.student_id) },
          {
            onSuccess: (x) => {
              notify(`Extra ${x.subject} class booked for ${x.label}`);
              onClose();
            },
          },
        )
      }
    >
      <TextField select label="Subject and class" value={offeringId} onChange={(e) => (setOfferingId(e.target.value), setPupils([]))} required>
        {(subjects.data ?? []).map((s) => (
          <MenuItem key={s.offering_id} value={s.offering_id}>
            {s.subject} · {s.label}
          </MenuItem>
        ))}
      </TextField>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="Date" type="date" value={day} onChange={(e) => setDay(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
        <TextField label="From" type="time" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
        <TextField label="To" type="time" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
      </Stack>
      <TextField label="What it is for" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Revision of chapter 4 before the unit test" required />
      <TextField label="Room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder={offering ? `Room ${offering.label}` : 'Optional'} />
      <ToggleButtonGroup exclusive size="small" value={who} onChange={(_, v: 'all' | 'some' | null) => v && setWho(v)} aria-label="Who it is for">
        <ToggleButton value="all">Whole section</ToggleButton>
        <ToggleButton value="some">Chosen pupils</ToggleButton>
      </ToggleButtonGroup>
      {who === 'some' ? (
        <Autocomplete
          multiple
          options={roster.data?.pupils ?? []}
          value={pupils}
          onChange={(_, value) => setPupils(value)}
          disabled={!offering}
          getOptionLabel={(p) => `${p.roll ? `${p.roll} · ` : ''}${p.name}`}
          isOptionEqualToValue={(a, b) => a.student_id === b.student_id}
          renderInput={(params) => <TextField {...params} label="Pupils" placeholder={offering ? 'Name or roll number' : 'Choose the class first'} />}
        />
      ) : null}
    </FormDialog>
  );
}
