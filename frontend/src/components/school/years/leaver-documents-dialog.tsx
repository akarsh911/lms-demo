'use client';

import * as React from 'react';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useSetDocument } from '@/hooks/mutation/use-foundation';
import { formatDay } from '@/lib/dates';
import type { DocumentState, YearEnrollment } from '@/types/foundation';

const STATES: readonly { value: DocumentState; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'issued', label: 'Issued' },
  { value: 'not_required', label: 'Not required' },
];

// The papers owed to a pupil who has left. They left on the day they left; this only records what has been issued since.
export function LeaverDocumentsDialog({ student, onClose }: { student: YearEnrollment; onClose: () => void }): React.ReactElement {
  const [states, setStates] = React.useState<Record<string, DocumentState>>(() => Object.fromEntries(student.documents.map((d) => [d.key, d.state])));
  const mutation = useSetDocument();
  const notify = useToast();
  const changed = student.documents.filter((document) => states[document.key] !== document.state);

  const save = async (): Promise<void> => {
    for (const document of changed) {
      await mutation.mutateAsync({ enrollmentId: student.id, key: document.key, state: states[document.key] ?? document.state });
    }
    notify(`Documents updated for ${student.name}`);
    onClose();
  };

  return (
    <FormDialog
      open
      title={`Documents for ${student.name}`}
      description={`${student.class_name}${student.section_name ? ` ${student.section_name}` : ''} · left ${formatDay(student.left ?? undefined)}`}
      submitLabel="Save changes"
      pending={mutation.isPending}
      error={mutation.error}
      canSubmit={changed.length > 0}
      onClose={onClose}
      // A failure is shown inside the dialog by the mutation's own error, so the rejection is not also thrown.
      onSubmit={() => void save().catch(() => undefined)}
    >
      {student.documents.map((document) => (
        <Stack key={document.key} direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
          <Typography variant="subtitle1" component="p">
            {document.label}
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={states[document.key]}
            aria-label={document.label}
            disabled={mutation.isPending}
            onChange={(_, next: DocumentState | null) => {
              if (next !== null) setStates((previous) => ({ ...previous, [document.key]: next }));
            }}
          >
            {STATES.map((state) => (
              <ToggleButton key={state.value} value={state.value}>
                {state.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>
      ))}
    </FormDialog>
  );
}
