'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

import { DebateRoom } from '@/components/debate/debate-room';
import { LearningScopeGate } from '@/components/learning-scope/learning-scope-gate';
import type { WidgetProps } from '@/types/widget';

const LOCKED = 'End the debate to change class';

function Room({ grade, onLive }: { grade: number | null; onLive?: (live: boolean) => void }): React.ReactElement {
  return (
    <Box sx={{ pb: 2 }}>
      <DebateRoom grade={grade} onLive={onLive} />
    </Box>
  );
}

export function DebateWidget(_props: WidgetProps): React.ReactElement {
  const [live, setLive] = React.useState(false);
  return (
    <LearningScopeGate
      mode="grade-only"
      prompt="Your opponent pitches the debate at this class."
      locked={live ? LOCKED : null}
      ungated={<Room grade={null} />}
    >
      {(scope) => <Room grade={scope.grade.level} onLive={setLive} />}
    </LearningScopeGate>
  );
}
