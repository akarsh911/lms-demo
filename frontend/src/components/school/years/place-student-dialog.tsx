'use client';

import * as React from 'react';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { usePlaceStudent } from '@/hooks/mutation/use-foundation';
import type { YearEnrollment } from '@/types/foundation';

// Gives an enrolled pupil a section. The full arranging of sections, with a board to drag across, is the Classes module's.
export function PlaceStudentDialog({
  student,
  rows,
  onClose,
}: {
  student: YearEnrollment;
  // The year's enrolments, to offer that class's sections with how full each is.
  rows: readonly YearEnrollment[];
  onClose: () => void;
}): React.ReactElement {
  const [sectionId, setSectionId] = React.useState('');
  const mutation = usePlaceStudent();
  const notify = useToast();

  const sections = React.useMemo(() => {
    const seats = new Map<string, { name: string; pupils: number }>();
    for (const row of rows) {
      if (row.grade_level_id !== student.grade_level_id || !row.section_id || row.status === 'withdrawn') continue;
      const seat = seats.get(row.section_id) ?? { name: row.section_name ?? '', pupils: 0 };
      seats.set(row.section_id, { ...seat, pupils: seat.pupils + 1 });
    }
    return [...seats.entries()].map(([id, seat]) => ({ id, ...seat })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, student.grade_level_id]);

  return (
    <FormDialog
      open
      title={`Place ${student.name}`}
      description={`${student.class_name}, admitted and not yet in a section. They take the next roll number in the section you choose.`}
      submitLabel="Place in section"
      pending={mutation.isPending}
      error={mutation.error}
      canSubmit={sectionId !== ''}
      onClose={onClose}
      onSubmit={() =>
        mutation.mutate(
          { enrollmentId: student.id, sectionId },
          {
            onSuccess: (placed) => {
              notify(`${student.name} placed in ${placed.class_name} ${placed.section_name ?? ''}`.trim());
              onClose();
            },
          },
        )
      }
    >
      <TextField select label="Section" required autoFocus value={sectionId} onChange={(event) => setSectionId(event.target.value)} disabled={mutation.isPending} fullWidth>
        {sections.map((section) => (
          <MenuItem key={section.id} value={section.id}>
            {student.class_name} {section.name} · {section.pupils} pupils
          </MenuItem>
        ))}
      </TextField>
    </FormDialog>
  );
}
