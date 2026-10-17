'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import type { StatusCounts } from '@/types/gap-analyzer';

import { STATUS_LEGEND, STATUS_META } from './status';

export function StatusComposition({ counts }: { counts: StatusCounts }): React.ReactElement {
  const total = STATUS_LEGEND.reduce((sum, status) => sum + counts[status], 0);
  return (
    <Box>
      <Box role="img" aria-label={STATUS_LEGEND.map((status) => `${counts[status]} ${STATUS_META[status].label}`).join(', ')} sx={(theme) => ({ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', bgcolor: theme.brand.sunken })}>
        {STATUS_LEGEND.filter((status) => counts[status] > 0).map((status) => (
          <Box key={status} sx={(theme) => ({ width: `${(counts[status] / Math.max(total, 1)) * 100}%`, bgcolor: theme.onTint[STATUS_META[status].tone], opacity: 0.85 })} />
        ))}
      </Box>
      <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', columnGap: 2, rowGap: 1, m: 0, mt: 2 }}>
        {STATUS_LEGEND.map((status) => (
          <Tooltip key={status} title={STATUS_META[status].hint}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', minWidth: 0 }} tabIndex={0}>
              <Box sx={(theme) => ({ width: 10, height: 10, borderRadius: '50%', bgcolor: theme.onTint[STATUS_META[status].tone], flex: 'none', alignSelf: 'center' })} />
              <Typography component="dd" variant="subtitle1" sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}>
                {counts[status]}
              </Typography>
              <Typography component="dt" variant="body2" color="text.secondary" noWrap>
                {STATUS_META[status].label}
              </Typography>
            </Stack>
          </Tooltip>
        ))}
      </Box>
    </Box>
  );
}
