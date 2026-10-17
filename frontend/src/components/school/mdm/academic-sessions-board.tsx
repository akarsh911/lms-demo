'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import {
  useCreateSession,
  useDeleteSession,
  useUpdateSession,
} from '@/hooks/mutation/use-mdm';
import { useMdmSessions } from '@/hooks/query/use-mdm';
import { dateOnly } from '@/lib/school/time';
import { MdmBoard, StatusChip } from './mdm-board';
import { MdmDialog, MdmFormActions, MdmFormError, StatusSelect } from './mdm-dialog';
import { SESSION_STATUS_LABELS } from './options';
import type { AcademicSession, SessionStatus } from '@/types/mdm';
import { SESSION_STATUSES } from '@/types/mdm';

export function AcademicSessionsBoard(): React.ReactElement {
  const sessions = useMdmSessions();
  const [editing, setEditing] = React.useState<AcademicSession | 'new' | null>(null);

  const rows = React.useMemo(
    () =>
      [...(sessions.data?.rows ?? [])].sort((a, b) =>
        dateOnly(b.start_date).localeCompare(dateOnly(a.start_date)),
      ),
    [sessions.data],
  );

  return (
    <>
      <MdmBoard
        summary={`${rows.length} ${rows.length === 1 ? 'academic year' : 'academic years'}`}
        addLabel="Add an academic year"
        onAdd={() => setEditing('new')}
        isPending={sessions.isPending}
        error={sessions.error}
        onRetry={() => void sessions.refetch()}
        isEmpty={rows.length === 0}
        emptyMessage="No academic years yet. Classes, offerings and the calendar all hang off one."
      >
        <TableHead>
          <TableRow>
            <TableCell>Year</TableCell>
            <TableCell>Runs</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Current</TableCell>
            <TableCell align="right">Edit</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((session) => (
            <TableRow key={session.id} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {session.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {session.code}
                </Typography>
              </TableCell>
              <TableCell>
                {dateOnly(session.start_date)} – {dateOnly(session.end_date)}
              </TableCell>
              <TableCell>
                <StatusChip status={session.status} />
              </TableCell>
              <TableCell>
                {session.is_current ? (
                  <EmergeChip label="Current" tone="teal" dot />
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    —
                  </Typography>
                )}
              </TableCell>
              <TableCell align="right">
                <Button size="small" onClick={() => setEditing(session)}>
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
        <SessionForm
          session={editing === 'new' ? undefined : (editing ?? undefined)}
          onClose={() => setEditing(null)}
        />
      </MdmDialog>
    </>
  );
}

function SessionForm({
  session,
  onClose,
}: {
  session: AcademicSession | undefined;
  onClose: () => void;
}): React.ReactElement {
  const create = useCreateSession();
  const update = useUpdateSession();
  const remove = useDeleteSession();

  const [name, setName] = React.useState(session?.name ?? '');
  const [code, setCode] = React.useState(session?.code ?? '');
  const [start, setStart] = React.useState(dateOnly(session?.start_date));
  const [end, setEnd] = React.useState(dateOnly(session?.end_date));
  const [isCurrent, setIsCurrent] = React.useState(session?.is_current ?? false);
  const [status, setStatus] = React.useState<string>(session?.status ?? 'upcoming');

  const datesOrdered = start !== '' && end !== '' && end > start;
  const usable = name.trim() !== '' && code.trim() !== '' && datesOrdered;
  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;
  const promoting = isCurrent && session?.is_current !== true;

  const save = (): void => {
    const shared = {
      name: name.trim(),
      start_date: start,
      end_date: end,
      is_current: isCurrent,
      status: status as SessionStatus,
    };
    if (session) update.mutate({ id: session.id, patch: shared }, { onSuccess: onClose });
    else create.mutate({ ...shared, code: code.trim() }, { onSuccess: onClose });
  };

  return (
    <>
      <DialogTitle>{session ? 'Edit academic year' : 'Add an academic year'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            helperText="Such as 2026-27."
          />
          <TextField
            label="Code"
            size="small"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            disabled={Boolean(session)}
            helperText={
              session ? 'A year code cannot be changed.' : 'Unique across the school.'
            }
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Starts"
              size="small"
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              required
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Ends"
              size="small"
              type="date"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              required
              fullWidth
              error={start !== '' && end !== '' && !datesOrdered}
              helperText={
                start !== '' && end !== '' && !datesOrdered
                  ? 'The end has to fall after the start.'
                  : undefined
              }
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
          <StatusSelect
            value={status}
            onChange={setStatus}
            options={SESSION_STATUSES}
            labels={SESSION_STATUS_LABELS}
          />
          <FormControlLabel
            control={
              <Switch
                checked={isCurrent}
                onChange={(event) => setIsCurrent(event.target.checked)}
              />
            }
            label="This is the current year"
          />

          {promoting ? (
            <Alert severity="warning" variant="outlined">
              Making this the current year takes the flag off whichever year holds it
              now. Every list that does not name a year switches to this one.
            </Alert>
          ) : null}

          <MdmFormError error={failure} />
        </Stack>
      </DialogContent>
      <MdmFormActions
        onDelete={
          session ? () => remove.mutate(session.id, { onSuccess: onClose }) : undefined
        }
        onCancel={onClose}
        onSave={save}
        busy={busy}
        canSave={usable}
      />
    </>
  );
}
