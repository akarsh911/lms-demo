'use client';

import * as React from 'react';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useCreateSchedule, useRenameSchedule } from '@/hooks/mutation/use-foundation';
import { schoolService } from '@/services/school';
import type { BellSchedule } from '@/types/school';

const EMPTY = '';

// Adds a schedule, optionally as a copy of another, or renames one.
export function ScheduleDialog({
  yearId,
  branchId,
  schemeId,
  schedules,
  rename,
  copyOf,
  onClose,
  onCreated,
}: {
  yearId: string;
  branchId: string;
  schemeId: string | null;
  schedules: readonly BellSchedule[];
  rename?: BellSchedule;
  copyOf?: BellSchedule;
  onClose: () => void;
  onCreated: (bell: BellSchedule) => void;
}): React.ReactElement {
  const [name, setName] = React.useState(rename?.name ?? (copyOf ? `${copyOf.name} copy` : ''));
  const [source, setSource] = React.useState(copyOf?.id ?? EMPTY);
  const create = useCreateSchedule();
  const renameIt = useRenameSchedule();
  const notify = useToast();
  const pending = create.isPending || renameIt.isPending;
  const taken = schedules.some((bell) => bell.id !== rename?.id && (bell.name ?? '').trim().toLowerCase() === name.trim().toLowerCase());

  const submit = async (): Promise<void> => {
    if (rename) {
      renameIt.mutate(
        { id: rename.id, name: name.trim() },
        {
          onSuccess: () => {
            notify('Bell schedule renamed');
            onClose();
          },
        },
      );
      return;
    }
    // The source's times are read at the moment of copying, so the copy is of what is saved, not what was on screen.
    const copy = source === EMPTY ? [] : (await schoolService.listBellPeriods(source)).rows;
    create.mutate(
      { yearId, branchId, schemeId, name: name.trim(), isDefault: schedules.length === 0, copy },
      {
        onSuccess: (bell) => {
          notify('Bell schedule created');
          onCreated(bell);
          onClose();
        },
      },
    );
  };

  return (
    <FormDialog
      open
      title={rename ? 'Rename schedule' : copyOf ? 'Duplicate schedule' : 'Add schedule'}
      description={rename ? undefined : 'A schedule is one shape of the school day: its periods, breaks and their times.'}
      submitLabel={rename ? 'Save changes' : 'Create Schedule'}
      pending={pending}
      error={create.error ?? renameIt.error}
      canSubmit={name.trim() !== '' && !taken}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <TextField
        label="Name"
        required
        autoFocus
        placeholder="Exam Day"
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={taken}
        helperText={taken ? 'Another schedule already has this name.' : undefined}
        disabled={pending}
        fullWidth
      />
      {rename || schedules.length === 0 ? null : (
        <TextField select label="Start from" value={source} onChange={(event) => setSource(event.target.value)} disabled={pending} fullWidth>
          <MenuItem value={EMPTY}>An empty day</MenuItem>
          {schedules.map((bell) => (
            <MenuItem key={bell.id} value={bell.id}>
              A copy of {bell.name}
            </MenuItem>
          ))}
        </TextField>
      )}
    </FormDialog>
  );
}
