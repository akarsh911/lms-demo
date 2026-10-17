'use client';

import * as React from 'react';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useApplyMoves, useCreateSection } from '@/hooks/mutation/use-structure';
import type { YearEnrollment } from '@/types/foundation';
import type { StructureSection } from '@/types/structure';

import { shortSection } from './structure-mode';

type Pick = 'alphabetical' | 'roll';

// Opens a new section and moves part of an existing one into it, in one step.
export function SplitDialog({
  yearId,
  gradeId,
  className,
  from,
  rows,
  taken,
  onClose,
  onSplit,
}: {
  yearId: string;
  gradeId: string;
  className: string;
  from: StructureSection;
  rows: readonly YearEnrollment[];
  taken: readonly string[];
  onClose: () => void;
  onSplit: () => void;
}): React.ReactElement {
  const notify = useToast();
  const create = useCreateSection(yearId, gradeId);
  const apply = useApplyMoves(yearId);
  const next = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((letter) => !taken.includes(letter)) ?? '';
  const [name, setName] = React.useState(next);
  const [count, setCount] = React.useState(Math.floor(rows.length / 2));
  const [pick, setPick] = React.useState<Pick>('alphabetical');
  const order = pick === 'alphabetical' ? [...rows].sort((a, b) => a.name.localeCompare(b.name)) : [...rows].sort((a, b) => Number(a.roll_number ?? 999) - Number(b.roll_number ?? 999));
  const moving = order.slice(rows.length - count);
  const clash = taken.includes(name.trim().toUpperCase());

  return (
    <FormDialog
      open
      title={`Split ${shortSection(className, from.name)}`}
      description="A new section is opened and the last part of this one, in the order you choose, moves into it."
      submitLabel={`Open ${shortSection(className, name.trim().toUpperCase() || '…')} with ${count}`}
      pending={create.isPending || apply.isPending}
      error={create.error ?? apply.error}
      canSubmit={name.trim() !== '' && !clash && count > 0 && count < rows.length}
      onClose={onClose}
      onSubmit={() =>
        create.mutate(
          { name: name.trim().toUpperCase(), capacity: from.capacity },
          {
            onSuccess: (section) =>
              apply.mutate(
                { moves: moving.map((s) => ({ enrollment_id: s.id, to_section_id: section.id })), reason: `Split from ${shortSection(className, from.name)}` },
                {
                  onSuccess: () => {
                    notify(`${shortSection(className, section.name)} opened with ${count} students`);
                    onSplit();
                  },
                },
              ),
          },
        )
      }
    >
      <TextField
        label="New section"
        value={name}
        onChange={(event) => setName(event.target.value.slice(0, 3))}
        error={clash}
        helperText={clash ? `${className} already has a section ${name.trim().toUpperCase()}` : 'It takes the class’s subjects; give it a room and a class teacher after'}
        autoFocus
      />
      <Stack spacing={1}>
        <Typography variant="subtitle2">Who moves</Typography>
        <ToggleButtonGroup exclusive size="small" value={pick} onChange={(_, value: Pick | null) => value && setPick(value)} aria-label="Order to split by">
          <ToggleButton value="alphabetical">By name</ToggleButton>
          <ToggleButton value="roll">By roll number</ToggleButton>
        </ToggleButtonGroup>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', px: 1 }}>
          <Slider value={count} min={1} max={Math.max(1, rows.length - 1)} onChange={(_, value) => setCount(value)} aria-label="Students to move" />
          <Typography variant="subtitle2" sx={{ minWidth: 120, fontVariantNumeric: 'tabular-nums' }}>
            {shortSection(className, from.name)} {rows.length - count} · {name.trim() ? shortSection(className, name.trim().toUpperCase()) : 'new'} {count}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {moving.length > 0 ? `${moving[0]?.name} to ${moving[moving.length - 1]?.name}` : 'Nobody'} move. Every moved student needs a roll number in the new section.
        </Typography>
      </Stack>
    </FormDialog>
  );
}
