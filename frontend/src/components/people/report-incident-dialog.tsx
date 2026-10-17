'use client';

import * as React from 'react';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useReportIncident } from '@/hooks/query/use-school-life';

const KINDS = ['Mobile phone in class', 'Uniform', 'Repeated late arrival', 'Damage to property', 'Unfair means in a test', 'Fight', 'Bullying', 'Leaving campus without permission'] as const;

// A teacher logs what they saw; the class teacher and the office pick it up in Actions.
export function ReportIncidentDialog({ studentId, name, onClose }: { studentId: string; name: string; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const report = useReportIncident();
  const [kind, setKind] = React.useState('');
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = React.useState('');
  return (
    <FormDialog
      open
      title={`Report an incident: ${name}`}
      description="It goes to the class teacher, and to the office when it is serious. The pupil and their family do not see it here."
      submitLabel="Report"
      pending={report.isPending}
      error={report.error}
      canSubmit={Boolean(kind && date && note.trim().length >= 6)}
      onClose={onClose}
      onSubmit={() => report.mutate({ student_id: studentId, kind, date, note }, { onSuccess: () => (notify('Incident reported'), onClose()) })}
    >
      <TextField select label="What happened" value={kind} onChange={(e) => setKind(e.target.value)} required>
        {KINDS.map((k) => (
          <MenuItem key={k} value={k}>
            {k}
          </MenuItem>
        ))}
      </TextField>
      <TextField label="When" type="date" value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      <TextField label="What you saw" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={3} placeholder="During the third period, in the corridor outside 8B…" required />
    </FormDialog>
  );
}
