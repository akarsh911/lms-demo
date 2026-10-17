'use client';

import * as React from 'react';
import FormHelperText from '@mui/material/FormHelperText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useSaveRooms } from '@/hooks/mutation/use-foundation';
import type { Room } from '@/types/school';

// Takes one room or several out of use for a stretch, with the reason people will ask for.
export function RoomUnavailableDialog({ rooms, onClose, onDone }: { rooms: readonly Room[]; onClose: () => void; onDone?: () => void }): React.ReactElement {
  const [status, setStatus] = React.useState<'maintenance' | 'unavailable'>('maintenance');
  // Read once when the dialog opens, so render stays free of the clock.
  const [from, setFrom] = React.useState(() => new Date().toLocaleDateString('en-CA'));
  const [until, setUntil] = React.useState('');
  const [reason, setReason] = React.useState('');
  const mutation = useSaveRooms();
  const notify = useToast();

  const one = rooms.length === 1 ? rooms[0] : undefined;
  const backwards = until !== '' && until < from;

  return (
    <FormDialog
      open
      title={one ? `Mark ${one.name} unavailable` : `Mark ${rooms.length} rooms unavailable`}
      description="Lessons already placed there are not moved. They are listed as needing another room."
      submitLabel="Mark unavailable"
      pending={mutation.isPending}
      error={mutation.error}
      canSubmit={from !== '' && reason.trim() !== '' && !backwards}
      onClose={onClose}
      onSubmit={() =>
        mutation.mutate(
          { ids: rooms.map((room) => room.id), patch: { status, unavailable: { from, until: until || null, reason: reason.trim() } } },
          {
            onSuccess: () => {
              notify(one ? `${one.name} marked unavailable` : `${rooms.length} rooms marked unavailable`);
              onDone?.();
              onClose();
            },
          },
        )
      }
    >
      <TextField select label="Status" value={status} onChange={(event) => setStatus(event.target.value as 'maintenance' | 'unavailable')} disabled={mutation.isPending} fullWidth>
        <MenuItem value="maintenance">Maintenance</MenuItem>
        <MenuItem value="unavailable">Temporarily unavailable</MenuItem>
      </TextField>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="From" type="date" required autoFocus value={from} onChange={(event) => setFrom(event.target.value)} disabled={mutation.isPending} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="Until" type="date" value={until} onChange={(event) => setUntil(event.target.value)} error={backwards} helperText="Leave empty if not known" disabled={mutation.isPending} fullWidth slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from } }} />
      </Stack>
      {backwards ? <FormHelperText error role="alert">It cannot end before it starts.</FormHelperText> : null}
      <TextField label="Reason" required placeholder="Projector being replaced" value={reason} onChange={(event) => setReason(event.target.value)} disabled={mutation.isPending} fullWidth />
    </FormDialog>
  );
}
