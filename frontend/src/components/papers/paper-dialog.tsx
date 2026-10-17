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

import { useBlueprints } from '@/hooks/query/use-blueprints';
import { useReachableExams } from '@/hooks/query/use-exams';
import {
  useCreatePaper,
  useDeletePaper,
  useUpdatePaper,
} from '@/hooks/mutation/use-papers';
import { blueprintLabel } from '@/lib/papers/blueprint';
import {
  PAPER_STATUS_LABELS,
  PATTERN_FIGURE_WITHHELD,
  PATTERN_OWNS_THE_FIGURES,
  PUBLISHED_PAPER_IS_SETTLED,
  figureFromPattern,
  isPublished,
  markLabel,
  patternAdoptions,
  type PatternFigure,
} from '@/lib/papers/paper';
import { durationLabel } from '@/lib/school/time';
import { examLabel, trimNumber } from '@/lib/exams/exam';
import { PAPER_STATUSES, type PaperPatch, type PaperRow, type PaperStatus } from '@/types/papers';
import type { AcademicSessionRow } from '@/types/school';
import { PaperFormError } from './form-failure';

const NO_ANCHOR = '';

interface PaperDialogProps {
  open: boolean;
  onClose: () => void;
  paper: PaperRow | undefined;
  sessions: readonly AcademicSessionRow[];
  defaultSessionId: string | null;
  mayDelete: boolean;
  onCreated: (id: string) => void;
}

export function PaperDialog(props: PaperDialogProps): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      {props.open ? <PaperForm key={props.paper?.id ?? 'new'} {...props} /> : null}
    </Dialog>
  );
}

function PaperForm({
  onClose,
  paper,
  sessions,
  defaultSessionId,
  mayDelete,
  onCreated,
}: PaperDialogProps): React.ReactElement {
  const create = useCreatePaper();
  const update = useUpdatePaper();
  const remove = useDeletePaper();

  const blueprints = useBlueprints('all');
  const exams = useReachableExams();

  const [sessionId, setSessionId] = React.useState(
    paper?.academic_session_id ?? defaultSessionId ?? '',
  );
  const [code, setCode] = React.useState(paper?.paper_code ?? '');
  const [title, setTitle] = React.useState(paper?.title ?? '');
  const [marks, setMarks] = React.useState(numberInput(paper?.total_marks));
  const [minutes, setMinutes] = React.useState(numberInput(paper?.duration_minutes));
  const [status, setStatus] = React.useState<PaperStatus>(paper?.status ?? 'draft');
  const [blueprintId, setBlueprintId] = React.useState(paper?.blueprint_id ?? NO_ANCHOR);
  const [examId, setExamId] = React.useState(paper?.exam_id ?? NO_ANCHOR);
  const [confirming, setConfirming] = React.useState(false);

  const settled = isPublished(paper);
  const marksValue = Number(marks);
  const minutesValue = Number(minutes);
  const marksTyped = marks.trim() !== '' && Number.isFinite(marksValue) && marksValue > 0;
  const minutesTyped =
    minutes.trim() === '' || (Number.isFinite(minutesValue) && minutesValue > 0);

  const patternChosen = blueprintId !== NO_ANCHOR;
  const pattern = (blueprints.data?.rows ?? []).find((row) => row.id === blueprintId);

  const marksFigure = figureFromPattern(
    patternChosen,
    blueprints.isPending,
    pattern?.total_marks,
  );
  const minutesFigure = figureFromPattern(
    patternChosen,
    blueprints.isPending,
    pattern?.duration_minutes,
  );
  const marksLocked = isLocked(marksFigure);
  const minutesLocked = isLocked(minutesFigure);
  const marksBad = !marksLocked && marks.trim() !== '' && !marksTyped;
  const minutesBad = !minutesLocked && !minutesTyped;
  const readOnlyWhenDerived = (figure: PatternFigure) => ({
    input: { readOnly: figure.state === 'derived' },
  });

  const nextMarks = marksFigure.state === 'derived' ? marksFigure.value : marksValue;
  const nextMinutes =
    minutesFigure.state === 'derived'
      ? minutesFigure.value
      : minutes.trim() === ''
        ? null
        : minutesValue;

  const usable =
    title.trim() !== '' &&
    (marksFigure.state === 'derived' || marksTyped) &&
    (minutesFigure.state === 'derived' || minutesTyped) &&
    marksFigure.state !== 'pending' &&
    (paper ? true : code.trim() !== '' && sessionId !== '');

  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const bothAnchors = blueprintId !== NO_ANCHOR && examId !== NO_ANCHOR;
  const noAnchor = blueprintId === NO_ANCHOR && examId === NO_ANCHOR;
  const adoptions = paper ? patternAdoptions(paper, marksFigure, minutesFigure) : [];

  const save = (): void => {
    if (paper) {
      const patch: PaperPatch = {};
      if (title.trim() !== (paper.title ?? '')) patch.title = title.trim();
      if (nextMarks !== paper.total_marks) patch.total_marks = nextMarks;
      if (status !== paper.status) patch.status = status;
      if (nextMinutes !== (paper.duration_minutes ?? null)) {
        patch.duration_minutes = nextMinutes;
      }
      const nextBlueprint = blueprintId === NO_ANCHOR ? null : blueprintId;
      if (nextBlueprint !== (paper.blueprint_id ?? null)) patch.blueprint_id = nextBlueprint;
      const nextExam = examId === NO_ANCHOR ? null : examId;
      if (nextExam !== (paper.exam_id ?? null)) patch.exam_id = nextExam;
      update.mutate({ id: paper.id, patch }, { onSuccess: onClose });
      return;
    }

    create.mutate(
      {
        academic_session_id: sessionId,
        paper_code: code.trim(),
        title: title.trim(),
        total_marks: nextMarks,
        status,
        ...(nextMinutes === null ? {} : { duration_minutes: nextMinutes }),
        ...(blueprintId === NO_ANCHOR ? {} : { blueprint_id: blueprintId }),
        ...(examId === NO_ANCHOR ? {} : { exam_id: examId }),
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
      <DialogTitle>{paper ? 'Edit this paper' : 'New paper'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {settled ? (
            <Alert severity="info" variant="outlined">
              <AlertTitle>Published, so settled</AlertTitle>
              {PUBLISHED_PAPER_IS_SETTLED}
            </Alert>
          ) : null}

          {paper ? null : (
            <TextField
              select
              label="Academic year"
              size="small"
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              required
              helperText="A paper belongs to one year and cannot be moved afterwards."
            >
              {sessions.map((session) => (
                <MenuItem key={session.id} value={session.id}>
                  {session.name ?? session.code ?? session.id}
                  {session.is_current ? ' (current)' : ''}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            label="Title"
            size="small"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            disabled={settled}
            helperText="What a teacher and a candidate will call it. Up to 200 characters."
          />

          <TextField
            label="Paper code"
            size="small"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            disabled={Boolean(paper)}
            helperText={
              paper
                ? 'The code and version are fixed when the paper is created.'
                : 'Unique with its version inside this academic year.'
            }
          />

          <TextField
            select
            label="Pattern it follows"
            size="small"
            value={blueprintId}
            onChange={(event) => setBlueprintId(event.target.value)}
            disabled={settled}
            helperText={
              patternChosen
                ? PATTERN_OWNS_THE_FIGURES
                : 'The blueprint this paper was built against, if there is one.'
            }
          >
            <MenuItem value={NO_ANCHOR}>No pattern</MenuItem>
            {(blueprints.data?.rows ?? []).map((row) => (
              <MenuItem key={row.id} value={row.id}>
                {blueprintLabel(row)}
              </MenuItem>
            ))}
          </TextField>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Marked out of"
              size="small"
              type="number"
              value={figureInput(marksFigure, marks)}
              onChange={(event) => setMarks(event.target.value)}
              required={!marksLocked}
              disabled={settled || marksFigure.state === 'pending'}
              slotProps={readOnlyWhenDerived(marksFigure)}
              error={marksBad}
              helperText={marksHelper(marksFigure, marksBad)}
              fullWidth
            />
            <TextField
              label="Minutes allowed"
              size="small"
              type="number"
              value={figureInput(minutesFigure, minutes)}
              onChange={(event) => setMinutes(event.target.value)}
              disabled={settled || minutesFigure.state === 'pending'}
              slotProps={readOnlyWhenDerived(minutesFigure)}
              error={minutesBad}
              helperText={minutesHelper(minutesFigure, minutesBad)}
              fullWidth
            />
          </Stack>

          {adoptions.length > 0 ? (
            <Alert severity="warning" variant="outlined">
              <AlertTitle>Saving restates this paper from the pattern</AlertTitle>
              {adoptions.join(' ')}
            </Alert>
          ) : null}

          <TextField
            select
            label="Assessment it belongs to"
            size="small"
            value={examId}
            onChange={(event) => setExamId(event.target.value)}
            disabled={settled}
            helperText="The exam campaign this paper is sat under, if there is one."
          >
            <MenuItem value={NO_ANCHOR}>No assessment</MenuItem>
            {(exams.data ?? []).map((row) => (
              <MenuItem key={row.id} value={row.id}>
                {examLabel(row)}
              </MenuItem>
            ))}
          </TextField>

          {bothAnchors ? (
            <Alert severity="info" variant="outlined">
              With both named, whether you may write this paper is decided by the
              pattern rather than the assessment.
            </Alert>
          ) : null}

          {noAnchor ? (
            <Alert severity="warning" variant="outlined">
              A paper naming neither a pattern nor an assessment is reachable
              school-wide only. Unless you hold the school-wide key, this will be
              refused; naming one of the two is what narrows it.
            </Alert>
          ) : null}

          <TextField
            select
            label="Status"
            size="small"
            value={status}
            onChange={(event) => setStatus(event.target.value as PaperStatus)}
            disabled={settled}
            helperText={
              status === 'approved'
                ? 'Approving records you as the approver, and when.'
                : 'Publishing settles the paper: after that it is superseded, not edited.'
            }
          >
            {PAPER_STATUSES.map((value) => (
              <MenuItem key={value} value={value}>
                {PAPER_STATUS_LABELS[value]}
              </MenuItem>
            ))}
          </TextField>

          {confirming ? (
            <Alert severity="error" variant="outlined">
              Deleting this paper deletes its sections and everything on them. A
              published paper cannot be deleted at all.
            </Alert>
          ) : null}

          <PaperFormError error={failure} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <span>
          {paper && mayDelete && !settled ? (
            confirming ? (
              <Button
                color="error"
                size="small"
                variant="contained"
                disabled={busy}
                onClick={() => remove.mutate(paper.id, { onSuccess: onClose })}
              >
                Delete it and its sections
              </Button>
            ) : (
              <Button
                color="error"
                size="small"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
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
            disabled={busy || !usable || settled}
          >
            Save
          </Button>
        </Stack>
      </DialogActions>
    </>
  );
}

function isLocked(figure: PatternFigure): boolean {
  return figure.state === 'derived' || figure.state === 'pending';
}

function figureInput(figure: PatternFigure, typed: string): string {
  return figure.state === 'derived' ? trimNumber(figure.value) : typed;
}

function marksHelper(figure: PatternFigure, bad: boolean): string {
  if (figure.state === 'derived') return `From the pattern: ${markLabel(figure.value)}.`;
  if (figure.state === 'pending') return 'Reading what the pattern is marked out of.';
  if (bad) return 'A total has to be above zero.';
  if (figure.state === 'unreadable') return PATTERN_FIGURE_WITHHELD;
  return 'Required.';
}

function minutesHelper(figure: PatternFigure, bad: boolean): string {
  if (figure.state === 'derived') return `From the pattern: ${durationLabel(figure.value)}.`;
  if (figure.state === 'pending') return 'Reading how long the pattern runs.';
  if (bad) return 'A duration has to be above zero.';
  if (figure.state === 'unreadable') return PATTERN_FIGURE_WITHHELD;
  return 'Optional. Leave it empty for a paper with no stated time.';
}

function numberInput(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : '';
}
