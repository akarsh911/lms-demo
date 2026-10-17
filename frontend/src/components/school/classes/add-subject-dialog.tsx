'use client';

import * as React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useAddSubject } from '@/hooks/mutation/use-structure';
import { useMdmSubjects } from '@/hooks/query/use-mdm';

const PICKED = { bgcolor: 'primary.main', color: 'primary.contrastText', borderColor: 'primary.main' } as const;

// Puts a subject on the timetable of chosen sections; a name not in the school's list is added to it.
export function AddSubjectDialog({ yearId, className, sections, onClose }: { yearId: string; className: string; sections: readonly { id: string; label: string }[]; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const subjects = useMdmSubjects();
  const add = useAddSubject(yearId);
  const [name, setName] = React.useState('');
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [elective, setElective] = React.useState(false);
  const [periods, setPeriods] = React.useState('4');
  const [chosen, setChosen] = React.useState<string[]>(sections.map((s) => s.id));
  const options = (subjects.data?.rows ?? []).map((s) => ({ id: s.id, name: s.name ?? s.code ?? '', elective: s.is_elective ?? false }));
  const many = sections.length > 1;

  return (
    <FormDialog
      open
      title={`Add a subject to ${className}`}
      description="Teachers are chosen per section afterwards, on the subject's row."
      submitLabel="Add Subject"
      pending={add.isPending}
      error={add.error}
      canSubmit={name.trim() !== '' && chosen.length > 0 && Number(periods) > 0}
      onClose={onClose}
      onSubmit={() =>
        add.mutate(
          { subject_id: subjectId, name, elective, section_ids: chosen, periods: Number(periods) },
          { onSuccess: (n) => (notify(`${name.trim()} added to ${n} ${n === 1 ? 'section' : 'sections'}`), onClose()) },
        )
      }
    >
      <Autocomplete
        freeSolo
        options={options}
        getOptionLabel={(o) => (typeof o === 'string' ? o : o.name)}
        onInputChange={(_, value, reason) => {
          if (reason !== 'input') return;
          setName(value);
          setSubjectId(null);
        }}
        onChange={(_, value) => {
          if (!value || typeof value === 'string') return;
          setName(value.name);
          setSubjectId(value.id);
          setElective(value.elective);
        }}
        renderInput={(params) => <TextField {...params} label="Subject" placeholder="Pick one, or type a new subject" autoFocus helperText={name.trim() && !subjectId ? `“${name.trim()}” is new and will be added to the school's subjects` : ' '} />}
      />
      <ToggleButtonGroup exclusive size="small" value={elective ? 'elective' : 'core'} onChange={(_, v: string | null) => v && setElective(v === 'elective')} aria-label="Core or elective">
        <ToggleButton value="core">Core: every student takes it</ToggleButton>
        <ToggleButton value="elective">Elective: chosen students</ToggleButton>
      </ToggleButtonGroup>
      <TextField label="Periods a week" type="number" value={periods} onChange={(e) => setPeriods(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 12 } }} sx={{ maxWidth: 200 }} />
      {many ? (
        <Stack spacing={0.75}>
          <Typography variant="subtitle2">Taught in</Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
            {sections.map((s) => (
              <Chip
                key={s.id}
                label={s.label}
                variant="outlined"
                sx={chosen.includes(s.id) ? PICKED : undefined}
                onClick={() => setChosen((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
                aria-pressed={chosen.includes(s.id)}
              />
            ))}
          </Stack>
        </Stack>
      ) : null}
    </FormDialog>
  );
}
