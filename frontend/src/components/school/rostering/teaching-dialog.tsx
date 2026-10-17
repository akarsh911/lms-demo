'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';

import {
  useCreateTeaching,
  useDeleteTeaching,
  useUpdateTeaching,
} from '@/hooks/mutation/use-rostering';
import { isIsoDate } from '@/lib/classroom/week';
import { offeringLabel } from '@/lib/school/names';
import { MdmFormActions, MdmFormError } from '../mdm/mdm-dialog';
import {
  TEACHING_ROLE_LABELS,
  TEACHING_ROLE_TYPES,
  TEACHING_STATUSES,
  TEACHING_STATUS_LABELS,
} from './options';
import type { TeacherAssignmentRow } from '@/types/academic';
import type { SchoolOfferingRow } from '@/types/school';
import type { TeacherAssignmentWrite, TeachingStatus } from '@/types/rostering';

export function TeachingForm({
  assignment,
  teacherName,
  sectionId,
  sessionId,
  offerings,
  teachers,
  mayDelete,
  onClose,
}: {
  assignment: TeacherAssignmentRow | undefined;
  teacherName: string | null;
  sectionId: string | null;
  sessionId: string | null;
  offerings: readonly SchoolOfferingRow[];
  teachers: ReadonlyMap<string, string>;
  mayDelete: boolean;
  onClose: () => void;
}): React.ReactElement {
  const create = useCreateTeaching();
  const update = useUpdateTeaching();
  const remove = useDeleteTeaching();

  const [teacherId, setTeacherId] = React.useState(assignment?.teacher_id ?? '');
  const [offeringId, setOfferingId] = React.useState(
    assignment?.subject_offering_id ?? '',
  );
  const [role, setRole] = React.useState(assignment?.role_type ?? 'subject_teacher');
  const [primary, setPrimary] = React.useState(assignment?.is_primary ?? false);
  const [from, setFrom] = React.useState(assignment?.valid_from?.slice(0, 10) ?? '');
  const [to, setTo] = React.useState(assignment?.valid_to?.slice(0, 10) ?? '');
  const [status, setStatus] = React.useState(assignment?.status ?? 'active');

  const fromUsable = from === '' || isIsoDate(from);
  const toUsable = to === '' || isIsoDate(to);
  const backwards = isIsoDate(from) && isIsoDate(to) && to < from;
  const usable =
    (assignment ? true : teacherId !== '') &&
    role !== '' &&
    fromUsable &&
    toUsable &&
    !backwards;
  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const save = (): void => {
    if (!usable) return;

    if (assignment) {
      const patch: TeacherAssignmentWrite = {};
      if (role !== (assignment.role_type ?? '')) patch.role_type = role;
      if (offeringId !== '' && offeringId !== (assignment.subject_offering_id ?? '')) {
        patch.subject_offering_id = offeringId;
      }
      if (primary !== (assignment.is_primary ?? false)) patch.is_primary = primary;
      if (isIsoDate(from) && from !== (assignment.valid_from?.slice(0, 10) ?? '')) {
        patch.valid_from = from;
      }
      if (isIsoDate(to) && to !== (assignment.valid_to?.slice(0, 10) ?? '')) {
        patch.valid_to = to;
      }
      if (status !== (assignment.status ?? 'active')) {
        patch.status = status as TeachingStatus;
      }
      if (Object.keys(patch).length === 0) {
        onClose();
        return;
      }
      update.mutate({ id: assignment.id, patch }, { onSuccess: onClose });
      return;
    }

    if (!sectionId || !sessionId) return;
    const body: TeacherAssignmentWrite = {
      academic_session_id: sessionId,
      teacher_id: teacherId,
      section_id: sectionId,
      role_type: role,
    };
    if (offeringId !== '') body.subject_offering_id = offeringId;
    if (primary) body.is_primary = true;
    if (isIsoDate(from)) body.valid_from = from;
    if (isIsoDate(to)) body.valid_to = to;
    if (status !== 'active') body.status = status as TeachingStatus;
    create.mutate(body, { onSuccess: onClose });
  };

  return (
    <>
      <DialogTitle>
        {assignment ? 'Edit this teaching assignment' : 'Give a teacher this class'}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {assignment ? (
            <TextField
              label="Teacher"
              size="small"
              value={teacherName ?? 'Named elsewhere'}
              disabled
              helperText="An assignment cannot be handed to another teacher, and it cannot be moved to another class. Revoke it and make the right one."
            />
          ) : (
            <TextField
              select
              label="Teacher"
              size="small"
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
              required
              helperText={
                teachers.size === 0
                  ? 'No teacher directory is readable from this account, so a teacher cannot be chosen here.'
                  : undefined
              }
            >
              {[...teachers.entries()].map(([id, label]) => (
                <MenuItem key={id} value={id}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            select
            label="Teaches"
            size="small"
            value={offeringId}
            onChange={(event) => setOfferingId(event.target.value)}
            helperText={
              assignment
                ? 'An assignment already tied to a subject cannot be widened back to the whole class.'
                : 'Leave it on the whole class for a class teacher; name a subject for a subject teacher.'
            }
          >
            <MenuItem value="">The whole class</MenuItem>
            {offeringId !== '' && !offerings.some((row) => row.id === offeringId) ? (
              <MenuItem value={offeringId}>Set, but not in this list</MenuItem>
            ) : null}
            {offerings.map((row) => (
              <MenuItem key={row.id} value={row.id}>
                {offeringLabel(row)}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Role"
            size="small"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            required
            helperText="These four are the roles the API reserves to teachers."
          >
            {TEACHING_ROLE_TYPES.map((option) => (
              <MenuItem key={option} value={option}>
                {TEACHING_ROLE_LABELS[option] ?? option}
              </MenuItem>
            ))}
          </TextField>

          <FormControlLabel
            control={
              <Switch
                checked={primary}
                onChange={(event) => setPrimary(event.target.checked)}
              />
            }
            label="The one chiefly answerable for it"
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="From"
              size="small"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              error={!fromUsable}
              fullWidth
              helperText="Optional."
            />
            <TextField
              label="To"
              size="small"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              error={!toUsable || backwards}
              fullWidth
              helperText={
                backwards ? 'The end cannot fall before the start.' : 'Optional.'
              }
            />
          </Stack>

          <TextField
            select
            label="Status"
            size="small"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {TEACHING_STATUSES.map((option) => (
              <MenuItem key={option} value={option}>
                {TEACHING_STATUS_LABELS[option] ?? option}
              </MenuItem>
            ))}
          </TextField>

          {assignment ? (
            <Alert severity="info" variant="outlined">
              Revoking keeps the record of who taught this and when. Deleting removes it
              altogether. Emptying a date here leaves whatever is already recorded: the
              API has no way to clear one.
            </Alert>
          ) : null}

          <MdmFormError error={failure} />
        </Stack>
      </DialogContent>
      <MdmFormActions
        onDelete={
          assignment && mayDelete
            ? () => remove.mutate(assignment.id, { onSuccess: onClose })
            : undefined
        }
        onCancel={onClose}
        onSave={save}
        busy={busy}
        canSave={
          usable && (Boolean(assignment) || (Boolean(sectionId) && Boolean(sessionId)))
        }
      />
    </>
  );
}
