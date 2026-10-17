'use client';

import * as React from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { Info } from 'lucide-react';

export function Hint({ title, label = 'More information' }: { title: React.ReactNode; label?: string }): React.ReactElement {
  return (
    <Tooltip title={title} enterTouchDelay={0} leaveTouchDelay={4000}>
      <IconButton size="small" aria-label={label} sx={{ color: 'text.secondary', p: 0.5 }}>
        <Info size={16} strokeWidth={1.75} />
      </IconButton>
    </Tooltip>
  );
}
