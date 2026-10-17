import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

// The bar between a card's header and its rows: filters on the left, what is listed, actions on the right.
export function CardToolbar({
  start,
  summary,
  children,
}: {
  start?: React.ReactNode;
  summary?: React.ReactNode;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <Stack
      direction="row"
      sx={(theme) => ({
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1.5,
        minHeight: 52,
        pl: start ? 1 : 2,
        pr: 1,
        // Room above for a small select's floated label, which sits over its own top edge.
        py: 1.25,
        backgroundColor: theme.brand.subtle,
        border: `1px solid ${theme.brand.line}`,
        borderRadius: `${theme.band.radius.md}px`,
      })}
    >
      {start}
      {summary ? (
        <Typography variant="body2" color="text.secondary" aria-live="polite" sx={{ minWidth: 0 }}>
          {summary}
        </Typography>
      ) : null}
      <Box sx={{ flex: 1 }} />
      {children ? (
        <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          {children}
        </Stack>
      ) : null}
    </Stack>
  );
}
