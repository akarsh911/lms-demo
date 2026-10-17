'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { STATUS_LEGEND, STATUS_META, cellFill } from './status';

const DIFFUSE_HINT = 'Only a whole-paper exam mark, which cannot say which topic was weak';

export function StatusLegend({ withDiffuse = false }: { withDiffuse?: boolean }): React.ReactElement {
  return (
    <Stack direction="row" spacing={2} component="ul" aria-label="Legend" sx={{ flexWrap: 'wrap', rowGap: 1, listStyle: 'none', m: 0, p: 0 }}>
      {STATUS_LEGEND.map((status) => (
        <Tooltip key={status} title={STATUS_META[status].hint}>
          <Stack component="li" direction="row" spacing={0.5} sx={{ alignItems: 'center' }} tabIndex={0} aria-label={`${STATUS_META[status].label}: ${STATUS_META[status].hint}`}>
            <Box aria-hidden sx={(theme) => ({ ...cellFill(theme, status), width: 12, height: 12, borderRadius: 0.5, border: 1, borderColor: 'divider' })} />
            <Typography variant="caption">{STATUS_META[status].label}</Typography>
          </Stack>
        </Tooltip>
      ))}
      {withDiffuse ? (
        <Tooltip title={DIFFUSE_HINT}>
          <Stack component="li" direction="row" spacing={0.5} sx={{ alignItems: 'center' }} tabIndex={0} aria-label={`Faded: ${DIFFUSE_HINT}`}>
            <Box aria-hidden sx={(theme) => ({ ...cellFill(theme, 'at_risk'), opacity: 0.45, width: 12, height: 12, borderRadius: 0.5 })} />
            <Typography variant="caption">Exam mark only</Typography>
          </Stack>
        </Tooltip>
      ) : null}
    </Stack>
  );
}
