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

import { SectionHeader } from '@/components/ui/layout';
import { useCreateBranch, useDeleteBranch, useUpdateBranch } from '@/hooks/mutation/use-mdm';
import { useMdmBranches } from '@/hooks/query/use-mdm';
import { MdmBoard, StatusChip } from './mdm-board';
import { MdmDialog, MdmFormActions, MdmFormError, StatusSelect } from './mdm-dialog';
import type { Branch, PostalAddress, RowStatus } from '@/types/mdm';

const ADDRESS_FIELDS: readonly { key: keyof PostalAddress; label: string }[] = [
  { key: 'line1', label: 'Address line 1' },
  { key: 'line2', label: 'Address line 2' },
  { key: 'landmark', label: 'Landmark' },
  { key: 'city', label: 'City' },
  { key: 'district', label: 'District' },
  { key: 'state', label: 'State' },
  { key: 'postal_code', label: 'Postal code' },
  { key: 'country', label: 'Country' },
];

export function BranchesBoard(): React.ReactElement {
  const branches = useMdmBranches();
  const [editing, setEditing] = React.useState<Branch | 'new' | null>(null);

  const rows = branches.data?.rows ?? [];

  return (
    <>
      <MdmBoard
        summary={`${rows.length} ${rows.length === 1 ? 'branch' : 'branches'}`}
        addLabel="Add a branch"
        onAdd={() => setEditing('new')}
        isPending={branches.isPending}
        error={branches.error}
        onRetry={() => void branches.refetch()}
        isEmpty={rows.length === 0}
        emptyMessage="No branches yet. A branch owns its own rooms, calendar and classes, so one has to exist before anything else does."
      >
        <TableHead>
          <TableRow>
            <TableCell>Branch</TableCell>
            <TableCell>Where</TableCell>
            <TableCell>Contact</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Edit</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((branch) => (
            <TableRow key={branch.id} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {branch.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {branch.code}
                </Typography>
              </TableCell>
              <TableCell>{placeOf(branch.address_json) || '—'}</TableCell>
              <TableCell>
                {[branch.phone, branch.email].filter(Boolean).join(' · ') || '—'}
              </TableCell>
              <TableCell>
                <StatusChip status={branch.status} />
              </TableCell>
              <TableCell align="right">
                <Button size="small" onClick={() => setEditing(branch)}>
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
        maxWidth="sm"
      >
        <BranchForm
          branch={editing === 'new' ? undefined : (editing ?? undefined)}
          onClose={() => setEditing(null)}
        />
      </MdmDialog>
    </>
  );
}

function placeOf(address: PostalAddress | undefined): string {
  return [address?.city, address?.state].filter(Boolean).join(', ');
}

function BranchForm({
  branch,
  onClose,
}: {
  branch: Branch | undefined;
  onClose: () => void;
}): React.ReactElement {
  const create = useCreateBranch();
  const update = useUpdateBranch();
  const remove = useDeleteBranch();

  const [name, setName] = React.useState(branch?.name ?? '');
  const [code, setCode] = React.useState(branch?.code ?? '');
  const [phone, setPhone] = React.useState(branch?.phone ?? '');
  const [email, setEmail] = React.useState(branch?.email ?? '');
  const [status, setStatus] = React.useState<string>(branch?.status ?? 'active');
  const [address, setAddress] = React.useState<PostalAddress>(
    branch?.address_json ?? {},
  );

  const usable = name.trim() !== '' && code.trim() !== '';
  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const save = (): void => {
    const filled = Object.fromEntries(
      Object.entries(address)
        .map(([key, value]) => [key, (value ?? '').trim()])
        .filter(([, value]) => value !== ''),
    ) as PostalAddress;
    const shared = {
      name: name.trim(),
      phone: phone.trim() === '' ? undefined : phone.trim(),
      email: email.trim() === '' ? undefined : email.trim(),
      address_json: filled,
      status: status as RowStatus,
    };
    if (branch) update.mutate({ id: branch.id, patch: shared }, { onSuccess: onClose });
    else create.mutate({ ...shared, code: code.trim() }, { onSuccess: onClose });
  };

  return (
    <>
      <DialogTitle>{branch ? 'Edit branch' : 'Add a branch'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Name"
              size="small"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Code"
              size="small"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              fullWidth
              disabled={Boolean(branch)}
              helperText={branch ? 'A branch code cannot be changed.' : undefined}
            />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Phone"
              size="small"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              fullWidth
            />
            <TextField
              label="Email"
              size="small"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              fullWidth
            />
          </Stack>

          <SectionHeader title="Address" subtitle="All of it optional." />
          <Stack spacing={2}>
            {ADDRESS_FIELDS.map((field) => (
              <TextField
                key={field.key}
                label={field.label}
                size="small"
                value={address[field.key] ?? ''}
                onChange={(event) =>
                  setAddress((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
              />
            ))}
          </Stack>

          <StatusSelect value={status} onChange={setStatus} />

          {branch ? (
            <Alert severity="info" variant="outlined">
              A branch still holding rooms, classes or calendar days cannot be deleted.
            </Alert>
          ) : null}

          <MdmFormError error={failure} />
        </Stack>
      </DialogContent>
      <MdmFormActions
        onDelete={
          branch ? () => remove.mutate(branch.id, { onSuccess: onClose }) : undefined
        }
        onCancel={onClose}
        onSave={save}
        busy={busy}
        canSave={usable}
      />
    </>
  );
}
