'use client';

import * as React from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { EmergeChip } from '@/components/ui/chip';
import type { DebatePosition, DebateSession } from '@/types/debate';

const SIDE: Record<DebatePosition, string> = { FOR: 'For', AGAINST: 'Against' };

export function DebateMotion({
  session,
  trailing,
}: {
  session: Pick<DebateSession, 'topic' | 'student_position' | 'ai_position' | 'difficulty'>;
  trailing?: React.ReactNode;
}): React.ReactElement {
  const theme = useTheme();
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <Stack spacing={1}>
        <Typography variant="overline" sx={{ color: theme.brand.tert }}>
          The motion
        </Typography>
        <Typography variant="h3" component="h3">
          {session.topic}
        </Typography>
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
          <EmergeChip label={`You: ${SIDE[session.student_position]}`} tone="green" />
          <EmergeChip label={`AI opponent: ${SIDE[session.ai_position]}`} tone="violet" />
          <EmergeChip label={session.difficulty.charAt(0).toUpperCase() + session.difficulty.slice(1)} tone="grey" />
        </Stack>
      </Stack>
      {trailing}
    </Stack>
  );
}
