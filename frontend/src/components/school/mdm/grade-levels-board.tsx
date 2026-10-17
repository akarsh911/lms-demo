'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ChevronDown, ChevronUp } from 'lucide-react';

import {
  useCreateGradeLevel,
  useDeleteGradeLevel,
  useUpdateGradeLevel,
} from '@/hooks/mutation/use-mdm';
import { useMdmGradeLevels } from '@/hooks/query/use-mdm';
import { MdmBoard, StatusChip } from './mdm-board';
import { MdmDialog, MdmFormActions, MdmFormError, StatusSelect } from './mdm-dialog';
import { EDUCATION_STAGES } from './options';
import type { GradeLevel, RowStatus } from '@/types/mdm';

export function GradeLevelsBoard(): React.ReactElement {
  const grades = useMdmGradeLevels();
  const update = useUpdateGradeLevel();
  const [editing, setEditing] = React.useState<GradeLevel | 'new' | null>(null);

  const rows = React.useMemo(
    () => [...(grades.data?.rows ?? [])].sort(bySequence),
    [grades.data],
  );

  const swap = (index: number, other: number): void => {
    const a = rows[index];
    const b = rows[other];
    if (!a || !b) return;
    update.mutate({ id: a.id, patch: { sequence: b.sequence ?? other } });
    update.mutate({ id: b.id, patch: { sequence: a.sequence ?? index } });
  };

  return (
    <>
      <MdmBoard
        summary={`${rows.length} ${rows.length === 1 ? 'grade level' : 'grade levels'}`}
        addLabel="Add a grade level"
        onAdd={() => setEditing('new')}
        isPending={grades.isPending}
        error={grades.error}
        onRetry={() => void grades.refetch()}
        isEmpty={rows.length === 0}
        emptyMessage="No grade levels yet. Every class belongs to one, so this is the first thing to set up."
        notice={
          update.isError ? (
            <Alert severity="error" variant="outlined">
              {update.error.message}
            </Alert>
          ) : null
        }
      >
        <TableHead>
          <TableRow>
            <TableCell>Order</TableCell>
            <TableCell>Grade</TableCell>
            <TableCell>Stage</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Edit</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((grade, index) => (
            <TableRow key={grade.id} hover>
              <TableCell>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ minWidth: 20 }}>
                    {grade.sequence ?? '—'}
                  </Typography>
                  <IconButton
                    size="small"
                    aria-label={`Move ${grade.name ?? grade.code ?? 'this grade'} earlier`}
                    disabled={index === 0 || update.isPending}
                    onClick={() => swap(index, index - 1)}
                  >
                    <ChevronUp size={14} />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label={`Move ${grade.name ?? grade.code ?? 'this grade'} later`}
                    disabled={index === rows.length - 1 || update.isPending}
                    onClick={() => swap(index, index + 1)}
                  >
                    <ChevronDown size={14} />
                  </IconButton>
                </Stack>
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {grade.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {grade.code}
                </Typography>
              </TableCell>
              <TableCell>{grade.education_stage ?? '—'}</TableCell>
              <TableCell>
                <StatusChip status={grade.status} />
              </TableCell>
              <TableCell align="right">
                <Button size="small" onClick={() => setEditing(grade)}>
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </MdmBoard>

      <MdmDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        formKey={editing === 'new' ? 'new' : (editing?.id ?? 'none')}
      >
        <GradeLevelForm
          grade={editing === 'new' ? undefined : (editing ?? undefined)}
          nextSequence={
            rows.length === 0 ? 1 : Math.max(...rows.map((row) => row.sequence ?? 0)) + 1
          }
          onClose={() => setEditing(null)}
        />
      </MdmDialog>
    </>
  );
}

function bySequence(a: GradeLevel, b: GradeLevel): number {
  return (a.sequence ?? 0) - (b.sequence ?? 0);
}

function GradeLevelForm({
  grade,
  nextSequence,
  onClose,
}: {
  grade: GradeLevel | undefined;
  nextSequence: number;
  onClose: () => void;
}): React.ReactElement {
  const create = useCreateGradeLevel();
  const update = useUpdateGradeLevel();
  const remove = useDeleteGradeLevel();

  const [name, setName] = React.useState(grade?.name ?? '');
  const [code, setCode] = React.useState(grade?.code ?? '');
  const [sequence, setSequence] = React.useState(
    String(grade?.sequence ?? nextSequence),
  );
  const [stage, setStage] = React.useState(grade?.education_stage ?? '');
  const [status, setStatus] = React.useState<string>(grade?.status ?? 'active');

  const parsedSequence = Number.parseInt(sequence, 10);
  const sequenceUsable = Number.isFinite(parsedSequence) && parsedSequence >= 0;
  const usable = name.trim() !== '' && code.trim() !== '' && sequenceUsable;
  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const save = (): void => {
    const shared = {
      name: name.trim(),
      sequence: parsedSequence,
      education_stage: stage.trim() === '' ? undefined : stage.trim(),
      status: status as RowStatus,
    };
    if (grade) update.mutate({ id: grade.id, patch: shared }, { onSuccess: onClose });
    else create.mutate({ ...shared, code: code.trim() }, { onSuccess: onClose });
  };

  return (
    <>
      <DialogTitle>{grade ? 'Edit grade level' : 'Add a grade level'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            helperText="What the school calls it, such as Class 10."
          />
          <TextField
            label="Code"
            size="small"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            disabled={Boolean(grade)}
            helperText={
              grade
                ? 'A code cannot be changed once the grade level exists.'
                : 'Unique across the school.'
            }
          />
          <TextField
            label="Order"
            size="small"
            type="number"
            value={sequence}
            onChange={(event) => setSequence(event.target.value)}
            error={!sequenceUsable}
            required
            helperText={
              sequenceUsable
                ? 'Drives promotion order: a lower number comes first.'
                : 'An order has to be zero or above.'
            }
          />
          <TextField
            select
            label="Education stage"
            size="small"
            value={EDUCATION_STAGES.includes(stage) || stage === '' ? stage : 'other'}
            onChange={(event) => setStage(event.target.value === 'other' ? '' : event.target.value)}
            helperText="Optional."
          >
            <MenuItem value="">Not set</MenuItem>
            {EDUCATION_STAGES.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          <StatusSelect value={status} onChange={setStatus} />

          {grade ? (
            <Alert severity="info" variant="outlined">
              A grade level with classes under it cannot be deleted. Make it inactive
              instead and it stops being offered on new forms.
            </Alert>
          ) : null}

          <MdmFormError error={failure} />
        </Stack>
      </DialogContent>
      <MdmFormActions
        onDelete={
          grade ? () => remove.mutate(grade.id, { onSuccess: onClose }) : undefined
        }
        onCancel={onClose}
        onSave={save}
        busy={busy}
        canSave={usable}
      />
    </>
  );
}
