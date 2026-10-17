'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';

import { EmergeChip } from '@/components/ui/chip';
import { FactStrip } from '@/components/ui/fact-strip';
import type { DebatePosition, DebateSession } from '@/types/debate';

import { DebateHeading } from './debate-heading';
import { DebaterPanel, type DebaterView } from './debater-panel';
import { formatClock } from './use-server-clock';

const LOW_TIME_MS = 30_000;
const SIDE: Record<DebatePosition, string> = { FOR: 'for', AGAINST: 'against' };

type Seat = Omit<DebaterView, 'kind' | 'name' | 'side' | 'turns'>;

export function DebateArena({
  session,
  remainingMs,
  floor,
  live,
  student,
  ai,
  banner,
  actions,
}: {
  session: DebateSession;
  remainingMs: number;
  floor: string;
  live: boolean;
  student: Seat;
  ai: Seat;
  banner?: React.ReactNode;
  actions?: React.ReactNode;
}): React.ReactElement {
  const theme = useTheme();
  const round = Math.max(1, session.turns.filter((t) => t.speaker === 'student').length);
  const low = remainingMs <= LOW_TIME_MS && remainingMs > 0;
  const aiFirst = ai.active && !student.active;

  return (
    <Stack spacing={3}>
      <DebateHeading
        title={session.topic}
        status={<EmergeChip label={live ? 'Live' : 'Starting'} tone={live ? 'green' : 'amber'} dot={live} />}
        subtitle={`You argue ${SIDE[session.student_position]} · AI argues ${SIDE[session.ai_position]}`}
        actions={actions}
      />

      <FactStrip
        facts={[
          {
            label: 'Time left',
            value: (
              <Box component="span" role="timer" aria-label={`${formatClock(remainingMs)} left`} sx={{ color: low ? theme.hues.red : undefined, fontVariantNumeric: 'tabular-nums' }}>
                {formatClock(remainingMs)}
              </Box>
            ),
          },
          { label: 'Floor', value: floor },
          { label: 'Round', value: round },
        ]}
      />

      {banner}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, alignItems: 'stretch' }}>
        <DebaterPanel
          order={aiFirst ? 1 : 0}
          view={{ ...student, kind: 'student', name: 'You', side: session.student_position, turns: session.turns.filter((t) => t.speaker === 'student') }}
        />
        <DebaterPanel
          order={aiFirst ? 0 : 1}
          view={{ ...ai, kind: 'ai', name: 'AI opponent', side: session.ai_position, turns: session.turns.filter((t) => t.speaker === 'ai') }}
        />
      </Box>
    </Stack>
  );
}
