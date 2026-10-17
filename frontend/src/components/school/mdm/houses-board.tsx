'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { useCreateHouse, useDeleteHouse, useUpdateHouse } from '@/hooks/mutation/use-mdm';
import { useMdmHouses } from '@/hooks/query/use-mdm';
import { MdmBoard, StatusChip } from './mdm-board';
import { MdmDialog, MdmFormActions, MdmFormError, StatusSelect } from './mdm-dialog';
import type { RowStatus, SchoolHouse } from '@/types/mdm';

export function HousesBoard(): React.ReactElement {
  const houses = useMdmHouses();
  const [editing, setEditing] = React.useState<SchoolHouse | 'new' | null>(null);

  const rows = houses.data?.rows ?? [];

  return (
    <>
      <MdmBoard
        summary={`${rows.length} ${rows.length === 1 ? 'house' : 'houses'}`}
        addLabel="Add a house"
        onAdd={() => setEditing('new')}
        isPending={houses.isPending}
        error={houses.error}
        onRetry={() => void houses.refetch()}
        isEmpty={rows.length === 0}
        emptyMessage="No houses yet. A pupil can be put in one once they exist."
      >
        <TableHead>
          <TableRow>
            <TableCell>House</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Edit</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((house) => (
            <TableRow key={house.id} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {house.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {house.code ?? '—'}
                </Typography>
              </TableCell>
              <TableCell>
                <StatusChip status={house.status} />
              </TableCell>
              <TableCell align="right">
                <Button size="small" onClick={() => setEditing(house)}>
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
        <HouseForm
          house={editing === 'new' ? undefined : (editing ?? undefined)}
          onClose={() => setEditing(null)}
        />
      </MdmDialog>
    </>
  );
}

function HouseForm({
  house,
  onClose,
}: {
  house: SchoolHouse | undefined;
  onClose: () => void;
}): React.ReactElement {
  const create = useCreateHouse();
  const update = useUpdateHouse();
  const remove = useDeleteHouse();

  const [name, setName] = React.useState(house?.name ?? '');
  const [code, setCode] = React.useState(house?.code ?? '');
  const [status, setStatus] = React.useState<string>(house?.status ?? 'active');

  const usable = name.trim() !== '';
  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const save = (): void => {
    const body = {
      name: name.trim(),
      code: code.trim() === '' ? undefined : code.trim(),
      status: status as RowStatus,
    };
    if (house) update.mutate({ id: house.id, patch: body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onClose });
  };

  return (
    <>
      <DialogTitle>{house ? 'Edit house' : 'Add a house'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            helperText="Unique across the school."
          />
          <TextField
            label="Code"
            size="small"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            helperText="Optional, and unique when it is set."
          />
          <StatusSelect value={status} onChange={setStatus} />
          <MdmFormError error={failure} />
        </Stack>
      </DialogContent>
      <MdmFormActions
        onDelete={house ? () => remove.mutate(house.id, { onSuccess: onClose }) : undefined}
        onCancel={onClose}
        onSave={save}
        busy={busy}
        canSave={usable}
      />
    </>
  );
}
