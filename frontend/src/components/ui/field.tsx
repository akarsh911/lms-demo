import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

// One label and its value, for use inside a `<dl>`. `quiet` is for "Not set" and "Not shown to you".
export function Field({
  label,
  quiet = false,
  caption,
  children,
}: {
  label: string;
  quiet?: boolean;
  caption?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="dt" variant="eyebrow" color="text.secondary">
        {label}
      </Typography>
      <Typography
        component="dd"
        variant="body1"
        color={quiet ? 'text.secondary' : 'text.primary'}
        sx={{ m: 0, mt: 0.5, fontWeight: quiet ? 400 : 500, wordBreak: 'break-word' }}
      >
        {children}
      </Typography>
      {caption ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {caption}
        </Typography>
      ) : null}
    </Box>
  );
}
