'use client';

import * as React from 'react';
import TextField from '@mui/material/TextField';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useCreateSection, useUpdateSection } from '@/hooks/mutation/use-structure';
import type { StructureSection } from '@/types/structure';

import { shortSection } from './structure-mode';

// Adds a section to a class, or renames one and changes its target size. Room and class teacher have their own pickers.
export function SectionDialog({
  yearId,
  gradeId,
  className,
  section,
  taken,
  onClose,
}: {
  yearId: string;
  gradeId: string;
  className: string;
  section: StructureSection | null;
  taken: readonly string[];
  onClose: () => void;
}): React.ReactElement {
  const notify = useToast();
  const create = useCreateSection(yearId, gradeId);
  const update = useUpdateSection();
  const next = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((letter) => !taken.includes(letter)) ?? '';
  const [name, setName] = React.useState(section?.name ?? next);
  const [capacity, setCapacity] = React.useState(String(section?.capacity ?? 40));
  const size = Number(capacity);
  const clash = taken.includes(name.trim().toUpperCase()) && name.trim().toUpperCase() !== section?.name;
  const mutation = section ? update : create;

  return (
    <FormDialog
      open
      title={section ? `Edit ${shortSection(className, section.name)}` : `Add a section to ${className}`}
      description={section ? undefined : 'It takes the subjects its class studies; pupils, a room and a class teacher are added after.'}
      submitLabel={section ? 'Save' : 'Add Section'}
      pending={mutation.isPending}
      error={mutation.error}
      canSubmit={name.trim() !== '' && !clash && size > 0}
      warning={section && size > 0 && section.students > size ? `${section.students} students are already in ${shortSection(className, section.name)}, more than ${size}.` : null}
      onClose={onClose}
      onSubmit={() => {
        const body = { name: name.trim().toUpperCase(), capacity: size };
        const done = (): void => {
          notify(section ? `${shortSection(className, body.name)} saved` : `${shortSection(className, body.name)} added`);
          onClose();
        };
        if (section) update.mutate({ sectionId: section.id, body }, { onSuccess: done });
        else create.mutate(body, { onSuccess: done });
      }}
    >
      <TextField
        label="Section name"
        value={name}
        onChange={(event) => setName(event.target.value.slice(0, 3))}
        error={clash}
        helperText={clash ? `${className} already has a section ${name.trim().toUpperCase()}` : 'A letter, as the school writes it: A, B, C'}
        autoFocus
        required
      />
      <TextField
        label="Target size"
        type="number"
        value={capacity}
        onChange={(event) => setCapacity(event.target.value)}
        helperText="How many students the section is planned for; arranging warns past it"
        slotProps={{ htmlInput: { min: 1, max: 80 } }}
      />
    </FormDialog>
  );
}
