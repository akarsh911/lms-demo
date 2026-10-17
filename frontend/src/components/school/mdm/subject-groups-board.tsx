'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
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

import {
  useCreateSubjectGroup,
  useDeleteSubjectGroup,
  useUpdateSubjectGroup,
} from '@/hooks/mutation/use-mdm';
import { useMdmSubjectGroups } from '@/hooks/query/use-mdm';
import { MdmBoard, StatusChip } from './mdm-board';
import { MdmDialog, MdmFormActions, MdmFormError, StatusSelect } from './mdm-dialog';
import type { RowStatus, SubjectGroup } from '@/types/mdm';

export function SubjectGroupsBoard(): React.ReactElement {
  const groups = useMdmSubjectGroups();
  const [editing, setEditing] = React.useState<SubjectGroup | 'new' | null>(null);

  const rows = groups.data?.rows ?? [];

  return (
    <>
      <MdmBoard
        summary={`${rows.length} ${rows.length === 1 ? 'group' : 'groups'}`}
        addLabel="Add a group"
        onAdd={() => setEditing('new')}
        isPending={groups.isPending}
        error={groups.error}
        onRetry={() => void groups.refetch()}
        isEmpty={rows.length === 0}
        emptyMessage="No subject groups yet. They are optional: an offering can stand on its own."
      >
        <TableHead>
          <TableRow>
            <TableCell>Group</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Edit</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((group) => (
            <TableRow key={group.id} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {group.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {group.description ?? '—'}
                </Typography>
              </TableCell>
              <TableCell>
                <StatusChip status={group.status} />
              </TableCell>
              <TableCell align="right">
                <Button size="small" onClick={() => setEditing(group)}>
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
        <SubjectGroupForm
          group={editing === 'new' ? undefined : (editing ?? undefined)}
          onClose={() => setEditing(null)}
        />
      </MdmDialog>
    </>
  );
}

function SubjectGroupForm({
  group,
  onClose,
}: {
  group: SubjectGroup | undefined;
  onClose: () => void;
}): React.ReactElement {
  const create = useCreateSubjectGroup();
  const update = useUpdateSubjectGroup();
  const remove = useDeleteSubjectGroup();

  const [name, setName] = React.useState(group?.name ?? '');
  const [description, setDescription] = React.useState(group?.description ?? '');
  const [status, setStatus] = React.useState<string>(group?.status ?? 'active');

  const usable = name.trim() !== '';
  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const save = (): void => {
    const body = {
      name: name.trim(),
      description: description.trim() === '' ? undefined : description.trim(),
      status: status as RowStatus,
    };
    if (group) update.mutate({ id: group.id, patch: body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onClose });
  };

  return (
    <>
      <DialogTitle>{group ? 'Edit subject group' : 'Add a subject group'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            helperText="Unique across the school, such as Languages."
          />
          <TextField
            label="Description"
            size="small"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={2}
          />
          <StatusSelect value={status} onChange={setStatus} />

          <Alert severity="info" variant="outlined">
            A group is a school-wide taxonomy, not a pick-one list for a class.
            Nothing here stops a pupil taking two subjects from the same group.
          </Alert>

          <MdmFormError error={failure} />
        </Stack>
      </DialogContent>
      <MdmFormActions
        onDelete={group ? () => remove.mutate(group.id, { onSuccess: onClose }) : undefined}
        onCancel={onClose}
        onSave={save}
        busy={busy}
        canSave={usable}
      />
    </>
  );
}
