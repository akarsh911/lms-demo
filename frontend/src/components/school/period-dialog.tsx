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

import { PERIOD_KIND_LABELS } from '@/constants/school';
import {
  useCreatePeriod,
  useDeletePeriod,
  useUpdatePeriod,
} from '@/hooks/mutation/use-school';
import { PERIOD_KINDS, type Period, type PeriodKind } from '@/types/school';

/**
 * A period in the pattern — and NOT a time.
 *
 * A period has a name, a code, a place in the order and a kind. It has no
 * start and no end, deliberately: the times live on `bell_schedule_periods`, so
 * one pattern of nine periods serves both the Regular bell and the Saturday
 * bell. Putting a clock here would force a second, parallel pattern into
 * existence to say that the same third lesson starts earlier on a Saturday.
 *
 * `sequence` is unique within the scheme, as is `code`, so two periods cannot
 * share a position — the refusal comes back from the database and is shown as
 * it is rather than guessed at here.
 */
export interface PeriodDialogProps {
  open: boolean;
  onClose: () => void;
  schemeId: string | null;
  period: Period | undefined;
  nextSequence: number;
}

/**
 * The form mounts with the dialog and is keyed on what it is pointed at, so its
 * fields are seeded once and never synchronised back from props. See
 * `calendar-day-dialog.tsx` for why that is not an effect.
 */
export function PeriodDialog(props: PeriodDialogProps): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      {props.open ? <PeriodForm key={props.period?.id ?? 'new'} {...props} /> : null}
    </Dialog>
  );
}

function PeriodForm({
  onClose,
  schemeId,
  period,
  nextSequence,
}: PeriodDialogProps): React.ReactElement {
  const create = useCreatePeriod(schemeId);
  const update = useUpdatePeriod();
  const remove = useDeletePeriod();

  const [name, setName] = React.useState(period?.name ?? '');
  const [code, setCode] = React.useState(period?.code ?? '');
  const [sequence, setSequence] = React.useState(String(period?.sequence ?? nextSequence));
  const [kind, setKind] = React.useState<PeriodKind>(period?.kind ?? 'teaching');

  const parsedSequence = Number.parseInt(sequence, 10);
  const usable =
    name.trim() !== '' && code.trim() !== '' && Number.isFinite(parsedSequence) && parsedSequence >= 0;
  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const save = (): void => {
    const body = {
      name: name.trim(),
      code: code.trim(),
      sequence: parsedSequence,
      kind,
    };
    if (period) update.mutate({ id: period.id, patch: body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onClose });
  };

  return (
    <>
      <DialogTitle>{period ? 'Edit period' : 'Add a period'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <TextField
            label="Code"
            size="small"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            helperText="Short, and unique in this scheme — P1, BRK, ASM."
          />
          <TextField
            label="Position in the day"
            size="small"
            type="number"
            value={sequence}
            onChange={(event) => setSequence(event.target.value)}
            required
          />
          <TextField
            select
            label="Kind"
            size="small"
            value={kind}
            onChange={(event) => setKind(event.target.value as PeriodKind)}
          >
            {PERIOD_KINDS.map((value) => (
              <MenuItem key={value} value={value}>
                {PERIOD_KIND_LABELS[value]}
              </MenuItem>
            ))}
          </TextField>

          <Typography variant="body2" color="text.secondary">
            Times are set per bell schedule, not here.
          </Typography>

          {failure ? (
            <Alert severity="error" variant="outlined">
              {failure.message}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <span>
          {period ? (
            <Button
              color="error"
              size="small"
              disabled={busy}
              onClick={() => remove.mutate(period.id, { onSuccess: onClose })}
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
