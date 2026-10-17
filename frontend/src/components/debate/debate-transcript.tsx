'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import type { DebateTurn } from '@/types/debate';

import { PlayRecordingButton } from './play-recording-button';

export function DebateTranscript({
  turns,
  liveText,
  scroller,
  sessionId,
}: {
  turns: readonly DebateTurn[];
  liveText?: string;
  sessionId?: string;
  scroller?: React.RefObject<HTMLElement | null>;
}): React.ReactElement {
  const theme = useTheme();
  const spoken = turns.filter((t) => t.status !== 'open' && t.text.trim());

  React.useEffect(() => {
    const box = scroller?.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  }, [scroller, spoken.length, liveText]);

  if (spoken.length === 0 && !liveText) {
    return (
      <Typography variant="body2" color="text.secondary">
        The transcript appears here as the debate goes on.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5} component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="Debate transcript">
      {spoken.map((turn) => (
        <Box
          component="li"
          key={turn.index}
          sx={{
            alignSelf: turn.speaker === 'student' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            px: 2,
            py: 1.25,
            borderRadius: `${theme.band.radius.md}px`,
            backgroundColor: turn.speaker === 'student' ? theme.tints.green : theme.tints.violet,
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700, color: turn.speaker === 'student' ? theme.onTint.green : theme.onTint.violet }}>
            {turn.speaker === 'student' ? 'You' : 'AI opponent'} · turn {turn.index + 1}
            {turn.status === 'cut_off' ? ' · cut off by the buzzer' : ''}
          </Typography>
          <Typography variant="body2">{turn.text}</Typography>
          {sessionId && turn.speaker === 'student' ? (
            <Box sx={{ mt: 0.5, ml: -1 }}>
              <PlayRecordingButton sessionId={sessionId} turnIndex={turn.index} label="Play this turn" variant="text" />
            </Box>
          ) : null}
        </Box>
      ))}
      {liveText ? (
        <Box
          component="li"
          sx={{
            alignSelf: 'flex-end',
            maxWidth: '85%',
            px: 2,
            py: 1.25,
            borderRadius: `${theme.band.radius.md}px`,
            border: `1px dashed ${theme.brand.line2}`,
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700, color: theme.brand.tert }}>
            You · speaking now
          </Typography>
          <Typography variant="body2" aria-live="polite">
            {liveText}
          </Typography>
        </Box>
      ) : null}
    </Stack>
  );
}
