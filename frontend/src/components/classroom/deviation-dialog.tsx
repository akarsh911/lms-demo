'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import {
  CHANGEABLE_KINDS,
  DEVIATION_ACTIONS,
  DEVIATION_HINTS,
  DEVIATION_REASON_LIMIT,
  SESSION_PRESENTATION,
} from '@/constants/section-calendar';
import {
  useCreateDeviation,
  useDeleteDeviation,
  useUpdateDeviation,
} from '@/hooks/mutation/use-deviations';
import { apiFailureKind, SESSION_ENDED, STEP_UP_NEEDED } from '@/lib/api-failure';
import {
  deviationCreateFrom,
  deviationPatchFrom,
  draftComplete,
  spanValid,
  type DeviationDraft,
  type PeriodAxisRow,
  type SessionState,
} from '@/lib/classroom/section-calendar';
import { longDate, clockToMinutes, minutesToClock } from '@/lib/school/time';
import type { OccurrenceRow } from '@/types/classroom';
import type { DeviationKind } from '@/types/section-calendar';

export interface DeviationTarget {
  date: string;
  period: PeriodAxisRow | undefined;
  lesson: OccurrenceRow | undefined;
  sessionState: SessionState;
}

export interface Choice {
  id: string;
  label: string;
}

export interface DeviationDialogProps {
  target: DeviationTarget | null;
  onClose: () => void;
  sectionId: string;
  sectionName: string;
  periods: readonly PeriodAxisRow[];
  offerings: readonly Choice[];
  rooms: readonly Choice[];
  teachers: readonly Choice[];
  mayDelete: boolean;
}

export function DeviationDialog(props: DeviationDialogProps): React.ReactElement {
  const { target, onClose } = props;
  return (
    <Dialog open={target !== null} onClose={onClose} fullWidth maxWidth="sm">
      {target ? (
        <DeviationForm
          key={`${target.date}:${target.period?.id ?? ''}:${target.lesson?.id ?? 'new'}`}
          {...props}
          target={target}
        />
      ) : null}
    </Dialog>
  );
}

function DeviationForm({
  target,
  onClose,
  sectionId,
  sectionName,
  periods,
  offerings,
  rooms,
  teachers,
  mayDelete,
}: DeviationDialogProps & { target: DeviationTarget }): React.ReactElement {
  const { date, period, lesson, sessionState } = target;

  const slotId = lesson?.timetable_slot_id;
  const deviationId = lesson?.timetable_deviation_id;
  const isAdded =
    lesson !== undefined &&
    (lesson.state === 'added' || lesson.deviation_kind === 'added');
  const fixedToAdded = lesson === undefined || isAdded;
  const slotUnreadable = lesson !== undefined && !isAdded && slotId === undefined;

  const create = useCreateDeviation();
  const update = useUpdateDeviation();
  const remove = useDeleteDeviation();

  const [kind, setKind] = React.useState<DeviationKind>(
    fixedToAdded ? 'added' : ((lesson?.deviation_kind as DeviationKind) ?? 'cancelled'),
  );
  const [periodId, setPeriodId] = React.useState(
    period?.id ?? lesson?.period_id ?? periods[0]?.id ?? '',
  );
  const [offeringId, setOfferingId] = React.useState(lesson?.subject_offering_id ?? '');
  const [teacherId, setTeacherId] = React.useState(
    lesson?.state === 'substituted' || isAdded ? (lesson?.teacher_id ?? '') : '',
  );
  const [roomId, setRoomId] = React.useState(
    lesson?.state === 'relocated' || isAdded ? (lesson?.room_id ?? '') : '',
  );
  const [startClock, setStartClock] = React.useState(
    lesson?.times_resolved ? minutesToClock(lesson.start_minute) : '',
  );
  const [endClock, setEndClock] = React.useState(
    lesson?.times_resolved ? minutesToClock(lesson.end_minute) : '',
  );
  const [reason, setReason] = React.useState(lesson?.reason ?? '');

  const draft: DeviationDraft = {
    kind,
    date,
    slotId,
    sectionId,
    periodId,
    offeringId: offeringId === '' ? undefined : offeringId,
    substituteTeacherId: teacherId === '' ? undefined : teacherId,
    roomId: roomId === '' ? undefined : roomId,
    startMinute: clockToMinutes(startClock) ?? undefined,
    endMinute: clockToMinutes(endClock) ?? undefined,
    reason,
  };

  const editing = deviationId !== undefined;
  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;
  const complete = draftComplete(draft);
  const timesTyped = startClock !== '' || endClock !== '';
  const timesBroken = timesTyped && !spanValid(draft);

  const save = (): void => {
    if (editing && deviationId) {
      update.mutate(
        { id: deviationId, patch: deviationPatchFrom(draft) },
        { onSuccess: onClose },
      );
      return;
    }
    create.mutate(deviationCreateFrom(draft), { onSuccess: onClose });
  };

  const showsTeacher = kind === 'substitution' || kind === 'added';
  const showsRoom = kind === 'room_change' || kind === 'added';
  const showsTimes = kind === 'time_change' || kind === 'added';
  const periodName =
    periods.find((entry) => entry.id === periodId)?.name ??
    period?.name ??
    lesson?.period_name ??
    'this period';

  return (
    <>
      <DialogTitle>
        {fixedToAdded
          ? editing
            ? 'Edit this extra lesson'
            : 'Add a lesson on this date'
          : 'Change this lesson for this date'}
        <Typography variant="body2" color="text.secondary">
          {sectionName} · {periodName} · {longDate(date)}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Alert severity="info" variant="outlined">
            This changes <strong>{longDate(date)}</strong> and nothing else. The weekly
            timetable keeps its pattern, so every other{' '}
            {weekdayName(date)} in the term is untouched. Changing the pattern itself
            is a different act, done on the timetable rather than here.
          </Alert>

          {slotUnreadable ? (
            <Alert severity="warning" variant="outlined">
              The timetable slot behind this lesson is not one this account can read,
              and a per-date change is recorded against that slot. Nothing can be saved
              here until the slot itself is readable.
            </Alert>
          ) : null}

          {sessionState !== 'open' ? (
            <Alert
              severity={sessionState === 'unknown' ? 'info' : 'warning'}
              variant="outlined"
            >
              {SESSION_PRESENTATION[sessionState].note}
            </Alert>
          ) : null}

          {!fixedToAdded ? (
            <TextField
              select
              label="What is changing"
              size="small"
              value={kind}
              onChange={(event) => setKind(event.target.value as DeviationKind)}
              helperText={`${DEVIATION_HINTS[kind]} One lesson carries one change per date, so choosing another replaces this one.`}
            >
              {CHANGEABLE_KINDS.map((value) => (
                <MenuItem key={value} value={value}>
                  {DEVIATION_ACTIONS[value]}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {DEVIATION_HINTS.added}
            </Typography>
          )}

          {fixedToAdded && !editing ? (
            <TextField
              select
              label="Period"
              size="small"
              value={periodId}
              onChange={(event) => setPeriodId(event.target.value)}
              required
              helperText={
                periods.length === 0
                  ? 'No periods could be listed for this date, so a lesson cannot be placed.'
                  : 'Which period of the day this lesson sits in.'
              }
            >
              <MenuItem value="">Not chosen</MenuItem>
              {periods.map((entry) => (
                <MenuItem key={entry.id} value={entry.id}>
                  {entry.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}

          {fixedToAdded ? (
            <TextField
              select
              label="Subject"
              size="small"
              value={offeringId}
              onChange={(event) => setOfferingId(event.target.value)}
              required
              helperText="An added lesson has to say what is being taught."
            >
              <MenuItem value="">Not chosen</MenuItem>
              {offerings.map((offering) => (
                <MenuItem key={offering.id} value={offering.id}>
                  {offering.label}
                </MenuItem>
              ))}
            </TextField>
          ) : null}

          {showsTeacher ? (
            <TextField
              select
              label={kind === 'added' ? 'Teacher' : 'Substitute teacher'}
              size="small"
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
              required={kind === 'substitution'}
              helperText={teacherHelp(teachers.length, kind)}
            >
              <MenuItem value="">Nobody named</MenuItem>
              {teachers.map((teacher) => (
                <MenuItem key={teacher.id} value={teacher.id}>
                  {teacher.label}
                </MenuItem>
              ))}
            </TextField>
          ) : null}

          {showsRoom ? (
            <TextField
              select
              label="Room"
              size="small"
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
              required={kind === 'room_change'}
              helperText={
                rooms.length === 0
                  ? 'No rooms could be listed for this campus.'
                  : 'For this date only.'
              }
            >
              <MenuItem value="">No room</MenuItem>
              {rooms.map((room) => (
                <MenuItem key={room.id} value={room.id}>
                  {room.label}
                </MenuItem>
              ))}
            </TextField>
          ) : null}

          {showsTimes ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Starts"
                type="time"
                size="small"
                fullWidth
                value={startClock}
                onChange={(event) => setStartClock(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Ends"
                type="time"
                size="small"
                fullWidth
                value={endClock}
                onChange={(event) => setEndClock(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
          ) : null}

          {timesBroken ? (
            <Alert severity="warning" variant="outlined">
              A start and an end are given together and the end has to be later than
              the start, inside the same day.
            </Alert>
          ) : null}

          <TextField
            label="Reason"
            size="small"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: DEVIATION_REASON_LIMIT } }}
            helperText={`Shown to whoever reads the calendar. ${DEVIATION_REASON_LIMIT - reason.length} characters left.`}
          />

          {failure ? (
            <Alert severity="error" variant="outlined">
              {failureMessage(failure)}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <span>
          {editing && mayDelete && deviationId ? (
            <Button
              color="error"
              size="small"
              disabled={busy}
              onClick={() => remove.mutate(deviationId, { onSuccess: onClose })}
            >
              {isAdded ? 'Remove this lesson' : 'Undo this change'}
            </Button>
          ) : null}
        </span>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy || !complete}
            onClick={save}
          >
            {editing ? 'Save this change' : 'Save for this date'}
          </Button>
        </Stack>
      </DialogActions>
    </>
  );
}

function teacherHelp(count: number, kind: DeviationKind): string {
  if (count === 0) {
    return 'No teachers could be listed for this class, so nobody can be named here.';
  }
  return kind === 'substitution'
    ? 'Who is taking the lesson instead. Recording an absence is a separate act and is not done here.'
    : 'Optional. Who is taking the added lesson.';
}

function weekdayName(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    timeZone: 'UTC',
  });
}

function failureMessage(error: unknown): string {
  const kind = apiFailureKind(error);
  if (kind === 'denied') {
    return 'This account may read the calendar but not change it. Somebody holding the timetable-write grant has to make this change.';
  }
  if (kind === 'signed_out') return SESSION_ENDED;
  if (kind === 'step_up') return STEP_UP_NEEDED;
  return error instanceof Error && error.message
    ? error.message
    : 'This change could not be saved.';
}
