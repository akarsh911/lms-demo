'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { WidgetLoading } from '@/components/widgets/widget-states';
import {
  useCreateEnrolment,
  useDeleteEnrolment,
  useUpdateEnrolment,
} from '@/hooks/mutation/use-rostering';
import { useStudentCandidates } from '@/hooks/query/use-rostering';
import { isIsoDate } from '@/lib/classroom/week';
import { codeOf, nameOf, personOf } from '@/lib/core/roster';
import { sectionLabel } from '@/lib/school/names';
import { ROSTER_KINDS } from '@/constants/roster';
import { MdmFormActions, MdmFormError } from '../mdm/mdm-dialog';
import {
  ENROLMENT_STATUSES,
  ENROLMENT_STATUS_LABELS,
  PROMOTION_STATUSES,
  PROMOTION_STATUS_LABELS,
} from './options';
import type { EnrollmentRow } from '@/types/academic';
import type { StudentRow } from '@/types/roster';
import type { SectionRow } from '@/types/school';
import type { EnrolmentStatus, EnrollmentWrite, PromotionStatus } from '@/types/rostering';

export function EnrolmentForm({
  enrolment,
  pupilName,
  sectionId,
  sessionId,
  sections,
  today,
  mayDelete,
  onClose,
}: {
  enrolment: EnrollmentRow | undefined;
  pupilName: string | null;
  sectionId: string | null;
  sessionId: string | null;
  sections: readonly SectionRow[];
  today: string;
  mayDelete: boolean;
  onClose: () => void;
}): React.ReactElement {
  const create = useCreateEnrolment();
  const update = useUpdateEnrolment();
  const remove = useDeleteEnrolment();

  const [search, setSearch] = React.useState('');
  const [studentId, setStudentId] = React.useState('');
  const [targetSection, setTargetSection] = React.useState(
    enrolment?.section_id ?? sectionId ?? '',
  );
  const [roll, setRoll] = React.useState(enrolment?.roll_number ?? '');
  const [number, setNumber] = React.useState(enrolment?.enrollment_number ?? '');
  const [enrolledOn, setEnrolledOn] = React.useState(
    enrolment?.enrollment_date?.slice(0, 10) ?? today,
  );
  const [exitOn, setExitOn] = React.useState(enrolment?.exit_date?.slice(0, 10) ?? '');
  const [promotion, setPromotion] = React.useState(enrolment?.promotion_status ?? '');
  const [status, setStatus] = React.useState(enrolment?.status ?? 'active');

  const candidates = useStudentCandidates(search);
  const searching = search.trim().length >= 2;

  const dateUsable = isIsoDate(enrolledOn);
  const exitUsable = exitOn === '' || isIsoDate(exitOn);
  const exitBeforeStart = isIsoDate(exitOn) && dateUsable && exitOn < enrolledOn;
  const usable =
    (enrolment ? true : studentId !== '') && dateUsable && exitUsable && !exitBeforeStart;
  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const save = (): void => {
    if (!usable) return;

    if (enrolment) {
      const patch: EnrollmentWrite = {};
      if (targetSection !== '' && targetSection !== enrolment.section_id) {
        patch.section_id = targetSection;
      }
      if (roll.trim() !== '' && roll.trim() !== (enrolment.roll_number ?? '')) {
        patch.roll_number = roll.trim();
      }
      if (number.trim() !== '' && number.trim() !== (enrolment.enrollment_number ?? '')) {
        patch.enrollment_number = number.trim();
      }
      if (isIsoDate(exitOn) && exitOn !== (enrolment.exit_date?.slice(0, 10) ?? '')) {
        patch.exit_date = exitOn;
      }
      if (promotion !== '' && promotion !== (enrolment.promotion_status ?? '')) {
        patch.promotion_status = promotion as PromotionStatus;
      }
      if (status !== (enrolment.status ?? 'active')) {
        patch.status = status as EnrolmentStatus;
      }
      if (Object.keys(patch).length === 0) {
        onClose();
        return;
      }
      update.mutate({ id: enrolment.id, patch }, { onSuccess: onClose });
      return;
    }

    if (!sectionId || !sessionId) return;
    const body: EnrollmentWrite = {
      student_id: studentId,
      academic_session_id: sessionId,
      section_id: sectionId,
      enrollment_date: enrolledOn,
    };
    if (roll.trim() !== '') body.roll_number = roll.trim();
    if (number.trim() !== '') body.enrollment_number = number.trim();
    if (status !== 'active') body.status = status as EnrolmentStatus;
    create.mutate(body, { onSuccess: onClose });
  };

  return (
    <>
      <DialogTitle>{enrolment ? 'Edit this enrolment' : 'Enrol a pupil'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {enrolment ? (
            <Stack spacing={0.5}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {pupilName ?? 'This pupil is not one this account may name'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                An enrolment cannot change which pupil it is for. Withdraw it and enrol
                the right one.
              </Typography>
            </Stack>
          ) : (
            <Stack spacing={1.5}>
              <TextField
                label="Find a pupil"
                size="small"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setStudentId('');
                }}
                helperText="Two letters or more of a name or an admission number."
              />
              {searching && candidates.isPending ? <WidgetLoading rows={2} /> : null}
              {searching && candidates.isError ? (
                <Alert severity="info" variant="outlined">
                  {candidates.error.isForbidden
                    ? 'This account may not search the school roll, so a pupil cannot be chosen here.'
                    : 'The school roll could not be searched just now.'}
                </Alert>
              ) : null}
              {searching && candidates.data ? (
                <TextField
                  select
                  label="Pupil"
                  size="small"
                  value={studentId}
                  onChange={(event) => setStudentId(event.target.value)}
                  required
                  helperText={
                    candidates.data.rows.length === 0
                      ? 'No pupil this account may see matches that.'
                      : 'Enrolling an already-enrolled pupil a second time is refused.'
                  }
                >
                  {candidates.data.rows.map((row) => (
                    <MenuItem key={row.id} value={row.id}>
                      {candidateLabel(row)}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}
            </Stack>
          )}

          {enrolment ? (
            <TextField
              select
              label="Class"
              size="small"
              value={targetSection}
              onChange={(event) => setTargetSection(event.target.value)}
              helperText="Choosing another class moves this pupil into it, keeping the same enrolment record."
            >
              {targetSection !== '' &&
              !sections.some((row) => row.id === targetSection) ? (
                <MenuItem value={targetSection}>Set, but not in this list</MenuItem>
              ) : null}
              {sections.map((row) => (
                <MenuItem key={row.id} value={row.id}>
                  {sectionLabel(row)}
                </MenuItem>
              ))}
            </TextField>
          ) : null}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Roll number"
              size="small"
              value={roll}
              onChange={(event) => setRoll(event.target.value)}
              fullWidth
              helperText={
                enrolment
                  ? 'Emptying this leaves the roll number as it is: the API has no way to clear one.'
                  : 'Optional.'
              }
            />
            <TextField
              label="Enrolment number"
              size="small"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              fullWidth
              helperText="Optional."
            />
          </Stack>

          {enrolment ? null : (
            <TextField
              label="Enrolled on"
              size="small"
              type="date"
              value={enrolledOn}
              onChange={(event) => setEnrolledOn(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              required
              error={!dateUsable}
              helperText={
                dateUsable
                  ? 'Required, and it cannot be changed afterwards.'
                  : 'An enrolment date is required, as a calendar date.'
              }
            />
          )}

          {enrolment ? (
            <TextField
              label="Left on"
              size="small"
              type="date"
              value={exitOn}
              onChange={(event) => setExitOn(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              error={!exitUsable || exitBeforeStart}
              helperText={
                exitBeforeStart
                  ? 'A pupil cannot leave before they arrived.'
                  : 'Set when a pupil leaves. Emptying it leaves whatever is already recorded.'
              }
            />
          ) : null}

          {enrolment ? (
            <TextField
              select
              label="Promotion"
              size="small"
              value={promotion}
              onChange={(event) => setPromotion(event.target.value)}
              helperText="What happened at the end of the year. Leaving it unset leaves whatever is recorded."
            >
              <MenuItem value="">Not decided</MenuItem>
              {PROMOTION_STATUSES.map((option) => (
                <MenuItem key={option} value={option}>
                  {PROMOTION_STATUS_LABELS[option] ?? option}
                </MenuItem>
              ))}
            </TextField>
          ) : null}

          <TextField
            select
            label="Status"
            size="small"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {ENROLMENT_STATUSES.map((option) => (
              <MenuItem key={option} value={option}>
                {ENROLMENT_STATUS_LABELS[option] ?? option}
              </MenuItem>
            ))}
          </TextField>

          {enrolment ? (
            <Alert severity="info" variant="outlined">
              Withdrawing keeps the record and the year&apos;s marks against it. Deleting
              removes the enrolment itself, and a pupil with marks or attendance recorded
              cannot be deleted.
            </Alert>
          ) : null}

          <MdmFormError error={failure} />
        </Stack>
      </DialogContent>
      <MdmFormActions
        onDelete={
          enrolment && mayDelete
            ? () => remove.mutate(enrolment.id, { onSuccess: onClose })
            : undefined
        }
        onCancel={onClose}
        onSave={save}
        busy={busy}
        canSave={
          usable && (Boolean(enrolment) || (Boolean(sectionId) && Boolean(sessionId)))
        }
      />
    </>
  );
}

function candidateLabel(row: StudentRow): string {
  const found = personOf('students', row);
  const name = found.status === 'present' ? nameOf(found.person) : null;
  const code = codeOf(row, ROSTER_KINDS.students.codeFields);
  if (name && code) return `${name} · ${code}`;
  return name ?? code ?? 'A pupil this account may not name';
}
