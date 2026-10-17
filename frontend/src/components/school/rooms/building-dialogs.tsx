'use client';

import * as React from 'react';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useSaveRoom, useSaveRooms } from '@/hooks/mutation/use-foundation';
import type { Room } from '@/types/school';

const TYPES = [
  { value: 'classroom', label: 'Classrooms' },
  { value: 'laboratory', label: 'Labs' },
  { value: 'staffroom', label: 'Offices' },
] as const;

// "Junior Block" becomes "JB"; rooms are numbered floor first, as 101, 102, then 201.
const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 3);
const floorKey = (i: number, ground: boolean): string => (ground && i === 0 ? 'Ground' : String(ground ? i : i + 1));
const roomName = (prefix: string, floorIndex: number, n: number, ground: boolean): string => `${prefix} ${ground ? floorIndex : floorIndex + 1}${String(n).padStart(2, '0')}`;

// A new building is created with its rooms, since a building exists only through the rooms in it.
export function AddBuildingDialog({ branchId, taken, onClose, onDone }: { branchId: string; taken: readonly string[]; onClose: () => void; onDone: (name: string) => void }): React.ReactElement {
  const notify = useToast();
  const save = useSaveRoom();
  const [name, setName] = React.useState('');
  const [floors, setFloors] = React.useState('3');
  const [perFloor, setPerFloor] = React.useState('6');
  const [ground, setGround] = React.useState(true);
  const [type, setType] = React.useState<string>('classroom');
  const [seats, setSeats] = React.useState('40');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const f = Math.min(12, Math.max(0, Number(floors) || 0));
  const p = Math.min(30, Math.max(0, Number(perFloor) || 0));
  const prefix = initials(name) || 'R';
  const clash = taken.some((t) => t.toLowerCase() === name.trim().toLowerCase());
  const total = f * p;
  const sample = total > 0 ? [roomName(prefix, 0, 1, ground), roomName(prefix, 0, p, ground), f > 1 ? roomName(prefix, f - 1, p, ground) : null].filter(Boolean).join(', ') : '';

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      for (let fi = 0; fi < f; fi += 1) {
        for (let n = 1; n <= p; n += 1) {
          const label = roomName(prefix, fi, n, ground);
          await save.mutateAsync({ body: { branch_id: branchId, name: label, code: label.replace(/\s+/g, ''), room_type: type, building: name.trim(), floor: floorKey(fi, ground), capacity: Number(seats) || null, status: 'active' } });
        }
      }
      notify(`${name.trim()} added with ${total} rooms`);
      onDone(name.trim());
    } catch (e) {
      setError(e instanceof Error ? e : new Error('The building could not be added.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open
      title="Add a building"
      description="Its rooms are created floor by floor; rename or change any of them afterwards."
      submitLabel={total > 0 ? `Add with ${total} Rooms` : 'Add Building'}
      pending={busy}
      error={error}
      canSubmit={name.trim() !== '' && !clash && total > 0}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <TextField label="Building name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required error={clash} helperText={clash ? 'A building with this name exists' : 'Junior Block, Science Wing, Annexe'} />
      <Stack direction="row" spacing={2}>
        <TextField label="Floors" type="number" value={floors} onChange={(e) => setFloors(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 12 } }} fullWidth />
        <TextField label="Rooms on each floor" type="number" value={perFloor} onChange={(e) => setPerFloor(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 30 } }} fullWidth />
        <TextField label="Seats per room" type="number" value={seats} onChange={(e) => setSeats(e.target.value)} fullWidth />
      </Stack>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <ToggleButtonGroup exclusive size="small" value={type} onChange={(_, v: string | null) => v && setType(v)} aria-label="What the rooms are">
          {TYPES.map((t) => (
            <ToggleButton key={t.value} value={t.value}>
              {t.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <ToggleButtonGroup exclusive size="small" value={ground ? 'ground' : 'first'} onChange={(_, v: string | null) => v && setGround(v === 'ground')} aria-label="Lowest floor">
          <ToggleButton value="ground">Starts at ground</ToggleButton>
          <ToggleButton value="first">Starts at floor 1</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {total > 0 ? (
        <Typography variant="body2" color="text.secondary">
          {total} rooms named like {sample}.
        </Typography>
      ) : null}
    </FormDialog>
  );
}

// Removing a building never deletes a room: its rooms move to another building, or are archived with their history.
export function RemoveBuildingDialog({ name, rooms, others, onClose, onDone }: { name: string; rooms: readonly Room[]; others: readonly string[]; onClose: () => void; onDone: () => void }): React.ReactElement {
  const notify = useToast();
  const save = useSaveRooms();
  const [mode, setMode] = React.useState<'move' | 'archive'>(others.length > 0 ? 'move' : 'archive');
  const [target, setTarget] = React.useState(others[0] ?? '');
  const [confirm, setConfirm] = React.useState('');
  const inUse = rooms.filter((r) => r.status === 'active').length;

  return (
    <FormDialog
      open
      title={`Remove ${name}`}
      description={`${rooms.length} rooms are in it. Choose what happens to them.`}
      submitLabel={mode === 'move' ? `Move ${rooms.length} Rooms and Remove` : `Archive ${rooms.length} Rooms`}
      pending={save.isPending}
      error={save.error}
      canSubmit={mode === 'move' ? target !== '' : confirm.trim().toLowerCase() === name.toLowerCase()}
      warning={mode === 'archive' && inUse > 0 ? `${inUse} of these rooms are in use. Sections or timetables that use them will show no room until they are given another.` : null}
      onClose={onClose}
      onSubmit={() =>
        save.mutate(
          { ids: rooms.map((r) => r.id), patch: mode === 'move' ? { building: target } : { status: 'archived' } },
          { onSuccess: () => (notify(mode === 'move' ? `${name} removed; its rooms are now in ${target}` : `${name} removed; ${rooms.length} rooms archived`), onDone()) },
        )
      }
    >
      <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v: 'move' | 'archive' | null) => v && setMode(v)} aria-label="What happens to the rooms">
        <ToggleButton value="move" disabled={others.length === 0}>
          Move rooms to another building
        </ToggleButton>
        <ToggleButton value="archive">Archive the rooms</ToggleButton>
      </ToggleButtonGroup>
      {mode === 'move' ? (
        <TextField select label="Move them to" value={target} onChange={(e) => setTarget(e.target.value)}>
          {others.map((o) => (
            <MenuItem key={o} value={o}>
              {o}
            </MenuItem>
          ))}
        </TextField>
      ) : (
        <TextField label={`Type ${name} to confirm`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      )}
    </FormDialog>
  );
}
