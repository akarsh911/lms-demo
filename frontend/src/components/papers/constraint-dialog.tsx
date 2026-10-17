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

import { useCreateBlueprintConstraint } from '@/hooks/mutation/use-blueprints';
import { CONSTRAINT_TYPE_LABELS } from '@/lib/papers/blueprint';
import { CONSTRAINT_TYPES, type ConstraintType } from '@/types/blueprints';
import { PaperFormError } from './form-failure';

const BARE_LIST_HINT =
  'A JSON object. A bare list is not one, so a list of values goes in as {"values": ["a", "b"]}.';

interface ConstraintDialogProps {
  open: boolean;
  onClose: () => void;
  sectionId: string | null;
  sectionName: string;
}

export function ConstraintDialog(props: ConstraintDialogProps): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      {props.open ? <ConstraintForm key={props.sectionId ?? 'none'} {...props} /> : null}
    </Dialog>
  );
}

function ConstraintForm({
  onClose,
  sectionId,
  sectionName,
}: ConstraintDialogProps): React.ReactElement {
  const create = useCreateBlueprintConstraint(sectionId);

  const [kind, setKind] = React.useState<ConstraintType>('difficulty');
  const [value, setValue] = React.useState('{\n  "values": []\n}');
  const [min, setMin] = React.useState('');
  const [max, setMax] = React.useState('');

  const parsed = parseObject(value);
  const minValue = Number(min);
  const maxValue = Number(max);
  const minUsable = min.trim() === '' || Number.isFinite(minValue);
  const maxUsable = max.trim() === '' || Number.isFinite(maxValue);
  const backwards =
    min.trim() !== '' && max.trim() !== '' && minUsable && maxUsable && maxValue < minValue;

  const usable = parsed !== null && minUsable && maxUsable && !backwards;

  const save = (): void => {
    if (!parsed) return;
    create.mutate(
      {
        constraint_type: kind,
        value_json: parsed,
        ...(min.trim() === '' ? {} : { min_value: minValue }),
        ...(max.trim() === '' ? {} : { max_value: maxValue }),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <DialogTitle>New constraint on {sectionName}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            select
            label="What it constrains"
            size="small"
            value={kind}
            onChange={(event) => setKind(event.target.value as ConstraintType)}
            required
          >
            {CONSTRAINT_TYPES.map((option) => (
              <MenuItem key={option} value={option}>
                {CONSTRAINT_TYPE_LABELS[option]}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Value"
            size="small"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
            multiline
            minRows={4}
            error={parsed === null}
            helperText={
              parsed === null
                ? `That is not a JSON object. ${BARE_LIST_HINT}`
                : BARE_LIST_HINT
            }
            slotProps={{ htmlInput: { spellCheck: false } }}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="At least"
              size="small"
              type="number"
              value={min}
              onChange={(event) => setMin(event.target.value)}
              error={!minUsable}
              helperText="Optional."
              fullWidth
            />
            <TextField
              label="At most"
              size="small"
              type="number"
              value={max}
              onChange={(event) => setMax(event.target.value)}
              error={!maxUsable || backwards}
              helperText={backwards ? 'The most cannot be below the least.' : 'Optional.'}
              fullWidth
            />
          </Stack>

          <Alert severity="info" variant="outlined">
            A constraint is recorded once and not edited afterwards. To change one,
            record a new version of the pattern.
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
          disabled={create.isPending || !usable || !sectionId}
        >
          Save
        </Button>
      </DialogActions>
    </>
  );
}

function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
