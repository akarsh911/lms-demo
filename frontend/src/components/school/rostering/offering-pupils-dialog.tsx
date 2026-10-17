'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import {
  WidgetDegraded,
  WidgetEmpty,
  WidgetError,
  WidgetLoading,
} from '@/components/widgets/widget-states';
import {
  useCreateSubjectEnrolment,
  useDeleteSubjectEnrolment,
  useUpdateSubjectEnrolment,
} from '@/hooks/mutation/use-rostering';
import {
  useOfferingEnrolments,
  useSectionEnrolments,
  useSectionRollNames,
} from '@/hooks/query/use-rostering';
import { emptyListMessage, partialListMessage } from '@/lib/school/reach';
import { offeringLabel, studentNames } from '@/lib/school/names';
import { useRosteringGrants } from './grants';
import {
  SUBJECT_ENROLMENT_STATUSES,
  SUBJECT_ENROLMENT_STATUS_LABELS,
} from './options';
import type { SchoolOfferingRow } from '@/types/school';
import type { SubjectEnrolmentStatus } from '@/types/rostering';

export function OfferingPupils({
  offering,
  sectionId,
  onClose,
}: {
  offering: SchoolOfferingRow;
  sectionId: string | null;
  onClose: () => void;
}): React.ReactElement {
  const grants = useRosteringGrants();
  const taking = useOfferingEnrolments(offering.id);
  const roll = useSectionEnrolments(sectionId);
  const names = useSectionRollNames(sectionId);

  const create = useCreateSubjectEnrolment();
  const update = useUpdateSubjectEnrolment();
  const remove = useDeleteSubjectEnrolment();

  const [adding, setAdding] = React.useState('');

  const rows = React.useMemo(() => taking.data?.rows ?? [], [taking.data]);
  const pupils = React.useMemo(() => studentNames(names.data?.rows ?? []), [names.data]);

  const nameOfEnrolment = React.useCallback(
    (studentId: string | undefined): string =>
      (studentId ? pupils.get(studentId) : undefined) ?? 'Name not shown to you',
    [pupils],
  );

  const alreadyTaking = React.useMemo(
    () => new Set(rows.map((row) => row.student_enrollment_id).filter(Boolean)),
    [rows],
  );
  const candidates = React.useMemo(
    () => (roll.data?.rows ?? []).filter((row) => !alreadyTaking.has(row.id)),
    [roll.data, alreadyTaking],
  );

  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const partial = partialListMessage(
    grants.subjectEnrolmentReach,
    rows.length,
    'This account reaches only part of the school, so this is what it may see of who takes this subject rather than the whole of it.',
  );

  const emptyMessage = emptyListMessage(grants.subjectEnrolmentReach, {
    school_wide: 'Nobody in this class is down for this subject yet.',
    narrowed:
      'No subject enrolment here is one this account may see. That is a reach, not a count: the subject may well be full.',
    unknown:
      'Nothing came back for this subject, and what this account reaches is not known yet.',
    denied:
      'This account holds no grant to read subject enrolments, so who takes this subject cannot be shown here.',
  });

  return (
    <>
      <DialogTitle>
        {offeringLabel(offering)}
        <Typography variant="body2" color="text.secondary">
          Who in this class takes this subject
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {names.isError ? (
            <WidgetDegraded
              error={names.error}
              denied="This account cannot read pupil records, so this list is built from the enrolments alone and carries no names."
              unavailable="Pupil records could not be loaded, so this list is built from the enrolments alone and carries no names."
            />
          ) : null}

          {partial ? (
            <Alert severity="info" variant="outlined">
              {partial}
            </Alert>
          ) : null}

          {grants.mayWriteSubjectEnrolment ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                select
                size="small"
                label="Add a pupil to this subject"
                value={adding}
                onChange={(event) => setAdding(event.target.value)}
                sx={{ minWidth: 260 }}
                disabled={candidates.length === 0}
                helperText={
                  roll.isError
                    ? 'The class roll could not be read, so nobody can be chosen here.'
                    : candidates.length === 0
                      ? 'Everyone on the roll this account can see is already down for it.'
                      : 'Only pupils enrolled in this class can take its subjects.'
                }
              >
                {candidates.map((row) => (
                  <MenuItem key={row.id} value={row.id}>
                    {nameOfEnrolment(row.student_id)}
                    {row.roll_number ? ` · Roll ${row.roll_number}` : ''}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="outlined"
                size="small"
                disabled={adding === '' || busy}
                sx={{ alignSelf: 'flex-start' }}
                onClick={() =>
                  create.mutate(
                    {
                      student_enrollment_id: adding,
                      subject_offering_id: offering.id,
                    },
                    { onSuccess: () => setAdding('') },
                  )
                }
              >
                Add
              </Button>
            </Stack>
          ) : grants.settled ? (
            <Alert severity="info" variant="outlined">
              This account holds no grant to write subject enrolments, so who takes this
              subject can be read here but not changed.
            </Alert>
          ) : null}

          {failure ? (
            <Alert severity="error" variant="outlined">
              {failure.message}
            </Alert>
          ) : null}

          {taking.isPending ? <WidgetLoading rows={4} /> : null}
          {taking.isError ? (
            <WidgetError error={taking.error} onRetry={() => void taking.refetch()} />
          ) : null}
          {!taking.isPending && !taking.isError && rows.length === 0 ? (
            <WidgetEmpty message={emptyMessage} />
          ) : null}

          {rows.length > 0 ? (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Pupil</TableCell>
                  <TableCell>Chose it</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Remove</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>{nameOfEnrolment(row.student_id)}</TableCell>
                    <TableCell>{row.is_elective_choice ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      <TextField
                        select
                        size="small"
                        label="Status"
                        value={row.status ?? 'active'}
                        disabled={!grants.mayWriteSubjectEnrolment || busy}
                        onChange={(event) =>
                          update.mutate({
                            id: row.id,
                            patch: {
                              status: event.target.value as SubjectEnrolmentStatus,
                            },
                          })
                        }
                        sx={{ minWidth: 160 }}
                      >
                        {SUBJECT_ENROLMENT_STATUSES.map((option) => (
                          <MenuItem key={option} value={option}>
                            {SUBJECT_ENROLMENT_STATUS_LABELS[option] ?? option}
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        color="error"
                        disabled={!grants.mayDeleteSubjectEnrolment || busy}
                        onClick={() => remove.mutate(row.id)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}

          <Alert severity="info" variant="outlined">
            Dropping keeps the record and whatever was marked against it. Removing
            deletes the enrolment itself. A pupil may hold one arm of an elective group,
            so adding a second arm is refused and names the one they already hold.
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </>
  );
}
