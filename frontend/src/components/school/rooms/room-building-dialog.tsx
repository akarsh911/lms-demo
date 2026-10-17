'use client';

import * as React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useSaveRooms } from '@/hooks/mutation/use-foundation';
import type { Room } from '@/types/school';

export function RoomBuildingDialog({
  rooms,
  buildings,
  onClose,
  onDone,
}: {
  rooms: readonly Room[];
  buildings: readonly string[];
  onClose: () => void;
  onDone: () => void;
}): React.ReactElement {
  const [building, setBuilding] = React.useState('');
  const mutation = useSaveRooms();
  const notify = useToast();

  return (
    <FormDialog
      open
      title={`Change building for ${rooms.length} ${rooms.length === 1 ? 'room' : 'rooms'}`}
      submitLabel="Change building"
      pending={mutation.isPending}
      error={mutation.error}
      canSubmit={building.trim() !== ''}
      onClose={onClose}
      onSubmit={() =>
        mutation.mutate(
          { ids: rooms.map((room) => room.id), patch: { building: building.trim() } },
          {
            onSuccess: () => {
              notify(`${rooms.length} ${rooms.length === 1 ? 'room' : 'rooms'} moved to ${building.trim()}`);
              onDone();
              onClose();
            },
          },
        )
      }
    >
      <Autocomplete
        freeSolo
        options={[...buildings]}
        inputValue={building}
        onInputChange={(_, value) => setBuilding(value)}
        disabled={mutation.isPending}
        renderInput={(params) => <TextField {...params} label="Building" required autoFocus />}
      />
    </FormDialog>
  );
}
