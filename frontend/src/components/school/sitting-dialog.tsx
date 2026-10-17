'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { useScheduleSitting } from '@/hooks/mutation/use-exams';
import { failureText } from '@/lib/exams/exam';
import { clashRefusalFrom } from '@/lib/school/clash';
import { ClashList } from './clash-list';
import type { NameBook } from './name-book';
import type { ExamSubjectRow } from '@/types/exams';

export interface PickerOption {
  id: string;
  label: string;
}

interface SittingDialogProps {
  open: boolean;
  onClose: () => void;
  subject: ExamSubjectRow | undefined;
  paperLabel: string;
  sectionLabel: string;
  periods: readonly PickerOption[];
  rooms: readonly PickerOption[];
  names: NameBook;
}

export function SittingDialog(props: SittingDialogProps): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      {props.open && props.subject ? (
        <SittingForm key={props.subject.id} {...props} />
      ) : null}
    </Dialog>
  );
}

function SittingForm({
  onClose,
  subject,
  paperLabel,
  sectionLabel,
  periods,
  rooms,
  names,
}: SittingDialogProps): React.ReactElement {
  const schedule = useScheduleSitting();

  const [date, setDate] = React.useState('');
  const [periodId, setPeriodId] = React.useState('');
  const [roomId, setRoomId] = React.useState('');

  const refusal = clashRefusalFrom(schedule.error);
  const clashes = refusal?.clashes ?? [];
  const otherFailure = schedule.error && !refusal ? schedule.error : null;
  const usable = date !== '' && periodId !== '';

  const save = (): void => {
    if (!subject || !usable) return;
    schedule.mutate(
      {
        subjectId: subject.id,
        body: {
          date,
          period_id: periodId,
          room_id: roomId === '' ? undefined : roomId,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <DialogTitle>
        Schedule a sitting
        <Typography variant="body2" color="text.secondary">
          {paperLabel} · {sectionLabel}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Date"
            size="small"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            required
            helperText="The school has to be in session that day, and the day has to run the pattern this period belongs to."
          />

          <TextField
            select
            label="Period"
            size="small"
            value={periodId}
            onChange={(event) => setPeriodId(event.target.value)}
            required
            helperText={
              periods.length === 0
                ? 'This branch has no periods yet, so a sitting has nowhere to go.'
                : 'The slot in the day this class sits the paper.'
            }
            disabled={periods.length === 0}
          >
            {periods.map((period) => (
              <MenuItem key={period.id} value={period.id}>
                {period.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Room"
            size="small"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            helperText="Optional. A room is checked for a double-booking like everything else."
          >
            <MenuItem value="">No room recorded</MenuItem>
            {rooms.map((room) => (
              <MenuItem key={room.id} value={room.id}>
                {room.label}
              </MenuItem>
            ))}
          </TextField>

          <Alert severity="info" variant="outlined">
            A sitting does not cancel the lesson that normally runs in this period. The
            lesson stays on the timetable and has to be dealt with separately.
          </Alert>

          {refusal ? (
            <Stack spacing={1.5}>
              <Alert severity="error" variant="outlined">
                <AlertTitle>This period is not free</AlertTitle>
                {refusal.message ?? failureText(schedule.error)}
              </Alert>

              {clashes.length > 0 ? (
                <ClashList clashes={clashes} names={names} />
              ) : null}

              <Typography variant="body2" color="text.secondary">
                A sitting is clash-checked like any other lesson and a clash here is
                never accepted against a reason. Pick another period or another day.
              </Typography>
            </Stack>
          ) : null}

          {otherFailure ? (
            <Alert severity="error" variant="outlined">
              {failureText(otherFailure)}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={schedule.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={schedule.isPending || !usable}
        >
          Schedule it
        </Button>
      </DialogActions>
    </>
  );
}
