'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import { useCreateBlueprintSection } from '@/hooks/mutation/use-blueprints';
import { PaperFormError } from './form-failure';

interface BlueprintSectionDialogProps {
  open: boolean;
  onClose: () => void;
  blueprintId: string | null;
  nextPosition: number;
}

export function BlueprintSectionDialog(
  props: BlueprintSectionDialogProps,
): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      {props.open ? <BlueprintSectionForm {...props} /> : null}
    </Dialog>
  );
}

function BlueprintSectionForm({
  onClose,
  blueprintId,
  nextPosition,
}: BlueprintSectionDialogProps): React.ReactElement {
  const create = useCreateBlueprintSection(blueprintId);

  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [position, setPosition] = React.useState(String(nextPosition));
  const [count, setCount] = React.useState('');
  const [each, setEach] = React.useState('');
  const [total, setTotal] = React.useState('');
  const [minutes, setMinutes] = React.useState('');

  const positionValue = Number(position);
  const countValue = Number(count);
  const eachValue = Number(each);
  const totalValue = Number(total);
  const minutesValue = Number(minutes);

  const positionUsable = Number.isInteger(positionValue) && positionValue > 0;
  const countUsable = Number.isInteger(countValue) && countValue > 0;
  const totalUsable = total.trim() !== '' && Number.isFinite(totalValue) && totalValue > 0;
  const eachUsable = each.trim() === '' || (Number.isFinite(eachValue) && eachValue > 0);
  const minutesUsable =
    minutes.trim() === '' || (Number.isFinite(minutesValue) && minutesValue > 0);

  const impliedTotal = countUsable && eachUsable && each.trim() !== '' ? countValue * eachValue : null;
  const disagrees = impliedTotal !== null && totalUsable && impliedTotal !== totalValue;

  const usable =
    name.trim() !== '' &&
    code.trim() !== '' &&
    positionUsable &&
    countUsable &&
    totalUsable &&
    eachUsable &&
    minutesUsable;

  const save = (): void => {
    create.mutate(
      {
        name: name.trim(),
        section_code: code.trim(),
        position: positionValue,
        question_count: countValue,
        total_marks: totalValue,
        ...(each.trim() === '' ? {} : { marks_per_question: eachValue }),
        ...(minutes.trim() === '' ? {} : { duration_minutes: minutesValue }),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <DialogTitle>New section in this pattern</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Section code"
              size="small"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              helperText="Unique within this pattern."
              fullWidth
            />
            <TextField
              label="Position"
              size="small"
              type="number"
              value={position}
              onChange={(event) => setPosition(event.target.value)}
              required
              error={position.trim() !== '' && !positionUsable}
              helperText="Two sections cannot share one."
              fullWidth
            />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="How many questions"
              size="small"
              type="number"
              value={count}
              onChange={(event) => setCount(event.target.value)}
              required
              error={count.trim() !== '' && !countUsable}
              helperText="Required, above zero."
              fullWidth
            />
            <TextField
              label="Marks each"
              size="small"
              type="number"
              value={each}
              onChange={(event) => setEach(event.target.value)}
              error={!eachUsable}
              helperText="Optional, for a section where every question is worth the same."
              fullWidth
            />
            <TextField
              label="Marks in total"
              size="small"
              type="number"
              value={total}
              onChange={(event) => setTotal(event.target.value)}
              required
              error={total.trim() !== '' && !totalUsable}
              helperText="Required, above zero."
              fullWidth
            />
          </Stack>

          {disagrees ? (
            <Alert severity="info" variant="outlined">
              {countValue} questions at {eachValue} each comes to {impliedTotal}, and the
              total says {totalValue}. Both are stored as typed; a section with optional
              questions is a real reason for them to differ.
            </Alert>
          ) : null}

          <TextField
            label="Minutes allowed"
            size="small"
            type="number"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            error={!minutesUsable}
            helperText="Optional."
          />

          <PaperFormError error={create.error} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={create.isPending || !usable || !blueprintId}
        >
          Save
        </Button>
      </DialogActions>
    </>
  );
}
