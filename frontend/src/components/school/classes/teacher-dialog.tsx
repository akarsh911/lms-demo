'use client';

import * as React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useUpdateSection } from '@/hooks/mutation/use-structure';
import { useTeacherOptions } from '@/hooks/query/use-structure';
import type { StructureSection, TeacherOption } from '@/types/structure';

// A section's class teacher, searched by name or subject. Choosing someone who already leads a section moves them.
export function TeacherDialog({ yearId, label, section, onClose }: { yearId: string; label: string; section: StructureSection; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const options = useTeacherOptions(yearId, true);
  const update = useUpdateSection();
  const [teacher, setTeacher] = React.useState<TeacherOption | null>(null);
  const current = options.data?.find((o) => o.id === section.class_teacher?.id) ?? null;
  const chosen = teacher ?? current;
  const moving = chosen && chosen.id !== section.class_teacher?.id ? chosen.class_teacher_of : null;
  // Teachers free of a class come first, then those who would have to move.
  const sorted = [...(options.data ?? [])].sort((a, b) => Number(a.class_teacher_of !== null) - Number(b.class_teacher_of !== null) || a.name.localeCompare(b.name));

  return (
    <FormDialog
      open
      title={`Class teacher for ${label}`}
      description={section.class_teacher ? `Now ${section.class_teacher.name}` : 'No class teacher yet'}
      submitLabel="Save Class Teacher"
      pending={update.isPending}
      error={update.error}
      canSubmit={Boolean(chosen) && chosen?.id !== section.class_teacher?.id}
      warning={moving ? `${chosen?.name} is class teacher of ${moving}. Saving moves them here and leaves ${moving} without one.` : null}
      onClose={onClose}
      onSubmit={() =>
        update.mutate(
          { sectionId: section.id, body: { class_teacher_id: chosen?.id ?? null } },
          {
            onSuccess: () => {
              notify(`${chosen?.name ?? 'The teacher'} is class teacher of ${label}`);
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
        onChange={(_, value) => setTeacher(value)}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        groupBy={(option) => (option.class_teacher_of === null ? 'Not leading a class' : 'Already a class teacher')}
        filterOptions={(list, { inputValue }) => {
          const q = inputValue.trim().toLowerCase();
          return q ? list.filter((o) => o.name.toLowerCase().includes(q) || o.subjects.some((s) => s.toLowerCase().includes(q))) : list;
        }}
        renderOption={({ key, ...props }, option) => (
          <li key={key} {...props}>
            <Stack sx={{ width: 1 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                <Typography variant="subtitle2">{option.name}</Typography>
                {option.class_teacher_of ? (
                  <Typography variant="body2" color="text.secondary">
                    Class teacher of {option.class_teacher_of}
                  </Typography>
                ) : null}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {option.subjects.join(' · ') || 'No teaching this year'}
              </Typography>
            </Stack>
          </li>
        )}
        renderInput={(params) => <TextField {...params} label="Teacher" placeholder="Search by name or subject" autoFocus />}
      />
    </FormDialog>
  );
}
