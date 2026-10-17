'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Trash2 } from 'lucide-react';

import { PaperFormError } from './form-failure';

export function PartRemoval({
  what,
  consequence,
  pending,
  error,
  onRemove,
}: {
  what: string;
  consequence: string;
  pending: boolean;
  error: unknown;
  onRemove: () => void;
}): React.ReactElement {
  const [confirming, setConfirming] = React.useState(false);

  return (
    <Stack spacing={1} sx={{ alignItems: 'flex-end' }}>
      {confirming ? (
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ alignItems: { sm: 'center' } }}
        >
          <Typography variant="caption" color="text.secondary">
            {consequence}
          </Typography>
          <Button size="small" onClick={() => setConfirming(false)} disabled={pending}>
            Keep it
          </Button>
          <Button
            size="small"
            color="error"
            variant="contained"
            onClick={onRemove}
            disabled={pending}
          >
            Take it off
          </Button>
        </Stack>
      ) : (
        <Button
          size="small"
          color="error"
          startIcon={<Trash2 size={14} />}
          onClick={() => setConfirming(true)}
          disabled={pending}
        >
          {what}
        </Button>
      )}

      {error ? (
        <Stack sx={{ width: '100%' }}>
          <PaperFormError error={error} />
        </Stack>
      ) : null}
    </Stack>
  );
}
