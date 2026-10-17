import * as React from 'react';
import Box from '@mui/material/Box';

// A tab's name with a count beside it. Inline rather than a floating Badge, which the tab strip's scroller clips.
export function TabLabel({ label, count }: { label: string; count?: number }): React.ReactElement {
  if (!count) return <>{label}</>;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      {label}
      <Box
        component="span"
        aria-label={`${count} waiting`}
        sx={(theme) => ({
          minWidth: 20,
          height: 20,
          px: 0.75,
          borderRadius: '999px',
          display: 'inline-grid',
          placeItems: 'center',
          fontSize: 11.5,
          fontWeight: 700,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          bgcolor: theme.brand.accent,
          color: '#FFFFFF',
        })}
      >
        {count > 99 ? '99+' : count}
      </Box>
    </Box>
  );
}
