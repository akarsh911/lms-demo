'use client';

import * as React from 'react';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

export const DebateModeContext = React.createContext<React.ReactNode>(null);

export function DebateHeading({
  title,
  status,
  subtitle,
  actions,
}: {
  title: string;
  status?: React.ReactNode;
  subtitle: React.ReactNode;
  actions?: React.ReactNode;
}): React.ReactElement {
  const mode = React.useContext(DebateModeContext);
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
      <Stack sx={{ minWidth: 0, flex: '1 1 320px' }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Tooltip title={title} placement="bottom-start">
            <Typography variant="h2" component="h2" noWrap tabIndex={0} sx={{ minWidth: 0 }}>
              {title}
            </Typography>
          </Tooltip>
          {status}
          {mode}
        </Stack>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
          {subtitle}
        </Typography>
      </Stack>
      {actions ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {actions}
        </Stack>
      ) : null}
    </Stack>
  );
}
