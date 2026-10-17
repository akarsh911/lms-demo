'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import type { EnrichedPassage } from '@/types/retrieval';

export function ReferencePassages({
  passages,
  pending,
  failed,
}: {
  passages: readonly EnrichedPassage[] | undefined;
  pending: boolean;
  failed: boolean;
}): React.ReactElement {
  const theme = useTheme();
  if (pending) return <Skeleton variant="rounded" height={48} />;
  if (failed) {
    return (
      <Typography variant="caption" color="text.secondary">
        Source unavailable.
      </Typography>
    );
  }
  if (!passages || passages.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary">
        No matching passage.
      </Typography>
    );
  }
  return (
    <Stack spacing={1}>
      {passages.map((passage) => (
        <Box key={passage.chunk_id} sx={{ borderLeft: `3px solid ${theme.palette.primary.main}`, pl: 1.5 }}>
          {passage.section_path ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {passage.section_path}
            </Typography>
          ) : null}
          <Typography variant="body2" component="blockquote" sx={{ m: 0 }}>
            {passage.verbatim_text}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {passage.citation.render}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}
