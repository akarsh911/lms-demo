'use client';

import * as React from 'react';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useApplyMoves } from '@/hooks/mutation/use-structure';
import type { YearEnrollment } from '@/types/foundation';
import type { StructureSection } from '@/types/structure';

import { shortSection, type StructureMode } from './structure-mode';

// Moves chosen students to another section of their class. In a running year it says what follows before anything moves.
export function MoveDialog({
  yearId,
  className,
  mode,
  students,
  sections,
  fromSectionId,
  onClose,
  onMoved,
}: {
  yearId: string;
  className: string;
  mode: StructureMode;
  students: readonly YearEnrollment[];
  sections: readonly StructureSection[];
  fromSectionId: string | null;
  onClose: () => void;
  onMoved: () => void;
}): React.ReactElement {
  const notify = useToast();
  const apply = useApplyMoves(yearId);
  const [to, setTo] = React.useState('');
  const [reason, setReason] = React.useState('');
  const target = sections.find((s) => s.id === to);
  const after = (target?.students ?? 0) + students.length;
  const who = students.length === 1 ? (students[0]?.name ?? 'The student') : `${students.length} students`;

  return (
    <FormDialog
      open
      title={`Move ${who}`}
      description={`To another section of ${className}`}
      submitLabel={target ? `Move to ${shortSection(className, target.name)}` : 'Move'}
      pending={apply.isPending}
      error={apply.error}
      canSubmit={Boolean(target)}
      warning={target?.capacity != null && after > target.capacity ? `${shortSection(className, target.name)} would have ${after} students, past its target of ${target.capacity}.` : null}
      onClose={onClose}
      onSubmit={() =>
        apply.mutate(
          { moves: students.map((s) => ({ enrollment_id: s.id, to_section_id: to })), reason: reason.trim() || `Moved to ${target ? shortSection(className, target.name) : 'another section'}` },
          {
            onSuccess: (moved) => {
              notify(`${moved} ${moved === 1 ? 'student' : 'students'} moved to ${target ? shortSection(className, target.name) : 'their new section'}`);
              onMoved();
            },
          },
        )
      }
    >
      <TextField select label="Section" value={to} onChange={(event) => setTo(event.target.value)} autoFocus>
        {sections
          .filter((s) => s.id !== fromSectionId)
          .map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {shortSection(className, s.name)} · {s.students}
              {s.capacity !== null ? ` of ${s.capacity}` : ''} students
            </MenuItem>
          ))}
      </TextField>
      {mode === 'active' ? (
        <>
          <TextField label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Kept on each student’s record" />
          <Typography component="ul" variant="body2" color="text.secondary" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
            <li>Their roll numbers are cleared; give them new ones in the new section.</li>
            <li>From tomorrow they are marked in the new section’s attendance and follow its timetable.</li>
            <li>Attendance and marks already recorded stay with them.</li>
            <li>The move is kept on their record with the date and reason.</li>
          </Typography>
        </>
      ) : null}
    </FormDialog>
  );
}
