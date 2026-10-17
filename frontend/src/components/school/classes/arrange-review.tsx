'use client';

import * as React from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ChevronDown } from 'lucide-react';

import { FormDialog } from '@/components/ui/form-dialog';

export interface StagedGroup {
  key: string;
  from: string;
  to: string;
  names: string[];
}

// Every staged change, grouped by where students go from and to, before anything is saved.
export function ArrangeReview({
  groups,
  running,
  pending,
  error,
  onClose,
  onSave,
}: {
  groups: readonly StagedGroup[];
  running: boolean;
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onSave: (reason: string) => void;
}): React.ReactElement {
  const [reason, setReason] = React.useState('');
  const total = groups.reduce((t, g) => t + g.names.length, 0);
  return (
    <FormDialog
      open
      title={`Review ${total} ${total === 1 ? 'change' : 'changes'}`}
      description="Nothing has been saved yet."
      submitLabel={`Save ${total} ${total === 1 ? 'Change' : 'Changes'}`}
      pending={pending}
      error={error}
      warning={running ? 'The year is running: moved students lose their roll numbers, and each move is kept on their record.' : null}
      onClose={onClose}
      onSubmit={() => onSave(reason.trim())}
    >
      <Stack>
        {groups.map((g) => (
          <Accordion key={g.key} disableGutters variant="outlined" sx={{ '&:not(:last-of-type)': { borderBottom: 0 } }}>
            <AccordionSummary expandIcon={<ChevronDown size={16} />}>
              <Typography variant="subtitle2">
                {g.names.length} {g.names.length === 1 ? 'student' : 'students'} · {g.from} to {g.to}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary">
                {g.names.join(', ')}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Stack>
      {running ? <TextField label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Balancing sections after admissions" /> : null}
    </FormDialog>
  );
}
