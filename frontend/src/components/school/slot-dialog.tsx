'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { CLASH_CHECK_DEBOUNCE_MS, DAY_NAMES } from '@/constants/school';
import { useCapabilities } from '@/hooks/query/use-capabilities';
import { useMoveSlot, usePlaceSlot, useRemoveSlot } from '@/hooks/mutation/use-school';
import { capabilityFor } from '@/lib/core/fields';
import {
  blockingOf,
  clashRefusalFrom,
  everyBlockingIsOverridable,
  firstUnoverridable,
  overrideForbidden,
  PROPOSAL_REF,
  reasonIsUsable,
} from '@/lib/school/clash';
import { schoolService } from '@/services/school';
import { ClashList } from './clash-list';
import type { NameBook, TeacherDirectoryState } from './name-book';
import type {
  Clash,
  ClashReport,
  Period,
  Room,
  SchoolOfferingRow,
  SlotWrite,
  TeacherAssignmentRow,
  TimetableSlot,
} from '@/types/school';

/**
 * Placing, moving and removing one lesson.
 *
 * ## The clash report runs while you choose, not when you save
 *
 * `POST /timetables/{id}/clash-check` is a REPORT — 200 whatever it finds — so
 * it runs on every change, debounced. By the time the save control is reached
 * the answer is already on screen. The 409 that a real save can still return is
 * the same body and is rendered by the same list, so nothing here has two
 * vocabularies for one collision.
 *
 * ## An override needs a reason, and a reason is not a formality
 *
 * `clash_override` without a non-empty `clash_override_reason` is a 422, and
 * the reason is stored on the slot with who accepted it and when. A
 * double-booking nobody explained is indistinguishable from a mistake six
 * months later, which is exactly when somebody asks.
 *
 * ## A pupil clash is not offered an override at all
 *
 * `overridable` is the API's answer per clash and the only thing that decides
 * whether the control appears. A `student_set` clash is never overridable: the
 * same pupil owed a mark in two registers for one period makes the losing
 * register read as an absence, and the offerings have to be moved apart
 * instead. Drawing a button the API will refuse teaches people the product
 * lies.
 */
export interface SlotDialogProps {
  open: boolean;
  onClose: () => void;
  timetableId: string | null;
  sectionId: string | null;
  defaultRoomId?: string | null;
  slot: TimetableSlot | undefined;
  day: number;
  period: Period | undefined;
  periods: readonly Period[];
  offerings: readonly SchoolOfferingRow[];
  rooms: readonly Room[];
  assignments: readonly TeacherAssignmentRow[];
  names: NameBook;
}

/**
 * The form mounts with the dialog and is keyed on the cell it was opened from,
 * so every field, the reason box and the mutation state start clean and are
 * never synchronised back from props. See `calendar-day-dialog.tsx`.
 */
export function SlotDialog(props: SlotDialogProps): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      {props.open ? (
        <SlotForm
          key={props.slot?.id ?? `new:${props.day}:${props.period?.id ?? ''}`}
          {...props}
        />
      ) : null}
    </Dialog>
  );
}

function SlotForm({
  onClose,
  timetableId,
  sectionId,
  defaultRoomId,
  slot,
  day,
  period,
  periods,
  offerings,
  rooms,
  assignments,
  names,
}: SlotDialogProps): React.ReactElement {
  const place = usePlaceSlot(timetableId);
  const move = useMoveSlot();
  const remove = useRemoveSlot();

  /**
   * Whether an override is even worth offering.
   *
   * `core.timetable.override` is a SEPARATE capability from
   * `core.timetable.write`, and a school administrator can hold the second
   * without the first — the seeded principal does exactly that. Capabilities
   * describe and never decide, so this only chooses what to OFFER: a caller
   * without the grant is told who has to accept the clash instead of being
   * given a button that answers 403.
   */
  const capabilities = useCapabilities();
  const mayOverride =
    !capabilities.data ||
    capabilityFor(capabilities.data.capabilities, 'core.timetable.override') !== undefined;

  const [offeringId, setOfferingId] = React.useState(slot?.subject_offering_id ?? '');
  const [teacherId, setTeacherId] = React.useState(slot?.teacher_id ?? '');
  const [roomId, setRoomId] = React.useState(
    slot ? (slot.room_id ?? '') : (defaultRoomId ?? ''),
  );
  const [label, setLabel] = React.useState(slot?.label ?? '');
  const [targetDay, setTargetDay] = React.useState(slot?.day_of_week ?? day);
  const [targetPeriod, setTargetPeriod] = React.useState(slot?.period_id ?? period?.id ?? '');
  const [reason, setReason] = React.useState('');
  const [report, setReport] = React.useState<ClashReport | null>(null);
  const [checking, setChecking] = React.useState(false);
  // Which kind of save produced the error now on screen. A 403 on an override
  // means the override grant is missing; a 403 on an ordinary save means the
  // caller may not write the timetable at all, and telling them the wrong one
  // sends them to ask for the wrong thing.
  const [triedOverride, setTriedOverride] = React.useState(false);

  /**
   * The live report.
   *
   * Debounced, and the answer is discarded if the inputs moved while it was in
   * flight — an old verdict arriving after a newer one would say a placement is
   * clear when the thing now on screen is not.
   */
  React.useEffect(() => {
    if (!timetableId || !sectionId || !targetPeriod) return;
    let live = true;
    const timer = window.setTimeout(() => {
      setChecking(true);
      void schoolService
        .checkClashes(timetableId, {
          proposed: [
            {
              ref: PROPOSAL_REF,
              ...(slot ? { replaces_timetable_slot_id: slot.id } : {}),
              section_id: sectionId,
              period_id: targetPeriod,
              day_of_week: targetDay,
              ...(offeringId ? { subject_offering_id: offeringId } : {}),
              ...(teacherId ? { teacher_id: teacherId } : {}),
              ...(roomId ? { room_id: roomId } : {}),
            },
          ],
        })
        .then((answer) => {
          if (live) setReport(answer);
        })
        .catch(() => {
          if (live) setReport(null);
        })
        .finally(() => {
          if (live) setChecking(false);
        });
    }, CLASH_CHECK_DEBOUNCE_MS);

    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [timetableId, sectionId, targetPeriod, targetDay, offeringId, teacherId, roomId, slot]);

  const refusal = clashRefusalFrom(place.error ?? move.error);
  const shown: Clash[] = refusal?.clashes ?? report?.clashes ?? [];
  const blocking = blockingOf(shown);
  const canOverride = everyBlockingIsOverridable(shown);
  const stopper = firstUnoverridable(shown);
  const forbidden = triedOverride && overrideForbidden(place.error ?? move.error);

  const describes = offeringId !== '' || label.trim() !== '';
  const busy = place.isPending || move.isPending || remove.isPending;
  const offerOverride = canOverride && mayOverride;

  const body = (withOverride: boolean): SlotWrite => ({
    section_id: sectionId ?? undefined,
    period_id: targetPeriod,
    day_of_week: targetDay,
    subject_offering_id: offeringId === '' ? null : offeringId,
    teacher_id: teacherId === '' ? null : teacherId,
    room_id: roomId === '' ? null : roomId,
    label: label.trim() === '' ? null : label.trim(),
    ...(withOverride ? { clash_override: true, clash_override_reason: reason.trim() } : {}),
  });

  const save = (withOverride: boolean): void => {
    setTriedOverride(withOverride);
    if (slot) move.mutate({ id: slot.id, patch: body(withOverride) }, { onSuccess: onClose });
    else place.mutate(body(withOverride), { onSuccess: onClose });
  };

  const otherError =
    !refusal && !forbidden ? (place.error ?? move.error ?? remove.error) : null;

  return (
    <>
      <DialogTitle>
        {slot ? 'Edit this lesson' : 'Place a lesson'}
        <Typography variant="body2" color="text.secondary">
          {DAY_NAMES[targetDay]} · {names.period(targetPeriod)} ·{' '}
          {names.section(sectionId ?? undefined)}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            select
            label="Subject"
            size="small"
            value={offeringId}
            onChange={(event) => setOfferingId(event.target.value)}
            helperText="What this class is taught in this period."
          >
            <MenuItem value="">Nothing timetabled</MenuItem>
            {offerings.map((offering) => (
              <MenuItem key={offering.id} value={offering.id}>
                {names.offering(offering.id)}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Teacher"
            size="small"
            value={teacherId}
            onChange={(event) => setTeacherId(event.target.value)}
            helperText={teacherHelperText(names.teacherDirectory)}
          >
            <MenuItem value="">Nobody yet</MenuItem>
            {teacherChoices(assignments, teacherId).map((id) => (
              <MenuItem key={id} value={id}>
                {names.teacher(id)}
                {assignmentNote(assignments, id, names)}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Room"
            size="small"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
          >
            <MenuItem value="">No room</MenuItem>
            {rooms.map((room) => (
              <MenuItem key={room.id} value={room.id}>
                {names.room(room.id)}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Label"
            size="small"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            helperText="For something with no subject behind it — Games, Library, Remedial."
          />

          {!describes ? (
            <Alert severity="info" variant="outlined">
              A lesson needs either a subject or a label, so that a timetable can say
              what is happening.
            </Alert>
          ) : null}

          <Divider />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              label="Day"
              size="small"
              value={targetDay}
              onChange={(event) => setTargetDay(Number(event.target.value))}
              fullWidth
            >
              {[1, 2, 3, 4, 5, 6, 7].map((value) => (
                <MenuItem key={value} value={value}>
                  {DAY_NAMES[value]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Period"
              size="small"
              value={targetPeriod}
              onChange={(event) => setTargetPeriod(event.target.value)}
              fullWidth
            >
              {periods.map((row) => (
                <MenuItem key={row.id} value={row.id}>
                  {row.name ?? row.code}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Divider />

          <Stack spacing={1}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Clashes
              </Typography>
              {checking ? <CircularProgress size={14} /> : null}
              <Typography variant="body2" color="text.secondary" aria-live="polite">
                {shown.length === 0
                  ? checking
                    ? 'Checking…'
                    : 'Nothing collides with this.'
                  : `${blocking.length} blocking, ${shown.length - blocking.length} already accepted`}
              </Typography>
            </Stack>

            {shown.length > 0 ? <ClashList clashes={shown} names={names} /> : null}

            {stopper ? (
              <Alert severity="error" variant="outlined">
                This one cannot be overridden. The same pupils are expected in two
                places at once, and a pupil owed a mark in two registers for one
                period is marked absent in whichever loses. Move one of the two
                subjects to another period.
              </Alert>
            ) : null}

            {canOverride && !mayOverride ? (
              <Alert severity="warning" variant="outlined">
                This clash can be accepted, but not by this account: arranging a week
                and forcing a double-booking are different powers. Somebody holding the
                override grant has to accept it.
              </Alert>
            ) : null}

            {offerOverride ? (
              <Stack spacing={1}>
                <Alert severity="warning" variant="outlined">
                  This can be saved anyway, against a reason that is kept with the
                  lesson and shown to whoever reads the week.
                </Alert>
                <TextField
                  label="Reason for the override"
                  size="small"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                  helperText="Required. An empty reason is refused."
                />
              </Stack>
            ) : null}

            {forbidden ? (
              <Alert severity="error" variant="outlined">
                Arranging a week and forcing a double-booking are different powers.
                This account may place lessons but not override a clash, so somebody
                who holds that grant has to accept this one.
              </Alert>
            ) : null}

            {otherError ? (
              <Alert severity="error" variant="outlined">
                {otherError.message}
              </Alert>
            ) : null}
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <span>
          {slot ? (
            <Button
              color="error"
              size="small"
              disabled={busy}
              onClick={() => remove.mutate(slot.id, { onSuccess: onClose })}
            >
              Remove
            </Button>
          ) : null}
        </span>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {offerOverride ? (
            <Button
              variant="contained"
              color="warning"
              disabled={busy || !describes || !reasonIsUsable(reason)}
              onClick={() => save(true)}
            >
              Save with an override
            </Button>
          ) : (
            <Button
              variant="contained"
              disabled={
                busy || !describes || !targetPeriod || Boolean(stopper) || canOverride
              }
              onClick={() => save(false)}
            >
              Save
            </Button>
          )}
        </Stack>
      </DialogActions>
    </>
  );
}

/**
 * The teachers this slot may name.
 *
 * Drawn from the section's teacher assignments rather than from a directory:
 * `/teacher-assignments` is readable where `/teachers` may not be, and it is
 * the right shortlist anyway — whoever the school has put in front of this
 * class. The slot's current teacher is included even when no assignment covers
 * them, so an edit cannot silently drop somebody.
 */
function teacherChoices(
  assignments: readonly TeacherAssignmentRow[],
  current: string,
): string[] {
  const ids = new Set<string>();
  for (const row of assignments) {
    if (row.teacher_id) ids.add(row.teacher_id);
  }
  if (current) ids.add(current);
  return [...ids];
}

function teacherHelperText(directory: TeacherDirectoryState): string {
  switch (directory) {
    case 'readable':
      return 'Chosen from the teachers assigned to this class.';
    case 'denied':
      return 'Teacher names are not readable by this account, so assignments are listed by subject.';
    case 'unavailable':
      return 'Teacher names could not be loaded, so assignments are listed by subject.';
  }
}

function assignmentNote(
  assignments: readonly TeacherAssignmentRow[],
  teacherId: string,
  names: NameBook,
): string {
  if (names.teacherDirectory === 'readable') return '';
  const subjects = assignments
    .filter((row) => row.teacher_id === teacherId && row.subject_offering_id)
    .map((row) => names.offering(row.subject_offering_id));
  return subjects.length > 0 ? ` — ${[...new Set(subjects)].join(', ')}` : '';
}
