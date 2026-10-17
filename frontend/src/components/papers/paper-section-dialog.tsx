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

import { useCreatePaperSection } from '@/hooks/mutation/use-papers';
import { PaperFormError } from './form-failure';

interface PaperSectionDialogProps {
  open: boolean;
  onClose: () => void;
  paperId: string | null;
  nextPosition: number;
}

export function PaperSectionDialog(props: PaperSectionDialogProps): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      {props.open ? <PaperSectionForm {...props} /> : null}
    </Dialog>
  );
}

function PaperSectionForm({
  onClose,
  paperId,
  nextPosition,
}: PaperSectionDialogProps): React.ReactElement {
  const create = useCreatePaperSection(paperId);

  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [position, setPosition] = React.useState(String(nextPosition));
  const [instructions, setInstructions] = React.useState('');

  const positionValue = Number(position);
  const positionUsable = Number.isInteger(positionValue) && positionValue > 0;
  const usable = name.trim() !== '' && code.trim() !== '' && positionUsable;

  const save = (): void => {
    create.mutate(
      {
        name: name.trim(),
        code: code.trim(),
        position: positionValue,
        ...(instructions.trim() === '' ? {} : { instructions: instructions.trim() }),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <DialogTitle>New section on this paper</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            helperText="What the section is called on the paper, such as Section A."
          />
          <TextField
            label="Code"
            size="small"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            helperText="Short, and unique within this paper."
          />
          <TextField
            label="Position"
            size="small"
            type="number"
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            required
            error={position.trim() !== '' && !positionUsable}
            helperText={
              position.trim() !== '' && !positionUsable
                ? 'A position is a whole number above zero.'
                : 'The order it prints in. Two sections cannot share one.'
            }
          />
          <TextField
            label="Instructions"
            size="small"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            multiline
            minRows={2}
            helperText="Optional. What a candidate is told before the questions."
          />

          <Alert severity="info" variant="outlined">
            Questions go on once the section exists. Each one records both the
            question and the exact version it printed, so a later edit in the bank
            cannot change what candidates sat.
          </Alert>

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
          disabled={create.isPending || !usable || !paperId}
        >
          Save
        </Button>
      </DialogActions>
    </>
  );
}
