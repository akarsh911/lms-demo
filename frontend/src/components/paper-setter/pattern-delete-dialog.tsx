'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import type { TemplateSummary } from './contract';
import { RefusalNotice } from './refusal-notice';

export const PAPERS_ALREADY_SET_ARE_SAFE =
  'Papers already set from this pattern are not affected. A paper keeps its own copy of ' +
  'the shape it was set from, so nothing printed reaches back to this.';

export const DELETE_IS_NOT_UNDOABLE =
  'There is no undo. The pattern is a small thing to retype, which is why this asks once ' +
  'rather than keeping a copy you would have to find later.';

export function PatternDeleteDialog({
  template,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  template: TemplateSummary | null;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: (templateId: string) => void;
}): React.ReactElement {
  return (
    <Dialog
      open={template !== null}
      onClose={pending ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="paper-setter-delete-pattern-title"
    >
      <DialogTitle id="paper-setter-delete-pattern-title">
        {template ? `Delete “${template.name}”?` : 'Delete this pattern?'}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Typography variant="body2">{PAPERS_ALREADY_SET_ARE_SAFE}</Typography>
          <Typography variant="body2" color="text.secondary">
            {DELETE_IS_NOT_UNDOABLE}
          </Typography>
          <RefusalNotice error={error} title="That pattern was not deleted" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          Keep it
        </Button>
        <Button
          variant="contained"
          color="error"
          disabled={pending || template === null}
          onClick={() => {
            if (template) onConfirm(template.id);
          }}
        >
          Delete this pattern
        </Button>
      </DialogActions>
    </Dialog>
  );
}
