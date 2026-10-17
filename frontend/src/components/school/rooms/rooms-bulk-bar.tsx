'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

// Shown only while rows are ticked, pinned to the bottom of the page so it follows the table as it scrolls.
export function RoomsBulkBar({
  count,
  onBuilding,
  onUnavailable,
  onArchive,
  onClear,
}: {
  count: number;
  onBuilding: () => void;
  onUnavailable: () => void;
  onArchive: () => void;
  onClear: () => void;
}): React.ReactElement {
  return (
    <Paper
      variant="ink"
      role="region"
      aria-label="Actions for the selected rooms"
      sx={{
        position: 'sticky',
        bottom: 16,
        zIndex: 2,
        alignSelf: 'center',
        width: 'fit-content',
        maxWidth: '100%',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 0.5,
        pl: 2.5,
        pr: 1,
        py: 1,
        borderRadius: '999px',
      }}
    >
      <Typography variant="subtitle2" component="p" sx={{ mr: 1 }} aria-live="polite">
        {count} {count === 1 ? 'room' : 'rooms'} selected
      </Typography>
      <Button size="small" color="inherit" onClick={onBuilding}>
        Change building
      </Button>
      <Button size="small" color="inherit" onClick={onUnavailable}>
        Mark unavailable
      </Button>
      <Button size="small" color="inherit" onClick={onArchive}>
        Archive
      </Button>
      <Button size="small" color="inherit" onClick={onClear} sx={{ opacity: 0.72 }}>
        Clear
      </Button>
    </Paper>
  );
}
