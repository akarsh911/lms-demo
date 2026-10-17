'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';

import {
  useCreateBellSchedule,
  useDeleteBellSchedule,
  useUpdateBellSchedule,
} from '@/hooks/mutation/use-school';
import type { BellSchedule } from '@/types/school';

/**
 * A bell schedule: one set of times over the scheme's periods.
 *
 * A scheme has at most ONE default — a partial unique index enforces it — so
 * making this one the default is a change to whichever one holds it now. The
 * switch says so rather than letting the refusal explain it afterwards.
 */
export interface BellDialogProps {
  open: boolean;
  onClose: () => void;
  schemeId: string | null;
  bell: BellSchedule | undefined;
  hasDefault: boolean;
}

/** Mounted and keyed with the dialog; see `calendar-day-dialog.tsx`. */
export function BellDialog(props: BellDialogProps): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      {props.open ? <BellForm key={props.bell?.id ?? 'new'} {...props} /> : null}
    </Dialog>
  );
}

function BellForm({
  onClose,
  schemeId,
  bell,
  hasDefault,
}: BellDialogProps): React.ReactElement {
  const create = useCreateBellSchedule(schemeId);
  const update = useUpdateBellSchedule();
  const remove = useDeleteBellSchedule();

  const [name, setName] = React.useState(bell?.name ?? '');
  const [code, setCode] = React.useState(bell?.code ?? '');
  const [isDefault, setIsDefault] = React.useState(bell?.is_default ?? false);

  const usable = name.trim() !== '' && code.trim() !== '';
  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;
  const takingDefault = isDefault && !bell?.is_default && hasDefault;

  const save = (): void => {
    const body = { name: name.trim(), code: code.trim(), is_default: isDefault };
    if (bell) update.mutate({ id: bell.id, patch: body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onClose });
  };

  return (
    <>
      <DialogTitle>{bell ? 'Edit bell schedule' : 'Add a bell schedule'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            helperText="Regular, Saturday, Examination."
          />
          <TextField
            label="Code"
            size="small"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
          />
          <FormControlLabel
            control={
              <Switch
                checked={isDefault}
                onChange={(event) => setIsDefault(event.target.checked)}
              />
            }
            label="Use as the default"
          />
          {takingDefault ? (
            <Alert severity="info" variant="outlined">
              A scheme has one default. Saving this takes it from the schedule that
              holds it now, and that one has to be changed first.
            </Alert>
          ) : null}
          {failure ? (
            <Alert severity="error" variant="outlined">
              {failure.message}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <span>
          {bell ? (
            <Button
              color="error"
              size="small"
              disabled={busy}
              onClick={() => remove.mutate(bell.id, { onSuccess: onClose })}
            >
              Delete
            </Button>
          ) : null}
        </span>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={save} disabled={busy || !usable || !schemeId}>
            Save
          </Button>
        </Stack>
      </DialogActions>
    </>
  );
}
