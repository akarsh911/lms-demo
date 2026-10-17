'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Check, Copy } from 'lucide-react';

export interface IdentifierEntry {
  label: string;
  value?: string;
  withheld?: boolean;
}

export function IdentifierList({
  entries,
}: {
  entries: readonly IdentifierEntry[];
}): React.ReactElement | null {
  if (entries.length === 0) return null;
  return (
    <Stack component="dl" spacing={1} sx={{ m: 0 }}>
      {entries.map((entry) =>
        entry.value ? (
          <CopyableId key={entry.label} label={entry.label} value={entry.value} />
        ) : (
          <WithheldId key={entry.label} label={entry.label} />
        ),
      )}
    </Stack>
  );
}

function WithheldId({ label }: { label: string }): React.ReactElement {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Typography
        component="dt"
        variant="body2"
        color="text.secondary"
        sx={{ minWidth: 104, flex: 'none' }}
      >
        {label}
      </Typography>
      <Typography component="dd" variant="body2" color="text.secondary" sx={{ m: 0, flex: 1 }}>
        Held, but not shown to you
      </Typography>
    </Stack>
  );
}

export function CopyableId({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  const [state, setState] = React.useState<'idle' | 'copied' | 'failed'>('idle');

  React.useEffect(() => {
    if (state === 'idle') return;
    const timer = window.setTimeout(() => setState('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  const hint =
    state === 'copied'
      ? `${label} copied`
      : state === 'failed'
        ? 'Could not copy. Select the text instead.'
        : `Copy ${label.toLowerCase()}`;

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Typography
        component="dt"
        variant="body2"
        color="text.secondary"
        sx={{ minWidth: 104, flex: 'none' }}
      >
        {label}
      </Typography>
      <Box
        component="dd"
        sx={{
          m: 0,
          minWidth: 0,
          flex: 1,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 13,
          overflowWrap: 'anywhere',
          userSelect: 'all',
        }}
      >
        {value}
      </Box>
      <Tooltip title={hint}>
        <IconButton
          size="small"
          onClick={() => void copy()}
          aria-label={`Copy ${label.toLowerCase()}`}
          sx={{ flex: 'none' }}
        >
          {state === 'copied' ? <Check size={16} /> : <Copy size={16} />}
        </IconButton>
      </Tooltip>
      <Box aria-live="polite" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {state === 'idle' ? '' : hint}
      </Box>
    </Stack>
  );
}
