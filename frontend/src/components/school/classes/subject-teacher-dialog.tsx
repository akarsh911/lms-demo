'use client';

import * as React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ArrowRight } from 'lucide-react';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useSetSubjectTeacher } from '@/hooks/mutation/use-structure';
import { useTeacherOptions } from '@/hooks/query/use-structure';
import type { TeacherOption } from '@/types/structure';

// Who teaches one subject in one section; teachers of that subject are offered first.
export function SubjectTeacherDialog({
  yearId,
  subject,
  label,
  offeringId,
  current,
  browseHref,
  onClose,
}: {
  yearId: string;
  subject: string;
  label: string;
  offeringId: string;
  current: string | null;
  browseHref: string;
  onClose: () => void;
}): React.ReactElement {
  const notify = useToast();
  const options = useTeacherOptions(yearId, true);
  const save = useSetSubjectTeacher();
  const [picked, setPicked] = React.useState<TeacherOption | null>(null);
  const chosen = picked;
  const fits = (o: TeacherOption): boolean => o.subjects.includes(subject);
  const sorted = [...(options.data ?? [])].sort((a, b) => Number(fits(b)) - Number(fits(a)) || a.name.localeCompare(b.name));

  return (
    <FormDialog
      open
      title={`${subject} in ${label}`}
      description={current ? `Taught by ${options.data?.find((o) => o.id === current)?.name ?? 'a teacher'}` : 'Nobody teaches it yet'}
      submitLabel="Save Teacher"
      pending={save.isPending}
      error={save.error}
      canSubmit={Boolean(chosen) && chosen?.id !== current}
      onClose={onClose}
      onSubmit={() => save.mutate({ offeringId, teacherId: chosen?.id ?? null }, { onSuccess: () => (notify(`${chosen?.name ?? 'Teacher'} now teaches ${subject} in ${label}`), onClose()) })}
    >
      <Autocomplete
        options={sorted}
        loading={options.isPending}
        value={chosen}
        onChange={(_, value) => setPicked(value)}
        groupBy={(o) => (fits(o) ? `Teaches ${subject}` : 'Other teachers')}
        getOptionLabel={(o) => o.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderOption={({ key, ...props }, o) => (
          <li key={key} {...props}>
            <Stack>
              <Typography variant="body2">{o.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {o.subjects.join(' · ') || 'No teaching this year'}
                {o.class_teacher_of ? ` · class teacher of ${o.class_teacher_of}` : ''}
              </Typography>
            </Stack>
          </li>
        )}
        renderInput={(params) => <TextField {...params} label={current ? 'New teacher' : 'Teacher'} placeholder="Search by name or subject" autoFocus />}
      />
      {browseHref ? (
        <Button component={NextLink} href={browseHref} size="small" variant="outlined" endIcon={<ArrowRight size={14} />} sx={{ alignSelf: 'flex-start' }}>
          Open {subject} for {label}
        </Button>
      ) : null}
    </FormDialog>
  );
}
