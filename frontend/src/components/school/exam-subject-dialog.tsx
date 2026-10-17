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
  useCreateExamSubject,
  useDeleteExamSubject,
  useUpdateExamSubject,
} from '@/hooks/mutation/use-exams';
import { failureText } from '@/lib/exams/exam';
import type { PickerOption } from './sitting-dialog';
import type { ExamSubjectPatch, ExamSubjectRow } from '@/types/exams';

interface ExamSubjectDialogProps {
  open: boolean;
  onClose: () => void;
  examId: string | null;
  subject: ExamSubjectRow | undefined;
  paperLabel: string;
  offerings: readonly PickerOption[];
  gradingSchemes: readonly PickerOption[];
  mayDelete: boolean;
  sittingCount: number;
}

export function ExamSubjectDialog(props: ExamSubjectDialogProps): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      {props.open ? <SubjectForm key={props.subject?.id ?? 'new'} {...props} /> : null}
    </Dialog>
  );
}

function SubjectForm({
  onClose,
  examId,
  subject,
  paperLabel,
  offerings,
  gradingSchemes,
  mayDelete,
  sittingCount,
}: ExamSubjectDialogProps): React.ReactElement {
  const create = useCreateExamSubject(examId);
  const update = useUpdateExamSubject();
  const remove = useDeleteExamSubject();

  const [offeringId, setOfferingId] = React.useState('');
  const [maximum, setMaximum] = React.useState(
    subject?.maximum_marks === undefined ? '' : String(subject.maximum_marks),
  );
  const [pass, setPass] = React.useState(
    subject?.pass_marks === undefined ? '' : String(subject.pass_marks),
  );
  const [schemeId, setSchemeId] = React.useState(subject?.grading_scheme_id ?? '');

  const parsedMaximum = Number.parseFloat(maximum);
  const maximumUsable = Number.isFinite(parsedMaximum) && parsedMaximum > 0;
  const parsedPass = pass.trim() === '' ? null : Number.parseFloat(pass);
  const passUsable =
    parsedPass === null ||
    (Number.isFinite(parsedPass) &&
      parsedPass >= 0 &&
      (!maximumUsable || parsedPass <= parsedMaximum));

  const usable =
    maximumUsable && passUsable && (subject !== undefined || offeringId !== '');
  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const save = (): void => {
    if (!usable) return;
    if (subject) {
      const patch: ExamSubjectPatch = {};
      if (parsedMaximum !== subject.maximum_marks) patch.maximum_marks = parsedMaximum;
      if (parsedPass !== (subject.pass_marks ?? null)) patch.pass_marks = parsedPass;
      const scheme = schemeId === '' ? null : schemeId;
      if (scheme !== (subject.grading_scheme_id ?? null)) patch.grading_scheme_id = scheme;
      update.mutate({ id: subject.id, patch }, { onSuccess: onClose });
      return;
    }
    create.mutate(
      {
        subject_offering_id: offeringId,
        maximum_marks: parsedMaximum,
        pass_marks: parsedPass ?? undefined,
        grading_scheme_id: schemeId === '' ? undefined : schemeId,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <DialogTitle>{subject ? 'Edit this paper' : 'Add a paper'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {subject ? (
            <div>
              <Typography variant="caption" color="text.secondary">
                Subject
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {paperLabel}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                A paper cannot be moved to another subject. Remove it and add the one
                you meant.
              </Typography>
            </div>
          ) : (
            <TextField
              select
              label="Subject"
              size="small"
              value={offeringId}
              onChange={(event) => setOfferingId(event.target.value)}
              required
              disabled={offerings.length === 0}
              helperText={
                offerings.length === 0
                  ? 'Every subject taught in this branch and year already has a paper in this assessment.'
                  : 'One class studying one subject. A subject taught to four classes takes four papers.'
              }
            >
              {offerings.map((offering) => (
                <MenuItem key={offering.id} value={offering.id}>
                  {offering.label}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            label="Marked out of"
            size="small"
            type="number"
            value={maximum}
            onChange={(event) => setMaximum(event.target.value)}
            required
            error={maximum !== '' && !maximumUsable}
            helperText={
              maximum !== '' && !maximumUsable
                ? 'A maximum has to be above zero.'
                : 'Required.'
            }
          />

          <TextField
            label="Pass mark"
            size="small"
            type="number"
            value={pass}
            onChange={(event) => setPass(event.target.value)}
            error={!passUsable}
            helperText={
              passUsable
                ? 'Optional. Leave it empty for a paper with no pass mark.'
                : 'A pass mark cannot be negative or above the maximum.'
            }
          />

          <TextField
            select
            label="Grading scheme"
            size="small"
            value={schemeId}
            onChange={(event) => setSchemeId(event.target.value)}
            helperText="Optional. Left empty, the subject's own scheme is used."
          >
            <MenuItem value="">The subject&rsquo;s own scheme</MenuItem>
            {gradingSchemes.map((scheme) => (
              <MenuItem key={scheme.id} value={scheme.id}>
                {scheme.label}
              </MenuItem>
            ))}
          </TextField>

          {subject && sittingCount > 0 ? (
            <Alert severity="warning" variant="outlined">
              Removing this paper also removes the {sittingCount}{' '}
              {sittingCount === 1 ? 'sitting' : 'sittings'} scheduled for it.
            </Alert>
          ) : null}

          {failure ? (
            <Alert severity="error" variant="outlined">
              {failureText(failure)}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <span>
          {subject && mayDelete ? (
            <Button
              color="error"
              size="small"
              disabled={busy}
              onClick={() => remove.mutate(subject.id, { onSuccess: onClose })}
            >
              Remove
            </Button>
          ) : null}
        </span>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={save} disabled={busy || !usable}>
            Save
          </Button>
        </Stack>
      </DialogActions>
    </>
  );
}
