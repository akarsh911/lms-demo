'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Previous and Next over a list that reports no total: it says which rows are on screen, never how many exist.
export function Pager({
  offset,
  shown,
  pageSize,
  hasMore,
  busy = false,
  onChange,
}: {
  offset: number;
  shown: number;
  pageSize: number;
  hasMore: boolean;
  busy?: boolean;
  onChange: (next: number) => void;
}): React.ReactElement {
  return (
    <>
      <Typography variant="eyebrow" component="p" color="text.secondary" aria-live="polite" sx={{ flex: 1, letterSpacing: '0.08em' }}>
        {shown > 0 ? `Showing ${offset + 1} to ${offset + shown}` : 'Nothing on this page'}
      </Typography>
      <Button
        size="small"
        startIcon={<ChevronLeft size={16} />}
        disabled={offset === 0 || busy}
        onClick={() => onChange(Math.max(0, offset - pageSize))}
      >
        Previous
      </Button>
      <Button
        size="small"
        endIcon={<ChevronRight size={16} />}
        disabled={!hasMore || busy}
        onClick={() => onChange(offset + pageSize)}
      >
        Next
      </Button>
    </>
  );
}
