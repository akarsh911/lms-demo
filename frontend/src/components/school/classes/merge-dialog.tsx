'use client';

import * as React from 'react';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useMergeSections } from '@/hooks/mutation/use-structure';
import { useMergePreview } from '@/hooks/query/use-structure';
import type { StructureSection } from '@/types/structure';

import { shortSection } from './structure-mode';

// Folds one section into another. The pupils move, the emptied section is archived with its history; nothing is deleted.
export function MergeDialog({ className, from, siblings, onClose, onMerged }: { className: string; from: StructureSection; siblings: readonly StructureSection[]; onClose: () => void; onMerged: () => void }): React.ReactElement {
  const notify = useToast();
  const merge = useMergeSections();
  const [into, setInto] = React.useState('');
  const target = siblings.find((s) => s.id === into);
  const preview = useMergePreview(from.id, into);
  const total = from.students + (target?.students ?? 0);

  return (
    <FormDialog
      open
      title={`Merge ${shortSection(className, from.name)}`}
      description="Its students join another section of the class, and the section is archived."
      submitLabel={target ? `Merge into ${shortSection(className, target.name)}` : 'Merge'}
      pending={merge.isPending}
      error={merge.error}
      canSubmit={Boolean(target)}
      warning={target && target.capacity !== null && total > target.capacity ? `${shortSection(className, target.name)} would have ${total} students, past its target of ${target.capacity}.` : null}
      onClose={onClose}
      onSubmit={() =>
        merge.mutate(
          { fromId: from.id, intoId: into },
          {
            onSuccess: () => {
              notify(`${shortSection(className, from.name)} merged into ${target ? shortSection(className, target.name) : 'its sibling'}`);
              onMerged();
            },
          },
        )
      }
    >
      <TextField select label="Merge into" value={into} onChange={(event) => setInto(event.target.value)} autoFocus>
        {siblings
          .filter((s) => s.id !== from.id)
          .map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {shortSection(className, s.name)} · {s.students} students
            </MenuItem>
          ))}
      </TextField>
      {target && preview.data ? (
        <Typography component="ul" variant="body2" color="text.secondary" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
          <li>
            {preview.data.students} students move to {preview.data.into}, and need roll numbers there.
          </li>
          <li>{preview.data.room ? `${preview.data.room} is freed.` : `${preview.data.from} had no room.`}</li>
          <li>{preview.data.class_teacher ? `${preview.data.class_teacher} is no longer a class teacher.` : `${preview.data.from} had no class teacher.`}</li>
          <li>{preview.data.teaching} subject assignments of {preview.data.from} end; {preview.data.into}’s teachers take its students.</li>
          <li>Attendance and marks already recorded stay with each student.</li>
        </Typography>
      ) : null}
    </FormDialog>
  );
}
