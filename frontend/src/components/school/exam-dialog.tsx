'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import { useCreateExam, useDeleteExam, useUpdateExam } from '@/hooks/mutation/use-exams';
import {
  ASSESSMENT_KIND_CHOICE,
  EXAM_STATUS_LABELS,
  EXAM_TYPE_LABELS,
  assessmentKindOf,
  countedNowhereDespiteType,
  failureText,
  namedPaperButCounts,
  toInstant,
  toLocalInput,
  windowIsBackwards,
} from '@/lib/exams/exam';
import {
  ASSESSMENT_KINDS,
  EXAM_STATUSES,
  EXAM_TYPES,
  type AssessmentKind,
  type ExamPatch,
  type ExamRow,
  type ExamStatus,
  type ExamType,
} from '@/types/exams';

interface ExamDialogProps {
  open: boolean;
  onClose: () => void;
  branchId: string | null;
  sessionId: string | null;
  exam: ExamRow | undefined;
  mayDelete: boolean;
  onCreated: (id: string) => void;
}

export function ExamDialog(props: ExamDialogProps): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      {props.open ? <ExamForm key={props.exam?.id ?? 'new'} {...props} /> : null}
    </Dialog>
  );
}

function ExamForm({
  onClose,
  branchId,
  sessionId,
  exam,
  mayDelete,
  onCreated,
}: ExamDialogProps): React.ReactElement {
  const create = useCreateExam();
  const update = useUpdateExam();
  const remove = useDeleteExam();

  const [name, setName] = React.useState(exam?.name ?? '');
  const [code, setCode] = React.useState(exam?.code ?? '');
  const [type, setType] = React.useState<ExamType>(exam?.exam_type ?? 'unit_test');
  const [kind, setKind] = React.useState<AssessmentKind>(assessmentKindOf(exam));
  const [status, setStatus] = React.useState<ExamStatus>(exam?.status ?? 'draft');
  const [start, setStart] = React.useState(toLocalInput(exam?.start_at));
  const [end, setEnd] = React.useState(toLocalInput(exam?.end_at));
  const [instructions, setInstructions] = React.useState(exam?.instructions ?? '');
  const [confirming, setConfirming] = React.useState(false);

  const backwards = windowIsBackwards(start, end);
  const usable = name.trim() !== '' && code.trim() !== '' && !backwards;
  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const save = (): void => {
    if (exam) {
      const patch = changesFor(exam, {
        name: name.trim(),
        code: code.trim(),
        exam_type: type,
        assessment_kind: kind,
        status,
        start_at: toInstant(start),
        end_at: toInstant(end),
        instructions,
      });
      update.mutate({ id: exam.id, patch }, { onSuccess: onClose });
      return;
    }
    if (!branchId || !sessionId) return;
    create.mutate(
      {
        academic_session_id: sessionId,
        branch_id: branchId,
        name: name.trim(),
        code: code.trim(),
        exam_type: type,
        assessment_kind: kind,
        status,
        start_at: toInstant(start),
        end_at: toInstant(end),
        instructions: instructions.trim() === '' ? undefined : instructions,
      },
      {
        onSuccess: (row) => {
          onCreated(row.id);
          onClose();
        },
      },
    );
  };

  return (
    <>
      <DialogTitle>{exam ? 'Edit this assessment' : 'New assessment'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            helperText="What a teacher and a parent will call it. Up to 200 characters."
          />
          <TextField
            label="Code"
            size="small"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            helperText="Unique within this branch and this academic year."
          />

          <FormControl>
            <FormLabel id="assessment-kind-label">Counts toward results</FormLabel>
            <RadioGroup
              aria-labelledby="assessment-kind-label"
              value={kind}
              onChange={(event) => setKind(event.target.value as AssessmentKind)}
            >
              {ASSESSMENT_KINDS.map((value) => (
                <FormControlLabel
                  key={value}
                  value={value}
                  control={<Radio size="small" />}
                  label={ASSESSMENT_KIND_CHOICE[value]}
                />
              ))}
            </RadioGroup>
          </FormControl>

          {kind === 'practice' ? (
            <Alert severity="warning" variant="outlined">
              Every mark in this assessment will be recorded and shown, and none of it
              will reach a report card. Whoever sets it and whoever marks it both need
              to know that before the papers go out.
            </Alert>
          ) : null}

          <TextField
            select
            label="Paper"
            size="small"
            value={type}
            onChange={(event) => setType(event.target.value as ExamType)}
            helperText="What kind of paper this is. It does not decide whether the marks count."
          >
            {EXAM_TYPES.map((value) => (
              <MenuItem key={value} value={value}>
                {EXAM_TYPE_LABELS[value]}
              </MenuItem>
            ))}
          </TextField>

          {namedPaperButCounts(type, kind) ? (
            <Alert severity="info" variant="outlined">
              This is called a practice paper and is set to count toward results. Those
              are two separate fields and the one that decides is “Counts toward
              results”, so these marks will reach the report card.
            </Alert>
          ) : null}

          {countedNowhereDespiteType(type, kind) ? (
            <Alert severity="info" variant="outlined">
              A {EXAM_TYPE_LABELS[type].toLowerCase()} that counts for nothing. That is
              allowed and sometimes meant; it is worth being sure it is meant here.
            </Alert>
          ) : null}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Starts"
              size="small"
              type="datetime-local"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              label="Ends"
              size="small"
              type="datetime-local"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              error={backwards}
              helperText={backwards ? 'The end cannot precede the start.' : undefined}
              fullWidth
            />
          </Stack>

          <Alert severity="info" variant="outlined">
            Dates here describe the campaign and schedule nothing. A class sits a paper
            only when a sitting is scheduled for it. Once a window is set it can be
            changed but not removed.
          </Alert>

          <TextField
            select
            label="Status"
            size="small"
            value={status}
            onChange={(event) => setStatus(event.target.value as ExamStatus)}
          >
            {EXAM_STATUSES.map((value) => (
              <MenuItem key={value} value={value}>
                {EXAM_STATUS_LABELS[value]}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Instructions"
            size="small"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            multiline
            minRows={3}
            helperText="Optional. Up to 4000 characters."
          />

          {confirming ? (
            <Alert severity="error" variant="outlined">
              Deleting this assessment deletes every paper under it and every sitting
              scheduled for those papers. Nothing else on the timetable changes.
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
          {exam && mayDelete ? (
            confirming ? (
              <Button
                color="error"
                size="small"
                variant="contained"
                disabled={busy}
                onClick={() => remove.mutate(exam.id, { onSuccess: onClose })}
              >
                Delete it and everything under it
              </Button>
            ) : (
              <Button color="error" size="small" disabled={busy} onClick={() => setConfirming(true)}>
                Delete
              </Button>
            )
          ) : null}
        </span>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={busy || !usable || (!exam && (!branchId || !sessionId))}
          >
            Save
          </Button>
        </Stack>
      </DialogActions>
    </>
  );
}

interface ExamFormValues {
  name: string;
  code: string;
  exam_type: ExamType;
  assessment_kind: AssessmentKind;
  status: ExamStatus;
  start_at: string | undefined;
  end_at: string | undefined;
  instructions: string;
}

function changesFor(exam: ExamRow, next: ExamFormValues): ExamPatch {
  const patch: ExamPatch = {};
  if (next.name !== (exam.name ?? '')) patch.name = next.name;
  if (next.code !== (exam.code ?? '')) patch.code = next.code;
  if (next.exam_type !== exam.exam_type) patch.exam_type = next.exam_type;
  if (next.assessment_kind !== assessmentKindOf(exam)) {
    patch.assessment_kind = next.assessment_kind;
  }
  if (next.status !== exam.status) patch.status = next.status;
  if (!sameInstant(next.start_at, exam.start_at)) patch.start_at = next.start_at;
  if (!sameInstant(next.end_at, exam.end_at)) patch.end_at = next.end_at;
  if (next.instructions !== (exam.instructions ?? '')) patch.instructions = next.instructions;
  return patch;
}

function sameInstant(next: string | undefined, current: string | undefined): boolean {
  if (!next && !current) return true;
  if (!next || !current) return false;
  return new Date(next).getTime() === new Date(current).getTime();
}
