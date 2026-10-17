'use client';

import * as React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useUpdateSection } from '@/hooks/mutation/use-structure';
import { useRoomOptions } from '@/hooks/query/use-structure';
import type { RoomOption, StructureSection } from '@/types/structure';

// A section's home room. Rooms another section already uses are shown and not offered; a room smaller than the section is warned about.
export function RoomDialog({ yearId, label, section, onClose }: { yearId: string; label: string; section: StructureSection; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const options = useRoomOptions(yearId, true);
  const update = useUpdateSection();
  const [room, setRoom] = React.useState<RoomOption | null>(null);
  const current = options.data?.find((o) => o.id === section.room?.id) ?? null;
  const chosen = room ?? current;
  const small = chosen?.capacity != null && chosen.capacity < section.students;
  const free = (option: RoomOption): boolean => option.used_by === null || option.id === section.room?.id;
  // Free rooms first, because those are the ones that can be chosen.
  const sorted = [...(options.data ?? [])].sort((a, b) => Number(free(b)) - Number(free(a)));

  return (
    <FormDialog
      open
      title={`Room for ${label}`}
      description={`${section.students} students${section.room ? ` · now in ${section.room.name}` : ' · no room yet'}`}
      submitLabel="Save Room"
      pending={update.isPending}
      error={update.error}
      canSubmit={Boolean(chosen) && chosen?.id !== section.room?.id}
      warning={small ? `${chosen?.name} seats ${chosen?.capacity}; ${label} has ${section.students} students.` : null}
      onClose={onClose}
      onSubmit={() =>
        update.mutate(
          { sectionId: section.id, body: { room_id: chosen?.id ?? null } },
          {
            onSuccess: () => {
              notify(`${label} is now in ${chosen?.name ?? 'its room'}`);
              onClose();
            },
          },
        )
      }
    >
      <Autocomplete
        options={sorted}
        loading={options.isPending}
        value={chosen}
        onChange={(_, value) => setRoom(value)}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        getOptionDisabled={(option) => !free(option)}
        groupBy={(option) => (free(option) ? 'Free' : 'In use this year')}
        renderOption={({ key, ...props }, option) => (
          <li key={key} {...props}>
            <Stack sx={{ width: 1 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                <Typography variant="subtitle2">{option.name}</Typography>
                <Typography variant="body2" color={option.capacity !== null && option.capacity < section.students ? 'warning.dark' : 'text.secondary'}>
                  {option.capacity ?? '—'} seats
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {option.where}
                {option.used_by && option.id !== section.room?.id ? ` · ${option.used_by}’s room` : ''}
              </Typography>
            </Stack>
          </li>
        )}
        renderInput={(params) => <TextField {...params} label="Room" placeholder="Search rooms" autoFocus />}
      />
    </FormDialog>
  );
}
