'use client';

import * as React from 'react';
import TextField from '@mui/material/TextField';

import { FormDialog } from '@/components/ui/form-dialog';
import type { LessonBlock } from '@/types/lesson-planner';

import { BLOCK_KIND_META, MAX_BLOCK_MINUTES, MIN_BLOCK_MINUTES } from './block-kinds';

const minutesError = (value: number): string | null =>
  Number.isInteger(value) && value >= MIN_BLOCK_MINUTES && value <= MAX_BLOCK_MINUTES
    ? null
    : `Between ${MIN_BLOCK_MINUTES} and ${MAX_BLOCK_MINUTES} minutes.`;

export function BlockEditDialog({
  block,
  onClose,
  onSave,
}: {
  block: LessonBlock;
  onClose: () => void;
  onSave: (next: LessonBlock) => void;
}): React.ReactElement {
  const [title, setTitle] = React.useState(block.title);
  const [minutes, setMinutes] = React.useState(String(block.minutes));
  const [summary, setSummary] = React.useState(block.summary);
  const [steps, setSteps] = React.useState(block.steps.join('\n'));

  const parsedMinutes = Number(minutes);
  const invalidMinutes = minutesError(parsedMinutes);
  const canSubmit = title.trim() !== '' && summary.trim() !== '' && invalidMinutes === null;

  const submit = (): void =>
    onSave({
      ...block,
      title: title.trim(),
      minutes: parsedMinutes,
      summary: summary.trim(),
      steps: steps.split('\n').map((step) => step.trim()).filter(Boolean),
    });

  return (
    <FormDialog
      open
      title={`Edit ${BLOCK_KIND_META[block.kind].label.toLowerCase()}`}
      submitLabel="Apply"
      pending={false}
      canSubmit={canSubmit}
      onClose={onClose}
      onSubmit={submit}
    >
      <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus error={title.trim() === ''} helperText={title.trim() === '' ? 'A block needs a title.' : ' '} />
      <TextField
        label="Minutes"
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        slotProps={{ htmlInput: { inputMode: 'numeric' } }}
        error={invalidMinutes !== null}
        helperText={invalidMinutes ?? ' '}
        sx={{ maxWidth: 160 }}
      />
      <TextField label="What happens" value={summary} onChange={(e) => setSummary(e.target.value)} required multiline minRows={2} error={summary.trim() === ''} helperText={summary.trim() === '' ? 'Say what happens in this block.' : ' '} />
      <TextField label="Steps" value={steps} onChange={(e) => setSteps(e.target.value)} multiline minRows={3} helperText="One step per line." />
    </FormDialog>
  );
}
