import * as React from 'react';
import Button from '@mui/material/Button';
import { Play, Square } from 'lucide-react';

import { playRecording, recordedMs, stopRecording, useRecordings } from './turn-recordings';

export function clipLength(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function PlayRecordingButton({
  sessionId,
  turnIndex,
  label = 'Play my turn',
  variant = 'outlined',
}: {
  sessionId: string;
  turnIndex: number;
  label?: string;
  variant?: 'outlined' | 'text';
}): React.ReactElement | null {
  const { playing } = useRecordings();
  const ms = recordedMs(sessionId, turnIndex);
  const [blocked, setBlocked] = React.useState(false);
  if (ms === 0) return null;
  const active = playing === `${sessionId}:${turnIndex}`;

  return (
    <Button
      size="small"
      variant={variant}
      color={variant === 'text' ? 'inherit' : 'primary'}
      startIcon={active ? <Square size={14} aria-hidden /> : <Play size={14} aria-hidden />}
      onClick={() => {
        if (active) {
          stopRecording();
          return;
        }
        void playRecording(sessionId, turnIndex).then((ok) => setBlocked(!ok));
      }}
      sx={{ flex: 'none', whiteSpace: 'nowrap' }}
    >
      {active ? 'Stop playing' : blocked ? 'Could not play. Retry' : `${label} · ${clipLength(ms)}`}
    </Button>
  );
}
