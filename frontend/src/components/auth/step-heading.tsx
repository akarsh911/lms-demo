import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export function StepHeading({ eyebrow, title, subtitle, large = false }: { eyebrow?: string; title: string; subtitle: React.ReactNode; large?: boolean }): React.ReactElement {
  return (
    <Box sx={{ mb: 1 }}>
      {eyebrow ? (
        <Typography variant="eyebrow" component="p" color="primary" sx={{ mb: 1 }}>
          {eyebrow}
        </Typography>
      ) : null}
      <Typography variant={large ? 'h1' : 'h2'} component="h1">
        {title}
      </Typography>
      <Typography variant={large ? 'body1' : 'body2'} color="text.secondary" sx={{ mt: 1, fontSize: large ? '1.15rem' : undefined }}>
        {subtitle}
      </Typography>
    </Box>
  );
}
