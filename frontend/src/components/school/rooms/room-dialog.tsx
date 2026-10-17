'use client';

import * as React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { ROOM_TYPES } from '@/constants/school';
import { useSaveRoom } from '@/hooks/mutation/use-foundation';
import { FACILITIES, roomCode, roomTypeLabel } from '@/lib/school/rooms';
import type { RoomInsight } from '@/types/foundation';
import type { Room } from '@/types/school';

export function RoomDialog({
  branchId,
  room,
  rooms,
  insight,
  onClose,
}: {
  branchId: string;
  room?: Room;
  // Every room in the branch: for the buildings on offer and to keep codes apart.
  rooms: readonly Room[];
  insight?: RoomInsight;
  onClose: () => void;
}): React.ReactElement {
  const [name, setName] = React.useState(room?.name ?? '');
  const [building, setBuilding] = React.useState(room?.building ?? '');
  const [floor, setFloor] = React.useState(room?.floor ?? '');
  const [type, setType] = React.useState(room?.room_type ?? 'classroom');
  const [capacity, setCapacity] = React.useState(room?.capacity === undefined ? '' : String(room.capacity));
  const [facilities, setFacilities] = React.useState<string[]>(room?.facilities ?? []);
  const [notes, setNotes] = React.useState(room?.notes ?? '');
  const mutation = useSaveRoom();
  const notify = useToast();

  const buildings = [...new Set(rooms.map((r) => r.building).filter((b): b is string => Boolean(b)))].sort();
  const types = ROOM_TYPES.includes(type) ? ROOM_TYPES : [...ROOM_TYPES, type];
  const seats = capacity.trim() === '' ? null : Number(capacity);
  const seatsWrong = seats !== null && (!Number.isInteger(seats) || seats < 1);
  // Said, not blocked: the class may be about to move.
  const tooSmall =
    !seatsWrong && seats !== null && insight?.primary_use && insight.primary_size !== null && insight.primary_size > seats
      ? `${insight.primary_use} is planned for ${insight.primary_size} pupils. This room's new capacity is ${seats}.`
      : null;

  const submit = (): void => {
    const body = {
      name: name.trim(),
      building: building.trim() || null,
      floor: floor.trim() || null,
      room_type: type,
      capacity: seats,
      facilities,
      notes: notes.trim() || null,
    };
    mutation.mutate(
      room
        ? { id: room.id, body }
        : { body: { ...body, branch_id: branchId, status: 'active', code: roomCode(name, rooms.map((r) => r.code)) } },
      {
        onSuccess: () => {
          notify(room ? 'Room updated' : 'Room added');
          onClose();
        },
      },
    );
  };

  return (
    <FormDialog
      open
      maxWidth="sm"
      title={room ? 'Edit room' : 'Add room'}
      submitLabel={room ? 'Save changes' : 'Add Room'}
      pending={mutation.isPending}
      error={mutation.error}
      warning={tooSmall}
      canSubmit={name.trim() !== '' && !seatsWrong}
      onClose={onClose}
      onSubmit={submit}
    >
      <TextField label="Room name or number" required autoFocus placeholder="204" value={name} onChange={(event) => setName(event.target.value)} disabled={mutation.isPending} fullWidth />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Autocomplete
          freeSolo
          fullWidth
          options={buildings}
          inputValue={building}
          onInputChange={(_, value) => setBuilding(value)}
          disabled={mutation.isPending}
          renderInput={(params) => <TextField {...params} label="Building" placeholder="Main Block" />}
        />
        <TextField label="Floor" placeholder="2" value={floor} onChange={(event) => setFloor(event.target.value)} disabled={mutation.isPending} sx={{ minWidth: { sm: 140 } }} />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField select label="Type" value={type} onChange={(event) => setType(event.target.value)} disabled={mutation.isPending} fullWidth>
          {types.map((option) => (
            <MenuItem key={option} value={option}>
              {roomTypeLabel(option)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Capacity"
          type="number"
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
          error={seatsWrong}
          helperText={seatsWrong ? 'A whole number of seats, at least 1.' : undefined}
          disabled={mutation.isPending}
          sx={{ minWidth: { sm: 140 } }}
          slotProps={{ htmlInput: { min: 1, inputMode: 'numeric' } }}
        />
      </Stack>
      <Autocomplete
        multiple
        freeSolo
        options={FACILITIES}
        value={facilities}
        onChange={(_, value) => setFacilities(value)}
        disabled={mutation.isPending}
        renderInput={(params) => <TextField {...params} label="Facilities" placeholder={facilities.length === 0 ? 'Projector, Smart Board' : undefined} />}
      />
      <TextField label="Notes" multiline minRows={2} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={mutation.isPending} fullWidth />
    </FormDialog>
  );
}
